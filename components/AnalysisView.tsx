"use client";

import { useState } from "react";
import type { ConsultationAnalysis } from "@/lib/analysis-schema";

export function AnalysisView({
  analysis,
  editable = false,
  onChange,
}: {
  analysis: ConsultationAnalysis;
  editable?: boolean;
  onChange?: (analysis: ConsultationAnalysis) => void;
}) {
  const [checklistOpen, setChecklistOpen] = useState(false);

  function update(patch: Partial<ConsultationAnalysis>) {
    onChange?.({ ...analysis, ...patch });
  }

  const checklistCounts = analysis.checklist.reduce((counts, item) => {
    counts[item.status] += 1;
    return counts;
  }, { completed: 0, partial: 0, not_detected: 0, not_applicable: 0, needs_review: 0 });
  const reviewCount = checklistCounts.partial + checklistCounts.needs_review;

  return (
    <div className="analysis-grid">
      <section className="detail-card wide">
        <div className="card-title-row">
          <div><p className="eyebrow">AI draft</p><h2>Consultation summary</h2></div>
          <span className="draft-label">Coordinator review required</span>
        </div>
        {editable ? (
          <textarea className="summary-editor" value={analysis.shortSummary} onChange={(event) => update({ shortSummary: event.target.value })} aria-label="Consultation summary" />
        ) : <p className="summary-copy">{analysis.shortSummary}</p>}
        {analysis.warnings.length > 0 && (
          <div className="warning-list">
            {analysis.warnings.map((warning, index) => <p key={`${warning}-${index}`}>Review: {warning}</p>)}
          </div>
        )}
      </section>

      <section className="detail-card">
        <p className="eyebrow">Patient decision</p>
        <h2>Current status</h2>
        {editable ? (
          <select value={analysis.patientDecision.status} onChange={(event) => update({
            patientDecision: { ...analysis.patientDecision, status: event.target.value as ConsultationAnalysis["patientDecision"]["status"] },
          })}>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            <option value="undecided">Undecided</option>
            <option value="not_stated">Not stated</option>
          </select>
        ) : <p className="decision-value">{label(analysis.patientDecision.status)}</p>}
        {analysis.patientDecision.needsReview && <span className="needs-review">Needs review</span>}
      </section>

      <section className="detail-card">
        <p className="eyebrow">Pricing</p>
        <h2>Amounts discussed</h2>
        <dl className="amount-list">
          <div><dt>Total estimate</dt><dd>{analysis.pricing.totalEstimate ?? "Not stated"}</dd></div>
          <div><dt>Patient estimate</dt><dd>{analysis.pricing.patientEstimate ?? "Not stated"}</dd></div>
          <div><dt>Insurance estimate</dt><dd>{analysis.pricing.insuranceEstimate ?? "Not stated"}</dd></div>
        </dl>
        <p className="small muted">Financing: {analysis.financing.discussed === null ? "Not detected" : analysis.financing.discussed ? analysis.financing.options.join(", ") || "Discussed" : "Not discussed"}</p>
      </section>

      <section className="detail-card wide">
        <p className="eyebrow">Treatment plan</p>
        <h2>Recommended treatments mentioned</h2>
        {analysis.recommendedTreatments.length === 0 ? <p className="muted">No treatment details detected.</p> : (
          <div className="editable-list">
            {analysis.recommendedTreatments.map((treatment, index) => (
              <div className="line-item" key={`${treatment.description}-${index}`}>
                {editable ? (
                  <>
                    <input aria-label={`Treatment ${index + 1}`} value={treatment.description} onChange={(event) => {
                      const next = [...analysis.recommendedTreatments];
                      next[index] = { ...treatment, description: event.target.value };
                      update({ recommendedTreatments: next });
                    }} />
                    <input className="short-input" aria-label={`Tooth numbers ${index + 1}`} value={treatment.toothNumbers.join(", ")} onChange={(event) => {
                      const next = [...analysis.recommendedTreatments];
                      next[index] = { ...treatment, toothNumbers: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) };
                      update({ recommendedTreatments: next });
                    }} placeholder="Tooth" />
                  </>
                ) : (
                  <div><strong>{treatment.description}</strong><small>{treatment.toothNumbers.length ? `Tooth ${treatment.toothNumbers.join(", ")}` : "No tooth number stated"}</small></div>
                )}
                <EvidenceList evidence={treatment.evidence} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="detail-card">
        <p className="eyebrow">Patient voice</p>
        <h2>Concerns and objections</h2>
        <div className="editable-list compact-list">
          {analysis.patientConcerns.map((item, index) => (
            <div className="line-item" key={`${item.concern}-${index}`}>
              {editable ? <textarea value={item.concern} aria-label={`Patient concern ${index + 1}`} onChange={(event) => {
                const next = [...analysis.patientConcerns];
                next[index] = { ...item, concern: event.target.value };
                update({ patientConcerns: next });
              }} /> : <strong>{item.concern}</strong>}
              <EvidenceList evidence={item.evidence} />
            </div>
          ))}
          {analysis.objections.map((item, index) => (
            <div className="line-item" key={`${item.objection}-${index}`}>
              <strong>{item.objection}</strong>
              {item.response && <p>Response: {item.response}</p>}
              <EvidenceList evidence={item.evidence} />
            </div>
          ))}
          {!analysis.patientConcerns.length && !analysis.objections.length && <p className="muted">No concerns detected.</p>}
        </div>
      </section>

      <section className="detail-card">
        <p className="eyebrow">Follow-up</p>
        <h2>Next steps</h2>
        <div className="editable-list compact-list">
          {analysis.nextSteps.map((item, index) => (
            <div className="line-item" key={`${item.action}-${index}`}>
              {editable ? (
                <>
                  <textarea value={item.action} aria-label={`Next step ${index + 1}`} onChange={(event) => {
                    const next = [...analysis.nextSteps];
                    next[index] = { ...item, action: event.target.value };
                    update({ nextSteps: next });
                  }} />
                  <input value={item.owner ?? ""} aria-label={`Owner ${index + 1}`} placeholder="Owner" onChange={(event) => {
                    const next = [...analysis.nextSteps];
                    next[index] = { ...item, owner: event.target.value || null };
                    update({ nextSteps: next });
                  }} />
                </>
              ) : <><strong>{item.action}</strong><small>{item.owner ? `Owner: ${item.owner}` : "Owner not stated"}</small></>}
              <EvidenceList evidence={item.evidence} />
            </div>
          ))}
          {!analysis.nextSteps.length && <p className="muted">No next step detected.</p>}
        </div>
      </section>

      <section className="detail-card wide">
        <div className="card-title-row">
          <div><p className="eyebrow">Topics covered</p><h2>Presentation checklist</h2></div>
          <span className="info-label">Not a performance score</span>
        </div>
        <div className="checklist-summary" aria-label="Presentation checklist summary">
          <span><strong>{checklistCounts.completed}</strong> covered</span>
          <span><strong>{reviewCount}</strong> partial or review</span>
          <span><strong>{checklistCounts.not_detected}</strong> not detected</span>
          {checklistCounts.not_applicable > 0 && <span><strong>{checklistCounts.not_applicable}</strong> not applicable</span>}
          <button className="button secondary checklist-toggle" type="button" aria-expanded={checklistOpen} onClick={() => setChecklistOpen((open) => !open)}>
            {checklistOpen ? "Hide topics" : `Show ${analysis.checklist.length} topics`}
          </button>
        </div>
        {checklistOpen && (
          <div className="checklist">
            {analysis.checklist.map((item, index) => (
              <div className="checklist-row" key={item.key}>
                <span className={`check-state check-${item.status}`} aria-hidden="true">{item.status === "completed" ? "✓" : item.status === "partial" ? "◐" : "–"}</span>
                <span>{item.label}</span>
                {editable ? (
                  <select aria-label={`${item.label} status`} value={item.status} onChange={(event) => {
                    const next = [...analysis.checklist];
                    next[index] = { ...item, status: event.target.value as ConsultationAnalysis["checklist"][number]["status"] };
                    update({ checklist: next });
                  }}>
                    <option value="completed">Completed</option>
                    <option value="partial">Partial</option>
                    <option value="not_detected">Not detected</option>
                    <option value="not_applicable">Not applicable</option>
                    <option value="needs_review">Needs review</option>
                  </select>
                ) : <small>{label(item.status)}</small>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: Array<{ quote: string; startSeconds: number | null; speaker: string | null }> }) {
  if (!evidence.length) return null;
  return (
    <div className="evidence-list">
      {evidence.map((item, index) => (
        <blockquote key={`${item.quote}-${index}`}>
          “{item.quote}”
          <small>{item.speaker ? label(item.speaker) : "Transcript"}{item.startSeconds !== null ? ` · ${formatSeconds(item.startSeconds)}` : ""}</small>
        </blockquote>
      ))}
    </div>
  );
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
