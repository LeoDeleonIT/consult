import { canAccessConsultation } from "@/lib/authorization";
import { ensureDatabase } from "@/lib/d1";
import { apiError } from "@/lib/http";
import { getConsultation } from "@/lib/records";
import { requireSession, verifyCsrf } from "@/lib/session";
import { assertTransition } from "@/lib/state-machine";

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
    if (consultation.status === "consented") {
      return Response.json({ status: "consented", idempotent: true });
    }
    assertTransition(consultation.status, "consented");
    const now = new Date().toISOString();
    await db.prepare(`UPDATE consultations SET status='consented', recording_started_at=NULL, recording_ended_at=NULL, updated_at=? WHERE id=?`)
      .bind(now, id)
      .run();
    return Response.json({ status: "consented" });
  } catch (error) {
    return apiError(error);
  }
}
