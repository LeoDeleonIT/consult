CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  phone TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE users ADD COLUMN location_id TEXT REFERENCES locations(id);
ALTER TABLE consultations ADD COLUMN location_id TEXT REFERENCES locations(id);

CREATE INDEX IF NOT EXISTS users_location_idx ON users(location_id);
CREATE INDEX IF NOT EXISTS consultations_location_idx ON consultations(location_id);
