import { ensureDatabase, seedUsers } from "@/lib/d1";
import { apiError } from "@/lib/http";

export async function POST(): Promise<Response> {
  try {
    if (process.env.NODE_ENV === "production") return new Response("Not found.", { status: 404 });
    const db = await ensureDatabase();
    await seedUsers(db);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
