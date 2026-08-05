import { canSubmitConsultation } from "@/lib/authorization";
import { ensureDatabase, writeAudit } from "@/lib/d1";
import { apiError } from "@/lib/http";
import { getAnalysis, getConsultation } from "@/lib/records";
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
    if (!canSubmitConsultation({ role: session.role, userId: session.id, coordinatorId: consultation.coordinator_id })) {
      return Response.json({ error: "Forbidden." }, { status: 403 });
    }
    assertTransition(consultation.status, "submitted");
    if (!(await getAnalysis(id, db))) return Response.json({ error: "Analysis not found." }, { status: 409 });
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`UPDATE consultations SET status='submitted', submitted_at=?, updated_at=? WHERE id=?`).bind(now, now, id),
      db.prepare(`UPDATE analyses SET approved_at=?, approved_by_id=?, updated_at=? WHERE consultation_id=?`).bind(now, session.id, now, id),
    ]);
    await writeAudit({ actorId: session.id, consultationId: id, eventType: "consultation.submitted" });
    return Response.json({ status: "submitted" });
  } catch (error) {
    return apiError(error);
  }
}
