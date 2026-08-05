import { apiError } from "@/lib/http";
import { clearSessionCookie, requireSession, verifyCsrf } from "@/lib/session";

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    verifyCsrf(request, session);
    await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
