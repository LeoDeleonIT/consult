import { env } from "cloudflare:workers";
import bcrypt from "bcryptjs";
import { sanitizeAuditMetadata } from "./audit";
import { CENTRAL_MANAGER_ACCOUNTS, officeAccountEmail, PILOT_LOCATIONS } from "./locations";

export type D1Result<T = Record<string, unknown>> = {
  results?: T[];
  success: boolean;
  meta?: Record<string, unknown>;
};

export type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  first: <T = Record<string, unknown>>(column?: string) => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  run: () => Promise<D1Result>;
};

export type D1DatabaseLike = {
  prepare: (query: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<D1Result[]>;
};

let ready: Promise<void> | null = null;

export function rawDb(): D1DatabaseLike {
  const database = (env as unknown as { DB?: D1DatabaseLike }).DB;
  if (!database) throw new Error("Database binding is unavailable.");
  return database;
}

export async function ensureDatabase(): Promise<D1DatabaseLike> {
  const db = rawDb();
  if (!ready) {
    ready = initialize(db).catch((error) => {
      ready = null;
      throw error;
    });
  }
  await ready;
  return db;
}

async function initialize(db: D1DatabaseLike): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS locations (id TEXT PRIMARY KEY NOT NULL, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, postal_code TEXT NOT NULL, phone TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('coordinator','manager')), location_id TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS consultations (id TEXT PRIMARY KEY NOT NULL, patient_reference TEXT NOT NULL, appointment_reference TEXT, speaker_role TEXT NOT NULL DEFAULT 'treatment_coordinator' CHECK (speaker_role IN ('doctor','treatment_coordinator','assistant')), coordinator_id TEXT NOT NULL, location_id TEXT, status TEXT NOT NULL, consented_at TEXT, consent_version TEXT, recording_started_at TEXT, recording_ended_at TEXT, submitted_at TEXT, failure_message TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS recordings (id TEXT PRIMARY KEY NOT NULL, consultation_id TEXT NOT NULL UNIQUE, storage_key TEXT NOT NULL, mime_type TEXT NOT NULL, byte_size INTEGER NOT NULL, duration_seconds INTEGER NOT NULL, status TEXT NOT NULL, delete_after TEXT, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS transcripts (id TEXT PRIMARY KEY NOT NULL, consultation_id TEXT NOT NULL UNIQUE, provider TEXT NOT NULL, model TEXT NOT NULL, text TEXT NOT NULL, normalized_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY NOT NULL, consultation_id TEXT NOT NULL UNIQUE, provider TEXT NOT NULL, model TEXT NOT NULL, schema_version TEXT NOT NULL, analysis_json TEXT NOT NULL, coordinator_edits_json TEXT, approved_at TEXT, approved_by_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY NOT NULL, actor_id TEXT, consultation_id TEXT, event_type TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL, window_started_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS consultations_coordinator_idx ON consultations(coordinator_id)`,
    `CREATE INDEX IF NOT EXISTS consultations_status_idx ON consultations(status)`,
    `CREATE INDEX IF NOT EXISTS audit_consultation_idx ON audit_events(consultation_id, created_at)`,
  ];
  await db.batch(statements.map((sql) => db.prepare(sql)));
  const consultationColumns = await db.prepare(`PRAGMA table_info(consultations)`).all<{ name: string }>();
  if (!(consultationColumns.results ?? []).some((column) => column.name === "speaker_role")) {
    await db.prepare(`ALTER TABLE consultations ADD COLUMN speaker_role TEXT NOT NULL DEFAULT 'treatment_coordinator' CHECK (speaker_role IN ('doctor','treatment_coordinator','assistant'))`).run();
  }
  const userColumns = await db.prepare(`PRAGMA table_info(users)`).all<{ name: string }>();
  if (!(userColumns.results ?? []).some((column) => column.name === "location_id")) {
    await db.prepare(`ALTER TABLE users ADD COLUMN location_id TEXT REFERENCES locations(id)`).run();
  }
  if (!(consultationColumns.results ?? []).some((column) => column.name === "location_id")) {
    await db.prepare(`ALTER TABLE consultations ADD COLUMN location_id TEXT REFERENCES locations(id)`).run();
  }
  await db.batch([
    db.prepare(`CREATE INDEX IF NOT EXISTS users_location_idx ON users(location_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS consultations_location_idx ON consultations(location_id)`),
  ]);
  await seedLocations(db);
  await seedUsers(db);
  await db.prepare(`UPDATE consultations SET location_id = (SELECT location_id FROM users WHERE users.id = consultations.coordinator_id) WHERE location_id IS NULL`).run();
}

export async function seedLocations(db: D1DatabaseLike = rawDb()): Promise<void> {
  const now = new Date().toISOString();
  await db.batch(PILOT_LOCATIONS.map((location) => db.prepare(`
    INSERT INTO locations (id,slug,name,address,city,state,postal_code,phone,active,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      slug=excluded.slug, name=excluded.name, address=excluded.address, city=excluded.city,
      state=excluded.state, postal_code=excluded.postal_code, phone=excluded.phone,
      active=excluded.active, updated_at=excluded.updated_at
  `).bind(
    location.id,
    location.slug,
    location.name,
    location.address,
    location.city,
    location.state,
    location.postalCode,
    location.phone,
    1,
    now,
    now,
  )));
}

export async function seedUsers(db: D1DatabaseLike = rawDb()): Promise<void> {
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash("TrinityPilot!2026", 12);
  // Disable superseded generated office accounts before activating the current set.
  await db.prepare(`UPDATE users SET active = 0, updated_at = ? WHERE id LIKE 'office-user-%'`).bind(now).run();
  const users = [
    { id: "2e4587bf-0a67-4dfe-b4ce-2b85d4dbca11", name: "Casey Coordinator", email: "coordinator@trinity.local", role: "coordinator", locationId: "location-aldine" },
    { id: "7478ea14-78f1-447f-8744-177412825bf8", name: "Morgan Manager", email: "manager@trinity.local", role: "manager", locationId: null },
    ...PILOT_LOCATIONS.map((location) => ({
      id: `office-user-${location.slug}`,
      name: `${location.name} Office`,
      email: officeAccountEmail(location),
      role: "coordinator",
      locationId: location.id,
    })),
    ...CENTRAL_MANAGER_ACCOUNTS.map((manager) => ({ ...manager, role: "manager", locationId: null })),
  ];
  await db.batch(users.map((user) => db.prepare(`
    INSERT INTO users (id,name,email,password_hash,role,location_id,active,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, email=excluded.email, role=excluded.role,
      location_id=excluded.location_id, active=excluded.active, updated_at=excluded.updated_at
  `).bind(user.id, user.name, user.email, passwordHash, user.role, user.locationId, 1, now, now)));
}

export async function writeAudit(input: {
  actorId?: string | null;
  consultationId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = await ensureDatabase();
  await db.prepare(`INSERT INTO audit_events (id,actor_id,consultation_id,event_type,metadata_json,created_at) VALUES (?,?,?,?,?,?)`)
    .bind(
      crypto.randomUUID(),
      input.actorId ?? null,
      input.consultationId ?? null,
      input.eventType,
      JSON.stringify(sanitizeAuditMetadata(input.metadata)),
      new Date().toISOString(),
    )
    .run();
}
