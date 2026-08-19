import { expect, test } from "@playwright/test";

const coordinator = {
  email: "coordinator@trinity.local",
  password: "TrinityPilot!2026",
};

const manager = {
  email: "manager@trinity.local",
  password: "TrinityPilot!2026",
};

test("P0 fixture workflow: consent, upload, process, approve, manager review, delete", async ({ page, request, baseURL }) => {
  expect(baseURL).toBeTruthy();
  expect((await request.get("/api/consultations")).status()).toBe(401);

  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await page.getByLabel("Work email").fill(coordinator.email);
  await page.getByLabel("Password").fill(coordinator.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/coordinator$/);
  await expect(page.getByRole("heading", { name: /Good .* Casey/ })).toBeVisible();

  await page.goto("/manager");
  await expect(page).toHaveURL(/\/coordinator$/);

  await page.getByRole("link", { name: "New consultation" }).click();
  await expect(page).toHaveURL(/\/coordinator\/consultations\/new$/);
  const patientReference = `TEST-${Date.now().toString().slice(-7)}`;
  await page.getByLabel("Patient reference").fill(patientReference);
  await page.getByLabel("Appointment reference Optional").fill("TEST-APPT-SYNTHETIC");
  await page.getByLabel("Who is speaking with the patient?").selectOption("treatment_coordinator");
  const continueButton = page.getByRole("button", { name: "Continue to recording" });
  await expect(continueButton).toBeDisabled();
  await page.getByLabel("The patient consented to this recording.").check();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(page).toHaveURL(/\/coordinator\/consultations\/[^/]+\/record$/);
  await expect(page.getByText("Treatment coordinator speaking with the patient", { exact: true })).toBeVisible();
  const consultationId = page.url().split("/").at(-2);
  expect(consultationId).toBeTruthy();
  await expect(page.getByText("Demo transcript mode", { exact: true })).toBeVisible();

  const startRecording = page.getByRole("button", { name: "Start recording" });
  await expect(startRecording).toBeEnabled();
  await startRecording.click();
  await expect(page.getByRole("status").getByText("Recording", { exact: true })).toBeVisible();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("status").getByText("Paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("status").getByText("Recording", { exact: true })).toBeVisible();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByText("Recording preview", { exact: true })).toBeVisible();
  const processingResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().endsWith(`/api/consultations/${consultationId}/process`));
  await page.getByRole("button", { name: "Generate demo draft" }).click();
  const processingResponse = await processingResponsePromise;
  expect(processingResponse.status()).toBe(202);
  await expect(page).toHaveURL(new RegExp(`/coordinator/consultations/${consultationId}/review$`));
  await expect(page.getByRole("heading", { name: "Consultation summary" })).toBeVisible();
  await expect(page.getByText("Sample data — not a transcription", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Presentation checklist" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show 10 topics" })).toBeVisible();
  await page.getByRole("button", { name: "Show 10 topics" }).click();
  await expect(page.getByText("Recommended treatment was explained.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide topics" }).click();

  const sessionResponse = await page.request.get("/api/session");
  expect(sessionResponse.ok()).toBeTruthy();
  const session = await sessionResponse.json() as { csrf: string };
  const headers = { "x-csrf-token": session.csrf };

  const duplicate = await page.request.post(`/api/consultations/${consultationId}/process`, { headers });
  expect(duplicate.status()).toBe(200);
  expect((await duplicate.json() as { idempotent: boolean }).idempotent).toBe(true);

  const coordinatorDelete = await page.request.post(`/api/consultations/${consultationId}/delete`, { headers });
  expect(coordinatorDelete.status()).toBe(403);

  await expect(page.getByRole("heading", { name: patientReference })).toBeVisible();
  await expect(page.getByText("Coordinator review required", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Submit to manager" }).click();
  await expect(page).toHaveURL(/\/coordinator$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await page.getByLabel("Work email").fill(manager.email);
  await page.getByLabel("Password").fill(manager.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/manager$/);
  await expect(page.getByText(patientReference, { exact: true })).toBeVisible();
  const managerRow = page.getByRole("row").filter({ hasText: patientReference });
  await expect(managerRow.getByText("Trinity Dental – Eastex", { exact: true })).toBeVisible();
  await page.getByLabel("Office").selectOption("location-aldine");
  await expect(page.getByText(patientReference, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Payment Plans" }).click();
  await expect(page.getByText(patientReference, { exact: true })).toBeVisible();
  await expect(page.getByTestId(`conversation-tags-${consultationId}`).getByText("Payment Plans", { exact: true })).toBeVisible();
  await page.getByLabel("Conversation keyword").fill("term that is not present");
  await expect(page.getByText("No matching consultations", { exact: true })).toBeVisible();
  await page.getByLabel("Conversation keyword").fill("crown");
  await expect(page.getByText(patientReference, { exact: true })).toBeVisible();

  await page.getByText(patientReference, { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/manager/consultations/${consultationId}$`));
  await expect(page.getByRole("heading", { name: "Tracked financing terms" })).toBeVisible();
  await expect(page.getByText(/Trinity Dental – Eastex · Started by Casey Coordinator/)).toBeVisible();
  await expect(page.getByTestId("tracked-tag-payment_plans")).toContainText("Mentioned");
  await expect(page.getByTestId("tracked-tag-sunbit")).toContainText("Not detected");
  await expect(page.locator("mark.keyword-highlight")).toContainText("payment plan");
  await expect(page.getByText("Coordinator-approved summary", { exact: true })).toBeVisible();
  await expect(page.getByText("Demo result — not a transcription", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recording and transcript" })).toBeVisible();

  const managerSession = await page.request.get("/api/session");
  const managerCsrf = (await managerSession.json() as { csrf: string }).csrf;
  const beforeDelete = await page.request.get(`/api/consultations/${consultationId}`);
  const beforeDetail = await beforeDelete.json() as { audit: Array<{ metadata_json: string }> };
  expect(beforeDetail.audit.every((event) => !event.metadata_json.includes(patientReference))).toBe(true);

  const deleteResponse = await page.request.post(`/api/consultations/${consultationId}/delete`, {
    headers: { "x-csrf-token": managerCsrf },
  });
  expect(deleteResponse.status(), await deleteResponse.text()).toBe(200);

  const deleted = await page.request.get(`/api/consultations/${consultationId}`);
  expect(deleted.status()).toBe(200);
  const deletedDetail = await deleted.json() as {
    consultation: { status: string };
    transcript: unknown;
    analysis: unknown;
  };
  expect(deletedDetail.consultation.status).toBe("deleted");
  expect(deletedDetail.transcript).toBeNull();
  expect(deletedDetail.analysis).toBeNull();
  expect((await page.request.get(`/api/consultations/${consultationId}/audio`)).status()).toBe(410);
});

test("central manager sees the access directory and an office account can sign in", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await page.getByLabel("Work email").fill("rlopez@trinitydentalcenters.com");
  await page.getByLabel("Password").fill("TrinityPilot!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/manager$/);
  await page.getByRole("link", { name: "Offices" }).click();
  await expect(page).toHaveURL(/\/manager\/offices$/);
  await expect(page.getByRole("heading", { name: "Offices and manager access" })).toBeVisible();
  await expect(page.getByText("18", { exact: true })).toBeVisible();
  await expect(page.getByText("rlopez@trinitydentalcenters.com", { exact: true })).toBeVisible();
  await expect(page.getByText("zain@trinitydentalcenters.com", { exact: true })).toBeVisible();
  await expect(page.getByText("leo@odysseysolutions.co", { exact: true })).toBeVisible();
  await expect(page.getByText("eastex@trinitydentalcenters.com", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await page.getByLabel("Work email").fill("eastex@trinitydentalcenters.com");
  await page.getByLabel("Password").fill("TrinityPilot!2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/coordinator$/);
  await expect(page.getByText(/Trinity Dental – Eastex · Capture consent/)).toBeVisible();
});

test("mobile recorder remains usable and explains denied microphone permission", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException("Permission denied", "NotAllowedError");
        },
      },
    });
  });

  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await page.getByLabel("Work email").fill(coordinator.email);
  await page.getByLabel("Password").fill(coordinator.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/coordinator$/);
  await page.getByRole("link", { name: "New consultation" }).click();
  await page.getByLabel("Patient reference").fill(`TEST-MOBILE-${Date.now().toString().slice(-7)}`);
  await page.getByLabel("Who is speaking with the patient?").selectOption("assistant");
  await page.getByLabel("The patient consented to this recording.").check();
  await page.getByRole("button", { name: "Continue to recording" }).click();
  await expect(page).toHaveURL(/\/coordinator\/consultations\/[^/]+\/record$/);
  await expect(page.getByText("Dental assistant speaking with the patient", { exact: true })).toBeVisible();

  const startRecording = page.getByRole("button", { name: "Start recording" });
  await expect(startRecording).toBeVisible();
  const buttonBox = await startRecording.boundingBox();
  expect(buttonBox?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await startRecording.click();
  await expect(page.getByRole("alert").filter({ hasText: "Microphone access was denied" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start recording" })).toBeEnabled();

  const consultationId = page.url().split("/").at(-2);
  const detailResponse = await page.request.get(`/api/consultations/${consultationId}`);
  const detail = await detailResponse.json() as { consultation: { status: string } };
  expect(detail.consultation.status).toBe("consented");
});
