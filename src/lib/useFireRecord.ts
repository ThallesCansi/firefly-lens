"use client";

import { useEffect, useState } from "react";
import { loadArea } from "./data/area";
import type { AnalysisArea } from "./data/types";
import { buildRecord, type FireRecord } from "./harmonize";
import { rawPilotFor } from "./data/coverage";
import { loadCountryRecord } from "./data/raw-pilot";

/** No Brazilian land in the area: there is nothing to read. */
const OUTSIDE = Symbol("outside");
/**
 * Records already built, by area id (a hash of the shape). The side panel and
 * the report below the map read the same area, so it is loaded and built once.
 */
const records = new Map<string, Promise<FireRecord | typeof OUTSIDE>>();
function recordFor(area: AnalysisArea) {
  let hit = records.get(area.id);
  if (!hit) {
    hit = rawPilotFor(area) ? loadCountryRecord(area) : loadArea(area).then((data) => (data.cells === 0 ? OUTSIDE : buildRecord(data)));
    hit.catch(() => records.delete(area.id));
    records.set(area.id, hit);
    if (records.size > 8) records.delete(records.keys().next().value!);
  }
  return hit;
}

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
    recordFor(area)
      .then((record) => {
        if (!live) return;
        if (record === OUTSIDE) {
          setError({ key: area.id, message: "No spatially calibrated historical coverage: this area overlaps no Brazilian data cells. Explore the globe or choose a published whole-country report under Coordinates." });
          return;
        }
        setState({ area, record });
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
