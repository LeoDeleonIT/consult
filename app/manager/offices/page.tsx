"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";

type Office = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  phone: string;
  account_email: string | null;
  active: number;
};

type Manager = { id: string; name: string; email: string; active: number };

export default function OfficeAccessPage() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/locations", { cache: "no-store" })
      .then(async (response) => await response.json() as { locations?: Office[]; managers?: Manager[] })
      .then((data) => {
        setOffices(data.locations ?? []);
        setManagers(data.managers ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell requiredRole="manager">
      <div className="page-heading split-heading">
        <div>
          <p className="eyebrow">Access directory</p>
          <h1>Offices and manager access</h1>
          <p>Each office account files consultations under one location. Central managers can review every location.</p>
        </div>
        <div className="metric"><strong>{offices.length}</strong><span>verified offices</span></div>
      </div>

      <section className="panel access-panel">
        <div className="panel-heading">
          <div><h2>Central manager accounts</h2><p>These accounts can access consultation information across every office.</p></div>
          <span className="info-label">All locations</span>
        </div>
        <div className="manager-access-list">
          {managers.map((manager) => (
            <div className="manager-access-row" key={manager.id}>
              <span className="reference-avatar" aria-hidden="true">{manager.name.slice(0, 2).toUpperCase()}</span>
              <span><strong>{manager.name}</strong><small>{manager.email}</small></span>
              <span className="access-active">{manager.active ? "Active" : "Disabled"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel access-panel">
        <div className="panel-heading">
          <div><h2>Office accounts</h2><p>Locations verified from Trinity Dental Centers’ public location directory.</p></div>
          <span className="info-label">One account per office</span>
        </div>
        {loading ? <p className="empty-state">Loading office access…</p> : (
          <div className="office-grid">
            {offices.map((office) => (
              <article className="office-card" key={office.id}>
                <div className="office-card-heading"><h3>{office.name}</h3><span className="access-active">Active</span></div>
                <p>{office.address}<br />{office.city}, {office.state} {office.postal_code}</p>
                <a href={`tel:${office.phone}`}>{office.phone}</a>
                <div className="office-account"><span>Office sign-in</span><strong>{office.account_email ?? "Account pending"}</strong></div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
