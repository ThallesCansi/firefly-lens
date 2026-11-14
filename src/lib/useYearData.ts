"use client";

import { useEffect, useState } from "react";
import { DATA_YEAR, fireData } from "./data/source";
import type { Hotspot } from "./data/types";
import { harmonize, type YearSummary } from "./harmonize";

export interface YearData {
  regionId: string;
  hotspots: Hotspot[];
  summary: YearSummary;
}

/** Loads one region's year and harmonizes it. Keeps the last region on screen while the next loads. */
export function useYearData(regionId: string): { data: YearData | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<YearData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fireData
      .hotspots(regionId, DATA_YEAR)
      .then((hotspots) => {
        if (!live) return;
        setError(null);
        setData({ regionId, hotspots, summary: harmonize(hotspots, DATA_YEAR) });
      })
      .catch(() => {
        if (live) setError("The detections for this region could not be loaded. Try another region or reload the page.");
      });
    return () => {
      live = false;
    };
  }, [regionId]);

  return { data, loading: data?.regionId !== regionId && !error, error };
}
