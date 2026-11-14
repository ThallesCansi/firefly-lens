"use client";
import { useEffect, useState } from "react";
import { cellCounts, type CellCount } from "./data/area";
import type { BBox } from "./data/types";

/** Detections per 0.25° cell for the map. Camera movement never enters the query key. */
export function useMapCells(bbox: BBox | null, period: string) {
  const key = bbox ? `${bbox.join(",")}|${period}` : null;
  const [state, setState] = useState<{
    key: string;
    cells: CellCount[];
    error: string | null;
  } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    const [area, date] = key.split("|");
    const from = date.length === 10 ? date : `${date}-01`;
    const last = new Date(
      Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0),
    ).getUTCDate();
    const to = date.length === 10 ? date : `${date}-${last}`;
    cellCounts(area.split(",").map(Number) as BBox, from, to)
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
  }, [key]);
  return {
    cells: !key ? [] : state?.key === key ? state.cells : null,
    error: state?.key === key ? state.error : null,
  };
}
