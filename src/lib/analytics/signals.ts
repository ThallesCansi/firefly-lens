import { geometryEnvelope, type AnalysisArea } from "../data/types";
import type { RegionEntry } from "./client";
import { isFailure, type AnomalyRow, type Bundle } from "./contracts";

export const SIGNAL_PERCENTILE = 90;
export const SIGNAL_Z_SCORE = 2;

export interface SignalRegion {
  region: RegionEntry;
  bundle: Bundle;
}
export interface FireflySignal {
  area: AnalysisArea;
  position: [number, number];
  anomaly: AnomalyRow;
}

/** Python already excludes partial/poor-quality targets and insufficient references.
 * Do not substitute counts, daily flags, or a neighbouring month's scores.
 */
export function seasonalAnomaly(bundle: Bundle, period: string): AnomalyRow | undefined {
  const data = bundle.sections.anomalies.data;
  if (isFailure(data)) return;
  return data.months.find((row) => row.date === period.slice(0, 7) &&
    row.complete && row.value !== null &&
    (row.status === "available" || row.status === "partially_available"));
}

export function isHighSeasonalActivity(row: AnomalyRow): boolean {
  return (row.percentile !== null && Number.isFinite(row.percentile) && row.percentile >= SIGNAL_PERCENTILE) ||
    (row.z_score !== null && Number.isFinite(row.z_score) && row.z_score >= SIGNAL_Z_SCORE);
}

export function fireflySignals(regions: SignalRegion[], period: string): FireflySignal[] {
  return regions.flatMap(({ region, bundle }) => {
    const anomaly = seasonalAnomaly(bundle, period);
    if (!anomaly || !isHighSeasonalActivity(anomaly)) return [];
    const bbox = geometryEnvelope(region.geometry);
    // The prepared catalog consists of rectangular study regions: the envelope
    // midpoint is their centroid and lies inside each exact analysis geometry.
    // Future polygon catalogs can provide an interior representative point here.
    return [{
      area: { id: `signal:${region.id}`, name: region.name, kind: "preset" as const,
        geometry: region.geometry, bbox },
      position: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] as [number, number],
      anomaly,
    }];
  });
}
