import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logDir = resolve(root, ".logs");
mkdirSync(logDir, { recursive: true });

const out = createWriteStream(resolve(logDir, "consult-3003.out.log"), { flags: "a" });
const err = createWriteStream(resolve(logDir, "consult-3003.err.log"), { flags: "a" });
const binPathKey = process.platform === "win32" ? "Path" : "PATH";
const binPath = dirname(process.execPath);
const env = {
  ...process.env,
  [binPathKey]: `${binPath}${process.platform === "win32" ? ";" : ":"}${process.env[binPathKey] ?? process.env.PATH ?? ""}`,
  WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH ?? ".wrangler/wrangler.log",
};

const child = spawn(process.execPath, [
  "scripts/with-wrangler-log.mjs",
  "vinext",
  "dev",
  "--host",
  "localhost",
  "--port",
  "3003",
  "--strictPort",
], {
  cwd: root,
  detached: false,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.pipe(out);
child.stderr.pipe(err);

child.on("exit", (code, signal) => {
  out.end(`\nconsult server exited code=${code ?? ""} signal=${signal ?? ""}\n`);
  err.end();
  process.exit(code ?? 0);
});
