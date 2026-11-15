"use client";

import { useId } from "react";
import type { TerrainPhase } from "@/lib/map/terrain";

export function TerrainControls({ requested, phase, suspended, onChange }: {
  requested: boolean; phase: TerrainPhase; suspended: boolean; onChange: (on: boolean) => void;
}) {
  const id = useId();
  const message = !requested ? "Real geographic elevation · 1×. Detection columns pause while terrain is on."
    : suspended ? "Terrain paused for the guided presentation. Your choice is retained."
    : phase === "unavailable" ? "Terrain unavailable. Existing map and columns restored. Switch off and on to retry."
    : phase === "loading" ? "Loading real elevation. Hotspot markers stay visible; detection columns are paused."
    : "Real elevation · 1×. Hotspot markers stay visible; detection columns are paused.";
  return <div className="terrain-control" data-terrain-phase={requested && suspended ? "suspended" : phase}>
    <button type="button" className="terrain-trigger" aria-pressed={requested} aria-describedby={id}
      disabled={suspended} onClick={() => onChange(!requested)} title={message}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m2 20 7-14 4 7 3-5 6 12Z" /><path d="m6 12 3 2 3-2" /></svg>
      <span>Terrain 3D</span>
      {requested && <span className="terrain-indicator" aria-hidden="true">{suspended ? "Paused" : phase === "loading" ? "Loading" : phase === "unavailable" ? "Unavailable" : "On"}</span>}
    </button>
    <span id={id} className="terrain-help" aria-live="polite">{message}</span>
  </div>;
}
