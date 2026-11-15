import { median, percentile } from "./harmonize";
import { monthQuality, type MonthCoverage, type RadarMonth, type QualityReason } from "./data/month-quality";
import type { Region } from "./data/types";

export interface RadarRegion extends Region { months: RadarMonth[] }
export interface RadarConfig {
  baseline: readonly [number, number];
  minReferenceYears: number;
  minRatio: number;
  minCount: number;
  minExcess: number;
  quantile: number;
}

/** Exploratory product thresholds, not significance levels or validated cutoffs. */
export const DEFAULT_RADAR_CONFIG: RadarConfig = {
  baseline: [2003, 2023], minReferenceYears: 15,
  minRatio: 2, minCount: 100, minExcess: 50, quantile: 0.9,
};

export interface RadarResult {
  region: Region;
  cell: RadarMonth;
  median: number | null;
  ratio: number | null;
  excess: number | null;
  referenceYears: number[];
  quantileValue: number | null;
  rank: number | null;
  rankOf: number;
  strength: number;
  qualityReasons: QualityReason[];
  status: "highlight" | "ordinary" | "excluded" | "insufficient" | "zero-median";
}

export function validateRadarConfig(config: RadarConfig): void {
  const [start, end] = config.baseline;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end ||
      !Number.isInteger(config.minReferenceYears) || config.minReferenceYears < 1 ||
      ![config.minRatio, config.minCount, config.minExcess, config.quantile].every(Number.isFinite) ||
      config.minRatio < 1 || config.minCount < 0 || config.minExcess < 0 ||
      config.quantile < 0 || config.quantile > 1) throw new Error("Invalid radar configuration");
}

/** Retrospective same-month comparison. Never reads daily anomaly/index flags.
 * Baseline and ranking pools differ: rank includes ALL eligible same-month
 * records in the archive (including the target and modeled months).
 */
export function evaluateRegion(
  region: RadarRegion, config: RadarConfig = DEFAULT_RADAR_CONFIG, coverage?: MonthCoverage,
): RadarResult[] {
  validateRadarConfig(config);
  const { months, ...identity } = region;
  const quality = new Map(months.map((cell) => [cell, monthQuality(cell, coverage)]));
  const eligible = months.filter((cell) => quality.get(cell)!.eligible);
  return months.map((cell) => {
    const q = quality.get(cell)!;
    const reference = eligible.filter((other) => other.month === cell.month && other.year !== cell.year &&
      other.year >= config.baseline[0] && other.year <= config.baseline[1]);
    const values = reference.map((c) => c.value).sort((a, b) => a - b);
    const mid = values.length ? median(values) : null;
    const ratio = q.eligible && mid !== null && mid > 0 ? cell.value / mid : null;
    const excess = q.eligible && mid !== null ? cell.value - mid : null;
    const threshold = values.length ? percentile(values, config.quantile) : null;
    const pool = eligible.filter((other) => other.month === cell.month);
    const rank = q.eligible ? 1 + pool.filter((other) => other.value > cell.value).length : null;
    const status = !q.eligible ? "excluded" : reference.length < config.minReferenceYears ? "insufficient" :
      mid === 0 ? "zero-median" : ratio !== null && ratio >= config.minRatio &&
      cell.value >= config.minCount && excess !== null && excess >= config.minExcess &&
      threshold !== null && cell.value >= threshold ? "highlight" : "ordinary";
    return {
      region: identity, cell, median: mid, ratio, excess, quantileValue: threshold,
      referenceYears: reference.map((c) => c.year), rank, rankOf: pool.length,
      strength: rank !== null && pool.length > 1 ? 1 - (rank - 1) / (pool.length - 1) : 0,
      qualityReasons: q.reasons, status,
    };
  });
}

/** Historical standing first; ratio and absolute excess break ties. No probability implied. */
export function compareAnomalies(a: RadarResult, b: RadarResult): number {
  return b.strength - a.strength || (b.ratio ?? -1) - (a.ratio ?? -1) ||
    (b.excess ?? -1) - (a.excess ?? -1) || b.cell.year - a.cell.year ||
    b.cell.month - a.cell.month || a.region.id.localeCompare(b.region.id);
}
