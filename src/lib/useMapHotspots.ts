"use client";
import { useEffect, useState } from "react";
import { fireData } from "./data/source";
import type { BBox, Hotspot } from "./data/types";

/** Map-only query. Camera movement never enters the query key. */
export function useMapHotspots(bbox: BBox | null, period: string) {
  const key = bbox ? `${bbox.join(",")}|${period}` : null;
  const [state, setState] = useState<{
    key: string;
    hotspots: Hotspot[];
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
    fireData
      .hotspots(area.split(",").map(Number) as BBox, from, to)
      .then((hotspots) => {
        if (live) setState({ key, hotspots, error: null });
      })
      .catch(() => {
        if (live)
          setState({
            key,
            hotspots: [],
            error:
              "Detections could not be loaded. Change the period to retry.",
          });
      });
    return () => {
      live = false;
    };
  }, [key]);
  return {
    hotspots: !key ? [] : state?.key === key ? state.hotspots : null,
    error: state?.key === key ? state.error : null,
  };
}
