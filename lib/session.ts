import { cookies } from "next/headers";
import { appConfig } from "./env";
import {
  createSessionToken,
  readSessionToken,
  sessionCookie,
  type SessionPayload,
} from "./session-token";
import type { Role, SessionUser } from "./types";

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(sessionCookie.name)?.value);
}

export async function setSessionCookie(user: SessionUser): Promise<string> {
  const { token, csrf } = await createSessionToken(user);
  const jar = await cookies();
  jar.set(sessionCookie.name, token, {
    httpOnly: true,
    secure: appConfig.isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: sessionCookie.seconds,
  });
  return csrf;
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(sessionCookie.name, "", {
    httpOnly: true,
    secure: appConfig.isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export async function requireSession(role?: Role): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Response("Authentication required.", { status: 401 });
  if (role && session.role !== role) throw new Response("Forbidden.", { status: 403 });
  return session;
}

export function verifyCsrf(request: Request, session: SessionPayload): void {
  if (request.headers.get("x-csrf-token") !== session.csrf) {
    throw new Response("Invalid request token.", { status: 403 });
  }
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    throw new Response("Invalid request origin.", { status: 403 });
  }
}
