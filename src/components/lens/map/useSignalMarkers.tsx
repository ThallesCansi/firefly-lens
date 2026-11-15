"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { AnalysisArea } from "@/lib/data/types";
import type { FireflySignal } from "@/lib/analytics/signals";
import { Lume } from "@/components/firefly/Lume";
import { MONTHS } from "@/lib/format";

interface SignalNodes {
  signal: FireflySignal;
  button: HTMLButtonElement;
  tooltip: HTMLDivElement;
}

/** Geography-attached markers use MapLibre's globe occlusion and camera updates.
 * The style listener restores the subtle outlines when the theme replaces the style.
 */
export function useSignalMarkers(
  map: RefObject<MapLibreMap | null>,
  ready: boolean,
  signals: FireflySignal[],
  blocked: boolean,
  onSelect?: (area: AnalysisArea) => void,
) {
  const select = useRef(onSelect);
  const [nodes, setNodes] = useState<SignalNodes[]>([]);
  useEffect(() => { select.current = onSelect; }, [onSelect]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    let live = true;
    const cleanups: (() => void)[] = [];
    const source = "firefly-signals";
    const layers = ["firefly-signals-glow", "firefly-signals-outline"];
    const setup = () => {
      if (m.getSource(source)) return;
      const color = getComputedStyle(document.documentElement).getPropertyValue("--color-lume").trim();
      m.addSource(source, { type: "geojson", data: { type: "FeatureCollection", features:
        signals.map((signal) => ({ type: "Feature", properties: {}, geometry: signal.area.geometry })) } });
      m.addLayer({ id: layers[0], source, type: "line", paint: {
        "line-color": color, "line-width": 7, "line-blur": 4, "line-opacity": 0.24,
      } }, "modis");
      m.addLayer({ id: layers[1], source, type: "line", paint: {
        "line-color": color, "line-width": 1.5, "line-opacity": 0.65,
      } }, "modis");
    };
    // style.load also covers a theme switch while signals are being fetched.
    m.on("style.load", setup);
    if (m.getLayer("modis")) setup();
    import("maplibre-gl").then(({ Marker, Popup }) => {
      if (!live) return;
      const next = signals.map((signal) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "firefly-signal-marker";
        button.disabled = blocked;
        button.setAttribute("aria-label", `${signal.area.name}: unusually high seasonal fire activity in ${signal.anomaly.date}. Open analysis`);
        const tooltip = document.createElement("div");
        tooltip.className = "firefly-signal-tooltip";
        tooltip.id = `signal-tip-${signal.area.id.replace(/[^a-z0-9-]/gi, "-")}`;
        tooltip.setAttribute("role", "tooltip");
        button.setAttribute("aria-describedby", tooltip.id);
        const popup = new Popup({ closeButton: true, closeOnClick: true, focusAfterOpen: false,
          offset: 22, maxWidth: "240px", className: "firefly-signal-popup" })
          .setLngLat(signal.position).setDOMContent(tooltip);
        const marker = new Marker({ element: button, anchor: "center", opacityWhenCovered: 0 })
          .setLngLat(signal.position).addTo(m);
        let pinned = false;
        const show = () => { if (!blocked && !popup.isOpen()) popup.addTo(m); };
        const hide = () => { if (!pinned) popup.remove(); };
        button.onmouseenter = show;
        button.onmouseleave = hide;
        button.onfocus = show;
        button.onblur = hide;
        button.onclick = (event) => {
          event.stopPropagation();
          pinned = true;
          show();
          select.current?.(signal.area);
        };
        const escape = (event: KeyboardEvent) => {
          if (event.key === "Escape") { pinned = false; popup.remove(); }
        };
        popup.on("close", () => { pinned = false; });
        document.addEventListener("keydown", escape);
        cleanups.push(() => {
          document.removeEventListener("keydown", escape);
          popup.remove();
          marker.remove();
        });
        return { signal, button, tooltip };
      });
      setNodes(next);
    });
    return () => {
      live = false;
      cleanups.forEach((cleanup) => cleanup());
      m.off("style.load", setup);
      layers.forEach((id) => { if (m.getLayer(id)) m.removeLayer(id); });
      if (m.getSource(source)) m.removeSource(source);
    };
  }, [map, ready, signals, blocked]);
  return nodes.flatMap(({ signal, button, tooltip }) => {
    const row = signal.anomaly;
    return [
      createPortal(<Lume size={38} mood="alert" />, button, `${signal.area.id}-marker`),
      createPortal(<>
        <strong>{signal.area.name}</strong>
        <span>{MONTHS[Number(row.date.slice(5, 7)) - 1]} {row.date.slice(0, 4)} · Monthly signal</span>
        <p>Unusually high seasonal fire activity</p>
        <span className="num">{[
          row.percentile !== null ? `Percentile ${row.percentile.toFixed(1)}` : null,
          row.z_score !== null ? `Seasonal z-score ${row.z_score.toFixed(2)}` : null,
        ].filter(Boolean).join(" · ")}</span>
        <small>Compared with the same month across {row.reference.n_years} historical years.
          {row.source === "modeled_viirs" ? " Based on a harmonized estimate." : ""}</small>
        <small>Click the firefly to analyze this region.</small>
      </>, tooltip, `${signal.area.id}-tooltip`),
    ];
  });
}
