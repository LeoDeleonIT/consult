import { describe, expect, it } from "vitest";
import { isAllowedAudioMimeType, opaqueAudioObjectKey, uploadExpiration } from "../src/upload-policy.js";

describe("constrained opaque upload policy", () => {
  it("normalizes an allowed MIME type and never includes consultation data", () => {
    const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
    const key = opaqueAudioObjectKey("audio/webm;codecs=opus", () => ids.shift() ?? "unexpected");
    expect(key).toBe("uploads/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webm");
    expect(key).not.toMatch(/patient|consultation|test/i);
    expect(isAllowedAudioMimeType("text/plain")).toBe(false);
  });

  it("uses an exact five-minute authorization window", () => {
    const now = new Date("2026-08-18T12:00:00.000Z");
    expect(uploadExpiration(now)).toEqual({ expiresInSeconds: 300, expiresAt: "2026-08-18T12:05:00.000Z" });
  });
});
