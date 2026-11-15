import { monthStamp } from "../dates";
import { meta } from "./meta";
import type { Source } from "../harmonize";

export interface RadarMonth {
  year: number;
  /** Zero-based calendar month. */
  month: number;
  value: number;
  source: Source;
  lo: number | null;
  hi: number | null;
  partial: boolean;
}

export interface MonthCoverage {
  firstDay: string;
  lastDay: string;
  seriesEnd: string;
  partialMonth: string;
  observedUntil: number;
  partialMonths?: readonly string[];
}

export const MONTH_QUALITY_VERSION = 1;
/** Whole affected months are conservatively excluded, never repaired or deleted.
 * Source: harmonization/docs/METHODOLOGY.md, sections 5 and 11.
 */
export const OBSERVATION_GAPS = [
  { from: "2020-08-16", to: "2020-09-02", sensor: "MODIS Aqua" },
  { from: "2022-03-31", to: "2022-04-16", sensor: "MODIS Aqua" },
] as const;

export const QUALITY_REASONS = {
  partial: "Incomplete monthly coverage",
  gap: "Known MODIS Aqua observation gap",
  invalid: "Invalid monthly value or interval",
  source: "Missing or inconsistent harmonized source",
} as const;
export type QualityReason = keyof typeof QUALITY_REASONS;

export function monthQuality(cell: RadarMonth, coverage: MonthCoverage = meta) {
  const stamp = monthStamp(cell.year, cell.month);
  const first = `${stamp}-01`;
  const end = new Date(Date.UTC(cell.year, cell.month + 1, 0)).toISOString().slice(0, 10);
  const reasons: QualityReason[] = [];
  if (cell.partial || stamp === "2002-07" || stamp === coverage.partialMonth ||
      coverage.partialMonths?.includes(stamp) || first < coverage.firstDay ||
      end > coverage.lastDay || stamp > coverage.seriesEnd) reasons.push("partial");
  if (OBSERVATION_GAPS.some((gap) => first <= gap.to && end >= gap.from)) reasons.push("gap");
  if (!Number.isFinite(cell.value) || cell.value < 0 ||
      (cell.source === "modeled" && (cell.lo === null || cell.hi === null ||
        !Number.isFinite(cell.lo) || !Number.isFinite(cell.hi) ||
        cell.lo < 0 || cell.lo > cell.value || cell.hi < cell.value))) reasons.push("invalid");
  if (cell.source !== (cell.year > coverage.observedUntil ? "modeled" : "observed")) reasons.push("source");
  return { eligible: reasons.length === 0, reasons };
}
