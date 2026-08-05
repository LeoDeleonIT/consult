"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearCachedSession } from "@/lib/client-api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("coordinator@trinity.local");
  const [password, setPassword] = useState("TrinityPilot!2026");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setHydrated(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    fetch("/api/session", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { user: { role: string } };
      router.replace(destinationForRole(data.user.role));
    }).catch(() => undefined);
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json() as { error?: string; user?: { role: string } };
      if (!response.ok || !data.user) {
        setError(data.error ?? "Sign-in failed.");
        return;
      }
      clearCachedSession();
      window.location.assign(destinationForRole(data.user.role));
    } catch {
      setError("Could not reach the secure pilot. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand login-brand">
          <span className="brand-mark" aria-hidden="true">T</span>
          <span><strong>Trinity Consult</strong><small>Internal pilot</small></span>
        </div>
        <div className="login-heading">
          <p className="eyebrow">Secure access</p>
          <h1>Welcome back</h1>
          <p>Sign in to record or review a treatment-plan conversation.</p>
        </div>
        <form onSubmit={submit} className="form-stack">
          <label>
            Work email
            <input name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary full" disabled={busy || !hydrated} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="security-note">Authorized pilot users only. Do not enter real patient information during testing.</p>
      </section>
    </main>
  );
}

function destinationForRole(role: string): string {
  const fallback = role === "manager" ? "/manager" : "/coordinator";
  if (typeof window === "undefined") return fallback;
  const requested = new URLSearchParams(window.location.search).get("next");
  if (!requested?.startsWith("/") || requested.startsWith("//")) return fallback;
  if (role === "manager" && requested.startsWith("/manager")) return requested;
  if (role === "coordinator" && requested.startsWith("/coordinator")) return requested;
  return fallback;
}
