"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "trinity-presentation-view";
const CHANGE_EVENT = "trinity-presentation-view-change";

export function usePresentationMode() {
  const enabled = useSyncExternalStore(subscribe, readPreference, () => false);

  function toggle() {
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? "off" : "on");
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      // The normal browser session used by the pilot provides local storage.
    }
  }

  return { enabled, toggle };
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readPreference() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function PresentationModeToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="button secondary presentation-toggle"
      aria-pressed={enabled}
      onClick={onToggle}
    >
      <span className="presentation-toggle-indicator" aria-hidden="true" />
      {enabled ? "Presentation view on" : "Presentation view"}
    </button>
  );
}

export function PresentationBanner({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="presentation-banner" role="status">
      <span className="presentation-badge">Live demo</span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}
