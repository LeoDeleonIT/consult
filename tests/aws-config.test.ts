import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnvironment = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
  vi.resetModules();
});

async function configurationErrors(overrides: Record<string, string>) {
  Object.assign(process.env, {
    NODE_ENV: "production",
    AI_PROVIDER: "aws",
    AUDIO_STORAGE_DRIVER: "aws",
    AUTH_SECRET: "synthetic-auth-secret-at-least-32-characters",
    APP_URL: "https://consult.synthetic.example",
    ALLOW_FIXTURE_PROCESSING: "false",
    ENABLE_DEVELOPMENT_SEED_USERS: "false",
    AWS_REGION: "us-east-1",
    AWS_API_BASE_URL: "https://api.synthetic.example",
    AWS_BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
    AWS_TRANSCRIBE_MODE: "standard",
    AWS_TRANSCRIBE_MAX_SPEAKERS: "2",
    AWS_BRIDGE_TOKEN_SECRET: "synthetic-bridge-secret-at-least-32-characters",
    AWS_ALLOWED_ORIGINS: "https://consult.synthetic.example",
    ...overrides,
  });
  vi.resetModules();
  return (await import("../lib/env")).productionConfigurationErrors();
}

describe("production AWS fail-closed configuration", () => {
  it("accepts a coherent HTTPS synthetic-pilot configuration", async () => {
    expect(await configurationErrors({})).toEqual([]);
  });

  it("rejects unsafe secrets, development users, wildcard CORS, and inconsistent AWS mode", async () => {
    const errors = await configurationErrors({
      AUTH_SECRET: "short",
      ENABLE_DEVELOPMENT_SEED_USERS: "true",
      AWS_ALLOWED_ORIGINS: "*",
      AUDIO_STORAGE_DRIVER: "r2",
    });
    expect(errors.join(" ")).toMatch(/AUTH_SECRET/);
    expect(errors.join(" ")).toMatch(/seed users/i);
    expect(errors.join(" ")).toMatch(/Wildcard CORS/i);
    expect(errors.join(" ")).toMatch(/enabled together/i);
  });

  it("rejects disallowed Bedrock and non-standard Transcribe settings", async () => {
    const errors = await configurationErrors({
      AWS_BEDROCK_MODEL_ID: "example-fable-model",
      AWS_TRANSCRIBE_MODE: "medical",
      AWS_TRANSCRIBE_MAX_SPEAKERS: "3",
    });
    expect(errors.join(" ")).toMatch(/not allowed/i);
    expect(errors.join(" ")).toMatch(/standard/i);
    expect(errors.join(" ")).toMatch(/must be 2/i);
  });

  it("rejects missing, wildcard, non-HTTPS, and path-bearing origins", async () => {
    for (const origin of ["", "*", "http://consult.synthetic.example", "https://consult.synthetic.example/path"]) {
      const errors = await configurationErrors({ AWS_ALLOWED_ORIGINS: origin });
      expect(errors.join(" ")).toMatch(/AWS_ALLOWED_ORIGINS/);
    }
  });
});
