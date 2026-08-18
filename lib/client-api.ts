"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionUser } from "./types";

type SessionState = {
  user: SessionUser | null;
  csrf: string;
  phiProductionApproved: boolean;
  loading: boolean;
};

let cached: { user: SessionUser; csrf: string; phiProductionApproved: boolean } | null = null;

export function useSession(): SessionState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<SessionState>({
    user: cached?.user ?? null,
    csrf: cached?.csrf ?? "",
    phiProductionApproved: cached?.phiProductionApproved ?? false,
    loading: !cached,
  });
  const refresh = useCallback(async () => {
    const response = await fetch("/api/session", { cache: "no-store" });
    if (!response.ok) {
      cached = null;
      setState({ user: null, csrf: "", phiProductionApproved: false, loading: false });
      return;
    }
    const data = await response.json() as { user: SessionUser; csrf: string; phiProductionApproved: boolean };
    cached = data;
    setState({ ...data, loading: false });
  }, []);
  useEffect(() => {
    // Load the shared authenticated session after the client mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!cached) void refresh();
  }, [refresh]);
  return { ...state, refresh };
}

export async function apiFetch(path: string, options: RequestInit = {}, csrf?: string): Promise<Response> {
  const headers = new Headers(options.headers);
  if (csrf) headers.set("x-csrf-token", csrf);
  if (options.body && typeof options.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(path, { ...options, headers });
}

export async function responseError(response: Response): Promise<string> {
  const fallback = "The request could not be completed.";
  const text = await response.text().catch(() => "");
  try {
    const data = JSON.parse(text) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return text.trim().slice(0, 240) || fallback;
  }
}

export function clearCachedSession(): void {
  cached = null;
}
