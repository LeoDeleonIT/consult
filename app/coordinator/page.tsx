"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { InstallGuide } from "@/components/InstallGuide";
import { PresentationBanner, PresentationModeToggle, usePresentationMode } from "@/components/PresentationMode";
import { StatusBadge } from "@/components/StatusBadge";
import { useSession } from "@/lib/client-api";
import type { ConsultationStatus } from "@/lib/types";

type Consultation = {
  id: string;
  patient_reference: string;
  status: ConsultationStatus;
  created_at: string;
};

export default function CoordinatorDashboard() {
  const { user } = useSession();
  const [items, setItems] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const presentationMode = usePresentationMode();

  useEffect(() => {
    if (!user) return;
    fetch("/api/consultations", { cache: "no-store" })
      .then(async (response) => await response.json() as { consultations?: Consultation[] })
      .then((data) => setItems(data.consultations ?? []))
      .finally(() => setLoading(false));
  }, [user]);

  const visibleItems = useMemo(() => {
    if (!presentationMode.enabled) return items;
    return items.filter((item) =>
      ["submitted", "review_required"].includes(item.status)
      && !/^(test|mobile)[\s-]/i.test(item.patient_reference.trim()),
    );
  }, [items, presentationMode.enabled]);

  return (
    <AppShell requiredRole="coordinator">
      <div className="page-heading split-heading">
        <div>
          <p className="eyebrow">Coordinator workspace</p>
          <h1>Good {greeting()}, {user?.name.split(" ")[0]}</h1>
          <p>{user?.locationName ? `${user.locationName} · ` : ""}Capture consent, record the conversation, and review the AI draft before submission.</p>
        </div>
        <div className="presentation-heading-actions">
          <PresentationModeToggle enabled={presentationMode.enabled} onToggle={presentationMode.toggle} />
          <Link className="button primary" href="/coordinator/consultations/new">New consultation</Link>
        </div>
      </div>
      {!presentationMode.enabled && <InstallGuide />}
      {presentationMode.enabled && (
        <PresentationBanner title="Coordinator workflow, without test clutter">
          Showing submitted and review-ready conversations only. Every underlying pilot record remains unchanged.
        </PresentationBanner>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recent consultations</h2>
            <p>{presentationMode.enabled ? `${visibleItems.length} presentation-ready consultations are shown.` : "Only your assigned consultations are shown."}</p>
          </div>
        </div>
        {loading ? <p className="empty-state">Loading consultations…</p> : visibleItems.length === 0 ? (
          <div className="empty-state">
            <strong>{presentationMode.enabled ? "No presentation-ready consultations" : "No consultations yet"}</strong>
            <p>{presentationMode.enabled ? "Turn off Presentation view to see every pilot record." : "Start with a fake patient reference for the local pilot."}</p>
          </div>
        ) : (
          <div className="consultation-list">
            {visibleItems.map((item) => {
              const href = routeFor(item);
              return (
                <Link className="consultation-row" href={href} key={item.id}>
                  <span className="reference-avatar" aria-hidden="true">{item.patient_reference.slice(0, 2).toUpperCase()}</span>
                  <span className="consultation-primary">
                    <strong>{item.patient_reference}</strong>
                    <small>{new Date(item.created_at).toLocaleString()}</small>
                  </span>
                  <StatusBadge status={item.status} />
                  <span className="row-arrow" aria-hidden="true">›</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function routeFor(item: Consultation): string {
  if (["review_required", "processing", "failed", "uploaded", "submitted"].includes(item.status)) {
    return `/coordinator/consultations/${item.id}/review`;
  }
  return `/coordinator/consultations/${item.id}/record`;
}

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}
