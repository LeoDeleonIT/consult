import { spawn } from "node:child_process";

process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
process.env.AI_PROVIDER = "fixture";
process.env.ALLOW_FIXTURE_PROCESSING = "true";
process.env.OPENAI_API_KEY = "";
process.env.AUTH_SECRET = "playwright-fixture-session-secret";
process.env.WRANGLER_LOG_PATH ??= ".wrangler/wrangler.log";

const child = spawn(process.execPath, [
  "scripts/with-wrangler-log.mjs",
  "vinext",
  "dev",
  "--host",
  "localhost",
  "--port",
  "4173",
], {
  env: process.env,
  stdio: "inherit",
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
      .on("exit", () => process.exit(0));
  } else {
    child.kill(signal);
  }

  setTimeout(() => {
    process.exit(0);
  }, 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`fixture server exited from signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 0);
});
