import { z } from "zod";
import { ensureDatabase, writeAudit } from "@/lib/d1";
import { apiError } from "@/lib/http";
import { TRACKED_CONVERSATION_TAGS } from "@/lib/conversation-tags";
import { requireSession, verifyCsrf } from "@/lib/session";
import type { ConsultationRow } from "@/lib/records";
import { STAFF_SPEAKER_ROLES } from "@/lib/speaker-roles";

type ConsultationListRow = ConsultationRow & {
  tag_payment_plans: number;
  tag_sunbit: number;
  tag_cherry: number;
  tag_care_credit: number;
};

const createSchema = z.object({
  patientReference: z.string().trim().min(2).max(80),
  appointmentReference: z.string().trim().max(80).optional().nullable(),
  speakerRole: z.enum(STAFF_SPEAKER_ROLES),
  consentConfirmed: z.literal(true),
  consentVersion: z.string().min(1).max(40).default("pilot-v1"),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    const db = await ensureDatabase();
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search")?.trim();
    const keyword = url.searchParams.get("keyword")?.trim().slice(0, 100);
    const coordinator = url.searchParams.get("coordinator");
    const location = url.searchParams.get("location");

    const conditions: string[] = [];
    const values: unknown[] = [];
    if (session.role === "coordinator") {
      conditions.push("c.coordinator_id = ?");
      values.push(session.id);
      conditions.push("c.status != 'deleted'");
    }
    if (status) {
      conditions.push("c.status = ?");
      values.push(status);
    }
    if (search) {
      conditions.push("c.patient_reference LIKE ?");
      values.push(`%${search}%`);
    }
    if (keyword && session.role === "manager") {
      conditions.push(`(
        EXISTS (
          SELECT 1 FROM transcripts t
          WHERE t.consultation_id = c.id AND instr(lower(t.text), lower(?)) > 0
        )
        OR EXISTS (
          SELECT 1 FROM analyses a
          WHERE a.consultation_id = c.id
            AND instr(lower(COALESCE(a.coordinator_edits_json, a.analysis_json)), lower(?)) > 0
        )
      )`);
      values.push(keyword, keyword);
    }
    if (coordinator && session.role === "manager") {
      conditions.push("c.coordinator_id = ?");
      values.push(coordinator);
    }
    if (location && session.role === "manager") {
      conditions.push("c.location_id = ?");
      values.push(location);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await db.prepare(`
      SELECT c.*, u.name AS coordinator_name, u.email AS coordinator_email, l.name AS location_name,
        CASE WHEN
          EXISTS (SELECT 1 FROM transcripts t WHERE t.consultation_id=c.id AND instr(lower(t.text), 'payment plan') > 0)
          OR EXISTS (SELECT 1 FROM analyses a WHERE a.consultation_id=c.id AND instr(lower(COALESCE(a.coordinator_edits_json, a.analysis_json)), 'payment plan') > 0)
        THEN 1 ELSE 0 END AS tag_payment_plans,
        CASE WHEN
          EXISTS (SELECT 1 FROM transcripts t WHERE t.consultation_id=c.id AND (instr(lower(t.text), 'sunbit') > 0 OR instr(lower(t.text), 'sun bit') > 0))
          OR EXISTS (SELECT 1 FROM analyses a WHERE a.consultation_id=c.id AND (instr(lower(COALESCE(a.coordinator_edits_json, a.analysis_json)), 'sunbit') > 0 OR instr(lower(COALESCE(a.coordinator_edits_json, a.analysis_json)), 'sun bit') > 0))
        THEN 1 ELSE 0 END AS tag_sunbit,
        CASE WHEN
          EXISTS (SELECT 1 FROM transcripts t WHERE t.consultation_id=c.id AND instr(lower(t.text), 'cherry') > 0)
          OR EXISTS (SELECT 1 FROM analyses a WHERE a.consultation_id=c.id AND instr(lower(COALESCE(a.coordinator_edits_json, a.analysis_json)), 'cherry') > 0)
        THEN 1 ELSE 0 END AS tag_cherry,
        CASE WHEN
          EXISTS (SELECT 1 FROM transcripts t WHERE t.consultation_id=c.id AND (instr(lower(t.text), 'care credit') > 0 OR instr(lower(t.text), 'carecredit') > 0))
          OR EXISTS (SELECT 1 FROM analyses a WHERE a.consultation_id=c.id AND (instr(lower(COALESCE(a.coordinator_edits_json, a.analysis_json)), 'care credit') > 0 OR instr(lower(COALESCE(a.coordinator_edits_json, a.analysis_json)), 'carecredit') > 0))
        THEN 1 ELSE 0 END AS tag_care_credit
      FROM consultations c
      JOIN users u ON u.id = c.coordinator_id
      LEFT JOIN locations l ON l.id = c.location_id
      ${where}
      ORDER BY c.created_at DESC
      LIMIT 100
    `).bind(...values).all<ConsultationListRow>();
    const consultations = (rows.results ?? []).map((row) => {
      const flags = {
        payment_plans: Boolean(row.tag_payment_plans),
        sunbit: Boolean(row.tag_sunbit),
        cherry: Boolean(row.tag_cherry),
        care_credit: Boolean(row.tag_care_credit),
      };
      const consultation: Partial<ConsultationListRow> = { ...row };
      delete consultation.tag_payment_plans;
      delete consultation.tag_sunbit;
      delete consultation.tag_cherry;
      delete consultation.tag_care_credit;
      return {
        ...consultation,
        conversationTags: TRACKED_CONVERSATION_TAGS.filter((tag) => flags[tag.key]),
      };
    });
    return Response.json({ consultations });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession("coordinator");
    verifyCsrf(request, session);
    const input = createSchema.parse(await request.json());
    const db = await ensureDatabase();
    const assignedOffice = await db.prepare(`
      SELECT u.location_id, l.name AS location_name
      FROM users u LEFT JOIN locations l ON l.id = u.location_id
      WHERE u.id = ? AND u.active = 1
    `).bind(session.id).first<{ location_id: string | null; location_name: string | null }>();
    if (!assignedOffice?.location_id) {
      throw new Response("No office is assigned to this account. Ask a manager to update access.", { status: 409 });
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO consultations (
        id, patient_reference, appointment_reference, speaker_role, coordinator_id, location_id, status,
        consented_at, consent_version, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id,
      input.patientReference,
      input.appointmentReference || null,
      input.speakerRole,
      session.id,
      assignedOffice.location_id,
      "consented",
      now,
      input.consentVersion,
      now,
      now,
    ).run();
    await writeAudit({
      actorId: session.id,
      consultationId: id,
      eventType: "consultation.created",
      metadata: { speakerRole: input.speakerRole, locationId: assignedOffice.location_id },
    });
    await writeAudit({
      actorId: session.id,
      consultationId: id,
      eventType: "consent.accepted",
      metadata: { consentVersion: input.consentVersion },
    });
    return Response.json({ id, status: "consented" }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
