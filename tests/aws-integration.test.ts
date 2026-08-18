import { describe, expect, it } from "vitest";
import { normalizeAwsTranscribe } from "../infra/src/transcribe-normalizer";
import { assertEvidenceBacked, consultationAnalysisSchema } from "../infra/src/analysis-schema";
import { applySpeakerMapping } from "../lib/speaker-mapping";

function transcribePayload() {
  return {
    results: {
      transcripts: [{ transcript: "Hello, there. Payment options? Yes." }],
      items: [
        { type: "pronunciation", start_time: "0.00", end_time: "0.40", speaker_label: "spk_0", alternatives: [{ content: "Hello" }] },
        { type: "punctuation", alternatives: [{ content: "," }] },
        { type: "pronunciation", start_time: "0.50", end_time: "0.90", speaker_label: "spk_0", alternatives: [{ content: "there" }] },
        { type: "punctuation", alternatives: [{ content: "." }] },
        { type: "pronunciation", start_time: "1.10", end_time: "1.70", speaker_label: "spk_1", alternatives: [{ content: "Payment" }] },
        { type: "pronunciation", start_time: "1.71", end_time: "2.20", speaker_label: "spk_1", alternatives: [{ content: "options" }] },
        { type: "punctuation", alternatives: [{ content: "?" }] },
        { type: "pronunciation", start_time: "2.40", end_time: "2.70", speaker_label: "spk_2", alternatives: [{ content: "Yes" }] },
        { type: "punctuation", alternatives: [{ content: "." }] },
      ],
    },
  };
}

describe("AWS transcript normalization and speaker confirmation", () => {
  it("preserves punctuation, timestamps, and raw labels without assigning identities", () => {
    const transcript = normalizeAwsTranscribe(transcribePayload());
    expect(transcript.speakerMapping).toBe("unconfirmed");
    expect(transcript.segments).toEqual([
      { startSeconds: 0, endSeconds: 0.9, speaker: "unknown", speakerLabel: "spk_0", text: "Hello, there." },
      { startSeconds: 1.1, endSeconds: 2.2, speaker: "unknown", speakerLabel: "spk_1", text: "Payment options?" },
      { startSeconds: 2.4, endSeconds: 2.7, speaker: "unknown", speakerLabel: "spk_2", text: "Yes." },
    ]);
    const confirmed = applySpeakerMapping(transcript, { staffSpeakerLabel: "spk_0", patientSpeakerLabel: "spk_1" });
    expect(confirmed.segments.map((segment) => segment.speaker)).toEqual(["coordinator", "patient", "unknown"]);
  });

  it("rejects malformed or missing timestamp output", () => {
    expect(() => normalizeAwsTranscribe({ results: { transcripts: [], items: [] } })).toThrow();
    const malformed = transcribePayload();
    malformed.results.items[0].start_time = "not-a-time";
    expect(() => normalizeAwsTranscribe(malformed)).toThrow(/timestamp/);
  });
});

describe("Bedrock structured evidence validation", () => {
  it("accepts an empty evidence-safe not-stated analysis", () => {
    const analysis = consultationAnalysisSchema.parse({
      recommendedTreatments: [],
      pricing: { totalEstimate: null, patientEstimate: null, insuranceEstimate: null, otherAmounts: [], evidence: [], needsReview: false },
      financing: { discussed: null, options: [], evidence: [] },
      patientConcerns: [],
      objections: [],
      patientDecision: { status: "not_stated", evidence: [], needsReview: false },
      nextSteps: [],
      checklist: [{ key: "cost_discussed", label: "Costs", status: "not_detected", evidence: [] }],
      shortSummary: "No supported consultation facts were detected.",
      warnings: ["Human review required."],
    });
    expect(assertEvidenceBacked(analysis)).toEqual(analysis);
  });

  it("rejects extracted prices and decisions without evidence", () => {
    const unsafe = consultationAnalysisSchema.parse({
      recommendedTreatments: [],
      pricing: { totalEstimate: "$100", patientEstimate: null, insuranceEstimate: null, otherAmounts: [], evidence: [], needsReview: true },
      financing: { discussed: null, options: [], evidence: [] },
      patientConcerns: [], objections: [],
      patientDecision: { status: "accepted", evidence: [], needsReview: true },
      nextSteps: [], checklist: [], shortSummary: "Draft", warnings: [],
    });
    expect(() => assertEvidenceBacked(unsafe)).toThrow(/bedrock_missing_evidence/);
  });
});
