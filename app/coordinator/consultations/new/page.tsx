"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { apiFetch, responseError, useSession } from "@/lib/client-api";
import type { OpenDentalPatient } from "@/lib/open-dental";
import { STAFF_SPEAKER_ROLES, staffSpeakerRoleLabel, type StaffSpeakerRole } from "@/lib/speaker-roles";

export default function NewConsultationPage() {
  return (
    <Suspense fallback={<AppShell requiredRole="coordinator"><p className="empty-state">Preparing consultation…</p></AppShell>}>
      <NewConsultationForm />
    </Suspense>
  );
}

function NewConsultationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openDentalPatNum = searchParams.get("odPatNum")?.trim() ?? "";
  const { user, csrf, phiProductionApproved } = useSession();
  const [patientReference, setPatientReference] = useState("");
  const [appointmentReference, setAppointmentReference] = useState("");
  const [speakerRole, setSpeakerRole] = useState<StaffSpeakerRole | "">("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [openDentalPatient, setOpenDentalPatient] = useState<OpenDentalPatient | null>(null);
  const [openDentalError, setOpenDentalError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!openDentalPatNum || !phiProductionApproved) return;
    const controller = new AbortController();
    fetch(`/api/open-dental/patients/${encodeURIComponent(openDentalPatNum)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json() as { patient?: OpenDentalPatient; error?: string };
        if (!response.ok || !data.patient) throw new Error(data.error ?? "Open Dental patient could not be loaded.");
        setOpenDentalPatient(data.patient);
        setPatientReference(data.patient.patientReference);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setOpenDentalError(caught instanceof Error ? caught.message : "Open Dental patient could not be loaded.");
      });
    return () => controller.abort();
  }, [openDentalPatNum, phiProductionApproved]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!speakerRole) return;
    setBusy(true);
    setError("");
    const response = await apiFetch("/api/consultations", {
      method: "POST",
      body: JSON.stringify({
        patientReference,
        appointmentReference: appointmentReference || null,
        speakerRole,
        consentConfirmed,
        consentVersion: "pilot-v1",
      }),
    }, csrf);
    if (!response.ok) {
      setError(await responseError(response));
      setBusy(false);
      return;
    }
    const data = await response.json() as { id: string };
    router.push(`/coordinator/consultations/${data.id}/record`);
  }

  const loadingOpenDental = phiProductionApproved && Boolean(openDentalPatNum) && !openDentalPatient && !openDentalError;
  const showManualPatientFields = !phiProductionApproved || !openDentalPatNum || Boolean(openDentalError);
  return (
    <AppShell requiredRole="coordinator">
      <div className="narrow-page">
        <div className="page-heading">
          <p className="eyebrow">New consultation</p>
          <h1>{openDentalPatient ? "Patient ready—confirm the speaker" : "Confirm the visit and consent"}</h1>
          <p>{openDentalPatient
            ? "Open Dental supplied the patient context. Select who is leading the conversation and confirm consent."
            : "Use a chart number or internal reference. Do not enter a full patient profile."}</p>
        </div>

        {!phiProductionApproved && (
          <aside className="notice provider-notice provider-unavailable" role="alert">
            <div><strong>Synthetic references only</strong><p>Open Dental lookup is disabled. Use a made-up reference beginning with SYN-, TEST-, or DEMO- and do not enter a real name, chart number, or appointment ID.</p></div>
          </aside>
        )}

        {loadingOpenDental && (
          <div className="open-dental-patient-card is-loading" role="status">
            <span className="spinner" />
            <div><span className="integration-label">Open Dental</span><strong>Loading the selected patient…</strong></div>
          </div>
        )}
        {openDentalPatient && (
          <div className="open-dental-patient-card" role="status">
            <div className="open-dental-mark" aria-hidden="true">OD</div>
            <div className="open-dental-patient-primary">
              <span className="integration-label">Open Dental patient linked</span>
              <strong>{openDentalPatient.displayName}</strong>
              <small>
                {openDentalPatient.chartNumber ? `Chart ${openDentalPatient.chartNumber}` : `Patient ID ${openDentalPatient.patNum}`}
                {openDentalPatient.clinic ? ` · ${openDentalPatient.clinic}` : ""}
              </small>
            </div>
            <span className="linked-check" aria-label="Patient linked">✓</span>
          </div>
        )}
        {openDentalError && (
          <aside className="notice provider-notice provider-unavailable" role="alert">
            <div><strong>Open Dental patient was not loaded</strong><p>{openDentalError} You can enter a chart reference manually below.</p></div>
          </aside>
        )}

        <form className="panel form-panel form-stack" onSubmit={submit}>
          {showManualPatientFields && (
            <>
              <label>
                Patient reference
                <input autoFocus required maxLength={80} placeholder={phiProductionApproved ? "Example: chart reference" : "Example: TEST-1042"} value={patientReference} onChange={(event) => setPatientReference(event.target.value)} />
                <small>{phiProductionApproved ? "Chart number or internal reference only" : "Must begin with SYN-, TEST-, or DEMO-"}</small>
              </label>
              <label>
                Appointment reference <span className="optional">Optional</span>
                <input maxLength={80} placeholder={phiProductionApproved ? "Example: appointment reference" : "Example: TEST-APPT-7781"} value={appointmentReference} onChange={(event) => setAppointmentReference(event.target.value)} />
              </label>
            </>
          )}
          <label className="speaker-role-field">
            Who is speaking with the patient?
            <select required value={speakerRole} onChange={(event) => setSpeakerRole(event.target.value as StaffSpeakerRole | "")}>
              <option value="">Select a role</option>
              {STAFF_SPEAKER_ROLES.map((role) => <option value={role} key={role}>{staffSpeakerRoleLabel(role)}</option>)}
            </select>
            <small>This label follows the staff speaker through the transcript and manager review.</small>
          </label>
          <div className="readonly-field">
            <span>Signed in as</span>
            <strong>{user?.name ?? "Current user"}</strong>
          </div>
          <div className="readonly-field">
            <span>Office</span>
            <strong>{user?.locationName ?? "Office assignment loading…"}</strong>
          </div>
          <section className="consent-card">
            <div className="consent-icon" aria-hidden="true">✓</div>
            <div>
              <h2>Patient recording consent</h2>
              <p>I explained that this treatment-plan conversation will be recorded and processed into a draft summary for internal review. The patient affirmatively agreed before recording began.</p>
              <label className="checkbox-label">
                <input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} />
                <span>The patient consented to this recording.</span>
              </label>
              <small>Disclosure version: pilot-v1 · Time captured when you continue</small>
            </div>
          </section>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions">
            <button className="button secondary" type="button" onClick={() => router.back()}>Cancel</button>
            <button className="button primary" type="submit" disabled={!consentConfirmed || !patientReference.trim() || !speakerRole || busy}>
              {busy ? "Saving consent…" : "Continue to recording"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
