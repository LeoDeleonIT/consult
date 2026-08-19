import { canAccessConsultation } from "@/lib/authorization";
import { ensureDatabase, writeAudit } from "@/lib/d1";
import { apiError } from "@/lib/http";
import { getConsultation } from "@/lib/records";
import { requireSession, verifyCsrf } from "@/lib/session";
import { canStartRecording } from "@/lib/state-machine";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const session = await requireSession("coordinator");
    verifyCsrf(request, session);
    const { id } = await context.params;
    const db = await ensureDatabase();
    const consultation = await getConsultation(id, db);
    if (!consultation) return Response.json({ error: "Consultation not found." }, { status: 404 });
    if (!canAccessConsultation({ role: session.role, userId: session.id, coordinatorId: consultation.coordinator_id })) {
      return Response.json({ error: "Forbidden." }, { status: 403 });
    }
    if (consultation.status === "recording") {
      return Response.json({
        status: "recording",
        recordingStartedAt: consultation.recording_started_at,
        idempotent: true,
      });
    }
    if (!canStartRecording(consultation.status, consultation.consented_at)) {
      return Response.json({ error: "Recording can only start after consent and before audio is saved." }, { status: 409 });
    }
    const now = new Date().toISOString();
    await db.prepare(`UPDATE consultations SET status='recording', recording_started_at=?, updated_at=? WHERE id=?`)
      .bind(now, now, id)
      .run();
    await writeAudit({ actorId: session.id, consultationId: id, eventType: "recording.started" });
    return Response.json({ status: "recording", recordingStartedAt: now });
  } catch (error) {
    return apiError(error);
  }
}
