"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fireData } from "@/lib/data/source";
import {
  drawnArea,
  normalizeBBox,
  rectangleArea,
  type AnalysisArea,
  type BBox,
  type Sensor,
} from "@/lib/data/types";
import type { AdministrativeCandidate } from "@/lib/interactions/administrative";
import type { Vertex } from "@/lib/interactions/polygon-editor";
import { AreaForm } from "./AreaForm";
import { AnalysisCalendar, AnalysisReport } from "./AnalysisContent";
import { HotspotMap } from "./HotspotMap";
import { LocationSearch, type MapDestination } from "./LocationSearch";
import { AssistantDock } from "./AssistantDock";
import type { AssistantHost } from "@/lib/assistant/execute";
import { SiteNav } from "@/components/ui/SiteNav";
import { MapCard, MapToolbar, MapLayerControl, MapHighlightsControl } from "./MapControls";
import { useFireflySignals } from "@/lib/analytics/useFireflySignals";
import { MONTHS } from "@/lib/format";
import { TemporalControl } from "./TemporalControl";
import { useMapCells } from "@/lib/useMapHotspots";
import { useWorkspaceTools } from "@/components/interactions/useWorkspaceTools";
import { WorkspaceSelectionTools } from "@/components/interactions/WorkspaceSelectionTools";
import { PolygonEditStatus } from "@/components/interactions/PolygonEditOverlay";
import { ResizableAnalysisPanel } from "@/components/interactions/ResizableAnalysisPanel";
import type { MapController } from "@/lib/map/map-contract";
import "@/components/interactions/WorkspaceTools.css";
import { ScientificInfo } from "@/components/ui/ScientificInfo";

type Area = AnalysisArea;
const presets = fireData.presets();

const deg = (n: number) => Math.round(n * 100) / 100;
/** One line that says what the area is. */
function describe(area: Area): string {
  if (area.kind === "preset") return "Study region · Prepared seasonal analytics";
  if (area.kind === "state") return "Brazilian state · IBGE outline";
  const corners = area.geometry.type === "Polygon" ? area.geometry.coordinates[0].length - 1 : 0;
  const [w, s, e, n] = area.bbox;
  return `${corners} corners · W ${deg(w)} · S ${deg(s)} · E ${deg(e)} · N ${deg(n)}`;
}

const INTRO_KEY = "firefly-lens-intro-done";
const subscribeStorage = (notify: () => void) => {
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
};
function readIntroSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
}
function rememberIntro() {
  try {
    localStorage.setItem(INTRO_KEY, "1");
  } catch {
    /* Storage blocked: the guidance shows again next time. */
  }
}

/** The folded map card's one line: "Sep 2026 · 2 layers" or "14 Sep 2026 · 1 layer". */
function periodSummary(period: string, layers: number): string {
  const month = MONTHS[Number(period.slice(5, 7)) - 1].slice(0, 3);
  const day = period.length === 10 ? `${Number(period.slice(8, 10))} ` : "";
  return `${day}${month} ${period.slice(0, 4)} · ${layers} ${layers === 1 ? "layer" : "layers"}`;
}

export function LensApp() {
  const [area, setArea] = useState<Area | null>(null);
  const [analyzed, setAnalyzed] = useState<Area | null>(null);
  const [analysis, setAnalysis] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [coordinates, setCoordinates] = useState(false);
  const [searching, setSearching] = useState(false);
  // First-run guidance: closed by its ×, or for good once an area is chosen.
  const introSeen = useSyncExternalStore(subscribeStorage, readIntroSeen, () => true);
  const [introClosed, setIntroClosed] = useState(false);
  const introDone = introSeen || introClosed;
  const finishIntro = useCallback(() => {
    setIntroClosed(true);
    rememberIntro();
  }, []);
  const searchPanel = useRef<HTMLElement>(null);
  const [period, setPeriod] = useState(`${fireData.lastYear}-09`);
  const [signalsEnabled, setSignalsEnabled] = useState(true);
  const signals = useFireflySignals(signalsEnabled, period);
  const [from, setFrom] = useState(fireData.firstMonth);
  const [to, setTo] = useState(fireData.lastMonth);
  const [sensors, setSensors] = useState<Sensor[]>(["MODIS", "VIIRS"]);
  const [destination, setDestination] = useState<MapDestination | null>(null);
  const [controller, setController] = useState<MapController | null>(null);
  /** Changes on each new selection, so the camera frames it; edits leave it alone. */
  const [frame, setFrame] = useState(0);
  const analyzeButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const mapData = useMapCells(area, period);
  const commitRectangle = useCallback((bbox: BBox) => {
    setArea(rectangleArea(normalizeBBox(bbox)));
    setFrame((n) => n + 1);
    setDrawing(false);
    setCoordinates(false);
    setAnalysis(false);
  }, []);
  // A finished corner edit: the shape changes, the camera stays.
  const commitShape = useCallback((vertices: Vertex[]) => {
    setArea((current) => drawnArea(vertices, current?.name));
  }, []);
  const commitAdministrative = useCallback(
    (candidate: AdministrativeCandidate) => {
      setAnalysis(false);
      setDrawing(false);
      setCoordinates(false);
      if (candidate.analysis !== "available") {
        setArea(null);
        return false;
      }
      const { id, name } = candidate.feature.properties;
      setArea({
        id: `state:${id}`,
        name,
        kind: "state",
        geometry: candidate.feature.geometry,
        bbox: candidate.bounds,
      });
      setFrame((n) => n + 1);
      return true;
    },
    [],
  );
  // Corner handles show as soon as a drawn area exists, unless another tool is in use.
  const editable = area && !analysis && !drawing && !coordinates ? area : null;
  const tools = useWorkspaceTools(
    controller,
    editable,
    commitShape,
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
  const report = useRef<HTMLElement>(null);
  const showReport = () => {
    report.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
    report.current?.focus({ preventScroll: true });
  };
  const close = () => {
    window.scrollTo({ top: 0 });
    setAnalysis(false);
    setExpanded(false);
    requestAnimationFrame(() => analyzeButton.current?.focus());
  };
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawing(false);
        setCoordinates(false);
        setSearching(false);
        stopTools();
      }
      // "/" opens place search, as in most map and search apps, unless the person is typing.
      const typing = (e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable=true]");
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setCoordinates(false);
        setDrawing(false);
        setSearching(true);
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [stopTools]);
  // Focus the search field as soon as the panel opens.
  useEffect(() => {
    if (searching) searchPanel.current?.querySelector("input")?.focus();
  }, [searching]);
  // Remember that the guidance did its job; this only writes to storage.
  useEffect(() => {
    if (area) rememberIntro();
  }, [area]);
  const detectionStatus = area ? (
    <p role="status">
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
            ).toLocaleString("en-GB")} detections in ${mapData.cells.length.toLocaleString("en-GB")} cells`)}
      {period < fireData.viirsStart.slice(0, period.length) &&
      sensors.includes("VIIRS")
        ? " · VIIRS starts April 2018"
        : ""}
    </p>
  ) : (
    // Before any area, the key says what loads the dots.
    <p role="status">Select an area to load detections</p>
  );
  function analyze(target: Area | null = area) {
    if (!target) return;
    setAnalyzed(target);
    setAnalysis(true);
    setCoordinates(false);
    tools.stop();
    requestAnimationFrame(() => {
      closeButton.current?.focus();
      controller?.navigate({
        id: Date.now(),
        bounds: target.bbox,
        animation: "ease",
      });
    });
  }
  // The assistant acts between renders: its host is kept current here and by
  // each of its own actions, so a later step of the same answer sees an earlier one.
  const assistantHost = useRef<AssistantHost | null>(null);
  const host: AssistantHost = {
    area,
    period,
    sensors,
    analysisOpen: analysis,
    chooseArea(next) {
      stopTools();
      clearAdministrative();
      setDrawing(false);
      setCoordinates(false);
      setSearching(false);
      setAnalysis(false);
      setArea(next);
      setFrame((n) => n + 1);
      Object.assign(assistantHost.current!, { area: next, analysisOpen: false });
    },
    clearArea() {
      tools.clear();
      setArea(null);
      setAnalysis(false);
      Object.assign(assistantHost.current!, { area: null, analysisOpen: false });
    },
    navigate(place) {
      stopTools();
      setDrawing(false);
      setDestination(place);
    },
    setPeriod(next) {
      changePeriod(next);
      assistantHost.current!.period = next;
    },
    setSensors(next) {
      setSensors(next);
      assistantHost.current!.sensors = next;
    },
    openAnalysis(target) {
      analyze(target);
      assistantHost.current!.analysisOpen = true;
    },
  };
  useEffect(() => {
    assistantHost.current = host;
  });
  return (
    <main id="main" className="lens-workspace">
      <div
        className="workspace-body"
        data-analysis={analysis}
        data-expanded={expanded && analysis}
      >
        <section className="workspace-map" aria-label="Earth exploration">
          <HotspotMap
            area={area}
            frame={area ? frame : null}
            areaName={area?.name ?? "Earth"}
            cells={mapData.cells}
            signals={signals.signals}
            onSignalSelect={(target) => {
              tools.clear();
              setDrawing(false);
              setCoordinates(false);
              setSearching(false);
              setArea(target);
              analyze(target);
            }}
            drawing={drawing}
            onDraw={selectArea}
            sensors={sensors}
            destination={destination}
            onReady={setController}
            interactionMode={
              tools.administrativeActive
                ? "pick-administrative"
                : drawing
                  ? "draw-rectangle"
                  : "navigate"
            }
            onMapClick={tools.onMapClick}
            onViewChange={tools.editor ? tools.updateView : undefined}
            status={detectionStatus}
            onResetView={() => {
              tools.stop();
              setDrawing(false);
            }}
          />
          <SiteNav current="/lens" className="map-site-card" />
          <MapToolbar
            onSearch={() => {
              tools.stop();
              setDrawing(false);
              setCoordinates(false);
              setSearching((s) => !s);
            }}
            searchActive={searching}
            tool={drawing ? "draw" : coordinates ? "coordinates" : "navigate"}
            onSelectAdministrative={() => {
              setDrawing(false);
              setCoordinates(false);
              setAnalysis(false);
              tools.beginAdministrative();
            }}
            administrativeActive={tools.administrativeActive}
            onTool={(tool) => {
              tools.stop();
              setSearching(false);
              setDrawing(tool === "draw");
              setCoordinates(tool === "coordinates");
            }}
          />
          <MapCard
            summary={`${periodSummary(period, sensors.length)} · Signals ${signalsEnabled ? "on" : "off"}`}
          >
            <div className="map-settings-row">
              <TemporalControl period={period} onChange={changePeriod} />
              <MapLayerControl sensors={sensors} onChange={setSensors} />
            </div>
            <MapHighlightsControl enabled={signalsEnabled} onChange={setSignalsEnabled} status={signals.status} />
          </MapCard>
          {searching && (
            <section
              ref={searchPanel}
              className="map-search-panel map-surface"
              aria-label="Search places"
            >
              <div className="map-search-head">
                <h2>Search places</h2>
                <CloseButton label="Close search" onClick={() => setSearching(false)} />
              </div>
              <LocationSearch
                onNavigate={(place) => {
                  tools.stop();
                  setDrawing(false);
                  setDestination(place);
                  setSearching(false);
                }}
              />
              <p className="map-search-hint">
                Cities, states or <span className="num">lat, lon</span>. The
                records cover Brazil; draw an area there to analyze it.
              </p>
            </section>
          )}
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
                <CloseButton label="Close coordinates" onClick={() => setCoordinates(false)} />
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
                      setArea(rectangleArea(p.bbox, p.name));
                      setFrame((n) => n + 1);
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
            !introDone &&
            !drawing &&
            !coordinates &&
            !searching &&
            !tools.administrativeActive &&
            !tools.boundary &&
            !tools.editor && (
              <div className="explore-hint map-surface">
                <div className="flex items-start justify-between gap-3">
                  <p className="eyebrow">EXPLORE THE RECORD</p>
                  <CloseButton label="Close the introduction" onClick={finishIntro} />
                </div>
                <h1 className="text-2xl">
                  A place. Two sensors.
                  <br />
                  One shared history.
                </h1>
                <p className="mt-2 text-sm text-dim">
                  Real MODIS and VIIRS records for Brazil, 2002 to today. Draw an
                  area anywhere in Brazil, or pick a state, to investigate its
                  fire activity.
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
            !tools.administrativeActive && (
              <section
                className="selection-card map-surface"
                aria-label="Selected area"
              >
                <p className="eyebrow">AREA OF INTEREST</p>
                <h2 className="text-xl">{area.name}</h2>
                <p className="num my-2 text-xs text-dim">{describe(area)}</p>
                <div className="mb-3 flex flex-col gap-1">
                  {analyzed && analyzed.id !== area.id && (
                    <p className="text-xs text-dim">
                      Area changed. Analyze to recalculate the history.
                    </p>
                  )}
                  {tools.editor && <PolygonEditStatus editor={tools.editor} />}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    ref={analyzeButton}
                    className="btn btn-primary"
                    onClick={() => analyze()}
                  >
                    Analyze area
                  </button>
                  <button
                    className="btn btn-quiet"
                    onClick={() => {
                      tools.stop();
                      setDrawing(true);
                    }}
                  >
                    Redraw
                  </button>
                  <button
                    className="btn btn-text"
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
          <AssistantDock host={assistantHost} />
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
              <div className="min-w-0">
                <h2 className="text-2xl">{analyzed.name}</h2>
                <p className="num text-xs text-dim">{describe(analyzed)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-quiet expand-analysis"
                  onClick={() => setExpanded(!expanded)}
                  aria-pressed={expanded}
                >
                  {expanded ? "Compact" : "Expand"}
                </button>
                <CloseButton ref={closeButton} label="Close analysis" onClick={close} />
              </div>
            </div>
            <div className="analysis-scroll">
              <AnalysisCalendar
                key={analyzed.id}
                area={analyzed}
                period={period}
                onPeriod={changePeriod}
                from={from}
                to={to}
                onReport={showReport}
              />
            </div>
          </ResizableAnalysisPanel>
        )}
      </div>
      {analyzed && (
        <section
          ref={report}
          id="area-report"
          className="analysis-report"
          aria-labelledby="report-title"
          tabIndex={-1}
          hidden={!analysis}
        >
          <div className="analysis-report-inner">
            <header className="analysis-report-head">
              <p className="eyebrow">AREA REPORT</p>
              <h2 id="report-title" className="text-3xl md:text-4xl">
                {analyzed.name}
              </h2>
              <p className="num text-xs text-dim">{describe(analyzed)}</p>
              <p className="mt-3 max-w-[70ch] text-[0.9375rem] text-dim">
                Real detections, harmonized to the MODIS Aqua scale. Hot spots
                are detected pixels, not independent fires.{" "}
                <Link href="/method">Read the methodology and limitations.</Link>
              </p>
            </header>
            <AnalysisReport
              area={analyzed}
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
            <button
              type="button"
              className="btn btn-quiet self-start"
              onClick={() =>
                window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" })
              }
            >
              Back to the map
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5M6 11l6-6 6 6" />
              </svg>
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The one close control used by every card and panel. */
function CloseButton({
  label,
  onClick,
  ref,
}: {
  label: string;
  onClick: () => void;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button ref={ref} type="button" className="icon-btn" aria-label={label} title={label} onClick={onClick}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  );
}
