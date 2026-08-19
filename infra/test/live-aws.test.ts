import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GetPublicAccessBlockCommand, HeadObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { z } from "zod";
import { consultationAnalysisSchema } from "../src/analysis-schema.js";

const runLive = process.env.RUN_AWS_INTEGRATION_TESTS === "true";

describe.runIf(runLive)("deployed AWS synthetic smoke test", () => {
  it("uploads, transcribes, analyzes, polls, and deletes a synthetic clip", async () => {
    const region = required("AWS_REGION");
    if (region !== "us-east-1") throw new Error("aws_integration_region_invalid");
    const identity = await new STSClient({ region }).send(new GetCallerIdentityCommand({}));
    expect(identity.Account).toBe(required("AWS_INTEGRATION_EXPECTED_ACCOUNT"));
    const baseUrl = required("AWS_INTEGRATION_API_BASE_URL").replace(/\/$/, "");
    const secret = required("AWS_INTEGRATION_BRIDGE_SECRET");
    const bucketName = required("AWS_INTEGRATION_BUCKET_NAME");
    const kmsKeyArn = required("AWS_INTEGRATION_KMS_KEY_ARN");
    const s3 = new S3Client({ region });
    const actorId = randomUUID();
    const consultationId = randomUUID();
    const fixture = await readFile(path.resolve(process.cwd(), "../tests/fixtures/synthetic-consultation.wav"));
    const authorization = `Bearer ${sign(secret, actorId, consultationId)}`;

    const created = await api(baseUrl, authorization, "/v1/uploads", {
      method: "POST",
      body: JSON.stringify({ consultationId, mimeType: "audio/wav", byteSize: fixture.byteLength, durationSeconds: 43 }),
    }) as { jobId: string; upload: { url: string; fields: Record<string, string> } };
    const form = new FormData();
    for (const [key, value] of Object.entries(created.upload.fields)) form.append(key, value);
    form.append("file", new Blob([fixture], { type: "audio/wav" }), "synthetic-consultation.wav");
    const uploaded = await fetch(created.upload.url, { method: "POST", body: form });
    expect(uploaded.ok).toBe(true);
    const objectKey = created.upload.fields.key;
    expect(objectKey).toMatch(/^uploads\/[0-9a-f-]+\/[0-9a-f-]+\.wav$/);
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: objectKey }));
    expect(head.ServerSideEncryption).toBe("aws:kms");
    expect(head.SSEKMSKeyId).toBe(kmsKeyArn);
    const publicAccess = await s3.send(new GetPublicAccessBlockCommand({ Bucket: bucketName }));
    expect(publicAccess.PublicAccessBlockConfiguration).toMatchObject({ BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true });

    await api(baseUrl, authorization, "/v1/jobs", { method: "POST", body: JSON.stringify({ jobId: created.jobId, consultationId }) });
    let result: { status?: string; transcript?: unknown; analysis?: unknown } = {};
    for (let attempt = 0; attempt < 90; attempt += 1) {
      result = await api(baseUrl, authorization, `/v1/jobs/${created.jobId}`, { method: "GET" }) as typeof result;
      if (["complete", "failed"].includes(result.status ?? "")) break;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    expect(result.status).toBe("complete");
    const completed = completedJobSchema.parse(result);
    expect(completed.provider).toBe("aws");
    expect(completed.transcriptionModel).toBe("amazon-transcribe-standard");
    expect(completed.analysisModel.length).toBeGreaterThan(0);
    expect(completed.transcript.segments.length).toBeGreaterThan(0);
    expect(completed.transcript.segments.every((segment) => segment.speaker === "unknown" && Boolean(segment.speakerLabel) && segment.endSeconds >= segment.startSeconds)).toBe(true);
    consultationAnalysisSchema.parse(completed.analysis);
    const deleted = await api(baseUrl, authorization, `/v1/jobs/${created.jobId}`, { method: "DELETE" }) as { status?: string };
    expect(deleted.status).toBe("deleted");
    const deletedJob = await api(baseUrl, authorization, `/v1/jobs/${created.jobId}`, { method: "GET" }) as { status?: string };
    expect(deletedJob.status).toBe("deleted");
    await expect(s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: objectKey }))).rejects.toBeTruthy();
    const artifacts = await Promise.all([
      s3.send(new ListObjectsV2Command({ Bucket: bucketName, Prefix: `transcripts/${created.jobId}/` })),
      s3.send(new ListObjectsV2Command({ Bucket: bucketName, Prefix: `analysis/${created.jobId}/` })),
    ]);
    expect(artifacts.flatMap((result) => result.Contents ?? [])).toHaveLength(0);
  }, 8 * 60_000);
});

const completedJobSchema = z.object({
  status: z.literal("complete"),
  provider: z.literal("aws"),
  transcriptionModel: z.string().min(1),
  analysisModel: z.string().min(1),
  transcript: z.object({
    text: z.string().min(1),
    segments: z.array(z.object({
      startSeconds: z.number().nonnegative(),
      endSeconds: z.number().nonnegative(),
      speaker: z.literal("unknown"),
      speakerLabel: z.string().min(1),
      text: z.string().min(1),
    })).min(1),
  }),
  analysis: consultationAnalysisSchema,
});

async function api(baseUrl: string, authorization: string, route: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${baseUrl}${route}`, { ...init, headers: { authorization, "content-type": "application/json" } });
  if (!response.ok) throw new Error(`aws_smoke_request_failed_${response.status}`);
  return response.json();
}

function sign(secret: string, actorId: string, consultationId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "trinity-consult", aud: "trinity-consult-aws-pilot", sub: actorId, role: "manager", consultationId, jti: randomUUID(), iat: now, exp: now + 120 })).toString("base64url");
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_required`);
  return value;
}
