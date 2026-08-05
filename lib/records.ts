import type { ConsultationAnalysis } from "./analysis-schema";
import { ensureDatabase, type D1DatabaseLike } from "./d1";
import type { ConsultationStatus, NormalizedTranscript } from "./types";
import type { StaffSpeakerRole } from "./speaker-roles";

export type ConsultationRow = {
  id: string;
  patient_reference: string;
  appointment_reference: string | null;
  speaker_role: StaffSpeakerRole;
  coordinator_id: string;
  coordinator_name?: string;
  coordinator_email?: string;
  location_id: string | null;
  location_name?: string | null;
  status: ConsultationStatus;
  consented_at: string | null;
  consent_version: string | null;
  recording_started_at: string | null;
  recording_ended_at: string | null;
  submitted_at: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
};

export type RecordingRow = {
  id: string;
  consultation_id: string;
  storage_key: string;
  mime_type: string;
  byte_size: number;
  duration_seconds: number;
  status: string;
  delete_after: string | null;
  deleted_at: string | null;
};

export type TranscriptRow = {
  id: string;
  consultation_id: string;
  provider: string;
  model: string;
  text: string;
  normalized_json: string;
};

export type AnalysisRow = {
  id: string;
  consultation_id: string;
  provider: string;
  model: string;
  schema_version: string;
  analysis_json: string;
  coordinator_edits_json: string | null;
  approved_at: string | null;
  approved_by_id: string | null;
};

export async function getConsultation(id: string, database?: D1DatabaseLike): Promise<ConsultationRow | null> {
  const db = database ?? await ensureDatabase();
  return db.prepare(`
    SELECT c.*, u.name AS coordinator_name, u.email AS coordinator_email, l.name AS location_name
    FROM consultations c
    JOIN users u ON u.id = c.coordinator_id
    LEFT JOIN locations l ON l.id = c.location_id
    WHERE c.id = ?
  `).bind(id).first<ConsultationRow>();
}

export async function getRecording(consultationId: string, database?: D1DatabaseLike): Promise<RecordingRow | null> {
  const db = database ?? await ensureDatabase();
  return db.prepare(`SELECT * FROM recordings WHERE consultation_id = ?`).bind(consultationId).first<RecordingRow>();
}

export async function getTranscript(consultationId: string, database?: D1DatabaseLike): Promise<TranscriptRow | null> {
  const db = database ?? await ensureDatabase();
  return db.prepare(`SELECT * FROM transcripts WHERE consultation_id = ?`).bind(consultationId).first<TranscriptRow>();
}

export async function getAnalysis(consultationId: string, database?: D1DatabaseLike): Promise<AnalysisRow | null> {
  const db = database ?? await ensureDatabase();
  return db.prepare(`SELECT * FROM analyses WHERE consultation_id = ?`).bind(consultationId).first<AnalysisRow>();
}

export function parseTranscript(row: TranscriptRow | null): NormalizedTranscript | null {
  return row ? JSON.parse(row.normalized_json) as NormalizedTranscript : null;
}

export function parseAnalysis(row: AnalysisRow | null): ConsultationAnalysis | null {
  if (!row) return null;
  return JSON.parse(row.coordinator_edits_json ?? row.analysis_json) as ConsultationAnalysis;
}
