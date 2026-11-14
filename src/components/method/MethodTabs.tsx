"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
const tabs = [
  { id: "harmonization", label: "Harmonization" },
  { id: "historical-anomalies", label: "Historical Anomalies" },
  { id: "data-limitations", label: "Data & Limitations" },
] as const;
type Tab = (typeof tabs)[number]["id"];
const sectionTabs: Record<string, Tab> = {
  challenge: "harmonization",
  approach: "harmonization",
  formulation: "harmonization",
  validation: "harmonization",
  "monthly-evidence": "historical-anomalies",
  "daily-evidence": "historical-anomalies",
  "data-quality": "data-limitations",
  seasonality: "historical-anomalies",
  "monthly-climatology": "historical-anomalies",
  "seasonal-z-score": "historical-anomalies",
  "robust-anomalies": "historical-anomalies",
  percentiles: "historical-anomalies",
  example: "historical-anomalies",
  interpretation: "historical-anomalies",
  "data-sources": "data-limitations",
  coverage: "data-limitations",
  hotspot: "data-limitations",
  frp: "data-limitations",
  limitations: "data-limitations",
  provenance: "data-limitations",
  status: "data-limitations",
};
function getTab(hash: string): Tab {
  return (
    tabs.find((t) => t.id === hash)?.id ?? sectionTabs[hash] ?? "harmonization"
  );
}
function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
const getHash = () => window.location.hash.slice(1);
const serverHash = () => "harmonization";

export function MethodTabs({ panels }: { panels: Record<Tab, ReactNode> }) {
  const hash = useSyncExternalStore(subscribe, getHash, serverHash);
  const active = getTab(hash);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sectionTabs[hash]) return;
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(hash)
        ?.scrollIntoView({ block: "start", behavior: "instant" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [hash]);
  const change = (id: Tab) => {
    history.replaceState(null, "", `#${id}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };
  return (
    <div className="method-tabs" ref={root}>
      <div
        role="tablist"
        aria-label="Scientific documentation"
        className="method-tablist"
        onKeyDown={(e) => {
          const index = tabs.findIndex((t) => t.id === active);
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? tabs.length - 1
                : e.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : e.key === "ArrowLeft"
                    ? (index - 1 + tabs.length) % tabs.length
                    : -1;
          if (next < 0) return;
          e.preventDefault();
          change(tabs[next].id);
          root.current
            ?.querySelector<HTMLButtonElement>(`#tab-${tabs[next].id}`)
            ?.focus();
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-controls={`panel-${t.id}`}
            aria-selected={active === t.id}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => change(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          tabIndex={0}
          hidden={active !== t.id}
        >
          {panels[t.id]}
        </div>
      ))}
    </div>
  );
}
