"use client";

import { useEffect, useState } from "react";
import { cellCounts, loadArea, type CellCount } from "./data/area";
import { DATA_YEAR, fireData } from "./data/source";
import { buildRecord, yearView, type YearSummary } from "./harmonize";

export interface YearData {
  regionId: string;
  summary: YearSummary;
  /** The year's busiest day, and the detections per cell on it. */
  peak: string;
  peakCells: CellCount[];
}

/** Loads one preset area and shows its latest complete year: what the landing page shows. */
export function useYearData(regionId: string): { data: YearData | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<YearData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const region = fireData.presets().find((r) => r.id === regionId) ?? fireData.presets()[0];
    loadArea(region.bbox)
      .then(async (area) => {
        const summary = yearView(buildRecord(area), DATA_YEAR);
        const peak = summary.days.reduce((best, d) => (d.index > best.index ? d : best)).date;
        const peakCells = await cellCounts(region.bbox, peak, peak);
        if (!live) return;
        setError(null);
        setData({ regionId, summary, peak, peakCells });
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
