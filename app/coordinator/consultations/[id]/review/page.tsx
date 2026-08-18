"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AnalysisView } from "@/components/AnalysisView";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { TranscriptView } from "@/components/TranscriptView";
import type { ConsultationAnalysis } from "@/lib/analysis-schema";
import { apiFetch, responseError, useSession } from "@/lib/client-api";
import { staffSpeakerRoleLabel, type StaffSpeakerRole } from "@/lib/speaker-roles";
import type { ConsultationStatus, NormalizedTranscript, ProviderStatus } from "@/lib/types";

type Detail = {
  consultation: {
    patient_reference: string;
    speaker_role: StaffSpeakerRole;
    status: ConsultationStatus;
    failure_message: string | null;
  };
  analysis: ConsultationAnalysis | null;
  transcript: NormalizedTranscript | null;
  transcriptProvider: { provider: string; model: string } | null;
  recording: { durationSeconds: number } | null;
};

export default function CoordinatorReviewPage() {
  const { id } = useParams<{ id: string }>();
  const { csrf } = useSession();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [analysis, setAnalysis] = useState<ConsultationAnalysis | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/consultations/${id}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as Detail;
    setDetail(data);
    setAnalysis(data.analysis);
  }, [id]);

  useEffect(() => {
    // Initial data synchronization with the authenticated consultation endpoint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const consultationStatus = detail?.consultation.status;
  useEffect(() => {
    if (!consultationStatus || !["uploaded", "processing"].includes(consultationStatus)) return;
    const timer = window.setInterval(() => void load(), 2_000);
    return () => window.clearInterval(timer);
  }, [consultationStatus, load]);

  useEffect(() => {
    fetch("/api/provider-status", { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as ProviderStatus : null)
      .then((data) => setProviderStatus(data))
      .catch(() => setProviderStatus(null));
  }, []);

  async function retry() {
    setBusy(true);
    setError("");
    const response = await apiFetch(`/api/consultations/${id}/process`, { method: "POST" }, csrf);
    if (!response.ok) setError(await responseError(response));
    await load();
    setBusy(false);
  }

  async function saveDraft(): Promise<boolean> {
    if (!analysis) return false;
    setBusy(true);
    setError("");
    setSaved(false);
    const response = await apiFetch(`/api/consultations/${id}/analysis`, {
      method: "PATCH",
      body: JSON.stringify(analysis),
    }, csrf);
    if (!response.ok) {
      setError(await responseError(response));
      setBusy(false);
      return false;
    }
    setSaved(true);
    setBusy(false);
    return true;
  }

  async function submit() {
    if (!(await saveDraft())) return;
    setBusy(true);
    const response = await apiFetch(`/api/consultations/${id}/submit`, { method: "POST" }, csrf);
    if (!response.ok) {
      setError(await responseError(response));
      setBusy(false);
      return;
    }
    router.push("/coordinator");
  }

  if (!detail) {
    return <AppShell requiredRole="coordinator"><p className="empty-state">Loading consultation…</p></AppShell>;
  }

  const status = detail.consultation.status;
  const processing = ["uploaded", "processing"].includes(status);
  const fixtureResult = detail.transcriptProvider?.provider === "fixture";
  const speakersConfirmed = detail.transcript?.speakerMapping === "provided";
  const canApprove = (!fixtureResult || providerStatus?.mode === "demo") && speakersConfirmed;
  return (
    <AppShell requiredRole="coordinator">
      <div className="page-heading split-heading">
        <div><p className="eyebrow">Review consultation</p><h1>{detail.consultation.patient_reference}</h1><p>{staffSpeakerRoleLabel(detail.consultation.speaker_role)} speaking with the patient · Confirm every detail before sending this draft to a manager.</p></div>
        <StatusBadge status={status} />
      </div>

      {processing && (
        <section className="panel processing-large">
          <span className="spinner" />
          <div>
            <h2>Recording saved — draft processing</h2>
            <p>You can start the next consultation or return later. This page updates automatically.</p>
            <div className="processing-actions">
              <button className="button primary" onClick={() => router.push("/coordinator/consultations/new")}>Start next consultation</button>
              <button className="button secondary" onClick={() => router.push("/coordinator")}>Back to consultations</button>
            </div>
          </div>
        </section>
      )}
      {status === "failed" && (
        <section className="panel failure-panel audio-safe-failure">
          <div>
            <p className="eyebrow">Audio saved securely</p>
            <h2>The AI draft needs another try</h2>
            <p>Your recording is safe and does not need to be uploaded again. The automatic attempts could not finish the transcript or summary.</p>
            <p className="failure-detail">{detail.consultation.failure_message ?? "The AI provider could not complete the draft."}</p>
          </div>
          <button className="button primary" onClick={retry} disabled={busy}>{busy ? "Restarting AI processing…" : "Retry AI processing"}</button>
          {error && <p className="form-error">{error}</p>}
        </section>
      )}
      {analysis && detail.transcript && (
        <>
          {fixtureResult && (
            <aside className="notice provider-notice provider-demo" role="alert">
              <div>
                <strong>Sample data — not a transcription</strong>
                <p>This draft is the fixed test fixture and was not generated from the recording.</p>
              </div>
              {providerStatus?.mode === "live" && (
                <button className="button primary" onClick={retry} disabled={busy}>
                  {busy ? "Transcribing recording…" : "Replace with recorded audio"}
                </button>
              )}
              {providerStatus?.mode === "unavailable" && <p className="form-error inline-provider-error">Add the server API key, restart the app, then return here to replace this sample.</p>}
            </aside>
          )}
          <AnalysisView analysis={analysis} editable={status === "review_required"} onChange={(next) => { setAnalysis(next); setSaved(false); }} />
          <section className="panel media-panel">
            <div className="panel-heading"><div><p className="eyebrow">Source material</p><h2>Recording and transcript</h2></div></div>
            {detail.recording && <audio className="server-audio" controls preload="metadata" src={`/api/consultations/${id}/audio`} />}
            {status === "review_required" && detail.transcript.speakerMapping !== "provided" && (
              <SpeakerMappingPanel id={id} transcript={detail.transcript} staffSpeakerRole={detail.consultation.speaker_role} csrf={csrf} onConfirmed={load} />
            )}
            <TranscriptView transcript={detail.transcript} staffSpeakerRole={detail.consultation.speaker_role} />
          </section>
          {status === "review_required" && !speakersConfirmed && (
            <aside className="notice" role="alert"><strong>Speaker confirmation required</strong><p>Submission stays locked until you identify the recorded staff and patient voices above.</p></aside>
          )}
          {status === "review_required" && canApprove && (
            <div className="sticky-actions">
              <div>{saved ? <span className="saved-message">Draft saved</span> : <span className="muted">AI draft — coordinator approval required</span>}{error && <span className="form-error inline-error">{error}</span>}</div>
              <div className="button-group">
                <button className="button secondary" onClick={saveDraft} disabled={busy}>{busy ? "Saving…" : "Save draft"}</button>
                <button className="button primary" onClick={submit} disabled={busy}>Submit to manager</button>
              </div>
            </div>
          )}
          {status === "submitted" && <aside className="notice success"><strong>Submitted to manager</strong><p>This approved summary is now available on the manager dashboard.</p></aside>}
        </>
      )}
    </AppShell>
  );
}

function SpeakerMappingPanel({
  id,
  transcript,
  staffSpeakerRole,
  csrf,
  onConfirmed,
}: {
  id: string;
  transcript: NormalizedTranscript;
  staffSpeakerRole: StaffSpeakerRole;
  csrf: string;
  onConfirmed: () => Promise<void>;
}) {
  const labels = [...new Set(transcript.segments.map((segment) => segment.speakerLabel).filter((value): value is string => Boolean(value)))];
  const [staffLabel, setStaffLabel] = useState("");
  const [patientLabel, setPatientLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    const response = await apiFetch(`/api/consultations/${id}/transcript`, {
      method: "PATCH",
      body: JSON.stringify({ staffSpeakerLabel: staffLabel, patientSpeakerLabel: patientLabel }),
    }, csrf);
    if (!response.ok) {
      setError(await responseError(response));
      setBusy(false);
      return;
    }
    await onConfirmed();
    setBusy(false);
  }

  return (
    <div className="speaker-mapping-panel">
      <div><strong>Confirm recorded voices</strong><p>Voice labels separate speakers but do not identify people. Use playback to make this selection.</p></div>
      {labels.length >= 2 ? (
        <div className="speaker-mapping-fields">
          <label>{staffSpeakerRoleLabel(staffSpeakerRole)} voice
            <select value={staffLabel} onChange={(event) => setStaffLabel(event.target.value)}>
              <option value="">Choose voice</option>
              {labels.map((label) => <option value={label} key={`staff-${label}`}>{label}</option>)}
            </select>
          </label>
          <label>Patient voice
            <select value={patientLabel} onChange={(event) => setPatientLabel(event.target.value)}>
              <option value="">Choose voice</option>
              {labels.map((label) => <option value={label} key={`patient-${label}`}>{label}</option>)}
            </select>
          </label>
          <button className="button primary" onClick={confirm} disabled={busy || !staffLabel || !patientLabel || staffLabel === patientLabel}>{busy ? "Saving…" : "Confirm voices"}</button>
        </div>
      ) : <p className="form-error">Two usable voice labels were not returned. An authorized transcript correction is required before submission.</p>}
      {labels.length > 2 && <p className="transcript-warning">Additional voice labels will remain unknown and must be checked during review.</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
