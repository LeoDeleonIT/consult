import { apiError } from "@/lib/http";
import { getProviderStatus } from "@/lib/providers";
import { requireSession } from "@/lib/session";

export async function GET(): Promise<Response> {
  try {
    await requireSession();
    return Response.json(getProviderStatus(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
