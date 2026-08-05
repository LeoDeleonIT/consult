import { canAccessConsultation } from "@/lib/authorization";
import { detectConversationTags } from "@/lib/conversation-tags";
import { ensureDatabase, writeAudit } from "@/lib/d1";
import { apiError } from "@/lib/http";
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
    const consultation = await getConsultation(id, db);
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
    const [recording, transcriptRow, analysisRow, audit] = await Promise.all([
      getRecording(id, db),
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
