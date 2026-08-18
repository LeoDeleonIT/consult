import { randomUUID } from "node:crypto";
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { DeleteTranscriptionJobCommand, TranscribeClient } from "@aws-sdk/client-transcribe";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { consultationAnalysisSchema } from "../analysis-schema.js";
import { MAX_JOB_ATTEMPTS, transcribeJobNameFor } from "../job-identifiers.js";
import { isAllowedAudioMimeType, normalizeAudioMimeType, opaqueAudioObjectKey, uploadExpiration } from "../upload-policy.js";

const s3 = new S3Client({});
const sqs = new SQSClient({});
const transcribe = new TranscribeClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

type AuthContext = { actorId: string; role: "coordinator" | "manager"; consultationId: string; tokenId: string };
type ApiEvent = {
  routeKey: string;
  body?: string | null;
  pathParameters?: Record<string, string | undefined>;
  requestContext: { authorizer?: { lambda?: Partial<AuthContext> } };
};

const statusSchema = z.enum(["awaiting_upload", "uploaded", "queued", "transcribing", "summarizing", "complete", "failed", "deleting", "deleted"]);
const jobSchema = z.object({
  jobId: z.string().uuid(),
  consultationId: z.string().uuid(),
  objectKey: z.string().min(1).optional(),
  status: statusSchema,
  mimeType: z.string().optional(),
  byteSize: z.number().int().positive().optional(),
  durationSeconds: z.number().positive().optional(),
  attempt: z.number().int().nonnegative().default(0),
  failureCode: z.string().optional(),
  transcriptionModel: z.string().optional(),
  analysisModel: z.string().optional(),
  transcribeJobName: z.string().optional(),
  transcriptRawKey: z.string().optional(),
  transcriptKey: z.string().optional(),
  analysisKey: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  retentionExpiresAt: z.number().int(),
});
type Job = z.infer<typeof jobSchema>;

const uploadSchema = z.object({
  consultationId: z.string().uuid(),
  mimeType: z.string().min(1).max(120),
  byteSize: z.number().int().positive(),
  durationSeconds: z.number().positive(),
});
const queueSchema = z.object({ jobId: z.string().uuid(), consultationId: z.string().uuid() });

export async function handler(event: ApiEvent) {
  try {
    const identity = identityFrom(event);
    if (event.routeKey === "POST /v1/uploads") return json(201, await createUpload(identity, parseBody(event, uploadSchema)));
    if (event.routeKey === "POST /v1/jobs") return json(202, await queueJob(identity, parseBody(event, queueSchema)));
    const jobId = z.string().uuid().parse(event.pathParameters?.jobId);
    if (event.routeKey === "GET /v1/jobs/{jobId}") return json(200, await jobStatus(identity, jobId));
    if (event.routeKey === "GET /v1/jobs/{jobId}/audio") return json(200, await audioUrl(identity, jobId));
    if (event.routeKey === "DELETE /v1/jobs/{jobId}") return json(200, await deleteJob(identity, jobId));
    return json(404, { code: "not_found" });
  } catch (error) {
    if (error instanceof ApiError) return json(error.status, { code: error.code });
    if (error instanceof z.ZodError) return json(400, { code: "invalid_request" });
    return json(500, { code: "internal_error" });
  }
}

async function createUpload(identity: AuthContext, input: z.infer<typeof uploadSchema>) {
  assertScope(identity, input.consultationId);
  const mimeType = normalizeAudioMimeType(input.mimeType);
  if (!isAllowedAudioMimeType(mimeType)) throw new ApiError(415, "unsupported_media_type");
  if (input.byteSize > maxUploadBytes()) throw new ApiError(413, "upload_too_large");
  if (input.durationSeconds > maxRecordingSeconds()) throw new ApiError(400, "duration_invalid");
  const jobId = randomUUID();
  const objectKey = opaqueAudioObjectKey(mimeType);
  const now = new Date();
  const expiration = uploadExpiration(now);
  const job: Job = {
    jobId,
    consultationId: input.consultationId,
    objectKey,
    status: "awaiting_upload",
    mimeType,
    byteSize: input.byteSize,
    durationSeconds: input.durationSeconds,
    attempt: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    retentionExpiresAt: Math.floor(now.getTime() / 1000) + retentionDays() * 86_400,
  };
  await ddb.send(new PutCommand({ TableName: required("JOBS_TABLE_NAME"), Item: job, ConditionExpression: "attribute_not_exists(jobId)" }));
  const upload = await createPresignedPost(s3, {
    Bucket: required("AUDIO_BUCKET_NAME"),
    Key: objectKey,
    Expires: expiration.expiresInSeconds,
    Fields: {
      "Content-Type": mimeType,
      "x-amz-server-side-encryption": "aws:kms",
      "x-amz-server-side-encryption-aws-kms-key-id": required("KMS_KEY_ARN"),
    },
    Conditions: [
      ["content-length-range", 1, Math.min(input.byteSize, maxUploadBytes())],
      ["eq", "$key", objectKey],
      ["eq", "$Content-Type", mimeType],
      ["eq", "$x-amz-server-side-encryption", "aws:kms"],
      ["eq", "$x-amz-server-side-encryption-aws-kms-key-id", required("KMS_KEY_ARN")],
    ],
  });
  return { jobId, status: "awaiting_upload", upload: { ...upload, expiresAt: expiration.expiresAt } };
}

async function queueJob(identity: AuthContext, input: z.infer<typeof queueSchema>) {
  assertScope(identity, input.consultationId);
  let job = await loadJob(input.jobId);
  assertJobScope(identity, job);
  if (["transcribing", "summarizing", "complete"].includes(job.status)) return publicJob(job);
  if (["deleting", "deleted"].includes(job.status)) throw new ApiError(409, "job_deleted");
  if (job.status === "failed" && job.attempt >= MAX_JOB_ATTEMPTS) throw new ApiError(409, "retry_limit_reached");
  await validateObject(job);
  if (job.status !== "queued") {
    const now = new Date().toISOString();
    await ddb.send(new UpdateCommand({
      TableName: required("JOBS_TABLE_NAME"),
      Key: { jobId: job.jobId },
      UpdateExpression: "SET #status=:queued, updatedAt=:now, attempt=if_not_exists(attempt,:zero)+:one REMOVE failureCode",
      ConditionExpression: "#status IN (:awaiting,:uploaded,:failed)",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":queued": "queued", ":now": now, ":zero": 0, ":one": 1, ":awaiting": "awaiting_upload", ":uploaded": "uploaded", ":failed": "failed" },
    }));
    job = await loadJob(job.jobId);
  }
  await sqs.send(new SendMessageCommand({
    QueueUrl: required("JOBS_QUEUE_URL"),
    MessageBody: JSON.stringify({ jobId: job.jobId, attempt: job.attempt }),
  }));
  return publicJob(job);
}

async function jobStatus(identity: AuthContext, jobId: string) {
  const job = await loadJob(jobId);
  assertJobScope(identity, job);
  const result: Record<string, unknown> = publicJob(job);
  if (job.status === "complete") {
    if (!job.transcriptKey || !job.analysisKey) throw new ApiError(500, "completion_artifacts_missing");
    const [transcript, analysis] = await Promise.all([readJsonObject(job.transcriptKey), readJsonObject(job.analysisKey)]);
    result.transcript = transcript;
    result.analysis = consultationAnalysisSchema.parse(analysis);
  }
  return result;
}

async function audioUrl(identity: AuthContext, jobId: string) {
  const job = await loadJob(jobId);
  assertJobScope(identity, job);
  if (!job.objectKey || ["deleting", "deleted"].includes(job.status)) throw new ApiError(410, "audio_deleted");
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: required("AUDIO_BUCKET_NAME"), Key: job.objectKey }), { expiresIn: 60 });
  return { url, expiresAt };
}

async function deleteJob(identity: AuthContext, jobId: string) {
  if (identity.role !== "manager") throw new ApiError(403, "manager_required");
  const job = await loadJob(jobId);
  assertJobScope(identity, job);
  if (job.status === "deleted") return { status: "deleted" };
  if (["queued", "transcribing", "summarizing", "deleting"].includes(job.status)) {
    throw new ApiError(409, "job_not_terminal");
  }
  const now = new Date().toISOString();
  try {
    await ddb.send(new UpdateCommand({
      TableName: required("JOBS_TABLE_NAME"),
      Key: { jobId },
      UpdateExpression: "SET #status=:deleting, updatedAt=:now",
      ConditionExpression: "#status IN (:awaiting,:uploaded,:complete,:failed)",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":deleting": "deleting", ":now": now, ":awaiting": "awaiting_upload", ":uploaded": "uploaded", ":complete": "complete", ":failed": "failed" },
    }));
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") throw new ApiError(409, "job_not_terminal");
    throw error;
  }
  const keys = [
    job.objectKey,
    job.transcriptRawKey,
    job.transcriptKey,
    job.analysisKey,
    `transcripts/${job.jobId}/.write_access_check_file.temp`,
  ].filter((value): value is string => Boolean(value));
  if (keys.length) {
    await s3.send(new DeleteObjectsCommand({ Bucket: required("AUDIO_BUCKET_NAME"), Delete: { Quiet: true, Objects: keys.map((Key) => ({ Key })) } }));
  }
  const transcribeJobNames = new Set([
    ...(job.transcribeJobName ? [job.transcribeJobName] : []),
    ...Array.from({ length: job.attempt }, (_, index) => transcribeJobNameFor(job.jobId, index + 1)),
  ]);
  for (const transcribeJobName of transcribeJobNames) {
    try {
      await transcribe.send(new DeleteTranscriptionJobCommand({ TranscriptionJobName: transcribeJobName }));
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "NotFoundException") throw error;
    }
  }
  await ddb.send(new UpdateCommand({
    TableName: required("JOBS_TABLE_NAME"),
    Key: { jobId },
    UpdateExpression: "SET #status=:deleted, updatedAt=:now, deletedAt=:now REMOVE objectKey,mimeType,byteSize,durationSeconds,failureCode,transcribeJobName,transcriptRawKey,transcriptKey,analysisKey",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":deleted": "deleted", ":now": now },
  }));
  return { status: "deleted" };
}

async function validateObject(job: Job): Promise<void> {
  if (!job.objectKey || !job.mimeType || !job.byteSize) throw new ApiError(409, "upload_not_ready");
  let head;
  try {
    head = await s3.send(new HeadObjectCommand({ Bucket: required("AUDIO_BUCKET_NAME"), Key: job.objectKey }));
  } catch {
    throw new ApiError(409, "upload_not_found");
  }
  if (head.ContentLength !== job.byteSize || head.ContentLength > maxUploadBytes()) throw new ApiError(409, "object_size_mismatch");
  if (normalizeAudioMimeType(head.ContentType ?? "") !== job.mimeType) throw new ApiError(409, "object_type_mismatch");
  if (head.ServerSideEncryption !== "aws:kms" || head.SSEKMSKeyId !== required("KMS_KEY_ARN")) throw new ApiError(409, "object_encryption_invalid");
}

async function readJsonObject(key: string): Promise<unknown> {
  const response = await s3.send(new GetObjectCommand({ Bucket: required("AUDIO_BUCKET_NAME"), Key: key }));
  if (!response.Body) throw new ApiError(500, "artifact_missing");
  return JSON.parse(await response.Body.transformToString());
}

async function loadJob(jobId: string): Promise<Job> {
  const response = await ddb.send(new GetCommand({ TableName: required("JOBS_TABLE_NAME"), Key: { jobId }, ConsistentRead: true }));
  if (!response.Item) throw new ApiError(404, "job_not_found");
  return jobSchema.parse(response.Item);
}

function publicJob(job: Job) {
  return {
    jobId: job.jobId,
    consultationId: job.consultationId,
    status: job.status,
    failureCode: job.failureCode ?? null,
    provider: "aws",
    transcriptionModel: job.transcriptionModel ?? null,
    analysisModel: job.analysisModel ?? null,
    updatedAt: job.updatedAt,
  };
}

function identityFrom(event: ApiEvent): AuthContext {
  return z.object({ actorId: z.string().uuid(), role: z.enum(["coordinator", "manager"]), consultationId: z.string().uuid(), tokenId: z.string().uuid() })
    .parse(event.requestContext.authorizer?.lambda);
}

function assertScope(identity: AuthContext, consultationId: string): void {
  if (identity.consultationId !== consultationId) throw new ApiError(403, "scope_mismatch");
}

function assertJobScope(identity: AuthContext, job: Job): void {
  assertScope(identity, job.consultationId);
}

function parseBody<T>(event: ApiEvent, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(event.body ?? "{}"));
}

function json(statusCode: number, body: unknown) {
  return { statusCode, headers: { "content-type": "application/json", "cache-control": "private, no-store", "x-content-type-options": "nosniff" }, body: JSON.stringify(body) };
}

function maxUploadBytes(): number {
  return Number(required("MAX_UPLOAD_BYTES"));
}

function maxRecordingSeconds(): number {
  return Number(required("MAX_RECORDING_SECONDS"));
}

function retentionDays(): number {
  return Number(required("AUDIO_RETENTION_DAYS"));
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("configuration_error");
  return value;
}

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}
