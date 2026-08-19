import { describe, expect, it } from "vitest";
import { applySafeAnalysisDefaults, assertEvidenceBacked, assertEvidenceMatchesTranscript, consultationAnalysisSchema } from "../src/analysis-schema.js";
import { normalizeAwsTranscribe } from "../src/transcribe-normalizer.js";

describe("AWS transcript and analysis boundaries", () => {
  it("defaults absence-only Bedrock collections without inventing analysis", () => {
    const input = {
      recommendedTreatments: [],
      pricing: { totalEstimate: null, patientEstimate: null, insuranceEstimate: null, otherAmounts: [], evidence: [], needsReview: true },
      financing: { discussed: null, options: [], evidence: [] },
      patientConcerns: [],
      patientDecision: { status: "not_stated", evidence: [], needsReview: true },
      nextSteps: [],
      checklist: [],
      shortSummary: "No supported details were extracted.",
    };

    const parsed = consultationAnalysisSchema.parse(applySafeAnalysisDefaults(input));
    expect(parsed.objections).toEqual([]);
    expect(parsed.warnings).toEqual([]);
  });

  it("preserves punctuation, timestamps, and raw labels without guessing identities", () => {
    const transcript = normalizeAwsTranscribe({ results: {
      transcripts: [{ transcript: "Hello. Payment options?" }],
      items: [
        { type: "pronunciation", start_time: "0.0", end_time: "0.5", speaker_label: "spk_0", alternatives: [{ content: "Hello" }] },
        { type: "punctuation", alternatives: [{ content: "." }] },
        { type: "pronunciation", start_time: "1.0", end_time: "1.4", speaker_label: "spk_1", alternatives: [{ content: "Payment" }] },
        { type: "pronunciation", start_time: "1.5", end_time: "2.0", speaker_label: "spk_1", alternatives: [{ content: "options" }] },
        { type: "punctuation", alternatives: [{ content: "?" }] },
      ],
    } });
    expect(transcript.speakerMapping).toBe("unconfirmed");
    expect(transcript.segments).toEqual([
      { startSeconds: 0, endSeconds: 0.5, speaker: "unknown", speakerLabel: "spk_0", text: "Hello." },
      { startSeconds: 1, endSeconds: 2, speaker: "unknown", speakerLabel: "spk_1", text: "Payment options?" },
    ]);
  });

  it("rejects malformed Transcribe output and unsupported evidence-free facts", () => {
    expect(() => normalizeAwsTranscribe({ results: { transcripts: [], items: [] } })).toThrow();
    const analysis = consultationAnalysisSchema.parse({
      recommendedTreatments: [],
      pricing: { totalEstimate: "$500", patientEstimate: null, insuranceEstimate: null, otherAmounts: [], evidence: [], needsReview: true },
      financing: { discussed: null, options: [], evidence: [] },
      patientConcerns: [],
      objections: [],
      patientDecision: { status: "not_stated", evidence: [], needsReview: false },
      nextSteps: [],
      checklist: [],
      shortSummary: "Synthetic draft",
      warnings: [],
    });
    expect(() => assertEvidenceBacked(analysis)).toThrow(/bedrock_missing_evidence/);
  });

  it("requires timestamped quotes from an actual raw speaker segment", () => {
    const transcript = normalizeAwsTranscribe({ results: {
      transcripts: [{ transcript: "The total is five hundred dollars." }],
      items: [
        { type: "pronunciation", start_time: "0.0", end_time: "0.3", speaker_label: "spk_0", alternatives: [{ content: "The" }] },
        { type: "pronunciation", start_time: "0.4", end_time: "0.8", speaker_label: "spk_0", alternatives: [{ content: "total" }] },
        { type: "pronunciation", start_time: "0.9", end_time: "1.1", speaker_label: "spk_0", alternatives: [{ content: "is" }] },
        { type: "pronunciation", start_time: "1.2", end_time: "1.5", speaker_label: "spk_0", alternatives: [{ content: "five" }] },
        { type: "pronunciation", start_time: "1.6", end_time: "2.0", speaker_label: "spk_0", alternatives: [{ content: "hundred" }] },
        { type: "pronunciation", start_time: "2.1", end_time: "2.5", speaker_label: "spk_0", alternatives: [{ content: "dollars" }] },
        { type: "punctuation", alternatives: [{ content: "." }] },
      ],
    } });
    const base = consultationAnalysisSchema.parse({
      recommendedTreatments: [],
      pricing: { totalEstimate: "$500", patientEstimate: null, insuranceEstimate: null, otherAmounts: [], evidence: [{ quote: "total is five hundred dollars", startSeconds: 0.4, endSeconds: 2.5, speaker: "unknown" }], needsReview: false },
      financing: { discussed: null, options: [], evidence: [] }, patientConcerns: [], objections: [],
      patientDecision: { status: "not_stated", evidence: [], needsReview: false }, nextSteps: [], checklist: [], shortSummary: "Synthetic draft", warnings: [],
    });
    expect(assertEvidenceMatchesTranscript(assertEvidenceBacked(base), transcript)).toEqual(base);
    const invented = structuredClone(base);
    invented.pricing.evidence[0].quote = "insurance will cover everything";
    expect(() => assertEvidenceMatchesTranscript(invented, transcript)).toThrow(/bedrock_invalid_evidence/);
    const guessedSpeaker = structuredClone(base);
    guessedSpeaker.pricing.evidence[0].speaker = "coordinator";
    expect(() => assertEvidenceMatchesTranscript(guessedSpeaker, transcript)).toThrow(/bedrock_unconfirmed_speaker_identity/);
  });
});
