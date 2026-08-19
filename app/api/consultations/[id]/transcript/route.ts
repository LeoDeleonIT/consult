import { z } from "zod";
import { canSubmitConsultation } from "@/lib/authorization";
import { ensureDatabase, writeAudit } from "@/lib/d1";
import { apiError } from "@/lib/http";
import { getConsultation, getTranscript, parseTranscript } from "@/lib/records";
import { requireSession, verifyCsrf } from "@/lib/session";
import { applySpeakerMapping } from "@/lib/speaker-mapping";

const mappingSchema = z.object({
  staffSpeakerLabel: z.string().min(1).max(40),
  patientSpeakerLabel: z.string().min(1).max(40),
});

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
    if (consultation.status !== "review_required") {
      return Response.json({ error: "Speaker labels can only be confirmed during coordinator review." }, { status: 409 });
    }
    const transcriptRow = await getTranscript(id, db);
    const transcript = parseTranscript(transcriptRow);
    if (!transcript || !transcriptRow) return Response.json({ error: "Transcript not found." }, { status: 404 });
    const mapped = applySpeakerMapping(transcript, mappingSchema.parse(await request.json()));
    const now = new Date().toISOString();
    await db.prepare(`UPDATE transcripts SET normalized_json=?, updated_at=? WHERE consultation_id=?`)
      .bind(JSON.stringify(mapped), now, id)
      .run();
    await writeAudit({ actorId: session.id, consultationId: id, eventType: "transcript.speaker_mapping_confirmed", metadata: { labelCount: new Set(mapped.segments.map((segment) => segment.speakerLabel).filter(Boolean)).size } });
    return Response.json({ transcript: mapped });
  } catch (error) {
    return apiError(error);
  }
}
