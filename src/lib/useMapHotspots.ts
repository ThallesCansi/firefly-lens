"use client";
import { useEffect, useState } from "react";
import { cellCounts, type CellCount } from "./data/area";
import type { AnalysisArea } from "./data/types";

/** Detections per 0.25° cell for the map. Camera movement never enters the query key. */
export function useMapCells(area: AnalysisArea | null, period: string) {
  const key = area ? `${area.id}|${period}` : null;
  const [state, setState] = useState<{
    key: string;
    cells: CellCount[];
    error: string | null;
  } | null>(null);
  useEffect(() => {
    if (!area) return;
    let live = true;
    const key = `${area.id}|${period}`;
    const from = period.length === 10 ? period : `${period}-01`;
    const last = new Date(
      Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0),
    ).getUTCDate();
    const to = period.length === 10 ? period : `${period}-${last}`;
    cellCounts(area, from, to)
      .then((cells) => {
        if (live) setState({ key, cells, error: null });
      })
      .catch(() => {
        if (live)
          setState({
            key,
            cells: [],
            error: "Detections could not be loaded. Change the period to retry.",
          });
      });
    return () => {
      live = false;
    };
  }, [area, period]);
  return {
    cells: !key ? [] : state?.key === key ? state.cells : null,
    error: state?.key === key ? state.error : null,
  };
}
