"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fireData } from "@/lib/data/source";
import { normalizeBBox, type BBox, type Sensor } from "@/lib/data/types";
import { AreaForm } from "./AreaForm";
import { AnalysisContent } from "./AnalysisContent";
import { HotspotMap } from "./HotspotMap";
import type { MapDestination } from "./LocationSearch";
import { TopNavigation } from "./TopNavigation";
import { MapToolbar, MapLayerControl } from "./MapControls";
import { TemporalControl } from "./TemporalControl";
import { useMapCells } from "@/lib/useMapHotspots";
import { useWorkspaceTools } from "@/components/interactions/useWorkspaceTools";
import { WorkspaceSelectionTools } from "@/components/interactions/WorkspaceSelectionTools";
import { ResizableAnalysisPanel } from "@/components/interactions/ResizableAnalysisPanel";
import type { MapController } from "@/lib/map/map-contract";
import "@/components/interactions/WorkspaceTools.css";
import { ScientificInfo } from "@/components/ui/ScientificInfo";

type Area = { name: string; bbox: BBox };
const presets = fireData.presets();

export function LensApp() {
  const [area, setArea] = useState<Area | null>(null);
  const [analyzed, setAnalyzed] = useState<Area | null>(null);
  const [analysis, setAnalysis] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [coordinates, setCoordinates] = useState(false);
  const [period, setPeriod] = useState(`${fireData.lastYear}-09`);
  const [from, setFrom] = useState(fireData.firstMonth);
  const [to, setTo] = useState(fireData.lastMonth);
  const [sensors, setSensors] = useState<Sensor[]>(["MODIS", "VIIRS"]);
  const [destination, setDestination] = useState<MapDestination | null>(null);
  const [reset, setReset] = useState(0);
  const [controller, setController] = useState<MapController | null>(null);
  const analyzeButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const mapData = useMapCells(area?.bbox ?? null, period);
  const commitRectangle = useCallback((bbox: BBox) => {
    setArea({ name: "Custom area", bbox: normalizeBBox(bbox) });
    setDrawing(false);
    setCoordinates(false);
    setAnalysis(false);
  }, []);
  const commitAdministrative = useCallback(() => {
    setArea(null);
    setAnalysis(false);
    setDrawing(false);
    setCoordinates(false);
  }, []);
  const tools = useWorkspaceTools(
    controller,
    commitRectangle,
    commitAdministrative,
  );
  const { stop: stopTools, clearAdministrative } = tools;
  const selectArea = useCallback(
    (bbox: BBox) => {
      stopTools();
      clearAdministrative();
      commitRectangle(bbox);
    },
    [stopTools, clearAdministrative, commitRectangle],
  );
  const changePeriod = (next: string) => {
    setPeriod(next);
    const month = next.slice(0, 7);
    if (month < from) setFrom(month);
    if (month > to) setTo(month);
  };
  const close = () => {
    setAnalysis(false);
    setExpanded(false);
    requestAnimationFrame(() => analyzeButton.current?.focus());
  };
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawing(false);
        setCoordinates(false);
        stopTools();
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [stopTools]);
  function analyze() {
    if (!area) return;
    setAnalyzed(area);
    setAnalysis(true);
    setCoordinates(false);
    tools.stop();
    requestAnimationFrame(() => {
      closeButton.current?.focus();
      controller?.navigate({
        id: Date.now(),
        bounds: area.bbox,
        animation: "ease",
      });
    });
  }
  return (
    <main id="main" className="lens-workspace">
      <TopNavigation
        onNavigate={(place) => {
          tools.stop();
          setDrawing(false);
          setDestination(place);
        }}
      />
      <div
        className="workspace-body"
        data-analysis={analysis}
        data-expanded={expanded && analysis}
      >
        <section className="workspace-map" aria-label="Earth exploration">
          <HotspotMap
            bbox={area?.bbox ?? null}
            areaName={area?.name ?? "Earth"}
            cells={mapData.cells}
            drawing={drawing}
            onDraw={selectArea}
            sensors={sensors}
            destination={destination}
            reset={reset}
            onReady={setController}
            interactionMode={
              tools.administrativeActive
                ? "pick-administrative"
                : tools.editor
                  ? "edit-rectangle"
                  : drawing
                    ? "draw-rectangle"
                    : "navigate"
            }
            onMapClick={tools.onMapClick}
            onViewChange={tools.editor ? tools.updateView : undefined}
          />
          <div className="map-status map-surface">
            <span className="status-dot" />
            NASA FIRMS · BRAZIL
            <span className="text-dim">
              {fireData.firstYear}–{fireData.lastYear}
            </span>
          </div>
          <MapToolbar
            tool={drawing ? "draw" : coordinates ? "coordinates" : "navigate"}
            hasArea={!!area || !!tools.boundary || !!tools.preview}
            canEditRectangle={!!area}
            onSelectAdministrative={() => {
              setDrawing(false);
              setCoordinates(false);
              setAnalysis(false);
              tools.beginAdministrative();
            }}
            administrativeActive={tools.administrativeActive}
            onEditRectangle={() => {
              if (area) {
                setAnalysis(false);
                setDrawing(false);
                setCoordinates(false);
                tools.beginEdit(area.bbox);
              }
            }}
            rectangleEditing={!!tools.editor}
            onTool={(tool) => {
              tools.stop();
              setDrawing(tool === "draw");
              setCoordinates(tool === "coordinates");
            }}
            onClear={() => {
              tools.clear();
              setArea(null);
              setAnalysis(false);
              setDrawing(false);
            }}
            onReset={() => {
              tools.stop();
              setDrawing(false);
              setReset((n) => n + 1);
            }}
          />
          <MapLayerControl sensors={sensors} onChange={setSensors} />
          <WorkspaceSelectionTools
            tools={tools}
            coordinates={coordinates}
            drawing={drawing}
          />
          {coordinates && (
            <section
              className="coordinates-panel map-surface"
              aria-label="Choose an analysis area"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2>Area coordinates</h2>
                <button
                  className="btn btn-quiet"
                  onClick={() => setCoordinates(false)}
                  aria-label="Close coordinates"
                >
                  ×
                </button>
              </div>
              <label className="mb-3 block text-sm">
                Study region
                <select
                  className="field mt-1 w-full"
                  value=""
                  onChange={(e) => {
                    const p = presets.find((p) => p.id === e.target.value);
                    if (p) {
                      tools.clear();
                      setArea({ name: p.name, bbox: p.bbox });
                      setAnalysis(false);
                      setCoordinates(false);
                    }
                  }}
                >
                  <option value="" disabled>
                    Choose a preset…
                  </option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.place}
                    </option>
                  ))}
                </select>
              </label>
              <AreaForm
                key={area?.bbox.join(",")}
                bbox={area?.bbox ?? presets[0].bbox}
                drawing={drawing}
                onApply={selectArea}
                onToggleDraw={() => {
                  setDrawing(true);
                  setCoordinates(false);
                }}
              />
            </section>
          )}
          {!area &&
            !drawing &&
            !coordinates &&
            !tools.administrativeActive &&
            !tools.boundary &&
            !tools.editor && (
              <div className="explore-hint map-surface">
                <p className="eyebrow">EXPLORE THE RECORD</p>
                <h1 className="text-2xl">
                  A place. Two sensors.
                  <br />
                  One shared history.
                </h1>
                <p className="mt-2 text-sm text-dim">
                  Real MODIS and VIIRS records for Brazil, 2002 to today. Draw a
                  rectangle anywhere in Brazil to investigate its fire activity.
                </p>
                <button
                  className="btn btn-primary mt-4"
                  onClick={() => setDrawing(true)}
                >
                  Select an area
                </button>
              </div>
            )}
          {area &&
            !analysis &&
            !coordinates &&
            !drawing &&
            !tools.administrativeActive &&
            !tools.editor && (
              <section
                className="selection-card map-surface"
                aria-label="Selected area"
              >
                <p className="eyebrow">AREA OF INTEREST</p>
                <h2 className="text-xl">{area.name}</h2>
                <p className="num my-2 text-xs text-dim">
                  W {area.bbox[0]} · S {area.bbox[1]} · E {area.bbox[2]} · N{" "}
                  {area.bbox[3]}
                </p>
                <p className="mb-3 text-xs text-dim">
                  {analyzed && analyzed.bbox.join() !== area.bbox.join()
                    ? "Area changed. Analyze to recalculate the history."
                    : "Selection is independent of map navigation."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    ref={analyzeButton}
                    className="btn btn-primary"
                    onClick={analyze}
                  >
                    Analyze Area
                  </button>
                  <button
                    className="btn btn-quiet"
                    onClick={() => {
                      tools.stop();
                      setDrawing(true);
                    }}
                  >
                    Change
                  </button>
                  <button
                    className="btn btn-quiet"
                    onClick={() => {
                      tools.clear();
                      setArea(null);
                    }}
                  >
                    Clear
                  </button>
                </div>
              </section>
            )}
          <TemporalControl
            period={period}
            onChange={changePeriod}
            disabled={!area}
          />
          {area && (
            <p className="map-data-status map-surface" role="status">
              <ScientificInfo concept="hotspot" />
              {mapData.error ||
                (mapData.cells === null
                  ? "Loading detections…"
                  : `${Math.round(
                      mapData.cells.reduce(
                        (s, c) =>
                          s +
                          (sensors.includes("MODIS") ? c.modis : 0) +
                          (sensors.includes("VIIRS") ? c.viirs : 0),
                        0,
                      ),
                    ).toLocaleString(
                      "en-GB",
                    )} visible detections in ${mapData.cells.length.toLocaleString("en-GB")} grid cells · selected area only`)}
              {period < fireData.viirsStart.slice(0, period.length) &&
              sensors.includes("VIIRS")
                ? " · VIIRS NOAA-20 starts in April 2018"
                : ""}
            </p>
          )}
        </section>
        {analyzed && (
          <ResizableAnalysisPanel
            hidden={!analysis}
            expanded={expanded}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
          >
            <div className="analysis-heading">
              <div>
                <p className="eyebrow">INVESTIGATE / NASA FIRMS, BRAZIL</p>
                <h2 className="text-2xl">{analyzed.name}</h2>
                <p className="num text-xs text-dim">
                  {analyzed.bbox.join(" / ")}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-quiet expand-analysis"
                  onClick={() => setExpanded(!expanded)}
                  aria-pressed={expanded}
                >
                  {expanded ? "Compact" : "Expand"}
                </button>
                <button
                  ref={closeButton}
                  className="btn btn-quiet"
                  onClick={close}
                  aria-label="Close analysis"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="analysis-scroll">
              <p className="mb-5 text-xs text-dim">
                Real detections, harmonized to the MODIS Aqua scale. Hot spots
                are detected pixels, not independent fires.{" "}
                <Link href="/method">
                  Read the methodology and limitations.
                </Link>
              </p>
              <AnalysisContent
                key={analyzed.bbox.join()}
                bbox={analyzed.bbox}
                areaName={analyzed.name}
                period={period}
                onPeriod={changePeriod}
                from={from}
                to={to}
                onFrom={(v) => {
                  setFrom(v);
                  if (period.slice(0, 7) < v) setPeriod(v);
                }}
                onTo={(v) => {
                  setTo(v);
                  if (period.slice(0, 7) > v) setPeriod(v);
                }}
              />
            </div>
          </ResizableAnalysisPanel>
        )}
      </div>
    </main>
  );
}
