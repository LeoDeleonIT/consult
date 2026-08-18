import { CONSULTATION_SCHEMA_VERSION, consultationAnalysisSchema } from "./analysis-schema";
import { getAwsJob, awsJobIdFromStorageKey } from "./aws-client";
import { normalizedTranscriptSchema } from "./aws-contract";
import { writeAudit, type D1DatabaseLike } from "./d1";
import type { ConsultationRow, RecordingRow } from "./records";
import type { Role } from "./types";

export async function syncAwsJob(input: {
  db: D1DatabaseLike;
  actorId: string;
  role: Role;
  consultation: ConsultationRow;
  recording: RecordingRow;
}): Promise<boolean> {
  const jobId = awsJobIdFromStorageKey(input.recording.storage_key);
  if (!jobId || !["processing", "failed"].includes(input.consultation.status)) return false;
  const job = await getAwsJob({
    actorId: input.actorId,
    role: input.role,
    consultationId: input.consultation.id,
  }, jobId);

  if (job.status === "complete") {
    const transcript = normalizedTranscriptSchema.parse(job.transcript);
    const analysis = consultationAnalysisSchema.parse(job.analysis);
    if (!job.transcriptionModel || !job.analysisModel) throw new Error("AWS completion metadata is incomplete.");
    const completedAt = new Date().toISOString();
    await input.db.batch([
      input.db.prepare(`
        INSERT INTO transcripts (id,consultation_id,provider,model,text,normalized_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(consultation_id) DO UPDATE SET provider=excluded.provider,model=excluded.model,text=excluded.text,normalized_json=excluded.normalized_json,updated_at=excluded.updated_at
      `).bind(crypto.randomUUID(), input.consultation.id, "aws", job.transcriptionModel, transcript.text, JSON.stringify(transcript), completedAt, completedAt),
      input.db.prepare(`
        INSERT INTO analyses (id,consultation_id,provider,model,schema_version,analysis_json,coordinator_edits_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,NULL,?,?)
        ON CONFLICT(consultation_id) DO UPDATE SET provider=excluded.provider,model=excluded.model,schema_version=excluded.schema_version,analysis_json=excluded.analysis_json,coordinator_edits_json=NULL,updated_at=excluded.updated_at
      `).bind(crypto.randomUUID(), input.consultation.id, "aws", job.analysisModel, CONSULTATION_SCHEMA_VERSION, JSON.stringify(analysis), completedAt, completedAt),
      input.db.prepare(`UPDATE recordings SET status='processed', updated_at=? WHERE consultation_id=?`).bind(completedAt, input.consultation.id),
      input.db.prepare(`UPDATE consultations SET status='review_required', failure_message=NULL, updated_at=? WHERE id=? AND status IN ('processing','failed')`).bind(completedAt, input.consultation.id),
    ]);
    if (input.consultation.status !== "review_required") {
      await writeAudit({
        actorId: input.actorId,
        consultationId: input.consultation.id,
        eventType: "aws.processing.completed",
        metadata: { provider: "aws", transcriptionModel: job.transcriptionModel, analysisModel: job.analysisModel },
      });
    }
    return true;
  }

  if (job.status === "failed") {
    const failedAt = new Date().toISOString();
    await input.db.prepare(`UPDATE consultations SET status='failed', failure_message=?, updated_at=? WHERE id=? AND status='processing'`)
      .bind(safeAwsFailureMessage(job.failureCode), failedAt, input.consultation.id)
      .run();
    if (input.consultation.status !== "failed") {
      await writeAudit({
        actorId: input.actorId,
        consultationId: input.consultation.id,
        eventType: "aws.processing.failed",
        metadata: { provider: "aws", failureCode: safeAwsFailureCode(job.failureCode) },
      });
    }
    return true;
  }

  return false;
}

function safeAwsFailureCode(value: string | null | undefined): string {
  return value && /^[a-z0-9_]{1,80}$/.test(value) ? value : "aws_processing_failed";
}

function safeAwsFailureMessage(value: string | null | undefined): string {
  const code = safeAwsFailureCode(value);
  const messages: Record<string, string> = {
    transcription_failed: "Amazon Transcribe could not complete this synthetic recording. The source audio is saved for an authorized retry.",
    bedrock_access_denied: "Amazon Bedrock model access is not enabled for the configured model. Ask an AWS administrator to review model access.",
    bedrock_invalid_output: "Amazon Bedrock returned an invalid draft. No analysis was saved; retry after the model configuration is reviewed.",
    object_validation_failed: "The saved audio did not pass the AWS size, MIME, encryption, or file-signature check.",
  };
  return messages[code] ?? "AWS processing could not be completed. The source audio remains saved for an authorized retry.";
}
