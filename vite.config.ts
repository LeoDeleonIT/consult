import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

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
    OPENAI_API_KEY: localRuntimeValue("OPENAI_API_KEY"),
    TRANSCRIPTION_MODEL: localRuntimeValue("TRANSCRIPTION_MODEL", "gpt-4o-transcribe-diarize"),
    SUMMARY_MODEL: localRuntimeValue("SUMMARY_MODEL", "gpt-5.6-terra"),
    ALLOW_FIXTURE_PROCESSING: localRuntimeValue("ALLOW_FIXTURE_PROCESSING", "false"),
    AUTH_SECRET: localRuntimeValue("AUTH_SECRET", "local-only-change-before-deploying-trinity-pilot"),
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
