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

/** Loads the latest year of one preset area and harmonizes it on its own: what the landing page shows. */
export function useYearData(regionId: string): { data: YearData | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<YearData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const region = fireData.presets().find((r) => r.id === regionId) ?? fireData.presets()[0];
    fireData
      .hotspots(region.bbox, `${DATA_YEAR}-01-01`, `${DATA_YEAR}-12-31`)
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
