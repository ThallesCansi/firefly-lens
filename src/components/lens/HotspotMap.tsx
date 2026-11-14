"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Hotspot, Region } from "@/lib/data/types";

const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/** Used when the basemap cannot be reached, so the detections still draw. */
const BLANK: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "ground", type: "background", paint: { "background-color": "#121713" } }],
};

function toGeoJSON(hotspots: Hotspot[]) {
  return {
    type: "FeatureCollection" as const,
    features: hotspots.map((h) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [h.longitude, h.latitude] },
      properties: { sensor: h.instrument, frp: h.frp },
    })),
  };
}

function makeMap(lib: typeof import("maplibre-gl"), container: HTMLElement, region: Region): MapLibreMap {
  return new lib.Map({
    container,
    style: BASEMAP,
    bounds: region.bbox,
    fitBoundsOptions: { padding: 24 },
    attributionControl: { compact: true },
    cooperativeGestures: true,
    dragRotate: false,
    pitchWithRotate: false,
  });
}

export function HotspotMap({ region, hotspots }: { region: Region; hotspots: Hotspot[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const latest = useRef(hotspots);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    latest.current = hotspots;
  }, [hotspots]);

  useEffect(() => {
    let dead = false;
    let created: MapLibreMap | undefined;
    let fellBack = false;

    import("maplibre-gl").then((maplibregl) => {
      if (dead || !el.current) return;
      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      let instance: MapLibreMap;
      try {
        instance = makeMap(maplibregl, el.current, region);
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
        m.addSource("hotspots", { type: "geojson", data: toGeoJSON(latest.current) });
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
    // The map is created once; region changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    map.current?.fitBounds(region.bbox, { padding: 24, duration: 600 });
  }, [region, ready]);

  useEffect(() => {
    if (!ready) return;
    (map.current?.getSource("hotspots") as GeoJSONSource | undefined)?.setData(toGeoJSON(hotspots));
  }, [hotspots, ready]);

  return (
    <div className="relative h-full min-h-80 overflow-hidden rounded-xl bg-canopy">
      {/* MapLibre's stylesheet makes its container position: relative, so it fills a positioned parent. */}
      <div className="absolute inset-0">
        <div ref={el} className="size-full" role="application" aria-label={`Map of detections in ${region.name}`} />
      </div>
      {!ready && !failed && <p className="absolute inset-0 grid place-items-center text-[0.9375rem] text-dim">Loading the map…</p>}
      {failed && (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-[0.9375rem] text-dim">
          This browser cannot draw the map (WebGL is off). The calendar and the day&rsquo;s figures still work.
        </p>
      )}
      {ready && hotspots.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-4 mx-auto w-fit rounded-lg bg-night px-3 py-2 text-[0.875rem] text-dim">
          Neither sensor saw fire here on this day.
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
        {offline && <span className="text-faint">Basemap unavailable offline</span>}
      </div>
    </div>
  );
}
