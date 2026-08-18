import { z } from "zod";
import { awsJobResponseSchema, awsUploadResponseSchema, type AwsJobResponse, type AwsUploadIntent, type AwsUploadResponse } from "./aws-contract";
import { appConfig, awsConfigurationErrors } from "./env";
import { PublicApiError } from "./http";
import type { Role } from "./types";

type AwsRequestIdentity = {
  actorId: string;
  role: Role;
  consultationId: string;
};

const deleteResponseSchema = z.object({ status: z.literal("deleted") });
const audioResponseSchema = z.object({ url: z.string().url(), expiresAt: z.string().datetime() });

export async function createAwsUpload(identity: AwsRequestIdentity, input: AwsUploadIntent): Promise<AwsUploadResponse> {
  return awsRequest(identity, "/v1/uploads", {
    method: "POST",
    body: JSON.stringify({ consultationId: identity.consultationId, ...input }),
  }, awsUploadResponseSchema);
}

export async function queueAwsJob(identity: AwsRequestIdentity, jobId: string): Promise<AwsJobResponse> {
  return awsRequest(identity, "/v1/jobs", {
    method: "POST",
    body: JSON.stringify({ jobId, consultationId: identity.consultationId }),
  }, awsJobResponseSchema);
}

export async function getAwsJob(identity: AwsRequestIdentity, jobId: string): Promise<AwsJobResponse> {
  return awsRequest(identity, `/v1/jobs/${encodeURIComponent(jobId)}`, { method: "GET" }, awsJobResponseSchema);
}

export async function getAwsAudioUrl(identity: AwsRequestIdentity, jobId: string): Promise<{ url: string; expiresAt: string }> {
  return awsRequest(identity, `/v1/jobs/${encodeURIComponent(jobId)}/audio`, { method: "GET" }, audioResponseSchema);
}

export async function deleteAwsJob(identity: AwsRequestIdentity, jobId: string): Promise<void> {
  await awsRequest(identity, `/v1/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" }, deleteResponseSchema);
}

export function awsJobIdFromStorageKey(storageKey: string): string | null {
  return storageKey.startsWith("aws:") ? storageKey.slice(4) : null;
}

async function awsRequest<T>(
  identity: AwsRequestIdentity,
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> {
  const configurationErrors = awsConfigurationErrors();
  if (configurationErrors.length) throw new PublicApiError(configurationErrors[0], 503, false, "aws_configuration");
  const token = await createBridgeToken(identity);
  let response: Response;
  try {
    response = await fetch(`${appConfig.awsApiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new PublicApiError("The AWS processing service could not be reached. The recording remains available for a later retry.", 502, true, "aws_network");
  }
  if (!response.ok) {
    await response.text().catch(() => "");
    const retryable = response.status === 429 || response.status >= 500;
    throw new PublicApiError(
      retryable
        ? "The AWS processing service is temporarily unavailable. The recording remains available for a later retry."
        : "The AWS processing service rejected the request. Ask an administrator to verify the pilot configuration.",
      502,
      retryable,
      retryable ? "aws_unavailable" : "aws_rejected",
    );
  }
  try {
    return schema.parse(await response.json());
  } catch {
    throw new PublicApiError("The AWS processing service returned an invalid response. No result was saved.", 502, false, "aws_invalid_response");
  }
}

async function createBridgeToken(identity: AwsRequestIdentity): Promise<string> {
  const secret = process.env.AWS_BRIDGE_TOKEN_SECRET;
  if (!secret || secret.length < 32) throw new PublicApiError("AWS bridge authentication is not configured.", 503, false, "aws_auth_configuration");
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    iss: "trinity-consult",
    aud: "trinity-consult-aws-pilot",
    sub: identity.actorId,
    role: identity.role,
    consultationId: identity.consultationId,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 120,
  });
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
