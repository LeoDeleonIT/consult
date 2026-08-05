import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [, , command, ...args] = process.argv;

if (!command) {
  console.error("Usage: node scripts/with-wrangler-log.mjs <command> [...args]");
  process.exit(1);
}

process.env.WRANGLER_LOG_PATH ??= ".wrangler/wrangler.log";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binPathKey = process.platform === "win32" ? "Path" : "PATH";
const separator = process.platform === "win32" ? ";" : ":";
const localBin = resolve(root, "node_modules", ".bin");
const nodeBin = dirname(process.execPath);
process.env[binPathKey] = [
  localBin,
  nodeBin,
  process.env[binPathKey] ?? process.env.PATH ?? "",
].join(separator);

const child = spawn(command, args, {
  env: process.env,
  shell: process.platform === "win32",
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
    console.error(`${command} exited from signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 0);
});
