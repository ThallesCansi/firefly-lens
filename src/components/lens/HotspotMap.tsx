"use client";

import { useEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
  MapTouchEvent,
  StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { CellCount } from "@/lib/data/area";
import { normalizeBBox, type BBox, type Sensor } from "@/lib/data/types";
import type { MapDestination } from "./LocationSearch";

const BASEMAP =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function fitPadding(map: MapLibreMap) {
  const { clientHeight: h, clientWidth: w } = map.getContainer();
  return {
    top: Math.min(90, h * 0.15),
    bottom: Math.min(160, h * 0.25),
    left: Math.min(90, w * 0.2),
    right: Math.min(60, w * 0.12),
  };
}

/** Used when the basemap cannot be reached, so the detections still draw. */
const BLANK: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "ground",
      type: "background",
      paint: { "background-color": "#121713" },
    },
  ],
};

/**
 * One feature per 0.25° grid cell. `km` and `kv` size the MODIS ring and the
 * VIIRS dot against the busiest cell of the period, per sensor.
 */
function points(cells: CellCount[]) {
  const topM = Math.max(1, ...cells.map((c) => c.modis));
  const topV = Math.max(1, ...cells.map((c) => c.viirs));
  const k = (n: number, top: number) => (n > 0 ? Math.max(0.3, Math.sqrt(n / top)) : 0);
  return {
    type: "FeatureCollection" as const,
    features: cells.map((c) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [c.lon, c.lat] },
      properties: { modis: c.modis, viirs: c.viirs, km: k(c.modis, topM), kv: k(c.viirs, topV) },
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
): MapLibreMap {
  return new lib.Map({
    container,
    style: BASEMAP,
    center: [-53, -14],
    zoom: 3,
    attributionControl: false,
    cooperativeGestures: false,
    renderWorldCopies: false,
    dragRotate: false,
    pitchWithRotate: false,
  });
}

export function HotspotMap({
  bbox,
  areaName,
  cells,
  drawing,
  onDraw,
  sensors = ["MODIS", "VIIRS"],
  destination = null,
  reset = 0,
}: {
  bbox: BBox | null;
  areaName: string;
  /** Detections per grid cell; null while they load. */
  cells: CellCount[] | null;
  /** When true, dragging on the map draws a new area instead of panning. */
  drawing: boolean;
  onDraw: (bbox: BBox) => void;
  sensors?: Sensor[];
  destination?: MapDestination | null;
  reset?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const latest = useRef({ cells, bbox, onDraw });
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    latest.current = { cells, bbox, onDraw };
  }, [cells, bbox, onDraw]);

  useEffect(() => {
    let dead = false;
    let created: MapLibreMap | undefined;
    let fellBack = false;

    import("maplibre-gl").then((maplibregl) => {
      if (dead || !el.current) return;
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      let instance: MapLibreMap;
      try {
        instance = makeMap(maplibregl, el.current);
        instance.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "bottom-right",
        );
        instance.addControl(
          new maplibregl.AttributionControl({ compact: true }),
          "bottom-right",
        );
      } catch {
        // No WebGL: the map cannot draw at all on this device.
        setFailed(true);
        return;
      }
      created = instance;
      map.current = instance;

      const addLayers = () => {
        const m = instance;
        if (m.getSource("hotspots")) return;
        m.addSource("area", {
          type: "geojson",
          data: outline(latest.current.bbox),
        });
        m.addSource("draft", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        m.addSource("hotspots", {
          type: "geojson",
          data: points(latest.current.cells ?? []),
        });
        m.addSource("brazil", { type: "geojson", data: OUTLINE_URL });
        m.addLayer({
          id: "brazil",
          type: "line",
          source: "brazil",
          paint: { "line-color": "#eef0e6", "line-width": 0.8, "line-opacity": 0.35 },
        });
        m.addLayer({
          id: "area",
          type: "line",
          source: "area",
          paint: {
            "line-color": "#d8f24e",
            "line-width": 1.5,
            "line-opacity": 0.8,
          },
        });
        m.addLayer({
          id: "draft",
          type: "line",
          source: "draft",
          paint: {
            "line-color": "#eef0e6",
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
          paint: {
            // @ts-expect-error MapLibre accepts a zoom curve whose stops are data expressions.
            "circle-radius": cellRadius("km"),
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": "#3f8fe6",
            "circle-stroke-width": 1.5,
          },
        });
        m.addLayer({
          id: "viirs",
          type: "circle",
          source: "hotspots",
          filter: [">", ["get", "viirs"], 0],
          paint: {
            // @ts-expect-error MapLibre accepts a zoom curve whose stops are data expressions.
            "circle-radius": cellRadius("kv", 0.7),
            "circle-color": "#d9569a",
            "circle-opacity": 0.85,
            "circle-stroke-color": "#0b0e0c",
            "circle-stroke-width": 0.5,
          },
        });
        setReady(true);
      };

      // "style.load" fires for the basemap and again for the fallback style.
      let styled = false;
      instance.on("style.load", () => {
        styled = true;
        addLayers();
      });
      instance.on("error", (e) => {
        if (!dead) console.warn("FireFly Lens map:", e.error?.message ?? e);
        // The basemap style itself never arrived: fall back to a plain ground.
        if (styled || dead || fellBack) return;
        fellBack = true;
        setOffline(true);
        instance.setStyle(BLANK);
      });
    });

    return () => {
      dead = true;
      map.current = null;
      created?.remove();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    (map.current?.getSource("area") as GeoJSONSource | undefined)?.setData(
      outline(bbox),
    );
    if (bbox && map.current)
      map.current.fitBounds(bbox, {
        padding: fitPadding(map.current),
        duration: 600,
      });
  }, [bbox, ready]);

  useEffect(() => {
    if (!ready) return;
    (map.current?.getSource("hotspots") as GeoJSONSource | undefined)?.setData(
      points(cells ?? []),
    );
  }, [cells, ready]);

  useEffect(() => {
    if (!ready) return;
    for (const sensor of ["MODIS", "VIIRS"] as Sensor[]) {
      map.current?.setLayoutProperty(
        sensor.toLowerCase(),
        "visibility",
        sensors.includes(sensor) ? "visible" : "none",
      );
    }
  }, [sensors, ready]);

  useEffect(() => {
    if (!ready || !destination || !map.current) return;
    if (destination.bounds) {
      map.current.fitBounds(destination.bounds, {
        padding: fitPadding(map.current), duration: 1000, maxZoom: 12,
      });
    } else {
      map.current.flyTo({
        center: destination.center,
        zoom: destination.zoom,
        duration: 1000,
      });
    }
  }, [destination, ready]);

  useEffect(() => {
    if (ready && reset)
      map.current?.flyTo({ center: [-53, -14], zoom: 3, duration: 800 });
  }, [reset, ready]);

  useEffect(() => {
    if (!ready || !el.current) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const m = map.current;
        m?.resize();
        const box = latest.current.bbox;
        if (box && m) m.fitBounds(box, { padding: fitPadding(m), duration: 0 });
      });
    });
    observer.observe(el.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ready]);

  // Drawing a new area: press, drag, release.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !drawing) return;
    const draft = m.getSource("draft") as GeoJSONSource | undefined;
    let start: [number, number] | null = null;
    let box: BBox | null = null;
    m.dragPan.disable();
    m.scrollZoom.disable();
    m.boxZoom.disable();
    m.doubleClickZoom.disable();
    m.touchZoomRotate.disable();
    m.keyboard.disable();
    const zoomButtons = m
      .getContainer()
      .querySelectorAll<HTMLButtonElement>(
        ".maplibregl-ctrl-zoom-in, .maplibregl-ctrl-zoom-out",
      );
    zoomButtons.forEach((button) => {
      button.disabled = true;
    });
    m.getCanvas().style.cursor = "crosshair";

    const down = (e: MapMouseEvent | MapTouchEvent) => {
      e.preventDefault();
      start = [e.lngLat.lng, e.lngLat.lat];
      box = null;
    };
    const move = (e: MapMouseEvent | MapTouchEvent) => {
      if (!start) return;
      box = [start[0], start[1], e.lngLat.lng, e.lngLat.lat];
      draft?.setData(outline(normalizeBBox(box)));
    };
    const up = () => {
      if (start && box) latest.current.onDraw(normalizeBBox(box));
      start = null;
      box = null;
      draft?.setData({ type: "FeatureCollection", features: [] });
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
      draft?.setData(outline(null));
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
      m.dragPan.enable();
      m.scrollZoom.enable();
      m.boxZoom.enable();
      m.doubleClickZoom.enable();
      m.touchZoomRotate.enable();
      m.keyboard.enable();
      zoomButtons.forEach((button) => {
        button.disabled = false;
      });
      m.getCanvas().removeEventListener("mouseleave", cancel);
      m.getCanvas().removeEventListener("touchcancel", cancel);
      m.getCanvas().style.cursor = "";
      draft?.setData({ type: "FeatureCollection", features: [] });
    };
  }, [drawing, ready]);

  return (
    <div
      className={`hotspot-map relative h-full overflow-hidden bg-canopy ${drawing ? "ring-2 ring-lume" : ""}`}
    >
      {/* MapLibre's stylesheet makes its container position: relative, so it fills a positioned parent. */}
      <div className="absolute inset-0">
        <div
          ref={el}
          className="size-full"
          role="application"
          aria-label={`Map of detections in ${areaName}`}
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
      {ready && drawing && (
        <p className="drawing-hint pointer-events-none absolute inset-x-0 top-16 mx-auto w-fit rounded-lg bg-lume px-3 py-2 text-[0.875rem] font-medium text-lume-ink">
          Drag to select · max 12° per side · Esc or Navigate to cancel
        </p>
      )}
      {ready && bbox && !drawing && cells?.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-4 mx-auto w-fit rounded-lg bg-night px-3 py-2 text-[0.875rem] text-dim">
          No detections in the selected area and period.
        </p>
      )}
      <div className="map-legend pointer-events-none absolute bottom-8 left-3 flex flex-col gap-1.5 rounded-lg bg-night/90 px-3 py-2 text-[0.8125rem] text-dim">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="block size-3 rounded-full border-[1.5px] border-modis"
          />
          MODIS Aqua, detections per 0.25° cell
        </span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="mx-[3px] block size-1.5 rounded-full bg-viirs"
          />
          VIIRS NOAA-20, detections per cell
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-px w-3 bg-lume" />
          Area of interest
        </span>
        {offline && (
          <span className="text-faint">Basemap unavailable offline</span>
        )}
      </div>
    </div>
  );
}
