ALTER TABLE consultations
ADD COLUMN speaker_role TEXT NOT NULL DEFAULT 'treatment_coordinator'
CHECK (speaker_role IN ('doctor', 'treatment_coordinator', 'assistant'));
