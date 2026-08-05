function numberValue(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export const appConfig = {
  aiProvider: process.env.AI_PROVIDER ?? "openai",
  transcriptionModel: process.env.TRANSCRIPTION_MODEL ?? "gpt-4o-transcribe-diarize",
  summaryModel: process.env.SUMMARY_MODEL ?? "gpt-5.6-terra",
  allowFixtureProcessing: booleanValue("ALLOW_FIXTURE_PROCESSING"),
  authSecret: process.env.AUTH_SECRET ?? "local-only-change-before-deploying-trinity-pilot",
  audioRetentionDays: numberValue("AUDIO_RETENTION_DAYS", 30),
  maxRecordingMinutes: numberValue("MAX_RECORDING_MINUTES", 90),
  maxUploadMb: numberValue("MAX_UPLOAD_MB", 25),
  isProduction: process.env.NODE_ENV === "production",
};
