import { z } from "zod";

export const evidenceSchema = z.object({
  quote: z.string().trim().min(1).max(320),
  startSeconds: z.number().nonnegative().nullable(),
  endSeconds: z.number().nonnegative().nullable(),
  speaker: z.enum(["coordinator", "patient", "unknown"]).nullable(),
});

export const consultationAnalysisSchema = z.object({
  recommendedTreatments: z.array(z.object({ description: z.string(), toothNumbers: z.array(z.string()), evidence: z.array(evidenceSchema), needsReview: z.boolean() })),
  pricing: z.object({ totalEstimate: z.string().nullable(), patientEstimate: z.string().nullable(), insuranceEstimate: z.string().nullable(), otherAmounts: z.array(z.string()), evidence: z.array(evidenceSchema), needsReview: z.boolean() }),
  financing: z.object({ discussed: z.boolean().nullable(), options: z.array(z.string()), evidence: z.array(evidenceSchema) }),
  patientConcerns: z.array(z.object({ concern: z.string(), evidence: z.array(evidenceSchema) })),
  objections: z.array(z.object({ objection: z.string(), response: z.string().nullable(), evidence: z.array(evidenceSchema) })),
  patientDecision: z.object({ status: z.enum(["accepted", "declined", "undecided", "not_stated"]), evidence: z.array(evidenceSchema), needsReview: z.boolean() }),
  nextSteps: z.array(z.object({ action: z.string(), owner: z.string().nullable(), dueDate: z.string().nullable(), evidence: z.array(evidenceSchema) })),
  checklist: z.array(z.object({ key: z.string(), label: z.string(), status: z.enum(["completed", "partial", "not_detected", "not_applicable", "needs_review"]), evidence: z.array(evidenceSchema) })),
  shortSummary: z.string().max(3000),
  warnings: z.array(z.string()),
});

export type ConsultationAnalysis = z.infer<typeof consultationAnalysisSchema>;

export function assertEvidenceBacked(analysis: ConsultationAnalysis): ConsultationAnalysis {
  const missing: string[] = [];
  analysis.recommendedTreatments.forEach((item, index) => { if (!item.evidence.length) missing.push(`recommendedTreatments[${index}]`); });
  if ([analysis.pricing.totalEstimate, analysis.pricing.patientEstimate, analysis.pricing.insuranceEstimate, ...analysis.pricing.otherAmounts].some(Boolean) && !analysis.pricing.evidence.length) missing.push("pricing");
  if ((analysis.financing.discussed || analysis.financing.options.length) && !analysis.financing.evidence.length) missing.push("financing");
  analysis.patientConcerns.forEach((item, index) => { if (!item.evidence.length) missing.push(`patientConcerns[${index}]`); });
  analysis.objections.forEach((item, index) => { if (!item.evidence.length) missing.push(`objections[${index}]`); });
  if (analysis.patientDecision.status !== "not_stated" && !analysis.patientDecision.evidence.length) missing.push("patientDecision");
  analysis.nextSteps.forEach((item, index) => { if (!item.evidence.length) missing.push(`nextSteps[${index}]`); });
  analysis.checklist.forEach((item, index) => { if (["completed", "partial", "needs_review"].includes(item.status) && !item.evidence.length) missing.push(`checklist[${index}]`); });
  if (missing.length) throw safeWorkflowError("bedrock_missing_evidence");
  return analysis;
}

type EvidenceTranscript = {
  text: string;
  durationSeconds: number | null;
  segments: Array<{ startSeconds: number; endSeconds: number; text: string }>;
};

export function assertEvidenceMatchesTranscript(analysis: ConsultationAnalysis, transcript: EvidenceTranscript): ConsultationAnalysis {
  const evidence = [
    ...analysis.recommendedTreatments.flatMap((item) => item.evidence),
    ...analysis.pricing.evidence,
    ...analysis.financing.evidence,
    ...analysis.patientConcerns.flatMap((item) => item.evidence),
    ...analysis.objections.flatMap((item) => item.evidence),
    ...analysis.patientDecision.evidence,
    ...analysis.nextSteps.flatMap((item) => item.evidence),
    ...analysis.checklist.flatMap((item) => item.evidence),
  ];
  const transcriptText = normalizeText(transcript.text);
  for (const item of evidence) {
    if (item.startSeconds === null || item.endSeconds === null || item.startSeconds > item.endSeconds) {
      throw safeWorkflowError("bedrock_invalid_evidence");
    }
    const startSeconds = item.startSeconds;
    const endSeconds = item.endSeconds;
    if (transcript.durationSeconds !== null && endSeconds > transcript.durationSeconds + 0.5) {
      throw safeWorkflowError("bedrock_invalid_evidence");
    }
    if (item.speaker !== null && item.speaker !== "unknown") {
      throw safeWorkflowError("bedrock_unconfirmed_speaker_identity");
    }
    const quote = normalizeText(item.quote);
    const matchingSegment = transcript.segments.some((segment) => {
      const overlaps = segment.startSeconds <= endSeconds + 0.25 && segment.endSeconds >= startSeconds - 0.25;
      const segmentText = normalizeText(segment.text);
      return overlaps && (segmentText.includes(quote) || quote.includes(segmentText));
    });
    if (!transcriptText.includes(quote) || !matchingSegment) throw safeWorkflowError("bedrock_invalid_evidence");
  }
  return analysis;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9$%]+/g, " ").trim().replace(/\s+/g, " ");
}

export function safeWorkflowError(code: string): Error {
  const error = new Error(code);
  error.name = code;
  return error;
}
