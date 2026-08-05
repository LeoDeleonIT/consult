import { getSession } from "@/lib/session";

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
  return Response.json({
    user: {
      id: session.id,
      name: session.name,
      email: session.email,
      role: session.role,
      locationId: session.locationId,
      locationName: session.locationName,
    },
    csrf: session.csrf,
  });
}
