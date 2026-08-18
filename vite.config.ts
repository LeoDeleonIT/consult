import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import hostingConfig from "./.openai/hosting.json" with { type: "json" };
import { sites } from "./build/sites-vite-plugin.ts";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async ({ command, mode }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const fileEnv = loadEnv(mode, ".", "");
  const localRuntimeValue = (name: string, fallback = "") => process.env[name] ?? fileEnv[name] ?? fallback;
  const localRuntimeVars = command === "serve" ? {
    AI_PROVIDER: localRuntimeValue("AI_PROVIDER", "openai"),
    AUDIO_STORAGE_DRIVER: localRuntimeValue("AUDIO_STORAGE_DRIVER", "r2"),
    OPENAI_API_KEY: localRuntimeValue("OPENAI_API_KEY"),
    TRANSCRIPTION_MODEL: localRuntimeValue("TRANSCRIPTION_MODEL", "gpt-4o-transcribe-diarize"),
    SUMMARY_MODEL: localRuntimeValue("SUMMARY_MODEL", "gpt-5.6-terra"),
    ALLOW_FIXTURE_PROCESSING: localRuntimeValue("ALLOW_FIXTURE_PROCESSING", "false"),
    AUTH_SECRET: localRuntimeValue("AUTH_SECRET", "local-only-change-before-deploying-trinity-pilot"),
    APP_URL: localRuntimeValue("APP_URL", "http://localhost:3000"),
    AUDIO_RETENTION_DAYS: localRuntimeValue("AUDIO_RETENTION_DAYS", "30"),
    MAX_RECORDING_MINUTES: localRuntimeValue("MAX_RECORDING_MINUTES", "90"),
    MAX_UPLOAD_MB: localRuntimeValue("MAX_UPLOAD_MB", "25"),
    PHI_PRODUCTION_APPROVED: localRuntimeValue("PHI_PRODUCTION_APPROVED", "false"),
    ENABLE_DEVELOPMENT_SEED_USERS: localRuntimeValue("ENABLE_DEVELOPMENT_SEED_USERS", "true"),
    AWS_REGION: localRuntimeValue("AWS_REGION", "us-east-1"),
    AWS_API_BASE_URL: localRuntimeValue("AWS_API_BASE_URL"),
    AWS_BEDROCK_MODEL_ID: localRuntimeValue("AWS_BEDROCK_MODEL_ID"),
    AWS_TRANSCRIBE_MODE: localRuntimeValue("AWS_TRANSCRIBE_MODE", "standard"),
    AWS_TRANSCRIBE_LANGUAGE_CODE: localRuntimeValue("AWS_TRANSCRIBE_LANGUAGE_CODE", "en-US"),
    AWS_TRANSCRIBE_MAX_SPEAKERS: localRuntimeValue("AWS_TRANSCRIBE_MAX_SPEAKERS", "2"),
    AWS_TRANSCRIBE_VOCABULARY_NAME: localRuntimeValue("AWS_TRANSCRIBE_VOCABULARY_NAME"),
    AWS_BRIDGE_TOKEN_SECRET: localRuntimeValue("AWS_BRIDGE_TOKEN_SECRET"),
    AWS_ALLOWED_ORIGINS: localRuntimeValue("AWS_ALLOWED_ORIGINS"),
    OPEN_DENTAL_DEVELOPER_KEY: localRuntimeValue("OPEN_DENTAL_DEVELOPER_KEY"),
    OPEN_DENTAL_CUSTOMER_KEY: localRuntimeValue("OPEN_DENTAL_CUSTOMER_KEY"),
    OPEN_DENTAL_API_BASE_URL: localRuntimeValue("OPEN_DENTAL_API_BASE_URL", "https://api.opendental.com/api/v1"),
  } : undefined;

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: { ...localBindingConfig, vars: localRuntimeVars },
      }),
    ],
  };
});
