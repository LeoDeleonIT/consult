"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { apiFetch, clearCachedSession, useSession } from "@/lib/client-api";
import type { Role } from "@/lib/types";

export function AppShell({ children, requiredRole }: { children: ReactNode; requiredRole: Role }) {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (session.loading) return;
    if (!session.user) window.location.replace("/login");
    else if (session.user.role !== requiredRole) {
      window.location.replace(session.user.role === "manager" ? "/manager" : "/coordinator");
    }
  }, [requiredRole, router, session.loading, session.user]);

  async function signOut() {
    const response = await apiFetch("/api/auth/logout", { method: "POST" }, session.csrf);
    if (response.ok) {
      clearCachedSession();
      router.replace("/login");
    }
  }

  if (session.loading || !session.user || session.user.role !== requiredRole) {
    return <main className="center-screen"><p className="muted">Loading secure workspace…</p></main>;
  }

  const home = requiredRole === "manager" ? "/manager" : "/coordinator";
  return (
    <div className="app-frame">
      <header className="app-header">
        <Link className="brand" href={home}>
          <span className="brand-mark" aria-hidden="true">T</span>
          <span>
            <strong>Trinity Consult</strong>
            <small>Internal pilot</small>
          </span>
        </Link>
        <nav aria-label="Account">
          <Link className={pathname === home ? "nav-link active" : "nav-link"} href={home}>
            {requiredRole === "manager" ? "Dashboard" : "Consultations"}
          </Link>
          {requiredRole === "manager" && (
            <Link className={pathname === "/manager/offices" ? "nav-link active" : "nav-link"} href="/manager/offices">
              Offices
            </Link>
          )}
          <button className="nav-link button-link" onClick={signOut}>Sign out</button>
        </nav>
      </header>
      {!session.phiProductionApproved && (
        <aside className="synthetic-only-banner" role="alert">
          <strong>Synthetic-data pilot only</strong>
          <span>Do not enter, record, upload, or review real patient information.</span>
        </aside>
      )}
      <main className="page-shell">{children}</main>
    </div>
  );
}
