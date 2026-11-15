"use client";
import { useEffect, useMemo, useState } from "react";
import { cellHistory } from "./data/history";
import type { AnalysisArea } from "./data/types";
import { unusualMonth, type CellHistory, type UnusualMonth } from "./unusual";

export interface MonthInsight {
  /** The cells that burn unusually in the month. */
  unusual: UnusualMonth;
  /** VIIRS converted to the MODIS Aqua scale for a cell in the month; null where the model has no value. */
  harmonized(cellId: number): number | null;
}

/**
 * What the record adds to a month (YYYY-MM) on the map: the unusually high
 * cells and each cell's harmonized value. Null while the area's history loads,
 * when it cannot be read, or when no month is given (a single day is not
 * judged). The history is read once per area; each month, including every
 * frame of a time-lapse, is then answered from memory.
 */
export function useMonthInsight(area: AnalysisArea | null, month: string | null): MonthInsight | null {
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
  return useMemo(() => {
    if (!history || !month) return null;
    const year = Number(month.slice(0, 4));
    const month0 = Number(month.slice(5, 7)) - 1;
    const at = (year - history.firstYear) * 12 + month0;
    return {
      unusual: unusualMonth(history, year, month0),
      harmonized(cellId) {
        const value = history.harmonized.get(cellId)?.[at];
        return value === undefined || Number.isNaN(value) ? null : value;
      },
    };
  }, [history, month]);
}
