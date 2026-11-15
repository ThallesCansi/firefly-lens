"use client";

import { useId } from "react";
import { IMAGERY_PROVIDERS, type ImageryProviderId } from "@/lib/map/imagery-providers";
import type { ImageryPhase } from "@/lib/map/imagery";

export function ImageryControls({ provider, phase, disabled, onChange, onRetry }: {
  provider: ImageryProviderId; phase: ImageryPhase; disabled: boolean;
  onChange: (provider: ImageryProviderId) => void; onRetry: () => void;
}) {
  const id = useId();
  return <div className="imagery-control">
    <label htmlFor={id}>Satellite source</label>
    <select id={id} aria-label="Satellite source" value={provider} disabled={disabled}
      onChange={(event) => onChange(event.target.value as ImageryProviderId)}>
      {Object.values(IMAGERY_PROVIDERS).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    <p>{IMAGERY_PROVIDERS[provider].reference}</p>
    <span className="imagery-status" aria-live="polite">{phase === "off" ? "Satellite layer hidden." : phase === "unavailable"
      ? "Imagery unavailable. Cartographic view remains usable." : phase === "loading" ? "Loading satellite imagery…" : "Satellite imagery ready."}</span>
    {phase === "unavailable" && <button type="button" disabled={disabled} onClick={onRetry}>Retry imagery</button>}
  </div>;
}
