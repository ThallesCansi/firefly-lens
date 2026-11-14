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
import {
  normalizeBBox,
  type BBox,
  type Hotspot,
  type Sensor,
} from "@/lib/data/types";
import type { MapDestination } from "./LocationSearch";
import { useTheme } from "@/components/ui/ThemeProvider";

const BASEMAPS = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};
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

function points(hotspots: Hotspot[]) {
  return {
    type: "FeatureCollection" as const,
    features: hotspots.map((h) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [h.longitude, h.latitude],
      },
      properties: { sensor: h.instrument },
    })),
  };
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
  theme: "light" | "dark",
): MapLibreMap {
  return new lib.Map({
    container,
    style: BASEMAPS[theme],
    center: [-48, -8],
    zoom: 2,
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
  hotspots,
  drawing,
  onDraw,
  sensors = ["MODIS", "VIIRS"],
  destination = null,
  reset = 0,
}: {
  bbox: BBox | null;
  areaName: string;
  /** Null while the day's detections load. */
  hotspots: Hotspot[] | null;
  /** When true, dragging on the map draws a new area instead of panning. */
  drawing: boolean;
  onDraw: (bbox: BBox) => void;
  sensors?: Sensor[];
  destination?: MapDestination | null;
  reset?: number;
}) {
  const { theme } = useTheme();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const latest = useRef({ hotspots, bbox, onDraw, sensors, theme });
  const appliedTheme = useRef(theme);
  const styled = useRef(false);
  const fellBack = useRef(false);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paintedTheme, setPaintedTheme] = useState<string | null>(null);

  useEffect(() => {
    latest.current = { hotspots, bbox, onDraw, sensors, theme };
  }, [hotspots, bbox, onDraw, sensors, theme]);

  useEffect(() => {
    let dead = false;
    let created: MapLibreMap | undefined;

    import("maplibre-gl").then((maplibregl) => {
      if (dead || !el.current) return;
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      let instance: MapLibreMap;
      try {
        appliedTheme.current = latest.current.theme;
        instance = makeMap(maplibregl, el.current, latest.current.theme);
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
        const colors = mapColors();
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
          data: points(latest.current.hotspots ?? []),
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
        // MODIS: an open ring, sized like its coarser pixel. VIIRS: a small solid dot.
        m.addLayer({
          id: "modis",
          type: "circle",
          source: "hotspots",
          filter: ["==", ["get", "sensor"], "MODIS"],
          layout: {
            visibility: latest.current.sensors.includes("MODIS")
              ? "visible"
              : "none",
          },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 9, 9],
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": colors.modis,
            "circle-stroke-width": 1.5,
          },
        });
        m.addLayer({
          id: "viirs",
          type: "circle",
          source: "hotspots",
          filter: ["==", ["get", "sensor"], "VIIRS"],
          layout: {
            visibility: latest.current.sensors.includes("VIIRS")
              ? "visible"
              : "none",
          },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2, 9, 4],
            "circle-color": colors.viirs,
            "circle-stroke-color": colors.stroke,
            "circle-stroke-width": 1,
          },
        });
        setReady(true);
      };

      // "style.load" fires for the basemap and again for the fallback style.
      instance.on("style.load", () => {
        styled.current = true;
        setOffline(fellBack.current);
        addLayers();
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
      created?.remove();
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || appliedTheme.current === theme) return;
    appliedTheme.current = theme;
    styled.current = false;
    fellBack.current = false;
    // Only replace the style. style.load restores data and layer visibility; camera and handlers stay intact.
    m.setStyle(BASEMAPS[theme], { diff: false });
  }, [theme]);

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
      points(hotspots ?? []),
    );
  }, [hotspots, ready]);

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

  useEffect(() => {
    if (!ready || !destination || !map.current) return;
    if (destination.bounds) {
      map.current.fitBounds(destination.bounds, {
        padding: fitPadding(map.current),
        duration: 1000,
        maxZoom: 12,
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
      map.current?.flyTo({ center: [-48, -8], zoom: 2, duration: 800 });
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
    const draft = () => m.getSource("draft") as GeoJSONSource | undefined;
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
      draft()?.setData({ type: "FeatureCollection", features: [] });
    };
  }, [drawing, ready]);

  return (
    <div
      className={`hotspot-map relative h-full overflow-hidden bg-canopy ${drawing ? "ring-2 ring-lume" : ""}`}
      data-map-theme={paintedTheme}
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
      {ready && bbox && !drawing && hotspots?.length === 0 && (
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
          MODIS, 1 km pixel
        </span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="mx-[3px] block size-1.5 rounded-full bg-viirs"
          />
          VIIRS, 375 m pixel
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
