import { consultationAnalysisSchema } from "@/lib/analysis-schema";
import { canSubmitConsultation } from "@/lib/authorization";
import { ensureDatabase, writeAudit } from "@/lib/d1";
import { apiError } from "@/lib/http";
import { getAnalysis, getConsultation } from "@/lib/records";
import { requireSession, verifyCsrf } from "@/lib/session";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
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
    if (consultation.status !== "review_required") return Response.json({ error: "This consultation is not ready for editing." }, { status: 409 });
    const existing = await getAnalysis(id, db);
    if (!existing) return Response.json({ error: "Analysis not found." }, { status: 404 });
    const analysis = consultationAnalysisSchema.parse(await request.json());
    const now = new Date().toISOString();
    await db.prepare(`UPDATE analyses SET coordinator_edits_json=?, updated_at=? WHERE consultation_id=?`)
      .bind(JSON.stringify(analysis), now, id)
      .run();
    await writeAudit({ actorId: session.id, consultationId: id, eventType: "analysis.edited" });
    return Response.json({ analysis });
  } catch (error) {
    return apiError(error);
  }
}
