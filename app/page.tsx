"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    fetch("/api/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return router.replace("/login");
        const data = await response.json() as { user: { role: string } };
        router.replace(data.user.role === "manager" ? "/manager" : "/coordinator");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <main className="center-screen">
      <div className="brand-mark" aria-hidden="true">T</div>
      <p className="muted">Opening your consultation workspace…</p>
    </main>
  );
}
