INSERT OR IGNORE INTO users (
  id, name, email, password_hash, role, active, created_at, updated_at
) VALUES
(
  '2e4587bf-0a67-4dfe-b4ce-2b85d4dbca11',
  'Casey Coordinator',
  'coordinator@trinity.local',
  '$2b$12$6IWaxSLvDFsgcsLHnbAxfuVHx5Y2V36/9sVVJATpgfdEDogs.n0oy',
  'coordinator',
  1,
  '2026-07-29T00:00:00.000Z',
  '2026-07-29T00:00:00.000Z'
),
(
  '7478ea14-78f1-447f-8744-177412825bf8',
  'Morgan Manager',
  'manager@trinity.local',
  '$2b$12$6IWaxSLvDFsgcsLHnbAxfuVHx5Y2V36/9sVVJATpgfdEDogs.n0oy',
  'manager',
  1,
  '2026-07-29T00:00:00.000Z',
  '2026-07-29T00:00:00.000Z'
);
