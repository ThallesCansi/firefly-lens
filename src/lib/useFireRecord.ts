"use client";

import { useEffect, useState } from "react";
import { fireData } from "./data/source";
import type { BBox, Hotspot } from "./data/types";
import { buildRecord, gridYear, type DaySummary, type FireRecord } from "./harmonize";

const keyOf = (bbox: BBox) => bbox.join(",");

/**
 * Reads the whole record for an area, one year at a time so the page stays
 * responsive, and harmonizes it. Keeps the last area on screen while the next loads.
 */
export function useFireRecord(bbox: BBox): {
  record: FireRecord | null;
  /** The area the record on screen belongs to. */
  recordKey: string | null;
  loading: boolean;
  /** 0 to 1 while loading. */
  progress: number;
  error: string | null;
} {
  const key = keyOf(bbox);
  const [state, setState] = useState<{ key: string; record: FireRecord } | null>(null);
  const [progress, setProgress] = useState<{ key: string; done: number }>({ key, done: 0 });
  const [error, setError] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    let live = true;
    const area = key.split(",").map(Number) as BBox;
    (async () => {
      const years: DaySummary[][] = [];
      const span = fireData.lastYear - fireData.firstYear + 1;
      for (let year = fireData.firstYear; year <= fireData.lastYear; year++) {
        const hotspots = await fireData.hotspots(area, `${year}-01-01`, `${year}-12-31`);
        if (!live) return;
        years.push(gridYear(hotspots, year));
        setProgress({ key, done: years.length / span });
        // Let the browser paint between years.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (!live) return;
      }
      setState({ key, record: buildRecord(years) });
    })().catch(() => {
      if (live) setError({ key, message: "The fire record for this area could not be loaded. Try another area or reload the page." });
    });
    return () => {
      live = false;
    };
  }, [key]);

  const failed = error?.key === key ? error.message : null;
  return {
    record: state?.record ?? null,
    recordKey: state?.key ?? null,
    loading: state?.key !== key && !failed,
    progress: progress.key === key ? progress.done : 0,
    error: failed,
  };
}

/** The raw detections for an area and date span: what the map draws and the CSV holds. */
export function useHotspots(bbox: BBox, from: string, to: string): Hotspot[] | null {
  const key = `${keyOf(bbox)}|${from}|${to}`;
  const [state, setState] = useState<{ key: string; hotspots: Hotspot[] } | null>(null);

  useEffect(() => {
    let live = true;
    const [area, start, end] = key.split("|");
    fireData
      .hotspots(area.split(",").map(Number) as BBox, start, end)
      .then((hotspots) => live && setState({ key, hotspots }))
      .catch(() => live && setState({ key, hotspots: [] }));
    return () => {
      live = false;
    };
  }, [key]);

  return state?.key === key ? state.hotspots : null;
}
