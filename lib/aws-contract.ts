import { z } from "zod";
import { consultationAnalysisSchema } from "./analysis-schema";

export const awsJobStatusSchema = z.enum([
  "awaiting_upload",
  "uploaded",
  "queued",
  "transcribing",
  "summarizing",
  "complete",
  "failed",
  "deleting",
  "deleted",
]);

export type AwsJobStatus = z.infer<typeof awsJobStatusSchema>;

export const normalizedTranscriptSchema = z.object({
  text: z.string().min(1),
  language: z.string().nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  speakerMapping: z.enum(["provided", "unconfirmed", "unavailable"]).optional(),
  segments: z.array(z.object({
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().nonnegative(),
    speaker: z.enum(["coordinator", "patient", "unknown"]),
    speakerLabel: z.string().max(40).nullable().optional(),
    text: z.string().min(1),
  })),
});

export const awsUploadResponseSchema = z.object({
  jobId: z.string().uuid(),
  status: z.literal("awaiting_upload"),
  upload: z.object({
    url: z.string().url(),
    fields: z.record(z.string(), z.string()),
    expiresAt: z.string().datetime(),
  }),
});

export const awsJobResponseSchema = z.object({
  jobId: z.string().uuid(),
  consultationId: z.string().uuid(),
  status: awsJobStatusSchema,
  failureCode: z.string().max(80).nullable().optional(),
  provider: z.literal("aws"),
  transcriptionModel: z.string().max(120).nullable().optional(),
  analysisModel: z.string().max(240).nullable().optional(),
  transcript: normalizedTranscriptSchema.nullable().optional(),
  analysis: consultationAnalysisSchema.nullable().optional(),
  updatedAt: z.string().datetime(),
});

export type AwsUploadResponse = z.infer<typeof awsUploadResponseSchema>;
export type AwsJobResponse = z.infer<typeof awsJobResponseSchema>;

export const awsUploadIntentSchema = z.object({
  mimeType: z.string().min(1).max(120),
  byteSize: z.number().int().positive(),
  durationSeconds: z.number().positive(),
});

export type AwsUploadIntent = z.infer<typeof awsUploadIntentSchema>;
