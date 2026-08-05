import { z } from "zod";

export const evidenceSchema = z.object({
  quote: z.string().max(320),
  // Strict Structured Outputs requires every property to be required. Null
  // represents evidence whose timestamp or speaker is not available.
  startSeconds: z.number().nonnegative().nullable(),
  endSeconds: z.number().nonnegative().nullable(),
  speaker: z.enum(["coordinator", "patient", "unknown"]).nullable(),
});

export const consultationAnalysisSchema = z.object({
  recommendedTreatments: z.array(z.object({
    description: z.string(),
    toothNumbers: z.array(z.string()),
    evidence: z.array(evidenceSchema),
    needsReview: z.boolean(),
  })),
  pricing: z.object({
    totalEstimate: z.string().nullable(),
    patientEstimate: z.string().nullable(),
    insuranceEstimate: z.string().nullable(),
    otherAmounts: z.array(z.string()),
    evidence: z.array(evidenceSchema),
    needsReview: z.boolean(),
  }),
  financing: z.object({
    discussed: z.boolean().nullable(),
    options: z.array(z.string()),
    evidence: z.array(evidenceSchema),
  }),
  patientConcerns: z.array(z.object({
    concern: z.string(),
    evidence: z.array(evidenceSchema),
  })),
  objections: z.array(z.object({
    objection: z.string(),
    response: z.string().nullable(),
    evidence: z.array(evidenceSchema),
  })),
  patientDecision: z.object({
    status: z.enum(["accepted", "declined", "undecided", "not_stated"]),
    evidence: z.array(evidenceSchema),
    needsReview: z.boolean(),
  }),
  nextSteps: z.array(z.object({
    action: z.string(),
    owner: z.string().nullable(),
    dueDate: z.string().nullable(),
    evidence: z.array(evidenceSchema),
  })),
  checklist: z.array(z.object({
    key: z.string(),
    label: z.string(),
    status: z.enum(["completed", "partial", "not_detected", "not_applicable", "needs_review"]),
    evidence: z.array(evidenceSchema),
  })),
  shortSummary: z.string().max(3000),
  warnings: z.array(z.string()),
});

export type ConsultationAnalysis = z.infer<typeof consultationAnalysisSchema>;

export const CONSULTATION_SCHEMA_VERSION = "1.0";
