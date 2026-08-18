import { canAccessConsultation } from "@/lib/authorization";
import { syncAwsJob } from "@/lib/aws-sync";
import { detectConversationTags } from "@/lib/conversation-tags";
import { ensureDatabase, writeAudit } from "@/lib/d1";
import { apiError, PublicApiError } from "@/lib/http";
import {
  getAnalysis,
  getConsultation,
  getRecording,
  getTranscript,
  parseAnalysis,
  parseTranscript,
} from "@/lib/records";
import { requireSession } from "@/lib/session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const db = await ensureDatabase();
    let consultation = await getConsultation(id, db);
    if (!consultation) return Response.json({ error: "Consultation not found." }, { status: 404 });
    if (!canAccessConsultation({ role: session.role, userId: session.id, coordinatorId: consultation.coordinator_id })) {
      return Response.json({ error: "Forbidden." }, { status: 403 });
    }
    if (consultation.status === "deleted") {
      return Response.json({
        consultation: {
          id: consultation.id,
          status: "deleted",
          coordinator_name: consultation.coordinator_name,
          created_at: consultation.created_at,
          updated_at: consultation.updated_at,
        },
        recording: null,
        transcript: null,
        analysis: null,
        audit: await loadAudit(db, id),
      });
    }
    let recording = await getRecording(id, db);
    if (recording && ["processing", "failed"].includes(consultation.status)) {
      try {
        const changed = await syncAwsJob({ db, actorId: session.id, role: session.role, consultation, recording });
        if (changed) {
          consultation = await getConsultation(id, db) ?? consultation;
          recording = await getRecording(id, db);
        }
      } catch (error) {
        // Transient polling failures leave durable AWS processing untouched. A
        // rejected/corrupt terminal response fails closed instead of polling forever.
        if (consultation.status === "processing" && error instanceof PublicApiError && !error.retryable) {
          const failedAt = new Date().toISOString();
          await db.prepare(`UPDATE consultations SET status='failed', failure_message=?, updated_at=? WHERE id=? AND status='processing'`)
            .bind("AWS returned an invalid or unauthorized processing response. The source recording remains saved for administrator review.", failedAt, id)
            .run();
          await writeAudit({ actorId: session.id, consultationId: id, eventType: "aws.processing.sync_rejected", metadata: { failureCode: error.code } });
          consultation = await getConsultation(id, db) ?? consultation;
        }
      }
    }
    const [transcriptRow, analysisRow, audit] = await Promise.all([
      getTranscript(id, db),
      getAnalysis(id, db),
      loadAudit(db, id),
    ]);
    if (session.role === "manager") {
      await writeAudit({ actorId: session.id, consultationId: id, eventType: "consultation.viewed_by_manager" });
    }
    const transcript = parseTranscript(transcriptRow);
    const analysis = parseAnalysis(analysisRow);
    return Response.json({
      consultation,
      recording: recording ? {
        id: recording.id,
        mimeType: recording.mime_type,
        byteSize: recording.byte_size,
        durationSeconds: recording.duration_seconds,
        status: recording.status,
        deletedAt: recording.deleted_at,
      } : null,
      transcript,
      transcriptProvider: transcriptRow ? { provider: transcriptRow.provider, model: transcriptRow.model } : null,
      analysis,
      analysisProvider: analysisRow ? { provider: analysisRow.provider, model: analysisRow.model, approvedAt: analysisRow.approved_at } : null,
      conversationTags: detectConversationTags(transcript?.text, analysis ? JSON.stringify(analysis) : null),
      audit,
    });
  } catch (error) {
    return apiError(error);
  }
}

async function loadAudit(db: Awaited<ReturnType<typeof ensureDatabase>>, consultationId: string) {
  const events = await db.prepare(`
    SELECT a.id, a.event_type, a.metadata_json, a.created_at, u.name AS actor_name
    FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.consultation_id = ?
    ORDER BY a.created_at DESC
    LIMIT 100
  `).bind(consultationId).all();
  return events.results ?? [];
}
