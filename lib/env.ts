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

function textValue(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

const defaultAuthSecret = "local-only-change-before-deploying-trinity-pilot";

export const appConfig = {
  aiProvider: process.env.AI_PROVIDER ?? "openai",
  audioStorageDriver: process.env.AUDIO_STORAGE_DRIVER ?? "r2",
  transcriptionModel: process.env.TRANSCRIPTION_MODEL ?? "gpt-4o-transcribe-diarize",
  summaryModel: process.env.SUMMARY_MODEL ?? "gpt-5.6-terra",
  awsRegion: textValue("AWS_REGION", "us-east-1"),
  awsApiBaseUrl: textValue("AWS_API_BASE_URL").replace(/\/$/, ""),
  awsBedrockModelId: textValue("AWS_BEDROCK_MODEL_ID"),
  awsTranscribeMode: textValue("AWS_TRANSCRIBE_MODE", "standard"),
  awsTranscribeLanguageCode: textValue("AWS_TRANSCRIBE_LANGUAGE_CODE", "en-US"),
  awsTranscribeMaxSpeakers: numberValue("AWS_TRANSCRIBE_MAX_SPEAKERS", 2),
  awsTranscribeVocabularyName: textValue("AWS_TRANSCRIBE_VOCABULARY_NAME"),
  allowFixtureProcessing: booleanValue("ALLOW_FIXTURE_PROCESSING"),
  enableDevelopmentSeedUsers: booleanValue("ENABLE_DEVELOPMENT_SEED_USERS", process.env.NODE_ENV !== "production"),
  phiProductionApproved: booleanValue("PHI_PRODUCTION_APPROVED"),
  authSecret: process.env.AUTH_SECRET ?? defaultAuthSecret,
  appUrl: textValue("APP_URL", "http://localhost:3000"),
  audioRetentionDays: numberValue("AUDIO_RETENTION_DAYS", 30),
  maxRecordingMinutes: numberValue("MAX_RECORDING_MINUTES", 90),
  maxUploadMb: numberValue("MAX_UPLOAD_MB", 25),
  isProduction: process.env.NODE_ENV === "production",
};

export function awsConfigurationErrors(): string[] {
  const errors: string[] = [];
  const allowedOrigins = (process.env.AWS_ALLOWED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
  if (appConfig.awsRegion !== "us-east-1") errors.push("AWS_REGION must be us-east-1 for this pilot.");
  if (!appConfig.awsApiBaseUrl) errors.push("AWS_API_BASE_URL is required in AWS mode.");
  if (appConfig.awsApiBaseUrl && !appConfig.awsApiBaseUrl.startsWith("https://")) errors.push("AWS_API_BASE_URL must use HTTPS.");
  if (!appConfig.awsBedrockModelId) errors.push("AWS_BEDROCK_MODEL_ID is required in AWS mode.");
  if (/fable|mythos/i.test(appConfig.awsBedrockModelId)) errors.push("The configured Bedrock model is not allowed for this pilot.");
  if (appConfig.awsTranscribeMode !== "standard") errors.push("AWS_TRANSCRIBE_MODE must be standard until a separate synthetic evaluation is approved.");
  if (appConfig.awsTranscribeMaxSpeakers !== 2) errors.push("AWS_TRANSCRIBE_MAX_SPEAKERS must be 2 for this pilot.");
  if (!allowedOrigins.length) errors.push("AWS_ALLOWED_ORIGINS must contain the exact HTTPS application origin in AWS mode.");
  if (allowedOrigins.some((origin) => !isExactHttpsOrigin(origin))) errors.push("AWS_ALLOWED_ORIGINS must contain only exact HTTPS origins without paths or wildcards.");
  if (!process.env.AWS_BRIDGE_TOKEN_SECRET || process.env.AWS_BRIDGE_TOKEN_SECRET.length < 32) {
    errors.push("AWS_BRIDGE_TOKEN_SECRET must be a server-only value of at least 32 characters.");
  }
  return errors;
}

function isExactHttpsOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.origin === value && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function productionConfigurationErrors(): string[] {
  if (!appConfig.isProduction) return [];
  const errors: string[] = [];
  if (appConfig.authSecret === defaultAuthSecret || appConfig.authSecret.length < 32) errors.push("AUTH_SECRET is not production-safe.");
  if (appConfig.allowFixtureProcessing) errors.push("Fixture processing must be disabled in production.");
  if (appConfig.enableDevelopmentSeedUsers) errors.push("Development seed users must be disabled in production.");
  if (!appConfig.appUrl.startsWith("https://")) errors.push("APP_URL must use HTTPS in production.");
  if ((process.env.AWS_ALLOWED_ORIGINS ?? "").split(",").some((origin) => origin.trim() === "*")) errors.push("Wildcard CORS origins are not allowed.");
  if (appConfig.aiProvider === "aws" || appConfig.audioStorageDriver === "aws") {
    if (appConfig.aiProvider !== "aws" || appConfig.audioStorageDriver !== "aws") errors.push("AWS AI and AWS audio storage must be enabled together.");
    errors.push(...awsConfigurationErrors());
  }
  return errors;
}

export function assertProductionConfiguration(): void {
  const errors = productionConfigurationErrors();
  if (errors.length) throw new Error(`Unsafe production configuration: ${errors.join(" ")}`);
}
