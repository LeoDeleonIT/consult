import { canAccessConsultation } from "@/lib/authorization";
import { ensureDatabase, writeAudit } from "@/lib/d1";
import { appConfig } from "@/lib/env";
import { apiError } from "@/lib/http";
import { getConsultation } from "@/lib/records";
import { requireSession, verifyCsrf } from "@/lib/session";
import { assertTransition } from "@/lib/state-machine";
import { isAllowedAudio, randomStorageKey, R2AudioStorage } from "@/lib/storage";

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
    assertTransition(consultation.status, "uploaded");

    const form = await request.formData();
    const file = form.get("audio");
    const durationSeconds = Number(form.get("durationSeconds"));
    if (!(file instanceof File)) return Response.json({ error: "Choose an audio recording to upload." }, { status: 400 });
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > appConfig.maxRecordingMinutes * 60 + 5) {
      return Response.json({ error: "Recording duration is invalid or exceeds the configured limit." }, { status: 400 });
    }
    if (file.size > appConfig.maxUploadMb * 1024 * 1024) {
      return Response.json({ error: `Recording exceeds the ${appConfig.maxUploadMb} MB upload limit.` }, { status: 413 });
    }
    const bytes = await file.arrayBuffer();
    if (!isAllowedAudio(bytes, file.type)) {
      return Response.json({ error: "The uploaded file is not a supported audio recording." }, { status: 415 });
    }
    const storage = new R2AudioStorage();
    const storageKey = randomStorageKey(id, file.type);
    await storage.put({ key: storageKey, bytes, mimeType: file.type });
    const now = new Date().toISOString();
    const deleteAfter = new Date(Date.now() + appConfig.audioRetentionDays * 86400000).toISOString();
    await db.batch([
      db.prepare(`
        INSERT INTO recordings (id,consultation_id,storage_key,mime_type,byte_size,duration_seconds,status,delete_after,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(consultation_id) DO UPDATE SET storage_key=excluded.storage_key,mime_type=excluded.mime_type,byte_size=excluded.byte_size,duration_seconds=excluded.duration_seconds,status='stored',delete_after=excluded.delete_after,updated_at=excluded.updated_at
      `).bind(crypto.randomUUID(), id, storageKey, file.type, file.size, Math.round(durationSeconds), "stored", deleteAfter, now, now),
      db.prepare(`UPDATE consultations SET status='uploaded', recording_ended_at=COALESCE(recording_ended_at,?), updated_at=? WHERE id=?`).bind(now, now, id),
    ]);
    await writeAudit({
      actorId: session.id,
      consultationId: id,
      eventType: "recording.uploaded",
      metadata: { byteSize: file.size, mimeType: file.type, durationSeconds: Math.round(durationSeconds) },
    });
    return Response.json({ status: "uploaded" });
  } catch (error) {
    return apiError(error);
  }
}
