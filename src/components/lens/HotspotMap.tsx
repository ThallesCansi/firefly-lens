"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, MapTouchEvent, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { normalizeBBox, type BBox, type Hotspot } from "@/lib/data/types";

const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/** Used when the basemap cannot be reached, so the detections still draw. */
const BLANK: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "ground", type: "background", paint: { "background-color": "#121713" } }],
};

function points(hotspots: Hotspot[]) {
  return {
    type: "FeatureCollection" as const,
    features: hotspots.map((h) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [h.longitude, h.latitude] },
      properties: { sensor: h.instrument },
    })),
  };
}

function outline([w, s, e, n]: BBox) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: [[w, s], [e, s], [e, n], [w, n], [w, s]] },
  };
}

function makeMap(lib: typeof import("maplibre-gl"), container: HTMLElement, bbox: BBox): MapLibreMap {
  return new lib.Map({
    container,
    style: BASEMAP,
    bounds: bbox,
    fitBoundsOptions: { padding: 32 },
    attributionControl: { compact: true },
    cooperativeGestures: true,
    dragRotate: false,
    pitchWithRotate: false,
  });
}

export function HotspotMap({
  bbox,
  areaName,
  hotspots,
  drawing,
  onDraw,
}: {
  bbox: BBox;
  areaName: string;
  /** Null while the day's detections load. */
  hotspots: Hotspot[] | null;
  /** When true, dragging on the map draws a new area instead of panning. */
  drawing: boolean;
  onDraw: (bbox: BBox) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const latest = useRef({ hotspots, bbox, onDraw });
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    latest.current = { hotspots, bbox, onDraw };
  }, [hotspots, bbox, onDraw]);

  useEffect(() => {
    let dead = false;
    let created: MapLibreMap | undefined;
    let fellBack = false;

    import("maplibre-gl").then((maplibregl) => {
      if (dead || !el.current) return;
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      let instance: MapLibreMap;
      try {
        instance = makeMap(maplibregl, el.current, latest.current.bbox);
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
        m.addSource("area", { type: "geojson", data: outline(latest.current.bbox) });
        m.addSource("draft", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addSource("hotspots", { type: "geojson", data: points(latest.current.hotspots ?? []) });
        m.addLayer({ id: "area", type: "line", source: "area", paint: { "line-color": "#d8f24e", "line-width": 1.5, "line-opacity": 0.8 } });
        m.addLayer({ id: "draft", type: "line", source: "draft", paint: { "line-color": "#eef0e6", "line-width": 1.5, "line-dasharray": [2, 2] } });
        // MODIS: an open ring, sized like its coarser pixel. VIIRS: a small solid dot.
        m.addLayer({
          id: "modis",
          type: "circle",
          source: "hotspots",
          filter: ["==", ["get", "sensor"], "MODIS"],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 9, 9],
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": "#3f8fe6",
            "circle-stroke-width": 1.5,
          },
        });
        m.addLayer({
          id: "viirs",
          type: "circle",
          source: "hotspots",
          filter: ["==", ["get", "sensor"], "VIIRS"],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2, 9, 4],
            "circle-color": "#d9569a",
            "circle-stroke-color": "#0b0e0c",
            "circle-stroke-width": 1,
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
    (map.current?.getSource("area") as GeoJSONSource | undefined)?.setData(outline(bbox));
    map.current?.fitBounds(bbox, { padding: 32, duration: 600 });
  }, [bbox, ready]);

  useEffect(() => {
    if (!ready) return;
    (map.current?.getSource("hotspots") as GeoJSONSource | undefined)?.setData(points(hotspots ?? []));
  }, [hotspots, ready]);

  // Drawing a new area: press, drag, release.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !drawing) return;
    const draft = m.getSource("draft") as GeoJSONSource | undefined;
    let start: [number, number] | null = null;
    let box: BBox | null = null;
    m.dragPan.disable();
    m.getCanvas().style.cursor = "crosshair";

    const down = (e: MapMouseEvent | MapTouchEvent) => {
      e.preventDefault();
      start = [e.lngLat.lng, e.lngLat.lat];
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
    return () => {
      m.off("mousedown", down);
      m.off("mousemove", move);
      m.off("mouseup", up);
      m.off("touchstart", down);
      m.off("touchmove", move);
      m.off("touchend", up);
      m.dragPan.enable();
      m.getCanvas().style.cursor = "";
      draft?.setData({ type: "FeatureCollection", features: [] });
    };
  }, [drawing, ready]);

  return (
    <div className={`relative h-full min-h-80 overflow-hidden rounded-xl bg-canopy ${drawing ? "ring-2 ring-lume" : ""}`}>
      {/* MapLibre's stylesheet makes its container position: relative, so it fills a positioned parent. */}
      <div className="absolute inset-0">
        <div ref={el} className="size-full" role="application" aria-label={`Map of detections in ${areaName}`} />
      </div>
      {!ready && !failed && <p className="absolute inset-0 grid place-items-center text-[0.9375rem] text-dim">Loading the map…</p>}
      {failed && (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-[0.9375rem] text-dim">
          This browser cannot draw the map (WebGL is off). The calendar and the day&rsquo;s figures still work, and
          you can still set the area with coordinates.
        </p>
      )}
      {ready && drawing && (
        <p className="pointer-events-none absolute inset-x-0 top-4 mx-auto w-fit rounded-lg bg-lume px-3 py-2 text-[0.875rem] font-medium text-lume-ink">
          Press and drag to draw the area
        </p>
      )}
      {ready && !drawing && hotspots?.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-4 mx-auto w-fit rounded-lg bg-night px-3 py-2 text-[0.875rem] text-dim">
          No sensor saw fire here on this day.
        </p>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1.5 rounded-lg bg-night/90 px-3 py-2 text-[0.8125rem] text-dim">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="block size-3 rounded-full border-[1.5px] border-modis" />
          MODIS, 1 km pixel
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="mx-[3px] block size-1.5 rounded-full bg-viirs" />
          VIIRS, 375 m pixel
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-px w-3 bg-lume" />
          Area of interest
        </span>
        {offline && <span className="text-faint">Basemap unavailable offline</span>}
      </div>
    </div>
  );
}
