import { randomUUID } from "node:crypto";

const allowedAudioMimeTypes = new Set(["audio/webm", "video/webm", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a"]);

export function normalizeAudioMimeType(value: string): string {
  return value.toLowerCase().split(";")[0].trim();
}

export function isAllowedAudioMimeType(value: string): boolean {
  return allowedAudioMimeTypes.has(normalizeAudioMimeType(value));
}

export function opaqueAudioObjectKey(mimeType: string, uuid: () => string = randomUUID): string {
  const normalized = normalizeAudioMimeType(mimeType);
  if (!isAllowedAudioMimeType(normalized)) throw new Error("unsupported_media_type");
  return `uploads/${uuid()}/${uuid()}.${extensionFor(normalized)}`;
}

export function uploadExpiration(now = new Date()): { expiresInSeconds: number; expiresAt: string } {
  const expiresInSeconds = 300;
  return { expiresInSeconds, expiresAt: new Date(now.getTime() + expiresInSeconds * 1_000).toISOString() };
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  return "webm";
}
