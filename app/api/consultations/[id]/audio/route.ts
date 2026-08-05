import { canAccessConsultation } from "@/lib/authorization";
import { ensureDatabase, writeAudit } from "@/lib/d1";
import { apiError } from "@/lib/http";
import { getConsultation, getRecording } from "@/lib/records";
import { requireSession } from "@/lib/session";
import { R2AudioStorage } from "@/lib/storage";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const db = await ensureDatabase();
    const consultation = await getConsultation(id, db);
    if (!consultation) return new Response("Not found.", { status: 404 });
    if (!canAccessConsultation({ role: session.role, userId: session.id, coordinatorId: consultation.coordinator_id })) {
      return new Response("Forbidden.", { status: 403 });
    }
    if (consultation.status === "deleted") return new Response("Gone.", { status: 410 });
    const recording = await getRecording(id, db);
    if (!recording || recording.deleted_at) return new Response("Gone.", { status: 410 });
    const object = await new R2AudioStorage().get(recording.storage_key);
    if (!object) return new Response("Not found.", { status: 404 });
    await writeAudit({ actorId: session.id, consultationId: id, eventType: "audio.played" });
    return new Response(object.bytes, {
      headers: {
        "Content-Type": recording.mime_type,
        "Content-Length": String(recording.byte_size),
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
