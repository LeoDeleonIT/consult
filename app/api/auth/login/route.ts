import bcrypt from "bcryptjs";
import { z } from "zod";
import { ensureDatabase, writeAudit } from "@/lib/d1";
import { apiError } from "@/lib/http";
import { setSessionCookie } from "@/lib/session";
import type { Role } from "@/lib/types";

const loginSchema = z.object({
  email: z.string().email().max(200).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
});

type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  active: number;
  location_id: string | null;
  location_name: string | null;
};

export async function POST(request: Request): Promise<Response> {
  try {
    verifyOrigin(request);
    const input = loginSchema.parse(await request.json());
    const db = await ensureDatabase();
    const rateKey = `login:${request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local"}`;
    await assertLoginAllowed(db, rateKey);
    const user = await db.prepare(`
      SELECT u.*, l.name AS location_name
      FROM users u LEFT JOIN locations l ON l.id = u.location_id
      WHERE u.email = ?
    `).bind(input.email).first<UserRow>();
    if (!user || !user.active || !(await bcrypt.compare(input.password, user.password_hash))) {
      await recordFailedLogin(db, rateKey);
      return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
    }
    await clearLoginAttempts(db, rateKey);
    const csrf = await setSessionCookie({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      locationId: user.location_id,
      locationName: user.location_name,
    });
    await writeAudit({ actorId: user.id, eventType: "user.login" });
    return Response.json({ user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      locationId: user.location_id,
      locationName: user.location_name,
    }, csrf });
  } catch (error) {
    return apiError(error);
  }
}

function verifyOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    throw new Response("Invalid request origin.", { status: 403 });
  }
}

type Database = Awaited<ReturnType<typeof ensureDatabase>>;

async function assertLoginAllowed(db: Database, key: string): Promise<void> {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const row = await db.prepare(`SELECT count, window_started_at FROM login_attempts WHERE key = ?`)
    .bind(key)
    .first<{ count: number; window_started_at: number }>();
  if (row && now - row.window_started_at <= windowMs && row.count >= 8) {
    throw new Response("Too many sign-in attempts. Please wait ten minutes.", { status: 429 });
  }
}

async function recordFailedLogin(db: Database, key: string): Promise<void> {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const row = await db.prepare(`SELECT count, window_started_at FROM login_attempts WHERE key = ?`)
    .bind(key)
    .first<{ count: number; window_started_at: number }>();
  if (!row || now - row.window_started_at > windowMs) {
    await db.prepare(`INSERT INTO login_attempts (key,count,window_started_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count, window_started_at=excluded.window_started_at`)
      .bind(key, 1, now)
      .run();
    return;
  }
  await db.prepare(`UPDATE login_attempts SET count = count + 1 WHERE key = ?`).bind(key).run();
}

async function clearLoginAttempts(db: Database, key: string): Promise<void> {
  await db.prepare(`DELETE FROM login_attempts WHERE key = ?`).bind(key).run();
}
