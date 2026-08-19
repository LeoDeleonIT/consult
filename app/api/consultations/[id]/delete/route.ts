import { canDeleteConsultation } from "@/lib/authorization";
import { awsJobIdFromStorageKey, deleteAwsJob } from "@/lib/aws-client";
import { ensureDatabase, writeAudit } from "@/lib/d1";
import { apiError } from "@/lib/http";
import { getConsultation, getRecording } from "@/lib/records";
import { requireSession, verifyCsrf } from "@/lib/session";
import { assertTransition } from "@/lib/state-machine";
import { R2AudioStorage } from "@/lib/storage";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const session = await requireSession("manager");
    verifyCsrf(request, session);
    if (!canDeleteConsultation(session.role)) return Response.json({ error: "Forbidden." }, { status: 403 });
    const { id } = await context.params;
    const db = await ensureDatabase();
    const consultation = await getConsultation(id, db);
    if (!consultation) return Response.json({ error: "Consultation not found." }, { status: 404 });
    assertTransition(consultation.status, "deleted");
    const recording = await getRecording(id, db);
    if (recording && !recording.deleted_at) {
      const awsJobId = awsJobIdFromStorageKey(recording.storage_key);
      if (awsJobId) {
        await deleteAwsJob({ actorId: session.id, role: session.role, consultationId: id }, awsJobId);
      } else {
        await new R2AudioStorage().delete(recording.storage_key);
      }
    }
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`DELETE FROM transcripts WHERE consultation_id=?`).bind(id),
      db.prepare(`DELETE FROM analyses WHERE consultation_id=?`).bind(id),
      db.prepare(`UPDATE recordings SET status='deleted', storage_key='', deleted_at=?, updated_at=? WHERE consultation_id=?`).bind(now, now, id),
      db.prepare(`UPDATE consultations SET status='deleted', patient_reference='[deleted]', appointment_reference=NULL, failure_message=NULL, updated_at=? WHERE id=?`).bind(now, id),
    ]);
    await writeAudit({ actorId: session.id, consultationId: id, eventType: "consultation.deleted" });
    return Response.json({ status: "deleted" });
  } catch (error) {
    return apiError(error);
  }
}
