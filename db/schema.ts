import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["coordinator", "manager"] }).notNull(),
  locationId: text("location_id"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  postalCode: text("postal_code").notNull(),
  phone: text("phone").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const consultations = sqliteTable("consultations", {
  id: text("id").primaryKey(),
  patientReference: text("patient_reference").notNull(),
  appointmentReference: text("appointment_reference"),
  speakerRole: text("speaker_role", { enum: ["doctor", "treatment_coordinator", "assistant"] }).notNull().default("treatment_coordinator"),
  coordinatorId: text("coordinator_id").notNull(),
  locationId: text("location_id"),
  status: text("status").notNull(),
  consentedAt: text("consented_at"),
  consentVersion: text("consent_version"),
  recordingStartedAt: text("recording_started_at"),
  recordingEndedAt: text("recording_ended_at"),
  submittedAt: text("submitted_at"),
  failureMessage: text("failure_message"),
  ...timestamps,
});

export const recordings = sqliteTable("recordings", {
  id: text("id").primaryKey(),
  consultationId: text("consultation_id").notNull().unique(),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  status: text("status").notNull(),
  deleteAfter: text("delete_after"),
  deletedAt: text("deleted_at"),
  ...timestamps,
});

export const transcripts = sqliteTable("transcripts", {
  id: text("id").primaryKey(),
  consultationId: text("consultation_id").notNull().unique(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  text: text("text").notNull(),
  normalizedJson: text("normalized_json").notNull(),
  ...timestamps,
});

export const analyses = sqliteTable("analyses", {
  id: text("id").primaryKey(),
  consultationId: text("consultation_id").notNull().unique(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  schemaVersion: text("schema_version").notNull(),
  analysisJson: text("analysis_json").notNull(),
  coordinatorEditsJson: text("coordinator_edits_json"),
  approvedAt: text("approved_at"),
  approvedById: text("approved_by_id"),
  ...timestamps,
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorId: text("actor_id"),
  consultationId: text("consultation_id"),
  eventType: text("event_type").notNull(),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStartedAt: integer("window_started_at").notNull(),
});
