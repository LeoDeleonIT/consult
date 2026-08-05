"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PresentationBanner, PresentationModeToggle, usePresentationMode } from "@/components/PresentationMode";
import { StatusBadge } from "@/components/StatusBadge";
import type { ConversationTag } from "@/lib/conversation-tags";
import type { ConsultationStatus } from "@/lib/types";

type Item = {
  id: string;
  patient_reference: string;
  coordinator_name: string;
  location_name: string | null;
  location_id: string | null;
  status: ConsultationStatus;
  submitted_at: string | null;
  created_at: string;
  conversationTags: ConversationTag[];
};

type OfficeOption = { id: string; name: string };

const KEYWORD_FILTERS = [
  { label: "Payment Plans", query: "payment plan" },
  { label: "Sunbit", query: "Sunbit" },
  { label: "Cherry", query: "Cherry" },
  { label: "Care Credit", query: "Care Credit" },
] as const;

export default function ManagerDashboard() {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("submitted");
  const [location, setLocation] = useState("");
  const [locations, setLocations] = useState<OfficeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const presentationMode = usePresentationMode();

  useEffect(() => {
    fetch("/api/locations", { cache: "no-store" })
      .then(async (response) => await response.json() as { locations?: OfficeOption[] })
      .then((data) => setLocations(data.locations ?? []));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (location) params.set("location", location);
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/consultations?${params}`, { cache: "no-store" })
        .then(async (response) => await response.json() as { consultations?: Item[] })
        .then((data) => setItems(data.consultations ?? []))
        .finally(() => setLoading(false));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [keyword, location, search, status]);

  const visibleItems = useMemo(
    () => presentationMode.enabled ? items.filter((item) => item.conversationTags.length > 0) : items,
    [items, presentationMode.enabled],
  );
  const submittedCount = useMemo(() => visibleItems.filter((item) => item.status === "submitted").length, [visibleItems]);
  return (
    <AppShell requiredRole="manager">
      <div className="page-heading split-heading">
        <div><p className="eyebrow">Manager dashboard</p><h1>Consultation review</h1><p>Review coordinator-approved summaries, source conversations, and follow-up actions.</p></div>
        <div className="presentation-heading-actions">
          <PresentationModeToggle enabled={presentationMode.enabled} onToggle={presentationMode.toggle} />
          <div className="metric"><strong>{submittedCount}</strong><span>{presentationMode.enabled ? "tagged conversations" : "ready to review"}</span></div>
        </div>
      </div>
      {presentationMode.enabled && (
        <PresentationBanner title="Manager insights, ready to present">
          Showing approved conversations with detected payment-option tags. Use a keyword below to narrow the story further.
        </PresentationBanner>
      )}
      <section className="panel">
        <div className="filter-bar">
          <label className="search-field"><span aria-hidden="true">⌕</span><input aria-label="Search patient reference" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient reference" /></label>
          <label className="select-field">Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="submitted">Submitted</option>
              <option value="">All statuses</option>
              <option value="review_required">Needs review</option>
              <option value="failed">Needs attention</option>
              <option value="deleted">Deleted</option>
            </select>
          </label>
          <label className="select-field">Office
            <select aria-label="Office" value={location} onChange={(event) => setLocation(event.target.value)}>
              <option value="">All offices</option>
              {locations.map((office) => <option value={office.id} key={office.id}>{office.name}</option>)}
            </select>
          </label>
        </div>
        <div className="keyword-filter">
          <div className="keyword-filter-heading">
            <label htmlFor="manager-keyword-search">Conversation keyword</label>
            <span>Search approved transcripts and summaries</span>
          </div>
          <label className="search-field keyword-search"><span aria-hidden="true">⌕</span><input id="manager-keyword-search" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Enter any word or phrase" /></label>
          <div className="keyword-presets" aria-label="Requested keyword filters">
            {KEYWORD_FILTERS.map((filter) => (
              <button
                type="button"
                className="button secondary keyword-chip"
                aria-pressed={keyword === filter.query}
                key={filter.label}
                onClick={() => setKeyword((current) => current === filter.query ? "" : filter.query)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        {loading ? <p className="empty-state">Loading consultations…</p> : visibleItems.length === 0 ? (
          <div className="empty-state"><strong>No matching consultations</strong><p>{keyword ? `No approved conversation contains “${keyword}”.` : "Submitted coordinator reviews will appear here."}</p></div>
        ) : (
          <div className="manager-table" role="table" aria-label="Consultations">
            <div className="manager-table-head" role="row">
              <span>Patient reference</span><span>Office</span><span>Coordinator</span><span>Date</span><span>Status</span><span>Next step</span>
            </div>
            {visibleItems.map((item) => (
              <Link role="row" href={`/manager/consultations/${item.id}`} className="manager-table-row" key={item.id}>
                <div className="manager-patient-cell">
                  <strong>{item.patient_reference}</strong>
                  {item.conversationTags.length > 0 && (
                    <div className="conversation-tag-list" data-testid={`conversation-tags-${item.id}`} aria-label="Detected conversation tags">
                      {item.conversationTags.map((tag) => <span className="conversation-tag" key={tag.key}>{tag.label}</span>)}
                    </div>
                  )}
                </div>
                <span>{item.location_name ?? "Unassigned"}</span>
                <span>{item.coordinator_name}</span>
                <span>{new Date(item.submitted_at ?? item.created_at).toLocaleDateString()}</span>
                <StatusBadge status={item.status} />
                <span className="table-action">Review <span aria-hidden="true">›</span></span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
