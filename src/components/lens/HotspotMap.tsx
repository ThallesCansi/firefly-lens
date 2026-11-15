"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import type { UnusualMonth } from "@/lib/unusual";
import { cellIdAt, cellRing, placeReadout } from "@/lib/map/readout";
import { DEFAULT_CAMERA_PROFILE, HOME } from "@/lib/map/camera";
import { presetRequest, type CameraAction } from "@/lib/map/camera-presets";
import { fireData } from "@/lib/data/source";
import { MapDisclosure } from "./MapDisclosure";
import { CameraControls } from "./map/CameraControls";
import { addCoverageMask,continentCenter,MIN_CONTINENT_ZOOM } from "@/lib/map/south-america";
import { GLOW, glowAt } from "@/lib/map/glow";
import {
  COLUMN_MOTION_MS,
  createColumnMotion,
  type ColumnMotion,
} from "@/lib/map/column-motion";
import { COLUMN_HEIGHT, COLUMN_OPACITY, columnTop, columns } from "@/lib/map/columns";
import {
  createController,
  cameraPadding,
  prefersReducedMotion,
  type EngineController,
} from "@/lib/map/controller";
import type {
  MapClickHandler,
  MapController,
  MapInteractionMode,
  MapNavigationRequest,
  ProjectionMode,
  CameraProfile,
} from "@/lib/map/map-contract";
import {
  DEFAULT_PROJECTION,
  readProjection,
  skyFor,
} from "@/lib/map/projection";
import type { MapDestination } from "./LocationSearch";
import { CellReadout } from "./map/CellReadout";
import { ProjectionToggle } from "./map/ProjectionToggle";
import { Starfield } from "./Starfield";
import { useTheme } from "@/components/ui/ThemeProvider";
import {
  BASEMAP_ATTRIBUTION,
  DEFAULT_BASEMAP,
  IMAGERY_LAYER,
  basemapFor,
  loadBasemap,
  readBasemap,
  saveBasemap,
  type BasemapKind,
} from "@/lib/map/basemap";
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
    lume: read("--color-lume"),
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

/** Centres of the unusually high cells among those on the map. */
function glowPoints(cells: CellCount[], unusual: UnusualMonth | null) {
  return {
    type: "FeatureCollection" as const,
    features: unusual
      ? cells
          .filter((c) => unusual.ids.has(c.id))
          .map((c) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [c.lon, c.lat] },
            properties: {},
          }))
      : [],
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
    minZoom: MIN_CONTINENT_ZOOM,
    transformCameraUpdate: (next) => {
      const [lng,lat]=continentCenter(next.center.lng,next.center.lat);
      return lng===next.center.lng && lat===next.center.lat ? {} : {center:new lib.LngLat(lng,lat)};
    },
    attributionControl: false,
    cooperativeGestures: false,
    renderWorldCopies: false,
    // The globe turns by dragging. Tilting and spinning the north away only
    // help with the 3D columns, so the controller switches them on with that view.
    dragRotate: false,
  });
}

/** Shows each sensor's flat mark or its column, never both. */
function showMarks(m: MapLibreMap, sensors: Sensor[], inColumns: boolean) {
  for (const sensor of ["MODIS", "VIIRS"] as Sensor[]) {
    const id = sensor.toLowerCase();
    const on = sensors.includes(sensor);
    const set = (layer: string, visible: boolean) => {
      if (m.getLayer(layer))
        m.setLayoutProperty(layer, "visibility", visible ? "visible" : "none");
    };
    set(id, on && !inColumns);
    set(`${id}-columns`, on && inColumns);
  }
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
  unusual = null,
  unusualMonth,
  harmonized,
  forceColumns = false,
  columnsChosen: controlledColumns,
  onColumnsChange,
  tourActive = false,
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
  onReady?: (controller: MapController | null) => void;
  /** Reproject external editing handles after map frames change. */
  onViewChange?: () => void;
  /** Shows the 3D globe / 2D map switch inside the map. */
  showProjectionToggle?: boolean;
  /** Live line shown at the foot of the map key (for example the detection count). */
  status?: ReactNode;
  /** Called when the person presses "Reset view" in the map controls. */
  onResetView?: () => void;
  /** Cells that burn unusually in the month shown; null when no month is judged. */
  unusual?: UnusualMonth | null;
  /** Name of that calendar month, for the key. */
  unusualMonth?: string;
  /** VIIRS on the MODIS Aqua scale for a cell in the month shown; absent when no month is shown. */
  harmonized?: (cellId: number) => number | null;
  /** Holds the 3D columns on, for a guided flight; the switch is then disabled. */
  forceColumns?: boolean;
  columnsChosen?: boolean;
  onColumnsChange?: (on: boolean) => void;
  tourActive?: boolean;
  signals?: FireflySignal[];
  onSignalSelect?: (area: AnalysisArea) => void;
}) {
  const { theme } = useTheme();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const control = useRef<EngineController | null>(null);
  const motion = useRef<ColumnMotion | null>(null);
  const isDrawing = drawing || interactionMode === "draw-rectangle";
  const bbox = area?.bbox ?? null;
  const hasArea = area !== null;
  const latest = useRef({
    cells,
    scale,
    area,
    onDraw,
    sensors,
    theme,
    tourActive,
    cameraProfile: DEFAULT_CAMERA_PROFILE,
    onReady,
    onProjectionChange,
    inColumns: false,
    basemap: DEFAULT_BASEMAP as BasemapKind,
    unusual,
    showUnusual: true,
    drawn: cells,
    drawnScale: scale,
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
  /** The 3D view: detections as columns, seen from a tilted camera. */
  const [localColumns, setLocalColumns] = useState(true);
  const columnsChosen = controlledColumns ?? localColumns;
  const setInColumns = (on: boolean) => { setLocalColumns(on); onColumnsChange?.(on); };
  const [cameraProfile, setCameraProfile] = useState<CameraProfile>(DEFAULT_CAMERA_PROFILE);
  const [cameraMoving, setCameraMoving] = useState(false);
  // A regional flight shows every stop in 3D, whatever was chosen before it.
  const inColumns = forceColumns || columnsChosen;
  /** NASA's satellite picture under the data, or the drawn map alone. */
  const [basemap, setBasemap] = useState<BasemapKind>(DEFAULT_BASEMAP);
  /** The glow under unusually high cells; the key switches it off. */
  const [showUnusual, setShowUnusual] = useState(true);
  /** The cell under the pointer, whose numbers the readout shows. */
  const [hovered, setHovered] = useState<CellCount | null>(null);
  /**
   * The sensor lens: VIIRS drawn as recorded, or as the model converts it to
   * the MODIS Aqua scale. Only a month from April 2018 has converted values.
   */
  const [lens, setLens] = useState<"recorded" | "harmonized">("recorded");
  const converted = lens === "harmonized" && !!harmonized;
  const drawn = useMemo(
    () =>
      converted && cells
        ? cells.map((c) => ({ ...c, viirs: harmonized(c.id) ?? 0 }))
        : cells,
    [cells, converted, harmonized],
  );
  // Converted VIIRS lives on the MODIS scale, so a time-lapse measures it against the MODIS peak.
  const drawnScale = useMemo(
    () => (converted && scale ? { modis: scale.modis, viirs: scale.modis } : scale),
    [converted, scale],
  );
  const readout = useRef<HTMLDivElement>(null);
  const pointer = useRef<[number, number]>([0, 0]);
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
      tourActive,
      cameraProfile,
      onReady,
      onProjectionChange,
      inColumns,
      basemap,
      unusual,
      showUnusual,
      drawn,
      drawnScale,
    };
  }, [
    drawn,
    drawnScale,
    cells,
    scale,
    area,
    onDraw,
    sensors,
    theme,
    tourActive,
    cameraProfile,
    onReady,
    onProjectionChange,
    inColumns,
    basemap,
    unusual,
    showUnusual,
  ]);

  useEffect(() => {
    let dead = false;
    let created: MapLibreMap | undefined;

    // The style is fetched here rather than by MapLibre: a failed style request
    // inside MapLibre left the map stuck, unable to load the fallback.
    Promise.all([import("maplibre-gl"), loadBasemap()]).then(([maplibregl, base]) => {
      if (dead || !el.current) return;
      // React may retain local state while tearing down effects on route exit.
      setReady(false);
      setCameraMoving(false);
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      let instance: MapLibreMap;
      const initial = projection ?? readProjection();
      const kind = readBasemap();
      latest.current.basemap = kind;
      setBasemap(kind);
      try {
        appliedTheme.current = latest.current.theme;
        fellBack.current = !base;
        instance = makeMap(
          maplibregl,
          el.current,
          base ? basemapFor(base, latest.current.theme, kind) : blankStyle(),
          initial,
        );
        instance.touchPitch.disable();
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
      const columnMotion = createColumnMotion(() => (dead ? null : instance), "columns");
      motion.current = columnMotion;
      const controller = createController(instance, maplibregl.Point, initial, {
        onFlightChange(running) { if (!dead) setCameraMoving(running); },
        onProjection(next, unavailable) {
          if (dead) return;
          setMode(next);
          if (unavailable) setGlobeUnavailable(true);
          latest.current.onProjectionChange?.(next);
        },
      });
      controller.setCameraProfile(latest.current.cameraProfile);
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
          data: points(latest.current.drawn ?? [], latest.current.drawnScale),
        });
        m.addSource("columns", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        m.addSource("unusual", {
          type: "geojson",
          data: glowPoints(
            latest.current.cells ?? [],
            latest.current.showUnusual ? latest.current.unusual : null,
          ),
        });
        m.addSource("cell-hover", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
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
        // A soft glow on the ground under each unusually high cell, a little
        // wider than the cell so neighbours merge into one lit region. It lies
        // flat in the tilted view, around the foot of the columns.
        m.addLayer({
          id: "unusual",
          type: "circle",
          source: "unusual",
          paint: {
            "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 3, 1.8, 11, 460],
            "circle-color": colors.lume,
            "circle-blur": 0.65,
            "circle-opacity": GLOW.rest,
            "circle-opacity-transition": { duration: 0 },
            "circle-pitch-alignment": "map",
            "circle-pitch-scale": "map",
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
        // The cell the readout describes, outlined on the ground.
        m.addLayer({
          id: "cell-hover",
          type: "line",
          source: "cell-hover",
          paint: { "line-color": colors.ink, "line-width": 1.5 },
        });
        // The 3D view of the same counts: one column per cell and sensor.
        for (const sensor of ["MODIS", "VIIRS"] as Sensor[]) {
          const id = sensor.toLowerCase() as "modis" | "viirs";
          m.addLayer({
            id: `${id}-columns`,
            type: "fill-extrusion",
            source: "columns",
            filter: ["==", ["get", "sensor"], sensor],
            layout: { visibility: "none" },
            paint: {
              "fill-extrusion-color": colors[id],
              // @ts-expect-error MapLibre accepts a zoom curve whose stops are data expressions.
              "fill-extrusion-height": COLUMN_HEIGHT,
              "fill-extrusion-opacity": COLUMN_OPACITY,
            },
          });
        }
        // A new style has a new, empty source: the columns go back in at once.
        columnMotion.reset();
        if (latest.current.inColumns)
          columnMotion.show(
            columns(latest.current.drawn ?? [], latest.current.sensors, latest.current.drawnScale),
            0,
          );
        showMarks(m, latest.current.sensors, latest.current.inColumns);
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
        addCoverageMask(instance, appliedTheme.current);
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
      instance.on("moveend", () => {
        const center=instance.getCenter();
        if (el.current) el.current.dataset.cameraCenter=`${center.lng.toFixed(5)},${center.lat.toFixed(5)}`;
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
      motion.current?.stop();
      motion.current = null;
      // Next may preserve the workspace state across client navigation while
      // destroying its effects. Never rebind tools to that removed engine.
      latest.current.onReady?.(null);
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
      m.setStyle(
        base ? basemapFor(base, theme, latest.current.basemap) : blankStyle(),
        { diff: false },
      );
    });
  }, [theme]);

  useEffect(() => {
    if (!ready) return;
    (map.current?.getSource("area") as GeoJSONSource | undefined)?.setData(
      areaFeature(area),
    );
  }, [area, ready]);

  // Frame a new selection; reshaping the current one leaves the camera alone.
  useEffect(() => { control.current?.setTutorialActive(tourActive); }, [tourActive, ready]);
  useEffect(() => { control.current?.setCameraProfile(cameraProfile); }, [cameraProfile, ready]);
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
        source: latest.current.tourActive ? "tutorial" : "user",
      });
  }, [frame, ready]);

  useEffect(() => {
    if (!ready) return;
    (map.current?.getSource("hotspots") as GeoJSONSource | undefined)?.setData(
      points(drawn ?? [], drawnScale),
    );
  }, [drawn, drawnScale, ready]);

  // The columns are built only while the 3D view is on. A change of month,
  // sensor or time-lapse frame moves each column to its new height instead of
  // swapping the picture; leaving the view clears them at once.
  useEffect(() => {
    if (!ready) return;
    motion.current?.show(
      inColumns ? columns(drawn ?? [], sensors, drawnScale) : [],
      inColumns && !prefersReducedMotion() ? COLUMN_MOTION_MS : 0,
    );
  }, [drawn, drawnScale, sensors, inColumns, ready]);

  useEffect(() => {
    if (ready && map.current) showMarks(map.current, sensors, inColumns);
  }, [sensors, inColumns, ready]);

  useEffect(() => {
    // Columns stand on an area of interest: without one there is nothing to lean over.
    if (ready) control.current?.setTilt(inColumns && (forceColumns || hasArea));
  }, [inColumns, forceColumns, hasArea, ready]);

  const glowing = showUnusual && !!unusual && unusual.ids.size > 0;
  useEffect(() => {
    if (!ready) return;
    (map.current?.getSource("unusual") as GeoJSONSource | undefined)?.setData(
      glowPoints(cells ?? [], showUnusual ? unusual : null),
    );
  }, [cells, unusual, showUnusual, ready]);

  // The glow breathes only while there is something to light, repaints about
  // 22 times a second, and stays steady when motion is reduced. The browser
  // stops these frames by itself in a hidden tab.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !glowing || prefersReducedMotion()) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < GLOW.step) return;
      last = now;
      if (m.getLayer("unusual"))
        m.setPaintProperty("unusual", "circle-opacity", glowAt(now));
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      if (map.current === m && m.getLayer("unusual"))
        m.setPaintProperty("unusual", "circle-opacity", GLOW.rest);
    };
  }, [glowing, ready]);

  // The readout: the cell under the pointer, found on the columns in the 3D
  // view (a tall column covers the ground behind it) and on the ground
  // otherwise. The card follows the pointer without a React render; only a
  // change of cell renders. A tap does the same on a touch screen.
  useEffect(() => {
    const m = map.current;
    const c = control.current;
    if (!ready || !m || !c || isDrawing) return;
    const byId = new Map((cells ?? []).map((cell) => [cell.id, cell]));
    let current: number | null = null;
    let frame = 0;
    const place = () => {
      const el = readout.current;
      if (!el) return;
      const { clientWidth: width, clientHeight: height } = m.getContainer();
      const [left, top] = placeReadout(
        pointer.current,
        { width: el.offsetWidth, height: el.offsetHeight },
        { width, height },
      );
      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    };
    const clear = () => {
      cancelAnimationFrame(frame);
      if (current === null) return;
      current = null;
      setHovered(null);
    };
    const find = (e: MapMouseEvent): CellCount | undefined => {
      if (!c.isOnSurface([e.point.x, e.point.y])) return undefined;
      const layers = ["modis-columns", "viirs-columns"].filter(
        (id) => m.getLayer(id) && m.getLayoutProperty(id, "visibility") !== "none",
      );
      const column = layers.length
        ? m.queryRenderedFeatures(e.point, { layers })[0]
        : undefined;
      return typeof column?.id === "number"
        ? byId.get(Math.floor(column.id / 2))
        : byId.get(cellIdAt(e.lngLat.lng, e.lngLat.lat));
    };
    const show = (e: MapMouseEvent) => {
      // While a button is down the map is being dragged, not read.
      if (e.type === "mousemove" && e.originalEvent.buttons !== 0) return clear();
      pointer.current = [e.point.x, e.point.y];
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const cell = find(e);
        if (!cell) return clear();
        if (cell.id !== current) {
          current = cell.id;
          setHovered(cell);
        }
        place();
      });
    };
    m.on("mousemove", show);
    m.on("click", show);
    m.on("mouseout", clear);
    m.on("movestart", clear);
    return () => {
      m.off("mousemove", show);
      m.off("click", show);
      m.off("mouseout", clear);
      m.off("movestart", clear);
      cancelAnimationFrame(frame);
      setHovered(null);
    };
  }, [cells, isDrawing, ready]);

  // Outline the cell being read, and put the card in place when it first appears.
  useEffect(() => {
    if (!ready) return;
    (map.current?.getSource("cell-hover") as GeoJSONSource | undefined)?.setData(
      hovered
        ? {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: cellRing(hovered.lon, hovered.lat),
            },
          }
        : { type: "FeatureCollection", features: [] },
    );
    const el = readout.current;
    const container = map.current?.getContainer();
    if (!hovered || !el || !container) return;
    const [left, top] = placeReadout(
      pointer.current,
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: container.clientWidth, height: container.clientHeight },
    );
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }, [hovered, ready]);

  // The satellite picture is a layer of the basemap: shown or hidden in place.
  useEffect(() => {
    const m = map.current;
    if (ready && m?.getLayer(IMAGERY_LAYER))
      m.setLayoutProperty(
        IMAGERY_LAYER,
        "visibility",
        basemap === "satellite" ? "visible" : "none",
      );
  }, [basemap, ready]);

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
        m?.resize();
        // An area framed before the map changed size is framed again in the new space.
        control.current?.refit();
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

  const cameraAction = (action: CameraAction) => {
    const c = control.current;
    const container = el.current;
    const pantanal = fireData.presets().find((p) => p.id === "pantanal");
    if (!c || !container || !pantanal || tourActive || isDrawing) return;
    if (action === "earth") c.setProjection("globe");
    const padding = map.current ? cameraPadding(map.current) : { left: 24, right: 24, top: 70, bottom: 70 };
    const request = presetRequest(action, c.getCameraPose(), container.clientWidth - padding.left - padding.right,
      container.clientHeight - padding.top - padding.bottom, pantanal.bbox, bbox);
    if (request && action === "earth") request.padding = padding;
    if (request) c.navigate(request);
  };

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
      {/* Follows the pointer, so it is moved by the map's own events, not by React. */}
      {hovered && (
        <div ref={readout} className="cell-readout map-surface" aria-hidden="true">
          <CellReadout
            cell={hovered}
            harmonized={harmonized?.(hovered.id)}
            unusual={
              unusual?.ids.has(hovered.id)
                ? unusual.modeled
                  ? "likely"
                  : "observed"
                : null
            }
            month={unusualMonth}
          />
        </div>
      )}
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
      <MapDisclosure kind="map-key" summary="Legend" aria-label="Map key">
        <ul className="map-key-rows">
          <li>
            <span
              aria-hidden="true"
              className={inColumns ? "sensor-column sensor-column-modis" : "sensor-ring"}
            />
            MODIS Aqua <span className="text-faint">· per 0.25° cell</span>
          </li>
          <li>
            <span
              aria-hidden="true"
              className={inColumns ? "sensor-column sensor-column-viirs" : "sensor-dot"}
            />
            VIIRS NOAA-20{" "}
            <span className="text-faint">
              · {converted ? "MODIS scale" : "per cell"}
            </span>
          </li>
          {harmonized && (
            <li>
              <div className="map-key-lens" role="group" aria-label="How VIIRS is drawn">
                <button
                  type="button"
                  aria-pressed={lens === "recorded"}
                  title="VIIRS detections as the sensor recorded them"
                  onClick={() => setLens("recorded")}
                >
                  As recorded
                </button>
                <button
                  type="button"
                  aria-pressed={lens === "harmonized"}
                  title="VIIRS converted by the model to the MODIS Aqua scale"
                  onClick={() => setLens("harmonized")}
                >
                  MODIS scale
                </button>
              </div>
            </li>
          )}
          {unusual && (
            <li>
              <button
                type="button"
                className="map-key-toggle"
                aria-pressed={showUnusual}
                title={showUnusual ? "Hide the glow" : "Show the glow"}
                onClick={() => setShowUnusual((on) => !on)}
              >
                <span aria-hidden="true" className="unusual-glow" />
                Unusually high <span className="text-faint">· for the month</span>
              </button>
            </li>
          )}
          <li>
            <span aria-hidden="true" className="map-key-area" />
            Area of interest
          </li>
        </ul>
        {unusual && showUnusual && (
          <p className="map-key-note map-key-detail">
            {unusual.modeled ? "Modeled: about " : ""}
            <span className="text-ink">
              {Math.round(unusual.count).toLocaleString("en-GB")}
            </span>{" "}
            {Math.round(unusual.count) === 1 ? "cell" : "cells"} above 9 in 10
            other years
            {unusual.modeled
              ? `, ${unusual.ids.size.toLocaleString("en-GB")} of them likely (glowing)`
              : ""}
            ; typical {unusualMonth ?? "month"}:{" "}
            {Math.round(unusual.typical).toLocaleString("en-GB")}.{" "}
            <Link href="/method#unusual-cells" className="link">
              Method
            </Link>
          </p>
        )}
        {inColumns && (
          <p className="map-key-note map-key-detail">
            Height = detections, one scale for both sensors; tallest:{" "}
            <span className="text-ink">
              {Math.round(columnTop(drawn ?? [], sensors, drawnScale)).toLocaleString("en-GB")}
            </span>
            {scale ? " (time-lapse peak)" : ""}. Right-drag to orbit.
          </p>
        )}
        {status && <div className="map-key-status">{status}</div>}
        <p className="map-key-note">South America coverage · shaded elsewhere</p>
        {offline && (
          <p className="map-key-note">Basemap unavailable offline</p>
        )}
        {globeUnavailable && (
          <p className="map-key-note">Globe unavailable here: flat map shown</p>
        )}
      </MapDisclosure>
      {signalMarkers}
      {/* One column of view controls: projection, zoom, reset. */}
      {ready && (
        <div data-tour="map-controls" className="map-view-controls">
          <CameraControls profile={cameraProfile} onProfile={(next) => { control.current?.setCameraProfile(next); setCameraProfile(next); }} onAction={cameraAction}
            onStop={() => control.current?.stopNavigation()} running={cameraMoving} disabled={isDrawing || tourActive}
            hasSelection={!!bbox} globeAvailable={!globeUnavailable && (!projection || projection === "globe")} />
          {showProjectionToggle && !projection && (
            <ProjectionToggle
              value={mode}
              disabled={globeUnavailable}
              onChange={(next) => control.current?.setProjection(next)}
            />
          )}
          <div className="map-projection map-style-controls map-surface">
            <button
              type="button"
              aria-pressed={basemap === "satellite"}
              aria-label="Satellite imagery"
              title={
                basemap === "satellite"
                  ? "Back to the drawn map"
                  : "Show NASA Blue Marble satellite imagery"
              }
              disabled={offline}
              onClick={() => {
                const next = basemap === "satellite" ? "map" : "satellite";
                saveBasemap(next);
                setBasemap(next);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5" /></svg>
            </button>
            <button
              type="button"
              aria-pressed={inColumns}
              aria-label="3D columns"
              title={inColumns ? "Back to the flat marks" : "Show detections as 3D columns"}
              disabled={forceColumns}
              onClick={() => setInColumns(!columnsChosen)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 20v-6M10 20V9M15 20v-9M20 20V4" /></svg>
            </button>
          </div>
          <div className="map-zoom map-surface" role="group" aria-label="Zoom">
            <button type="button" aria-label="Zoom in" title="Zoom in" disabled={isDrawing} onClick={() => { control.current?.stopNavigation(); map.current?.zoomIn(); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <button type="button" aria-label="Zoom out" title="Zoom out" disabled={isDrawing} onClick={() => { control.current?.stopNavigation(); map.current?.zoomOut(); }}>
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
