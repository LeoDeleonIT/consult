import { describe, expect, it } from "vitest";
import { createSessionToken, readSessionToken } from "../lib/session-token";

describe("signed sessions", () => {
  it("round-trips a valid expiring session", async () => {
    const session = await createSessionToken({
      id: "user-1",
      name: "Test Coordinator",
      email: "test@example.local",
      role: "coordinator",
      locationId: "location-test",
      locationName: "Test Office",
    });
    const payload = await readSessionToken(session.token);
    expect(payload?.id).toBe("user-1");
    expect(payload?.csrf).toBe(session.csrf);
  });

  it("rejects a modified session token", async () => {
    const session = await createSessionToken({
      id: "user-1",
      name: "Test Coordinator",
      email: "test@example.local",
      role: "coordinator",
      locationId: "location-test",
      locationName: "Test Office",
    });
    expect(await readSessionToken(`${session.token}tampered`)).toBeNull();
  });
});
