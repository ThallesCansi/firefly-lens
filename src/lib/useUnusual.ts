"use client";
import { useEffect, useMemo, useState } from "react";
import { cellHistory } from "./data/history";
import type { AnalysisArea } from "./data/types";
import { unusualMonth, type CellHistory, type UnusualMonth } from "./unusual";

/**
 * The cells of an area that burn unusually in a month (YYYY-MM), or null while
 * the area's history loads, when it cannot be read, or when no month is given
 * (a single day is not judged). The history is read once per area; each month,
 * including every frame of a time-lapse, is then judged from memory.
 */
export function useUnusualCells(area: AnalysisArea | null, month: string | null): UnusualMonth | null {
  const [loaded, setLoaded] = useState<{ id: string; history: CellHistory } | null>(null);
  useEffect(() => {
    if (!area) return;
    let live = true;
    cellHistory(area)
      .then((history) => {
        if (live) setLoaded({ id: area.id, history });
      })
      .catch(() => {
        // Without the history the map simply shows no unusual cells.
      });
    return () => {
      live = false;
    };
  }, [area]);
  const history = area && loaded?.id === area.id ? loaded.history : null;
  return useMemo(
    () => (history && month ? unusualMonth(history, Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1) : null),
    [history, month],
  );
}
