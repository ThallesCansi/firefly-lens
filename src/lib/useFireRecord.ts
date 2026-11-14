"use client";

import { useEffect, useState } from "react";
import { loadArea } from "./data/area";
import type { AnalysisArea } from "./data/types";
import { buildRecord, type FireRecord } from "./harmonize";

/**
 * Reads the harmonized record for an area: the 4° data tiles it touches, summed
 * over the share of each cell inside it. Keeps the last area on screen while
 * the next loads.
 */
export function useFireRecord(area: AnalysisArea): {
  record: FireRecord | null;
  /** The area the record on screen belongs to. */
  recordArea: AnalysisArea | null;
  loading: boolean;
  error: string | null;
} {
  const key = area.id;
  const [state, setState] = useState<{ area: AnalysisArea; record: FireRecord } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    let live = true;
    loadArea(area)
      .then((data) => {
        if (!live) return;
        if (data.cells === 0) {
          setError({ key: area.id, message: "This area has no Brazilian land. FireFly Lens covers Brazil only: move or redraw the area." });
          return;
        }
        setState({ area, record: buildRecord(data) });
      })
      .catch(() => {
        if (live) setError({ key: area.id, message: "The fire record for this area could not be loaded. Try another area or reload the page." });
      });
    return () => {
      live = false;
    };
  }, [area]);

  const failed = error?.key === key ? error.message : null;
  return {
    record: state?.record ?? null,
    recordArea: state?.area ?? null,
    loading: state?.area.id !== key && !failed,
    error: failed,
  };
}
