"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
  MapTouchEvent,
  StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { CellCount } from "@/lib/data/area";
import { normalizeBBox, type AnalysisArea, type BBox, type Sensor } from "@/lib/data/types";
import { HOME } from "@/lib/map/camera";
import { createController, type EngineController } from "@/lib/map/controller";
import type {
  MapClickHandler,
  MapController,
  MapInteractionMode,
  MapNavigationRequest,
  ProjectionMode,
} from "@/lib/map/map-contract";
import {
  DEFAULT_PROJECTION,
  readProjection,
  skyFor,
} from "@/lib/map/projection";
import type { MapDestination } from "./LocationSearch";
import { ProjectionToggle } from "./map/ProjectionToggle";
import { Starfield } from "./Starfield";
import { useTheme } from "@/components/ui/ThemeProvider";
import { BASEMAP_ATTRIBUTION, basemapFor, loadBasemap } from "@/lib/map/basemap";
import type { FireflySignal } from "@/lib/analytics/signals";
import { useSignalMarkers } from "./map/useSignalMarkers";

const NO_SIGNALS: FireflySignal[] = [];

function mapColors() {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string) => css.getPropertyValue(name).trim();
  return {
    ground: read("--map-ground"),
    area: read("--color-selected"),
    ink: read("--color-ink"),
    modis: read("--color-modis"),
    viirs: read("--color-viirs"),
    stroke: read("--color-night"),
  };
}

/** Used when the basemap cannot be reached, so the detections still draw. */
const blankStyle = (): StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [
    {
      id: "ground",
      type: "background",
      paint: { "background-color": mapColors().ground },
    },
  ],
});

/**
 * One feature per 0.25° grid cell. `km` and `kv` size the MODIS ring and the
 * VIIRS dot against the busiest cell of the period, per sensor, or against
 * `scale` when frames of a time-lapse must share one.
 */
function points(cells: CellCount[], scale?: { modis: number; viirs: number }) {
  const topM = scale?.modis ?? Math.max(1, ...cells.map((c) => c.modis));
  const topV = scale?.viirs ?? Math.max(1, ...cells.map((c) => c.viirs));
  const k = (n: number, top: number) =>
    n > 0 ? Math.max(0.3, Math.sqrt(n / top)) : 0;
  return {
    type: "FeatureCollection" as const,
    features: cells.map((c) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [c.lon, c.lat] },
      properties: {
        modis: c.modis,
        viirs: c.viirs,
        km: k(c.modis, topM),
        kv: k(c.viirs, topV),
      },
    })),
  };
}

/** Half a 0.25° cell in pixels at zoom 3 and 11, times a size factor. */
const cellRadius = (k: string, scale = 1) => [
  "interpolate",
  ["exponential", 2],
  ["zoom"],
  3,
  ["max", 1.2, ["*", 0.71 * scale, ["get", k]]],
  11,
  ["*", 182 * scale, ["get", k]],
];

/** Brazil's outline, drawn under the data so the covered area reads at a glance. */
const OUTLINE_URL = "/data/brazil/brazil.geojson";

function areaFeature(area: AnalysisArea | null) {
  if (!area) return { type: "FeatureCollection" as const, features: [] };
  return { type: "Feature" as const, properties: {}, geometry: area.geometry };
}

function outline(bbox: BBox | null) {
  if (!bbox) return { type: "FeatureCollection" as const, features: [] };
  const [w, s, e, n] = bbox;
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    },
  };
}

function makeMap(
  lib: typeof import("maplibre-gl"),
  container: HTMLElement,
  style: StyleSpecification,
  projection: ProjectionMode,
): MapLibreMap {
  return new lib.Map({
    container,
    // Already fetched and coloured for the theme (see loadBasemap), or the plain ground.
    style,
    center: HOME.center,
    zoom: HOME.zoom[projection],
    attributionControl: false,
    cooperativeGestures: false,
    renderWorldCopies: false,
    // The globe turns by dragging; tilting and spinning the north away add nothing to a fire map.
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
}

/**
 * The map engine: MapLibre with the basemap, the theme, the projection (globe
 * by default, flat on request), the camera and the data layers. Tools for
 * search and area selection plug in through the contract in
 * src/lib/map/map-contract.ts (`onReady`, `navigation`, `onMapClick`), without
 * editing this file.
 */
export function HotspotMap({
  area,
  frame,
  areaName,
  cells,
  scale,
  drawing,
  onDraw,
  sensors = ["MODIS", "VIIRS"],
  destination = null,
  reset = 0,
  projection,
  onProjectionChange,
  navigation = null,
  interactionMode,
  onMapClick,
  onReady,
  onViewChange,
  showProjectionToggle = true,
  status,
  onResetView,
  signals = NO_SIGNALS,
  onSignalSelect,
}: {
  /** The area of interest, outlined on the map. */
  area: AnalysisArea | null;
  /** The camera frames the area when this changes (a new selection, not an edit). */
  frame?: string | number | null;
  areaName: string;
  /** Detections per grid cell; null while they load. */
  cells: CellCount[] | null;
  /** Busiest cell per sensor to size the marks against; by default, the busiest of `cells`. */
  scale?: { modis: number; viirs: number };
  /** When true, dragging on the map draws a new area instead of panning. */
  drawing: boolean;
  onDraw: (bbox: BBox) => void;
  sensors?: Sensor[];
  destination?: MapDestination | null;
  reset?: number;
  /** Controlled projection. Leave undefined to let the map's own switch (and the saved choice) decide. */
  projection?: ProjectionMode;
  onProjectionChange?: (mode: ProjectionMode) => void;
  /** A camera move requested by a tool; a new `id` starts a new move. */
  navigation?: MapNavigationRequest | null;
  /** Alternative to `drawing`: "draw-rectangle" draws, "pick-administrative" shows a pointer for clicks. */
  interactionMode?: MapInteractionMode;
  /** Clicks on the map, with geography (null when off the Earth). */
  onMapClick?: MapClickHandler;
  /** Receives the map controller once the map has loaded. */
  onReady?: (controller: MapController) => void;
  /** Reproject external editing handles after map frames change. */
  onViewChange?: () => void;
  /** Shows the 3D globe / 2D map switch inside the map. */
  showProjectionToggle?: boolean;
  /** Live line shown at the foot of the map key (for example the detection count). */
  status?: ReactNode;
  /** Called when the person presses "Reset view" in the map controls. */
  onResetView?: () => void;
  signals?: FireflySignal[];
  onSignalSelect?: (area: AnalysisArea) => void;
}) {
  const { theme } = useTheme();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const control = useRef<EngineController | null>(null);
  const isDrawing = drawing || interactionMode === "draw-rectangle";
  const bbox = area?.bbox ?? null;
  const latest = useRef({
    cells,
    scale,
    area,
    onDraw,
    sensors,
    theme,
    onReady,
    onProjectionChange,
  });
  const appliedTheme = useRef(theme);
  const styled = useRef(false);
  const fellBack = useRef(false);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paintedTheme, setPaintedTheme] = useState<string | null>(null);
  const [mode, setMode] = useState<ProjectionMode>(
    projection ?? DEFAULT_PROJECTION,
  );
  const [globeUnavailable, setGlobeUnavailable] = useState(false);
  const signalMarkers = useSignalMarkers(map, ready, signals,
    isDrawing || interactionMode === "pick-administrative", onSignalSelect);

  useEffect(() => {
    latest.current = {
      cells,
      scale,
      area,
      onDraw,
      sensors,
      theme,
      onReady,
      onProjectionChange,
    };
  }, [cells, scale, area, onDraw, sensors, theme, onReady, onProjectionChange]);

  useEffect(() => {
    let dead = false;
    let created: MapLibreMap | undefined;

    // The style is fetched here rather than by MapLibre: a failed style request
    // inside MapLibre left the map stuck, unable to load the fallback.
    Promise.all([import("maplibre-gl"), loadBasemap()]).then(([maplibregl, base]) => {
      if (dead || !el.current) return;
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      let instance: MapLibreMap;
      const initial = projection ?? readProjection();
      try {
        appliedTheme.current = latest.current.theme;
        fellBack.current = !base;
        instance = makeMap(
          maplibregl,
          el.current,
          base ? basemapFor(base, latest.current.theme) : blankStyle(),
          initial,
        );
        instance.addControl(
          new maplibregl.AttributionControl({ compact: true, customAttribution: BASEMAP_ATTRIBUTION }),
          "bottom-right",
        );
      } catch {
        // No WebGL: the map cannot draw at all on this device.
        setFailed(true);
        return;
      }
      created = instance;
      map.current = instance;
      const controller = createController(instance, maplibregl.Point, initial, {
        onProjection(next, unavailable) {
          if (dead) return;
          setMode(next);
          if (unavailable) setGlobeUnavailable(true);
          latest.current.onProjectionChange?.(next);
        },
      });
      control.current = controller;

      const addLayers = () => {
        const m = instance;
        const colors = mapColors();
        if (m.getSource("hotspots")) return;
        m.addSource("area", {
          type: "geojson",
          data: areaFeature(latest.current.area),
        });
        m.addSource("draft", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        m.addSource("hotspots", {
          type: "geojson",
          data: points(latest.current.cells ?? [], latest.current.scale),
        });
        m.addSource("brazil", { type: "geojson", data: OUTLINE_URL });
        m.addLayer({
          id: "brazil",
          type: "line",
          source: "brazil",
          paint: {
            "line-color": colors.ink,
            "line-width": 0.8,
            "line-opacity": 0.35,
          },
        });
        m.addLayer({
          id: "area",
          type: "line",
          source: "area",
          paint: {
            "line-color": colors.area,
            "line-width": 1.5,
            "line-opacity": 0.8,
          },
        });
        m.addLayer({
          id: "draft",
          type: "line",
          source: "draft",
          paint: {
            "line-color": colors.ink,
            "line-width": 1.5,
            "line-dasharray": [2, 2],
          },
        });
        // One mark per grid cell, sized by its detections. MODIS: an open ring.
        // VIIRS: a solid dot, slightly smaller so it nests inside the ring.
        m.addLayer({
          id: "modis",
          type: "circle",
          source: "hotspots",
          filter: [">", ["get", "modis"], 0],
          layout: {
            visibility: latest.current.sensors.includes("MODIS")
              ? "visible"
              : "none",
          },
          paint: {
            // @ts-expect-error MapLibre accepts a zoom curve whose stops are data expressions.
            "circle-radius": cellRadius("km"),
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": colors.modis,
            "circle-stroke-width": 1.5,
          },
        });
        m.addLayer({
          id: "viirs",
          type: "circle",
          source: "hotspots",
          filter: [">", ["get", "viirs"], 0],
          layout: {
            visibility: latest.current.sensors.includes("VIIRS")
              ? "visible"
              : "none",
          },
          paint: {
            // @ts-expect-error MapLibre accepts a zoom curve whose stops are data expressions.
            "circle-radius": cellRadius("kv", 0.7),
            "circle-color": colors.viirs,
            "circle-opacity": 0.85,
            "circle-stroke-color": colors.stroke,
            "circle-stroke-width": 0.5,
          },
        });
        setReady(true);
      };

      // "style.load" fires for the basemap, again for the fallback style and on
      // every theme change. A new style starts flat and without our layers, so
      // projection, sky, data layers and the tools' layers are restored here.
      let announced = false;
      instance.on("style.load", () => {
        styled.current = true;
        setOffline(fellBack.current);
        addLayers();
        try {
          instance.setSky(
            skyFor(appliedTheme.current) as Parameters<
              MapLibreMap["setSky"]
            >[0],
          );
        } catch {
          // A style without sky support still draws; only the atmosphere is missing.
        }
        controller.styleLoaded();
        if (!announced) {
          announced = true;
          latest.current.onReady?.(controller);
        }
      });
      instance.on("idle", () => {
        if (!dead) setPaintedTheme(appliedTheme.current);
      });
      instance.on("error", (e) => {
        if (!dead) console.warn("FireFly Lens map:", e.error?.message ?? e);
        // The basemap style itself never arrived: fall back to a plain ground.
        if (styled.current || dead || fellBack.current) return;
        fellBack.current = true;
        setOffline(true);
        instance.setStyle(blankStyle());
      });
    });

    return () => {
      dead = true;
      map.current = null;
      control.current = null;
      created?.remove();
    };
    // The map is created once; later projection changes go through the controller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || appliedTheme.current === theme) return;
    appliedTheme.current = theme;
    styled.current = false;
    fellBack.current = false;
    control.current?.styleUnloading();
    // Only replace the style. style.load restores data and layer visibility; camera and handlers stay intact.
    loadBasemap().then((base) => {
      if (map.current !== m || appliedTheme.current !== theme) return;
      fellBack.current = !base;
      m.setStyle(base ? basemapFor(base, theme) : blankStyle(), { diff: false });
    });
  }, [theme]);

  useEffect(() => {
    if (!ready) return;
    (map.current?.getSource("area") as GeoJSONSource | undefined)?.setData(
      areaFeature(area),
    );
  }, [area, ready]);

  // Frame a new selection; reshaping the current one leaves the camera alone.
  const framed = useRef(bbox);
  useEffect(() => {
    framed.current = bbox;
  }, [bbox]);
  useEffect(() => {
    const box = framed.current;
    if (ready && frame != null && box)
      control.current?.navigate({
        id: `area-${frame}`,
        bounds: box,
        animation: "ease",
      });
  }, [frame, ready]);

  useEffect(() => {
    if (!ready) return;
    (map.current?.getSource("hotspots") as GeoJSONSource | undefined)?.setData(
      points(cells ?? [], scale),
    );
  }, [cells, scale, ready]);

  useEffect(() => {
    if (!ready) return;
    for (const sensor of ["MODIS", "VIIRS"] as Sensor[]) {
      if (!map.current?.getLayer(sensor.toLowerCase())) continue;
      map.current?.setLayoutProperty(
        sensor.toLowerCase(),
        "visibility",
        sensors.includes(sensor) ? "visible" : "none",
      );
    }
  }, [sensors, ready]);

  // A search result: fly there, framing its extent when it has one.
  useEffect(() => {
    if (!ready || !destination) return;
    control.current?.navigate({
      id: destination.id,
      center: destination.center,
      zoom: destination.zoom,
      bounds: destination.bounds,
      maxZoom: 12,
      animation: destination.animation ?? "fly",
    });
  }, [destination, ready]);

  // A camera move asked for by a tool through the contract.
  useEffect(() => {
    if (ready && navigation) control.current?.navigate(navigation);
  }, [navigation, ready]);

  useEffect(() => {
    if (ready && reset) control.current?.resetView();
  }, [reset, ready]);

  // Controlled projection: follow the prop when the parent owns the choice.
  useEffect(() => {
    if (ready && projection) control.current?.setProjection(projection);
  }, [projection, ready]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !onViewChange) return;
    m.on("render", onViewChange);
    onViewChange();
    return () => {
      m.off("render", onViewChange);
    };
  }, [ready, onViewChange]);

  // Clicks for tools such as an administrative picker.
  useEffect(() => {
    const c = control.current;
    if (!ready || !c || !onMapClick) return;
    return c.onPointer((e) => {
      if (e.type === "click") onMapClick(e);
    });
  }, [onMapClick, ready]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || isDrawing) return;
    m.getCanvas().style.cursor =
      interactionMode === "pick-administrative" ? "pointer" : "";
  }, [interactionMode, isDrawing, ready]);

  useEffect(() => {
    if (!ready || !el.current) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const m = map.current;
        // Resize preserves the camera; framing follows explicit selection/analysis.
        m?.resize();
      });
    });
    observer.observe(el.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ready]);

  // Drawing a new area: press, drag, release. The camera is locked meanwhile,
  // so the globe does not turn under the pointer; a press in space is ignored.
  useEffect(() => {
    const m = map.current;
    const c = control.current;
    if (!ready || !m || !c || !isDrawing) return;
    const draft = () => m.getSource("draft") as GeoJSONSource | undefined;
    let start: [number, number] | null = null;
    let box: BBox | null = null;
    m.stop();
    c.lockCamera(true);
    const zoomButtons = m
      .getContainer()
      .querySelectorAll<HTMLButtonElement>(
        ".maplibregl-ctrl-zoom-in, .maplibregl-ctrl-zoom-out",
      );
    zoomButtons.forEach((button) => {
      button.disabled = true;
    });
    m.getCanvas().style.cursor = "crosshair";

    const onEarth = (e: MapMouseEvent | MapTouchEvent) =>
      c.isOnSurface([e.point.x, e.point.y]);
    const down = (e: MapMouseEvent | MapTouchEvent) => {
      e.preventDefault();
      if (!onEarth(e)) return;
      start = [e.lngLat.lng, e.lngLat.lat];
      box = null;
    };
    const move = (e: MapMouseEvent | MapTouchEvent) => {
      // Past the globe's edge the last corner on the Earth stays.
      if (!start || !onEarth(e)) return;
      box = [start[0], start[1], e.lngLat.lng, e.lngLat.lat];
      draft()?.setData(outline(normalizeBBox(box)));
    };
    const up = () => {
      if (start && box) latest.current.onDraw(normalizeBBox(box));
      start = null;
      box = null;
      draft()?.setData({ type: "FeatureCollection", features: [] });
    };

    m.on("mousedown", down);
    m.on("mousemove", move);
    m.on("mouseup", up);
    m.on("touchstart", down);
    m.on("touchmove", move);
    m.on("touchend", up);
    const cancel = () => {
      start = null;
      box = null;
      draft()?.setData(outline(null));
    };
    m.getCanvas().addEventListener("mouseleave", cancel);
    m.getCanvas().addEventListener("touchcancel", cancel);
    return () => {
      m.off("mousedown", down);
      m.off("mousemove", move);
      m.off("mouseup", up);
      m.off("touchstart", down);
      m.off("touchmove", move);
      m.off("touchend", up);
      c.lockCamera(false);
      zoomButtons.forEach((button) => {
        button.disabled = false;
      });
      m.getCanvas().removeEventListener("mouseleave", cancel);
      m.getCanvas().removeEventListener("touchcancel", cancel);
      m.getCanvas().style.cursor = "";
      draft()?.setData({ type: "FeatureCollection", features: [] });
    };
  }, [isDrawing, ready]);

  return (
    <div
      className={`hotspot-map map-space relative h-full overflow-hidden ${isDrawing ? "ring-2 ring-[var(--color-selected)] ring-inset" : ""}`}
      data-map-theme={paintedTheme}
      data-projection={ready ? mode : undefined}
    >
      <Starfield />
      {/* MapLibre's stylesheet makes its container position: relative, so it fills a positioned parent. */}
      <div className="absolute inset-0">
        <div
          ref={el}
          className="size-full"
          role="application"
          aria-label={`Map of detections in ${areaName}`}
          data-tour="map-canvas"
        />
      </div>
      {!ready && !failed && (
        <p className="pointer-events-none absolute inset-0 grid place-items-center text-[0.9375rem] text-dim">
          Loading the map…
        </p>
      )}
      {failed && (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-[0.9375rem] text-dim">
          This browser cannot draw the map (WebGL is off). The calendar and the
          day&rsquo;s figures still work, and you can still set the area with
          coordinates.
        </p>
      )}
      {ready && isDrawing && (
        <p className="drawing-hint pointer-events-none absolute inset-x-0 top-16 mx-auto w-fit rounded-lg bg-lume px-3 py-2 text-[0.875rem] font-medium text-lume-ink">
          Drag to select · max 12° per side · Esc or Navigate to cancel
        </p>
      )}
      {ready && bbox && !isDrawing && cells?.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-4 mx-auto w-fit rounded-lg bg-night px-3 py-2 text-[0.875rem] text-dim">
          No detections in the selected area and period.
        </p>
      )}
      {/* The map key: what the marks mean, and what is on screen now. */}
      <section className="map-key map-surface" aria-label="Map key">
        <ul className="map-key-rows">
          <li>
            <span aria-hidden="true" className="sensor-ring" />
            MODIS Aqua <span className="text-faint">· per 0.25° cell</span>
          </li>
          <li>
            <span aria-hidden="true" className="sensor-dot" />
            VIIRS NOAA-20 <span className="text-faint">· per cell</span>
          </li>
          <li>
            <span aria-hidden="true" className="map-key-area" />
            Area of interest
          </li>
        </ul>
        {status && <div className="map-key-status">{status}</div>}
        {offline && (
          <p className="map-key-note">Basemap unavailable offline</p>
        )}
        {globeUnavailable && (
          <p className="map-key-note">Globe unavailable here: flat map shown</p>
        )}
      </section>
      {signalMarkers}
      {/* One column of view controls: projection, zoom, reset. */}
      {ready && (
        <div data-tour="map-controls" className="map-view-controls">
          {showProjectionToggle && !projection && (
            <ProjectionToggle
              value={mode}
              disabled={globeUnavailable}
              onChange={(next) => control.current?.setProjection(next)}
            />
          )}
          <div className="map-zoom map-surface" role="group" aria-label="Zoom">
            <button type="button" aria-label="Zoom in" title="Zoom in" disabled={isDrawing} onClick={() => map.current?.zoomIn()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <button type="button" aria-label="Zoom out" title="Zoom out" disabled={isDrawing} onClick={() => map.current?.zoomOut()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
            </button>
            <button
              type="button"
              aria-label="Reset view"
              title="Reset view"
              onClick={() => {
                onResetView?.();
                control.current?.resetView();
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
