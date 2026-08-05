CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('coordinator', 'manager')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY NOT NULL,
  patient_reference TEXT NOT NULL,
  appointment_reference TEXT,
  coordinator_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,
  consented_at TEXT,
  consent_version TEXT,
  recording_started_at TEXT,
  recording_ended_at TEXT,
  submitted_at TEXT,
  failure_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY NOT NULL,
  consultation_id TEXT NOT NULL UNIQUE REFERENCES consultations(id),
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  status TEXT NOT NULL,
  delete_after TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY NOT NULL,
  consultation_id TEXT NOT NULL UNIQUE REFERENCES consultations(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  text TEXT NOT NULL,
  normalized_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY NOT NULL,
  consultation_id TEXT NOT NULL UNIQUE REFERENCES consultations(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  analysis_json TEXT NOT NULL,
  coordinator_edits_json TEXT,
  approved_at TEXT,
  approved_by_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT REFERENCES users(id),
  consultation_id TEXT REFERENCES consultations(id),
  event_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS consultations_coordinator_idx ON consultations(coordinator_id);
CREATE INDEX IF NOT EXISTS consultations_status_idx ON consultations(status);
CREATE INDEX IF NOT EXISTS audit_consultation_idx ON audit_events(consultation_id, created_at);
