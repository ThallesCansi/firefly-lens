"use client";
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
  return (
    <>
      {(tools.administrativeActive || tools.boundary) &&
        !coordinates &&
        !drawing && (
          <section
            className="ff-workspace-tools-card"
            aria-label="Country or state selection"
          >
            {tools.administrativeActive ? (
              <>
                <label>
                  Selection level
                  <select
                    className="field"
                    value={tools.level}
                    onChange={(e) => {
                      tools.administrative.cancel();
                      tools.setLevel(e.target.value as "country" | "state");
                    }}
                  >
                    <option value="country">Country</option>
                    <option value="state">Brazilian state</option>
                  </select>
                </label>
                <p className="px-4 text-sm text-dim">
                  Click the map to identify a region. Drag to keep exploring.
                </p>
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
