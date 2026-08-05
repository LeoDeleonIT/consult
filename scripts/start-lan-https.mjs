import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logDir = resolve(root, ".logs");
mkdirSync(logDir, { recursive: true });

const out = createWriteStream(resolve(logDir, "consult-https.out.log"), { flags: "a" });
const err = createWriteStream(resolve(logDir, "consult-https.err.log"), { flags: "a" });

const child = spawn(process.execPath, ["scripts/https-lan-proxy.mjs"], {
  cwd: root,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.pipe(out);
child.stderr.pipe(err);

child.on("exit", (code, signal) => {
  out.end(`\nhttps proxy exited code=${code ?? ""} signal=${signal ?? ""}\n`);
  err.end();
  process.exit(code ?? 0);
});
