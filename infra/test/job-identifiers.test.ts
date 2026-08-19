import { describe, expect, it } from "vitest";
import { MAX_JOB_ATTEMPTS, transcribeJobNameFor } from "../src/job-identifiers.js";

describe("bounded idempotent AWS job attempts", () => {
  it("uses one deterministic opaque Transcribe name per bounded attempt", () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    expect(transcribeJobNameFor(jobId, 1)).toBe("consult-11111111111141118111111111111111-1");
    expect(transcribeJobNameFor(jobId, 1)).toBe(transcribeJobNameFor(jobId, 1));
    expect(transcribeJobNameFor(jobId, 2)).not.toBe(transcribeJobNameFor(jobId, 1));
    expect(() => transcribeJobNameFor(jobId, MAX_JOB_ATTEMPTS + 1)).toThrow(/job_identifier_invalid/);
  });
});
