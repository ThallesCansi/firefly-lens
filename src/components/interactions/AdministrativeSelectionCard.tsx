"use client";

import { useSyncExternalStore } from "react";
import { AdministrativeSelectionController } from "@/lib/interactions/administrative";
import "./Interactions.css";

export function AdministrativeSelectionCard({
  controller,
  onCancel,
}: {
  controller: AdministrativeSelectionController;
  onCancel?: () => void;
}) {
  const state = useSyncExternalStore(
      controller.subscribe,
      controller.snapshot,
      controller.snapshot,
    ),
    candidate = state.selected;
  return (
    <section
      className={"ff-interaction-card" + " map-surface"}
      aria-label="Administrative selection"
      aria-busy={state.phase === "loading"}
    >
      <p className="eyebrow">COUNTRY / STATE</p>
      <p role={state.phase === "error" ? "alert" : "status"}>{state.phase === "idle" ? "Tap the map to identify a region. Drag to keep exploring." : state.message}</p>
      {candidate && (
        <>
          {state.candidates.length > 1 && (
            <label>
              Boundary candidates
              <select
                className="field"
                value={candidate.feature.properties.id}
                onChange={(e) => controller.choose(e.target.value)}
              >
                {state.candidates.map((c) => (
                  <option
                    key={c.feature.properties.id}
                    value={c.feature.properties.id}
                  >
                    {c.feature.properties.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <h2>{candidate.feature.properties.name}</h2>
          <details className="ff-boundary-details"><summary>Boundary details</summary>
          <p className={"ff-interaction-muted"}>
            {candidate.feature.properties.level} /{" "}
            {candidate.feature.properties.sourceId} /{" "}
            {candidate.feature.geometry.type}
          </p>
          <p className={"ff-interaction-notice"}>
            {candidate.dataCoverage === "national" ? "A country-wide harmonized record is available. Calibration is evaluated for national totals; internal regions and ecosystems are not independently validated." : candidate.dataCoverage === "raw-pilot"
              ? "Real raw country archives are available. Harmonized activity, anomalies and forecasts are not validated for this pilot."
              : candidate.analysis === "available"
              ? "The analysis counts each 0.25° grid cell by the share of it inside this outline."
              : candidate.analysis === "too-large"
                ? "The whole country is too large for one analysis. Switch the level to Brazilian state."
                : "No historical data coverage for this country. Global map exploration remains available."}
          </p>
          <p className={"ff-interaction-muted"}>
            Envelope:{" "}
            {candidate.bounds.map((n) => n.toFixed(2)).join(" / ")}
          </p>
          <a
            className={"ff-interaction-source"}
            href={candidate.feature.properties.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            {candidate.feature.properties.source} (source)
          </a>
          <p className={"ff-interaction-muted"}>
            Simplified boundaries for identification. Coastlines, small islands
            and disputed borders may be generalized.
          </p>
          </details>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => controller.confirm()}
          >
            {candidate.dataCoverage === "national" ? "Use national report" : candidate.dataCoverage === "raw-pilot" ? "Use raw country pilot" : candidate.analysis === "available"
              ? "Use this state"
              : "Confirm boundary for display"}
          </button>
        </>
      )}
      <button
        type="button"
        className="btn btn-quiet"
        onClick={onCancel ?? (() => controller.cancel())}
      >
        Cancel selection
      </button>
    </section>
  );
}
