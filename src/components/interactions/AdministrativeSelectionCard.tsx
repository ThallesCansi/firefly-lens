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
      <p role={state.phase === "error" ? "alert" : "status"}>{state.message}</p>
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
          <p className={"ff-interaction-muted"}>
            {candidate.feature.properties.level} /{" "}
            {candidate.feature.properties.sourceId} /{" "}
            {candidate.feature.geometry.type}
          </p>
          <p className={"ff-interaction-notice"}>
            {candidate.dataCoverage === "brazil"
              ? "Brazil observations are available. Exact territorial analysis requires polygon clipping, which is not wired to this selection."
              : "No data coverage: this application currently serves Brazil only."}
          </p>
          <p className={"ff-interaction-muted"}>
            Bounding box:{" "}
            {candidate.bounds.map((n) => n.toFixed(3)).join(" / ")}. This
            envelope is not the region&apos;s territory.
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
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => controller.confirm()}
          >
            Confirm boundary for display
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
