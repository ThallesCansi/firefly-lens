"use client";
import { useSyncExternalStore } from "react";
import { AdministrativeSelectionCard } from "./AdministrativeSelectionCard";
import { PolygonEditOverlay } from "./PolygonEditOverlay";
import type { useWorkspaceTools } from "./useWorkspaceTools";
export function WorkspaceSelectionTools({
  tools,
  coordinates,
  drawing,
}: {
  tools: ReturnType<typeof useWorkspaceTools>;
  coordinates: boolean;
  drawing: boolean;
}) {
  const selection = useSyncExternalStore(tools.administrative.subscribe,tools.administrative.snapshot,tools.administrative.snapshot);
  return (
    <>
      {(tools.administrativeActive || tools.boundary) &&
        !coordinates &&
        !drawing && (
          <section
            className="ff-workspace-tools-card"
            data-phase={selection.phase}
            aria-label="Country or state selection"
          >
            {tools.administrativeActive ? (
              <>
                <fieldset className="ff-selection-level">
                  <legend>Selection level</legend>
                  <div role="group" aria-label="Selection level">
                    {(["country","state"] as const).map(level=><button
                      key={level} type="button" aria-pressed={tools.level===level}
                      onClick={() => {
                      tools.administrative.cancel();
                      tools.setLevel(level);
                    }}>{level==="country"?"Country":"Brazilian state"}</button>)}
                  </div>
                </fieldset>
                <AdministrativeSelectionCard
                  controller={tools.administrative}
                  onCancel={tools.cancelAdministrative}
                />
              </>
            ) : (
              tools.boundary && (
                <>
                  <div className="ff-interaction-card">
                    <p className="eyebrow">SELECTED BOUNDARY</p>
                    <h2>{tools.boundary.feature.properties.name}</h2>
                    <p role="status">
                      Boundary selected and highlighted on the map.
                    </p>
                    <p className="ff-interaction-notice">
                      {tools.boundary.dataCoverage === "none"
                        ? "No data coverage: observations currently cover Brazil only."
                        : "The whole country is too large for one analysis. Pick a Brazilian state instead."}
                    </p>
                  </div>
                  <div className="ff-boundary-actions">
                    <button
                      className="btn btn-quiet"
                      onClick={tools.beginAdministrative}
                    >
                      Change region
                    </button>
                    <button
                      className="btn btn-quiet"
                      onClick={tools.clearBoundary}
                    >
                      Clear boundary
                    </button>
                  </div>
                </>
              )
            )}
          </section>
        )}
      {tools.editor && (
        <PolygonEditOverlay
          editor={tools.editor}
          adapter={tools.adapter}
          viewRevision={tools.revision}
          onInteractionLock={tools.lock}
        />
      )}
    </>
  );
}
