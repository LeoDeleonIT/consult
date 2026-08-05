import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseUrl ?? "http://localhost:4173";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${resolve("tests/fixtures/synthetic-consultation.wav")}`,
      ],
    },
    ...devices["Desktop Chrome"],
  },
  webServer: externalBaseUrl ? undefined : {
    // Keep the isolated smoke test from loading a developer's live API key
    // from .env.local. The test must always use the explicitly enabled fixture.
    command: "node scripts/playwright-fixture-server.mjs",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
