import { ensureDatabase } from "@/lib/d1";
import { apiError } from "@/lib/http";
import { CENTRAL_MANAGER_ACCOUNTS } from "@/lib/locations";
import { requireSession } from "@/lib/session";

type LocationAccessRow = {
  id: string;
  slug: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  phone: string;
  active: number;
  account_user_id: string | null;
  account_name: string | null;
  account_email: string | null;
};

type ManagerAccessRow = {
  id: string;
  name: string;
  email: string;
  active: number;
};

export async function GET(): Promise<Response> {
  try {
    await requireSession("manager");
    const db = await ensureDatabase();
    const [locations, managers] = await Promise.all([
      db.prepare(`
        SELECT l.*, u.id AS account_user_id, u.name AS account_name, u.email AS account_email
        FROM locations l
        LEFT JOIN users u ON u.location_id = l.id AND u.role = 'coordinator' AND u.active = 1 AND u.id LIKE 'office-user-%'
        WHERE l.active = 1
        ORDER BY l.name
      `).all<LocationAccessRow>(),
      db.prepare(`
        SELECT id, name, email, active FROM users
        WHERE role = 'manager' AND email IN (${CENTRAL_MANAGER_ACCOUNTS.map(() => "?").join(",")})
        ORDER BY name
      `).bind(...CENTRAL_MANAGER_ACCOUNTS.map((manager) => manager.email)).all<ManagerAccessRow>(),
    ]);
    return Response.json({
      locations: locations.results ?? [],
      managers: managers.results ?? [],
      source: "https://www.trinitydentalcenters.com/location/",
    });
  } catch (error) {
    return apiError(error);
  }
}
