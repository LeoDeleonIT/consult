import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAllowedAudio } from "../lib/audio-validation";

describe("audio validation", () => {
  it("accepts the synthetic WAV fixture by MIME type and file signature", () => {
    const file = readFileSync(new URL("./fixtures/synthetic-consultation.wav", import.meta.url));
    const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    expect(isAllowedAudio(bytes, "audio/wav")).toBe(true);
  });

  it("rejects a spoofed audio MIME type", () => {
    const bytes = new TextEncoder().encode("not audio").buffer as ArrayBuffer;
    expect(isAllowedAudio(bytes, "audio/wav")).toBe(false);
  });
});
