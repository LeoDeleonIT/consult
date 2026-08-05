import { z } from "zod";
import { PublicApiError } from "./http";

const patientSchema = z.object({
  PatNum: z.coerce.number().int().positive(),
  FName: z.string().default(""),
  LName: z.string().default(""),
  Preferred: z.string().default(""),
  ChartNumber: z.string().default(""),
  clinicAbbr: z.string().default(""),
});

export type OpenDentalPatient = {
  patNum: number;
  displayName: string;
  chartNumber: string | null;
  clinic: string | null;
  patientReference: string;
};

export function normalizeOpenDentalPatient(payload: unknown): OpenDentalPatient {
  const patient = patientSchema.parse(payload);
  const preferred = patient.Preferred.trim();
  const firstName = preferred || patient.FName.trim();
  const displayName = [firstName, patient.LName.trim()].filter(Boolean).join(" ") || `Open Dental patient ${patient.PatNum}`;
  const chartNumber = patient.ChartNumber.trim() || null;
  return {
    patNum: patient.PatNum,
    displayName,
    chartNumber,
    clinic: patient.clinicAbbr.trim() || null,
    patientReference: chartNumber ?? `OD-${patient.PatNum}`,
  };
}

export async function getOpenDentalPatient(patNum: number, request: typeof fetch = fetch): Promise<OpenDentalPatient> {
  const developerKey = process.env.OPEN_DENTAL_DEVELOPER_KEY?.trim();
  const customerKey = process.env.OPEN_DENTAL_CUSTOMER_KEY?.trim();
  if (!developerKey || !customerKey) {
    throw new PublicApiError(
      "Open Dental is not connected yet. The server needs both the developer key and the office customer key.",
      503,
      false,
      "open_dental_not_configured",
    );
  }
  const baseUrl = (process.env.OPEN_DENTAL_API_BASE_URL?.trim() || "https://api.opendental.com/api/v1").replace(/\/$/, "");
  let response: Response;
  try {
    response = await request(`${baseUrl}/patients/${patNum}`, {
      method: "GET",
      headers: {
        Authorization: `ODFHIR ${developerKey}/${customerKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
  } catch {
    throw new PublicApiError(
      "Open Dental could not be reached. Confirm the office eConnector is online, then try again.",
      502,
      true,
      "open_dental_network",
    );
  }
  if (response.status === 401) {
    throw new PublicApiError(
      "Open Dental rejected the connection. Confirm both keys are enabled and have Patients GET permission.",
      502,
      false,
      "open_dental_auth",
    );
  }
  if (response.status === 404) {
    throw new PublicApiError("That Open Dental patient could not be found.", 404, false, "open_dental_patient_not_found");
  }
  if (response.status === 429) {
    throw new PublicApiError("Open Dental is temporarily busy. Wait a few seconds and reopen the consultation button.", 502, true, "open_dental_rate_limit");
  }
  if (!response.ok) {
    throw new PublicApiError(
      "Open Dental could not load this patient. Confirm the office API and eConnector are enabled.",
      502,
      response.status >= 500,
      "open_dental_request",
    );
  }
  return normalizeOpenDentalPatient(await response.json());
}
