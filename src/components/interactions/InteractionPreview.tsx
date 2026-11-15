"use client";

import { useState } from "react";
import { LocationSearch } from "@/components/lens/LocationSearch";
import { MapToolbar } from "@/components/lens/MapControls";
import { AdministrativeSelectionCard } from "./AdministrativeSelectionCard";
import { ResizableAnalysisPanel } from "./ResizableAnalysisPanel";
import { RectangleEditActions } from "./RectangleEditOverlay";
import { AdministrativeSelectionController } from "@/lib/interactions/administrative";
import {
  RectangleEditor,
  type RectangleHandle,
} from "@/lib/interactions/rectangle-editor";
import type { BBox } from "@/lib/data/types";
import "./InteractionPreview.css";

export function InteractionPreview() {
  const [notice, setNotice] = useState(
    "Independent interaction preview. No map camera or scientific analysis is connected here.",
  );
  const [point, setPoint] = useState(["-46.63", "-23.55"]);
  const [level, setLevel] = useState<"country" | "state">("state");
  const [handle, setHandle] = useState<RectangleHandle>("nw");
  const [committed, setCommitted] = useState<BBox>([-50, -14, -42, -6]);
  const [draft, setDraft] = useState<BBox>([-50, -14, -42, -6]);
  const [editor, setEditor] = useState(
    () =>
      new RectangleEditor(committed, {
        onPreview: setDraft,
        onConfirm: (b) => {
          setCommitted(b);
          setNotice(
            "Rectangle confirmed. Integration may now request analysis explicitly.",
          );
        },
        onCancel: () =>
          setNotice("Edit cancelled; the original selection is preserved."),
      }),
  );
  const [administrative] = useState(
    () =>
      new AdministrativeSelectionController(
        undefined,
        (selection) =>
          setNotice(
            selection
              ? "Boundary preview requested: " +
                  selection.feature.properties.name +
                  ". The map renderer is not connected in this preview."
              : "Boundary preview cleared.",
          ),
        (selection) =>
          setNotice(
            "Confirmed " +
              selection.feature.properties.name +
              " for display. Exact territorial analysis remains unavailable.",
          ),
      ),
  );
  const startEdit = () => {
    setDraft([...committed]);
    setEditor(
      new RectangleEditor(committed, {
        onPreview: setDraft,
        onConfirm: (b) => {
          setCommitted(b);
          setNotice(
            "Rectangle confirmed. No automatic analysis was triggered.",
          );
        },
        onCancel: () =>
          setNotice("Edit cancelled; original rectangle restored."),
      }),
    );
  };
  return (
    <div className={"ff-preview-workspace"}>
      <section
        className={"ff-preview-controls"}
        aria-label="Interaction preview controls"
      >
        <div className={"ff-preview-toolbar"}>
          <MapToolbar
            tool="navigate"
            onTool={(tool) =>
              setNotice(
                "Tool requested: " +
                  tool +
                  ". Map event integration is pending.",
              )
            }
            onSelectAdministrative={() =>
              setNotice(
                "Choose country/state and submit a geographic click below.",
              )
            }
          />
        </div>
        <h2>Location autocomplete</h2>
        <LocationSearch
          onNavigate={(intent) =>
            setNotice(
              "Navigation requested: " +
                intent.center.join(", ") +
                "; " +
                intent.motion?.durationMs +
                " ms. The preview does not move a map.",
            )
          }
        />
        <p className={"ff-preview-help"}>
          Suggestions navigate only. Use the controls below to simulate
          geographic events supplied by the map owner.
        </p>
        <form
          className={"ff-preview-form"}
          onSubmit={(e) => {
            e.preventDefault();
            void administrative.selectAt(
              [Number(point[0]), Number(point[1])],
              level,
            );
          }}
        >
          <h2>Geographic click adapter</h2>
          <label>
            Administrative level
            <select
              className="field"
              value={level}
              onChange={(e) => setLevel(e.target.value as "country" | "state")}
            >
              <option value="state">Brazilian state</option>
              <option value="country">Country</option>
            </select>
          </label>
          <label>
            Longitude
            <input
              className="field"
              value={point[0]}
              inputMode="decimal"
              required
              onChange={(e) => setPoint([e.target.value, point[1]])}
            />
          </label>
          <label>
            Latitude
            <input
              className="field"
              value={point[1]}
              inputMode="decimal"
              required
              onChange={(e) => setPoint([point[0], e.target.value])}
            />
          </label>
          <button className="btn btn-primary" type="submit">
            Identify region at coordinate
          </button>
        </form>
        <form
          className={"ff-preview-form"}
          onSubmit={(e) => {
            e.preventDefault();
            editor.begin(handle, [Number(point[0]), Number(point[1])]);
            editor.update([Number(point[0]), Number(point[1])]);
            editor.endDrag();
          }}
        >
          <h2>Rectangle editor adapter</h2>
          <p className={"ff-preview-help"}>
            Corner handles use the coordinate above. A geographic drag adapter,
            not pixel math, supplies positions.
          </p>
          <label>
            Corner
            <select
              className="field"
              value={handle}
              onChange={(e) => setHandle(e.target.value as RectangleHandle)}
            >
              <option value="nw">North-west</option>
              <option value="ne">North-east</option>
              <option value="se">South-east</option>
              <option value="sw">South-west</option>
            </select>
          </label>
          <button className="btn btn-quiet" type="button" onClick={startEdit}>
            Start rectangle edit
          </button>
          <button className="btn btn-quiet" type="submit">
            Preview corner at coordinate
          </button>
        </form>
        <p className={"ff-preview-help"}>
          Preview bounds: {draft.map((n) => n.toFixed(3)).join(" / ")}
        </p>
        <p className={"ff-preview-help"}>
          Committed bounds:{" "}
          <output aria-label="Committed rectangle">
            {committed.map((n) => n.toFixed(3)).join(" / ")}
          </output>
        </p>
        <p className={"ff-preview-notice"} role="status">
          {notice}
        </p>
      </section>
      <ResizableAnalysisPanel storageKey="firefly-interactions-preview-width">
        <h2 className="text-xl mb-4">Selection workspace</h2>
        <p className={"ff-preview-help"}>
          Drag the left separator, use arrow keys, or reset the panel. On mobile
          this becomes a bottom sheet.
        </p>
        <AdministrativeSelectionCard controller={administrative} />
        <RectangleEditActions editor={editor} />
      </ResizableAnalysisPanel>
    </div>
  );
}
