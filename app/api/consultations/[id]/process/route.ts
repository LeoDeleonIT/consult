import { DEFAULT_CHECKLIST } from "@/lib/checklist";
import { ensureDatabase, writeAudit, type D1DatabaseLike } from "@/lib/d1";
import { apiError, PublicApiError } from "@/lib/http";
import { createProviders, usesDurableAwsProcessing, type ProviderSet } from "@/lib/providers";
import { getAnalysis, getConsultation, getRecording, getTranscript, parseTranscript, type RecordingRow } from "@/lib/records";
import { requireSession, verifyCsrf } from "@/lib/session";
import { assertTransition, processingDisposition } from "@/lib/state-machine";
import { R2AudioStorage } from "@/lib/storage";
import { CONSULTATION_SCHEMA_VERSION, consultationAnalysisSchema } from "@/lib/analysis-schema";
import { canAccessConsultation } from "@/lib/authorization";
import { awsJobIdFromStorageKey, queueAwsJob } from "@/lib/aws-client";
import { appConfig } from "@/lib/env";
import { getRequestExecutionContext } from "vinext/shims/request-context";
import type { StaffSpeakerRole } from "@/lib/speaker-roles";

type ProcessingJob = {
  actorId: string;
  consultationId: string;
  db: D1DatabaseLike;
  providers: ProviderSet;
  recording: RecordingRow;
  staffSpeakerRole: StaffSpeakerRole;
};

function safeProcessingFailureMessage(error: unknown): string {
  return error instanceof PublicApiError
    ? error.message
    : "AI processing could not be completed. Your recording is saved securely and does not need to be uploaded again. Retry processing in a few minutes.";
}

async function runProcessingJob(job: ProcessingJob): Promise<void> {
  const { actorId, consultationId: id, db, providers, recording, staffSpeakerRole } = job;
  try {
    const savedTranscript = await getTranscript(id, db);
    const reusableTranscript = savedTranscript
      && savedTranscript.provider === providers.name
      && savedTranscript.model === providers.transcriptionModel
      ? parseTranscript(savedTranscript)
      : null;

    const transcript = reusableTranscript ?? await providers.transcription.transcribe({
      audioPath: recording.storage_key,
      mimeType: recording.mime_type,
    });

    if (!reusableTranscript) {
      const transcribedAt = new Date().toISOString();
      await db.prepare(`
        INSERT INTO transcripts (id,consultation_id,provider,model,text,normalized_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(consultation_id) DO UPDATE SET provider=excluded.provider,model=excluded.model,text=excluded.text,normalized_json=excluded.normalized_json,updated_at=excluded.updated_at
      `).bind(crypto.randomUUID(), id, providers.name, providers.transcriptionModel, transcript.text, JSON.stringify(transcript), transcribedAt, transcribedAt).run();
      await writeAudit({ actorId, consultationId: id, eventType: "transcript.created", metadata: { provider: providers.name, model: providers.transcriptionModel } });
    } else {
      await writeAudit({ actorId, consultationId: id, eventType: "transcript.reused", metadata: { provider: providers.name, model: providers.transcriptionModel } });
    }

    const analysis = consultationAnalysisSchema.parse(await providers.summary.summarize({
      transcript,
      checklist: DEFAULT_CHECKLIST,
      staffSpeakerRole,
    }));
    const completedAt = new Date().toISOString();
    await db.batch([
      db.prepare(`
        INSERT INTO analyses (id,consultation_id,provider,model,schema_version,analysis_json,coordinator_edits_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,NULL,?,?)
        ON CONFLICT(consultation_id) DO UPDATE SET provider=excluded.provider,model=excluded.model,schema_version=excluded.schema_version,analysis_json=excluded.analysis_json,coordinator_edits_json=NULL,updated_at=excluded.updated_at
      `).bind(crypto.randomUUID(), id, providers.name, providers.summaryModel, CONSULTATION_SCHEMA_VERSION, JSON.stringify(analysis), completedAt, completedAt),
      db.prepare(`UPDATE consultations SET status='review_required', failure_message=NULL, updated_at=? WHERE id=? AND status='processing'`).bind(completedAt, id),
    ]);
    await writeAudit({ actorId, consultationId: id, eventType: "analysis.created", metadata: { provider: providers.name, model: providers.summaryModel, schemaVersion: CONSULTATION_SCHEMA_VERSION } });
  } catch (error) {
    const failureMessage = safeProcessingFailureMessage(error);
    try {
      const failedAt = new Date().toISOString();
      await db.prepare(`UPDATE consultations SET status='failed', failure_message=?, updated_at=? WHERE id=? AND status='processing'`)
        .bind(failureMessage, failedAt, id)
        .run();
      await writeAudit({
        actorId,
        consultationId: id,
        eventType: "processing.failed",
        metadata: {
          provider: providers.name,
          failureCode: error instanceof PublicApiError ? error.code : "processing_error",
          retryable: error instanceof PublicApiError ? error.retryable : false,
        },
      });
    } catch {
      // The job already has a safe terminal state when failure persistence is unavailable.
    }
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  let consultationId: string | null = null;
  try {
    const session = await requireSession();
    verifyCsrf(request, session);
    const { id } = await context.params;
    consultationId = id;
    const db = await ensureDatabase();
    const consultation = await getConsultation(id, db);
    if (!consultation) return Response.json({ error: "Consultation not found." }, { status: 404 });
    if (!canAccessConsultation({ role: session.role, userId: session.id, coordinatorId: consultation.coordinator_id })) {
      return Response.json({ error: "Forbidden." }, { status: 403 });
    }
    const existing = await getAnalysis(id, db);
    const targetProvider = usesDurableAwsProcessing() ? "aws" : getProviderName();
    const replacingFixture = existing?.provider === "fixture" && targetProvider !== "fixture";
    const disposition = processingDisposition(consultation.status, Boolean(existing) && !replacingFixture);
    if (disposition === "return_existing") {
      return Response.json({ status: consultation.status, idempotent: true });
    }
    if (disposition === "return_in_progress") {
      return Response.json({ status: "processing", idempotent: true }, { status: 202 });
    }
    if (disposition === "reject") {
      assertTransition(consultation.status, "processing");
    }
    assertTransition(consultation.status, "processing");
    const recording = await getRecording(id, db);
    if (!recording || recording.deleted_at) return Response.json({ error: "No active recording is available." }, { status: 409 });

    const now = new Date().toISOString();
    await db.prepare(`UPDATE consultations SET status='processing', failure_message=NULL, updated_at=? WHERE id=?`)
      .bind(now, id)
      .run();
    await writeAudit({
      actorId: session.id,
      consultationId: id,
      eventType: replacingFixture ? "processing.fixture_replacement_started" : "processing.started",
      metadata: { provider: targetProvider },
    });

    if (targetProvider === "aws") {
      const jobId = awsJobIdFromStorageKey(recording.storage_key);
      if (!jobId) throw new PublicApiError("This consultation does not have an AWS upload job. Upload the recording again.", 409, false, "aws_job_missing");
      await queueAwsJob({ actorId: session.id, role: session.role, consultationId: id }, jobId);
      await db.prepare(`UPDATE recordings SET status='queued', updated_at=? WHERE consultation_id=?`).bind(now, id).run();
      await writeAudit({ actorId: session.id, consultationId: id, eventType: "recording.aws_upload_verified", metadata: { provider: "aws" } });
      return Response.json({ status: "processing", queued: true, durable: true }, { status: 202 });
    }

    const providers = createProviders(new R2AudioStorage());

    const job = runProcessingJob({
      actorId: session.id,
      consultationId: id,
      db,
      providers,
      recording,
      staffSpeakerRole: consultation.speaker_role,
    });
    const executionContext = getRequestExecutionContext();
    if (executionContext) executionContext.waitUntil(job);
    else void job;

    return Response.json({ status: "processing", queued: true }, { status: 202 });
  } catch (error) {
    if (consultationId) {
      try {
        const db = await ensureDatabase();
        const now = new Date().toISOString();
        await db.prepare(`UPDATE consultations SET status='failed', failure_message=?, updated_at=? WHERE id=? AND status IN ('uploaded','processing')`)
          .bind(safeProcessingFailureMessage(error), now, consultationId)
          .run();
      } catch {
        // Preserve the original safe error response.
      }
    }
    return apiError(error);
  }
}

function getProviderName(): "fixture" | "openai" {
  if (appConfig.aiProvider === "fixture") return "fixture";
  if (appConfig.aiProvider === "openai") return "openai";
  throw new PublicApiError("The configured AI provider is not supported.", 503, false, "provider_invalid");
}
