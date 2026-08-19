import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyBridgeToken } from "../src/bridge-token.js";

const secret = "synthetic-test-secret-at-least-32-characters";
const now = 1_800_000_000;

function sign(overrides: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: "trinity-consult",
    aud: "trinity-consult-aws-pilot",
    sub: randomUUID(),
    role: "coordinator",
    consultationId: randomUUID(),
    jti: randomUUID(),
    iat: now,
    exp: now + 120,
    ...overrides,
  })).toString("base64url");
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}

describe("short-lived consultation-scoped bridge tokens", () => {
  it("accepts valid claims and returns only the authorization context", () => {
    const claims = verifyBridgeToken(sign(), secret, now);
    expect(claims.role).toBe("coordinator");
    expect(claims.exp - claims.iat).toBe(120);
  });

  it("rejects tampering, expiry, overly long lifetimes, and wrong audiences", () => {
    const token = sign();
    const [header, payload, signature] = token.split(".");
    const tamperedSignature = `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
    expect(() => verifyBridgeToken(`${header}.${payload}.${tamperedSignature}`, secret, now)).toThrow();
    expect(() => verifyBridgeToken(sign({ exp: now }), secret, now)).toThrow(/expired/);
    expect(() => verifyBridgeToken(sign({ exp: now + 181 }), secret, now)).toThrow(/expired/);
    expect(() => verifyBridgeToken(sign({ aud: "another-service" }), secret, now)).toThrow();
  });
});
