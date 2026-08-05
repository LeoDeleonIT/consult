import { appConfig } from "./env";
import type { SessionUser } from "./types";

const SESSION_SECONDS = 60 * 60 * 8;

export type SessionPayload = SessionUser & {
  csrf: string;
  exp: number;
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function signature(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appConfig.authSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return toBase64Url(new Uint8Array(signed));
}

export async function createSessionToken(user: SessionUser): Promise<{ token: string; csrf: string }> {
  const payload: SessionPayload = {
    ...user,
    csrf: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return { token: `${encoded}.${await signature(encoded)}`, csrf: payload.csrf };
}

export async function readSessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const [encoded, supplied] = token.split(".");
  if (!encoded || !supplied || supplied !== await signature(encoded)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as SessionPayload;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!["coordinator", "manager"].includes(payload.role)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const sessionCookie = {
  name: "trinity_session",
  seconds: SESSION_SECONDS,
};
