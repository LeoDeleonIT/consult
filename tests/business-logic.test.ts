import { describe, expect, it } from "vitest";
import { z } from "zod";
import { consultationAnalysisSchema, evidenceSchema } from "../lib/analysis-schema";
import {
  canAccessConsultation,
  canAccessManager,
  canDeleteConsultation,
  canSubmitConsultation,
} from "../lib/authorization";
import { sanitizeAuditMetadata } from "../lib/audit";
import { detectConversationTags } from "../lib/conversation-tags";
import { getOpenDentalPatient, normalizeOpenDentalPatient } from "../lib/open-dental";
import { CENTRAL_MANAGER_ACCOUNTS, officeAccountEmail, PILOT_LOCATIONS, TRINITY_LOCATIONS } from "../lib/locations";
import { fixtureAnalysis, normalizeOpenAITranscript, openAIProviderError } from "../lib/providers";
import { staffSpeakerRoleLabel } from "../lib/speaker-roles";
import {
  assertTransition,
  canStartRecording,
  canTransition,
  processingDisposition,
} from "../lib/state-machine";

describe("consent and consultation states", () => {
  it("blocks recording until consent is stored", () => {
    expect(canStartRecording("draft", null)).toBe(false);
    expect(canStartRecording("consented", null)).toBe(false);
    expect(canStartRecording("consented", "2026-07-29T18:00:00.000Z")).toBe(true);
  });

  it("rejects invalid state transitions", () => {
    expect(canTransition("draft", "processing")).toBe(false);
    expect(() => assertTransition("draft", "processing")).toThrow(/Invalid consultation state transition/);
    expect(canTransition("review_required", "submitted")).toBe(true);
  });

  it("makes duplicate processing idempotent", () => {
    expect(processingDisposition("review_required", true)).toBe("return_existing");
    expect(processingDisposition("submitted", true)).toBe("return_existing");
    expect(processingDisposition("processing", false)).toBe("return_in_progress");
    expect(processingDisposition("failed", false)).toBe("start");
  });
});

describe("role and ownership authorization", () => {
  it("keeps verified office and central manager accounts unique", () => {
    expect(TRINITY_LOCATIONS).toHaveLength(17);
    expect(PILOT_LOCATIONS).toHaveLength(18);
    expect(new Set(TRINITY_LOCATIONS.map((location) => location.id)).size).toBe(17);
    expect(new Set(PILOT_LOCATIONS.map((location) => officeAccountEmail(location))).size).toBe(18);
    expect(officeAccountEmail(TRINITY_LOCATIONS[0])).toBe("eastex@trinitydentalcenters.com");
    expect(officeAccountEmail(TRINITY_LOCATIONS.find((location) => location.slug === "humble")!)).toBe("humble@trinitydentalcenters.com");
    expect(officeAccountEmail(PILOT_LOCATIONS.find((location) => location.slug === "pearl-dentistry")!)).toBe("humble@pearlmoderndentistry.com");
    expect(CENTRAL_MANAGER_ACCOUNTS.map((manager) => manager.email)).toEqual([
      "rlopez@trinitydentalcenters.com",
      "zain@trinitydentalcenters.com",
      "leo@odysseysolutions.co",
    ]);
  });

  it("keeps manager routes manager-only", () => {
    expect(canAccessManager("coordinator")).toBe(false);
    expect(canAccessManager("manager")).toBe(true);
  });

  it("prevents coordinators from accessing or submitting another coordinator's consultation", () => {
    expect(canAccessConsultation({ role: "coordinator", userId: "a", coordinatorId: "b" })).toBe(false);
    expect(canSubmitConsultation({ role: "coordinator", userId: "a", coordinatorId: "b" })).toBe(false);
    expect(canSubmitConsultation({ role: "coordinator", userId: "a", coordinatorId: "a" })).toBe(true);
  });

  it("allows managers to review but reserves deletion for managers", () => {
    expect(canAccessConsultation({ role: "manager", userId: "manager", coordinatorId: "coordinator" })).toBe(true);
    expect(canDeleteConsultation("manager")).toBe(true);
    expect(canDeleteConsultation("coordinator")).toBe(false);
  });
});

describe("AI output and audit safety", () => {
  it("keeps Open Dental patient data minimal and uses a safe chart reference", () => {
    expect(normalizeOpenDentalPatient({
      PatNum: 48,
      FName: "Jane",
      LName: "Smith",
      Preferred: "Janie",
      ChartNumber: "CH-1042",
      clinicAbbr: "North",
      SSN: "should-not-be-returned",
    })).toEqual({
      patNum: 48,
      displayName: "Janie Smith",
      chartNumber: "CH-1042",
      clinic: "North",
      patientReference: "CH-1042",
    });
    expect(staffSpeakerRoleLabel("assistant")).toBe("Dental assistant");
  });

  it("sends both Open Dental keys only in the server authorization header", async () => {
    const previousDeveloperKey = process.env.OPEN_DENTAL_DEVELOPER_KEY;
    const previousCustomerKey = process.env.OPEN_DENTAL_CUSTOMER_KEY;
    process.env.OPEN_DENTAL_DEVELOPER_KEY = "developer-test-key";
    process.env.OPEN_DENTAL_CUSTOMER_KEY = "customer-test-key";
    let observedUrl = "";
    let observedAuthorization = "";
    try {
      const patient = await getOpenDentalPatient(48, async (input, init) => {
        observedUrl = String(input);
        observedAuthorization = new Headers(init?.headers).get("Authorization") ?? "";
        return Response.json({ PatNum: 48, FName: "Jane", LName: "Smith", Preferred: "", ChartNumber: "", clinicAbbr: "" });
      });
      expect(observedUrl).toBe("https://api.opendental.com/api/v1/patients/48");
      expect(observedAuthorization).toBe("ODFHIR developer-test-key/customer-test-key");
      expect(patient.patientReference).toBe("OD-48");
      expect(JSON.stringify(patient)).not.toContain("test-key");
    } finally {
      if (previousDeveloperKey === undefined) delete process.env.OPEN_DENTAL_DEVELOPER_KEY;
      else process.env.OPEN_DENTAL_DEVELOPER_KEY = previousDeveloperKey;
      if (previousCustomerKey === undefined) delete process.env.OPEN_DENTAL_CUSTOMER_KEY;
      else process.env.OPEN_DENTAL_CUSTOMER_KEY = previousCustomerKey;
    }
  });

  it("flags only tracked financing terms that were actually mentioned", () => {
    const tags = detectConversationTags("We discussed a payment plan, Sunbit, Cherry, and CareCredit.");
    expect(tags.map((tag) => tag.key)).toEqual(["payment_plans", "sunbit", "cherry", "care_credit"]);
    expect(detectConversationTags("Financing was not discussed.")).toEqual([]);
  });

  it("normalizes live diarized transcription into timestamped speaker turns", () => {
    const transcript = normalizeOpenAITranscript({
      text: "Hello. Hi there. What brings you in?",
      duration: 6.2,
      segments: [
        { start: 0, end: 1.5, speaker: "A", text: "Hello." },
        { start: 1.5, end: 3, speaker: "B", text: "Hi there." },
        { start: 3, end: 6.2, speaker: "A", text: "What brings you in?" },
      ],
    });
    expect(transcript.durationSeconds).toBe(6.2);
    expect(transcript.speakerMapping).toBe("inferred_turn_order");
    expect(transcript.segments.map((segment) => segment.speaker)).toEqual(["coordinator", "patient", "coordinator"]);
  });

  it("retries temporary provider failures but not rejected credentials", () => {
    expect(openAIProviderError("transcription", 429).retryable).toBe(true);
    expect(openAIProviderError("summary", 503).retryable).toBe(true);
    expect(openAIProviderError("transcription", 401).retryable).toBe(false);
  });

  it("accepts the strict fixture summary", () => {
    expect(consultationAnalysisSchema.parse(fixtureAnalysis).patientDecision.status).toBe("undecided");
  });

  it("rejects malformed summary output", () => {
    const malformed = { ...fixtureAnalysis, patientDecision: { status: "maybe" } };
    expect(consultationAnalysisSchema.safeParse(malformed).success).toBe(false);
  });

  it("generates strict evidence JSON schema with every field required", () => {
    const schema = z.toJSONSchema(evidenceSchema, { target: "draft-7" });
    expect(schema.required).toEqual(["quote", "startSeconds", "endSeconds", "speaker"]);
  });

  it("turns OpenAI billing or rate limits into a safe, actionable message", () => {
    const error = openAIProviderError("transcription", 429);
    expect(error.status).toBe(502);
    expect(error.message).toContain("Billing and Limits");
    expect(error.message).not.toContain("sk-");
  });

  it("removes patient reference, transcript, and audio from audit metadata", () => {
    const safe = sanitizeAuditMetadata({
      patientReference: "TEST-1042",
      transcript: "synthetic transcript",
      audio: "bytes",
      provider: "fixture",
    });
    expect(safe).toEqual({ provider: "fixture" });
    expect(JSON.stringify(safe)).not.toContain("TEST-1042");
    expect(JSON.stringify(safe)).not.toContain("synthetic transcript");
  });
});
