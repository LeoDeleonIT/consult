import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4173";
const serverEnv = {
  ...process.env,
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
  AI_PROVIDER: "fixture",
  ALLOW_FIXTURE_PROCESSING: "true",
  OPENAI_API_KEY: "",
  AUTH_SECRET: "playwright-fixture-session-secret",
  WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH ?? ".wrangler/wrangler.log",
};

const server = spawn(process.execPath, [
  "scripts/with-wrangler-log.mjs",
  "vinext",
  "dev",
  "--host",
  "localhost",
  "--port",
  "4173",
], {
  env: serverEnv,
  stdio: "inherit",
});

async function waitForServer(url, timeoutMs = 120000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.status < 500) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited from signal ${signal}`));
        return;
      }

      resolve(code ?? 0);
    });
  });
}

function killProcessTree(processId) {
  if (!processId) {
    return Promise.resolve();
  }

  if (process.platform === "win32") {
    return run("taskkill", ["/pid", String(processId), "/T", "/F"]).catch(() => {});
  }

  try {
    process.kill(processId, "SIGTERM");
  } catch {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, 1000));
}

let exitCode = 1;

try {
  await waitForServer(baseURL);
  const playwrightCli = fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url));
  exitCode = await run(process.execPath, [playwrightCli, "test"], {
    ...process.env,
    PLAYWRIGHT_BASE_URL: baseURL,
  });
} finally {
  await killProcessTree(server.pid);
}

process.exit(exitCode);
