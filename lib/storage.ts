import { env } from "cloudflare:workers";
export { isAllowedAudio } from "./audio-validation";

type R2ObjectBodyLike = {
  arrayBuffer: () => Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
};

type R2BucketLike = {
  put: (key: string, value: ArrayBuffer | Uint8Array | Blob, options?: { httpMetadata?: { contentType?: string } }) => Promise<unknown>;
  get: (key: string) => Promise<R2ObjectBodyLike | null>;
  delete: (key: string) => Promise<void>;
};

export interface AudioStorage {
  put(input: { key: string; bytes: ArrayBuffer; mimeType: string }): Promise<void>;
  get(key: string): Promise<{ bytes: ArrayBuffer; mimeType: string } | null>;
  delete(key: string): Promise<void>;
}

export class R2AudioStorage implements AudioStorage {
  private bucket(): R2BucketLike {
    const bucket = (env as unknown as { AUDIO?: R2BucketLike }).AUDIO;
    if (!bucket) throw new Error("Private audio storage is unavailable.");
    return bucket;
  }

  async put(input: { key: string; bytes: ArrayBuffer; mimeType: string }): Promise<void> {
    await this.bucket().put(input.key, input.bytes, {
      httpMetadata: { contentType: input.mimeType },
    });
  }

  async get(key: string): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
    const object = await this.bucket().get(key);
    if (!object) return null;
    return {
      bytes: await object.arrayBuffer(),
      mimeType: object.httpMetadata?.contentType ?? "application/octet-stream",
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket().delete(key);
  }
}

export function randomStorageKey(consultationId: string, mimeType: string): string {
  const extension =
    mimeType.includes("wav") ? "wav"
      : mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a"
        : mimeType.includes("mpeg") || mimeType.includes("mp3") ? "mp3"
          : "webm";
  return `consultations/${consultationId}/${crypto.randomUUID()}.${extension}`;
}
