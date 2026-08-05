"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnalysisView } from "@/components/AnalysisView";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { TranscriptView } from "@/components/TranscriptView";
import type { ConsultationAnalysis } from "@/lib/analysis-schema";
import { apiFetch, responseError, useSession } from "@/lib/client-api";
import { TRACKED_CONVERSATION_TAGS, type ConversationTag } from "@/lib/conversation-tags";
import { staffSpeakerRoleLabel, type StaffSpeakerRole } from "@/lib/speaker-roles";
import type { ConsultationStatus, NormalizedTranscript } from "@/lib/types";

type Audit = { id: string; event_type: string; metadata_json: string; created_at: string; actor_name?: string };
type Detail = {
  consultation: {
    patient_reference?: string;
    speaker_role: StaffSpeakerRole;
    coordinator_name: string;
    location_name?: string | null;
    status: ConsultationStatus;
    created_at: string;
    submitted_at?: string | null;
  };
  analysis: ConsultationAnalysis | null;
  transcript: NormalizedTranscript | null;
  recording: { durationSeconds: number } | null;
  audit: Audit[];
  transcriptProvider?: { provider: string; model: string } | null;
  analysisProvider?: { provider: string; model: string; approvedAt: string | null } | null;
  conversationTags: ConversationTag[];
};

export default function ManagerConsultationPage() {
  const { id } = useParams<{ id: string }>();
  const { csrf } = useSession();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/consultations/${id}`, { cache: "no-store" })
      .then(async (response) => await response.json() as Detail)
      .then((data) => setDetail(data));
  }, [id]);

  async function deleteConsultation() {
    setBusy(true);
    const response = await apiFetch(`/api/consultations/${id}/delete`, { method: "POST" }, csrf);
    if (!response.ok) {
      setError(await responseError(response));
      setBusy(false);
      return;
    }
    router.push("/manager");
  }

  if (!detail) return <AppShell requiredRole="manager"><p className="empty-state">Loading manager review…</p></AppShell>;
  const deleted = detail.consultation.status === "deleted";
  const detectedTagKeys = new Set(detail.conversationTags.map((tag) => tag.key));
  return (
    <AppShell requiredRole="manager">
      <div className="page-heading split-heading">
        <div>
          <p className="eyebrow">Manager review</p>
          <h1>{detail.consultation.patient_reference ?? "Deleted consultation"}</h1>
          <p>{staffSpeakerRoleLabel(detail.consultation.speaker_role)} · {detail.consultation.location_name ?? "Unassigned office"} · Started by {detail.consultation.coordinator_name} · {new Date(detail.consultation.created_at).toLocaleString()}</p>
        </div>
        <StatusBadge status={detail.consultation.status} />
      </div>
      {deleted ? (
        <section className="panel empty-state"><strong>Consultation data deleted</strong><p>The recording, transcript, structured analysis, and patient reference are no longer available. The minimal audit history is retained.</p></section>
      ) : detail.analysis && detail.transcript ? (
        <>
          <aside className="notice success"><strong>Coordinator-approved summary</strong><p>Approved {detail.analysisProvider?.approvedAt ? new Date(detail.analysisProvider.approvedAt).toLocaleString() : "before manager review"}.</p></aside>
          {detail.transcriptProvider?.provider === "fixture" && (
            <aside className="notice provider-notice provider-demo" role="alert">
              <div><strong>Demo result — not a transcription</strong><p>This content came from the fixed test fixture, not from the consultation recording.</p></div>
            </aside>
          )}
          <section className="panel conversation-flags-panel" aria-labelledby="conversation-flags-title">
            <div className="panel-heading">
              <div><p className="eyebrow">Conversation flags</p><h2 id="conversation-flags-title">Tracked financing terms</h2><p>Detected terms are highlighted in the transcript below.</p></div>
              <span className="info-label">Automatic scan</span>
            </div>
            <div className="tracked-tag-grid">
              {TRACKED_CONVERSATION_TAGS.map((tag) => {
                const detected = detectedTagKeys.has(tag.key);
                return (
                  <div className={`tracked-tag ${detected ? "is-detected" : "is-missing"}`} data-testid={`tracked-tag-${tag.key}`} key={tag.key}>
                    <span className="tracked-tag-icon" aria-hidden="true">{detected ? "✓" : "–"}</span>
                    <span><strong>{tag.label}</strong><small>{detected ? "Mentioned" : "Not detected"}</small></span>
                  </div>
                );
              })}
            </div>
          </section>
          <AnalysisView analysis={detail.analysis} />
          <section className="panel media-panel">
            <div className="panel-heading"><div><p className="eyebrow">Source material</p><h2>Recording and transcript</h2></div><span className="info-label">No autoplay</span></div>
            {detail.recording && <audio className="server-audio" controls preload="none" src={`/api/consultations/${id}/audio`} />}
            <TranscriptView transcript={detail.transcript} highlightTags={detail.conversationTags} staffSpeakerRole={detail.consultation.speaker_role} />
          </section>
        </>
      ) : <section className="panel empty-state"><strong>No approved summary available</strong><p>This consultation has not completed the coordinator review workflow.</p></section>}

      <section className="panel audit-panel">
        <div className="panel-heading"><div><p className="eyebrow">Accountability</p><h2>Audit history</h2></div></div>
        <div className="timeline">
          {detail.audit.map((event) => (
            <div className="timeline-row" key={event.id}>
              <span className="timeline-dot" />
              <div><strong>{auditLabel(event.event_type)}</strong><p>{event.actor_name ?? "System"} · {new Date(event.created_at).toLocaleString()}</p></div>
            </div>
          ))}
        </div>
      </section>

      {!deleted && (
        <section className="danger-zone">
          <div><h2>Delete consultation data</h2><p>Permanently removes the recording, transcript, structured summary, and patient reference. A minimal deletion audit event remains.</p></div>
          <button className="button danger-outline" onClick={() => setConfirmOpen(true)}>Delete data</button>
        </section>
      )}

      {confirmOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <h2 id="delete-title">Delete this consultation?</h2>
            <p>This action cannot be undone. Type <strong>DELETE</strong> to confirm.</p>
            <input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} aria-label="Type DELETE to confirm" />
            {error && <p className="form-error">{error}</p>}
            <div className="form-actions">
              <button className="button secondary" onClick={() => { setConfirmOpen(false); setConfirmation(""); }}>Cancel</button>
              <button className="button danger" disabled={confirmation !== "DELETE" || busy} onClick={deleteConsultation}>{busy ? "Deleting…" : "Delete permanently"}</button>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function auditLabel(eventType: string): string {
  return eventType.split(".").map((part) => part.replaceAll("_", " ")).join(" — ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
