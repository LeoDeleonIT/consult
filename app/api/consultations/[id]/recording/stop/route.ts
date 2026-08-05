import { canAccessConsultation } from "@/lib/authorization";
import { ensureDatabase, writeAudit } from "@/lib/d1";
import { apiError } from "@/lib/http";
import { getConsultation } from "@/lib/records";
import { requireSession, verifyCsrf } from "@/lib/session";

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
    if (consultation.status !== "recording") return Response.json({ error: "No active recording." }, { status: 409 });
    const now = new Date().toISOString();
    await db.prepare(`UPDATE consultations SET recording_ended_at=?, updated_at=? WHERE id=?`).bind(now, now, id).run();
    await writeAudit({ actorId: session.id, consultationId: id, eventType: "recording.stopped" });
    return Response.json({ status: "recording", recordingEndedAt: now });
  } catch (error) {
    return apiError(error);
  }
}
