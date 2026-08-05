"use client";

import { useEffect, useState } from "react";

export function InstallGuide() {
  const [showReadiness, setShowReadiness] = useState(false);

  useEffect(() => {
    const isMobileSafari = /iP(ad|hone|od)/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent);
    const dismissed = localStorage.getItem("trinity-recording-readiness");
    // This client-only browser readiness check runs after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowReadiness(isMobileSafari && !dismissed);
  }, []);

  return (
    <>
      {showReadiness && (
        <aside className="notice readiness" role="status">
          <div>
            <strong>Before your first recording</strong>
            <p>Allow microphone access, keep this app open and visible, and avoid phone calls during the consultation.</p>
          </div>
          <button className="icon-button" aria-label="Dismiss recording readiness message" onClick={() => {
            localStorage.setItem("trinity-recording-readiness", "dismissed");
            setShowReadiness(false);
          }}>×</button>
        </aside>
      )}
      <details className="install-guide">
        <summary>Add this app to an iPhone or iPad</summary>
        <ol>
          <li>Open the secure pilot address in Safari.</li>
          <li>Tap Share, then choose <strong>Add to Home Screen</strong>.</li>
          <li>Launch Trinity Consult from the new Home Screen icon.</li>
        </ol>
        <p className="muted small">During pilot recordings, Safari must remain open and active.</p>
      </details>
    </>
  );
}
