import { VIIRS_START, confidenceClass, type ConfidenceClass, type Hotspot, type Sensor } from "./data/types";
import { dateOfDay, daysInYear } from "./data/mock";

/**
 * Provisional harmonization.
 *
 * A hot spot is one observation, not one fire: VIIRS reports several 375 m
 * pixels where MODIS reports a single 1 km pixel, so raw counts from the two
 * sensors are never added together. The steps:
 *
 *  1. Snap every detection to a shared grid and count the lit cells per sensor
 *     and day. Pixel size no longer matters: a cell is lit or it is not.
 *  2. Learn from the years both sensors flew how many cells VIIRS lights for
 *     each cell MODIS lights in this area (the calibration factor).
 *  3. Express every day in VIIRS-equivalent cells: MODIS alone before 2012,
 *     scaled by the factor; the mean of both afterwards.
 *  4. Scale that one series against the area's own busy day (the 95th
 *     percentile of burning days), giving an index from 0 to 1 that means the
 *     same thing in 2003 and in 2023.
 */

/** Shared grid cell size in degrees (about 5.5 km at the equator). */
export const CELL_DEGREES = 0.05;

export interface SensorDay {
  /** Raw detections, as reported. */
  detections: number;
  /** Shared-grid cells with at least one detection. */
  cells: number;
  /** Summed fire radiative power, MW. */
  frp: number;
  day: number;
  night: number;
  confidence: Record<ConfidenceClass, number>;
  /** This sensor's own view of the day on the 0-1 index, after calibration. */
  scaled: number;
}

/** 0 no fire seen, 5 the busiest days on record. */
export type Level = 0 | 1 | 2 | 3 | 4 | 5;

export const LEVEL_NAMES: Record<Level, string> = {
  0: "No fire seen",
  1: "Faint",
  2: "Low",
  3: "Moderate",
  4: "High",
  5: "Extreme",
};

export interface DaySummary {
  date: string;
  year: number;
  dayOfYear: number;
  sensors: Record<Sensor, SensorDay>;
  /** False before VIIRS existed: the day rests on MODIS alone. */
  bothSensors: boolean;
  /** Harmonized activity in VIIRS-equivalent lit cells. */
  value: number;
  /** Harmonized activity, 0 to 1. */
  index: number;
  level: Level;
  /** What the surrounding three weeks suggest for this day, 0 to 1. */
  expected: number;
  /** True when the day burns far above its surrounding three weeks. */
  anomaly: boolean;
  /** 1 when both sensors agree after calibration, 0 when one sees nothing. */
  agreement: number | null;
}

/** One calendar month of one year, set against the same month in other years. */
export interface MonthCell {
  year: number;
  /** 0 to 11. */
  month: number;
  /** Sum of the daily harmonized values: VIIRS-equivalent cell-days. */
  value: number;
  /** Raw detections in the month, per sensor, as reported. */
  detections: Record<Sensor, number>;
  /** Median of this calendar month across every year on record. */
  median: number;
  /** value / median, or null when the median is zero. */
  ratio: number | null;
  /** 1 is the highest this calendar month has been. */
  rank: number;
  /** 0 to 5, by the value's share of the busiest months on record. */
  level: Level;
}

export interface Season {
  /** Day of year, 1 to 365. The season wraps the new year when start > end. */
  startDay: number;
  endDay: number;
  days: number;
}

export interface FireRecord {
  years: number[];
  days: DaySummary[];
  /** VIIRS cells lit per MODIS cell lit, learned from the overlap years. */
  calibration: { factor: number; overlapDays: number };
  /** VIIRS-equivalent cells that scale to an index of 1. */
  reference: number;
  months: MonthCell[];
  /** Median harmonized value for each calendar month. */
  monthlyMedian: number[];
  yearTotals: { year: number; value: number; median: number }[];
  season: Season | null;
}

/** One year of a record, in the shape the calendar and charts read. */
export interface YearSummary {
  year: number;
  days: DaySummary[];
  totals: Record<Sensor, { detections: number; frp: number }>;
  /** The typical fire season, as dates in this year. */
  criticalPeriod: { start: string; end: string; days: number; wraps: boolean } | null;
  anomalies: string[];
}

function emptySensorDay(): SensorDay {
  return { detections: 0, cells: 0, frp: 0, day: 0, night: 0, confidence: { low: 0, nominal: 0, high: 0 }, scaled: 0 };
}

export function cellKey(latitude: number, longitude: number): string {
  return `${Math.floor(latitude / CELL_DEGREES)}:${Math.floor(longitude / CELL_DEGREES)}`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

function median(values: number[]): number {
  return percentile([...values].sort((a, b) => a - b), 0.5);
}

export function levelOf(index: number, anyDetection: boolean): Level {
  if (!anyDetection) return 0;
  if (index < 0.08) return 1;
  if (index < 0.25) return 2;
  if (index < 0.5) return 3;
  if (index < 0.8) return 4;
  return 5;
}

/** Step 1: one year of detections snapped to the shared grid, day by day. */
export function gridYear(hotspots: Hotspot[], year: number): DaySummary[] {
  const total = daysInYear(year);
  const byDate = new Map<string, number>();
  const days: DaySummary[] = [];
  for (let d = 1; d <= total; d++) {
    const date = dateOfDay(year, d);
    byDate.set(date, d - 1);
    days.push({
      date,
      year,
      dayOfYear: d,
      sensors: { MODIS: emptySensorDay(), VIIRS: emptySensorDay() },
      bothSensors: date >= VIIRS_START,
      value: 0,
      index: 0,
      level: 0,
      expected: 0,
      anomaly: false,
      agreement: null,
    });
  }
  const cells: Record<Sensor, Set<string>[]> = {
    MODIS: days.map(() => new Set<string>()),
    VIIRS: days.map(() => new Set<string>()),
  };
  for (const h of hotspots) {
    const at = byDate.get(h.acq_date);
    if (at === undefined) continue;
    const s = days[at].sensors[h.instrument];
    s.detections++;
    s.frp += h.frp;
    if (h.daynight === "D") s.day++;
    else s.night++;
    s.confidence[confidenceClass(h.confidence)]++;
    cells[h.instrument][at].add(cellKey(h.latitude, h.longitude));
  }
  days.forEach((day, i) => {
    for (const sensor of ["MODIS", "VIIRS"] as const) {
      day.sensors[sensor].cells = cells[sensor][i].size;
      day.sensors[sensor].frp = Math.round(day.sensors[sensor].frp * 10) / 10;
    }
  });
  return days;
}

/** Days on each side used to judge what is normal for a date. */
const ANOMALY_WINDOW = 10;
/** Below this index a day is too faint to call unusual. */
const ANOMALY_FLOOR = 0.22;
/** Smallest gap over the neighbours' median that counts as unusual. */
const ANOMALY_MARGIN = 0.15;

/** Steps 2 to 4: gridded years, in order, become one harmonized record. */
export function buildRecord(years: DaySummary[][]): FireRecord {
  const days = years.flat();

  // Step 2: calibrate MODIS against VIIRS where both flew.
  let modisCells = 0;
  let viirsCells = 0;
  let overlapDays = 0;
  for (const day of days) {
    if (!day.bothSensors) continue;
    overlapDays++;
    modisCells += day.sensors.MODIS.cells;
    viirsCells += day.sensors.VIIRS.cells;
  }
  const factor = modisCells > 0 && viirsCells > 0 ? viirsCells / modisCells : 1;

  // Step 3: one series in VIIRS-equivalent cells.
  for (const day of days) {
    const fromModis = day.sensors.MODIS.cells * factor;
    day.value = day.bothSensors ? (fromModis + day.sensors.VIIRS.cells) / 2 : fromModis;
  }

  // Step 4: scale against the area's own busy day.
  const burning = days.map((d) => d.value).filter((v) => v > 0).sort((a, b) => a - b);
  const reference = Math.max(1, percentile(burning, 0.95));
  for (const day of days) {
    const m = day.sensors.MODIS;
    const v = day.sensors.VIIRS;
    m.scaled = Math.min(1, (m.cells * factor) / reference);
    v.scaled = Math.min(1, v.cells / reference);
    day.index = Math.min(1, day.value / reference);
    const any = m.detections + v.detections > 0;
    day.level = levelOf(day.index, any);
    const top = Math.max(m.cells * factor, v.cells);
    day.agreement = day.bothSensors && any && top > 0 ? 1 - Math.abs(m.cells * factor - v.cells) / top : null;
  }

  // Unusual burning: a day far above the median of its neighbours, by a margin
  // that widens when those neighbours are themselves erratic.
  days.forEach((day, i) => {
    const around: number[] = [];
    for (let k = i - ANOMALY_WINDOW; k <= i + ANOMALY_WINDOW; k++) {
      if (k === i || k < 0 || k >= days.length) continue;
      around.push(days[k].index);
    }
    const mid = median(around);
    const spread = median(around.map((x) => Math.abs(x - mid))) * 1.4826;
    day.expected = mid;
    day.anomaly = day.index >= ANOMALY_FLOOR && day.index >= mid * 2 && day.index > mid + Math.max(ANOMALY_MARGIN, 4 * spread);
  });

  const months = monthTable(days);
  const monthlyMedian = Array.from({ length: 12 }, (_, m) => months.find((c) => c.month === m)?.median ?? 0);
  const totals = years.map((y) => ({ year: y[0].year, value: y.reduce((sum, d) => sum + d.value, 0) }));
  const typical = median(totals.map((t) => t.value));

  return {
    years: years.map((y) => y[0].year),
    days,
    calibration: { factor, overlapDays },
    reference,
    months,
    monthlyMedian,
    yearTotals: totals.map((t) => ({ ...t, median: typical })),
    season: findSeason(days),
  };
}

function monthTable(days: DaySummary[]): MonthCell[] {
  const cells = new Map<string, MonthCell>();
  for (const day of days) {
    const month = Number(day.date.slice(5, 7)) - 1;
    const key = `${day.year}:${month}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { year: day.year, month, value: 0, detections: { MODIS: 0, VIIRS: 0 }, median: 0, ratio: null, rank: 1, level: 0 };
      cells.set(key, cell);
    }
    cell.value += day.value;
    cell.detections.MODIS += day.sensors.MODIS.detections;
    cell.detections.VIIRS += day.sensors.VIIRS.detections;
  }
  const all = [...cells.values()];
  const sorted = all.map((c) => c.value).filter((v) => v > 0).sort((a, b) => a - b);
  // Colour steps are fractions of the busiest months on record, so a strong
  // season and a weak one land on different steps.
  const top = Math.max(percentile(sorted, 0.98), 1e-9);
  const steps = [0.03, 0.1, 0.3, 0.6].map((f) => f * top);
  for (let m = 0; m < 12; m++) {
    const same = all.filter((c) => c.month === m);
    const mid = median(same.map((c) => c.value));
    for (const cell of same) {
      cell.median = mid;
      cell.ratio = mid > 0 ? cell.value / mid : null;
      cell.rank = 1 + same.filter((o) => o.value > cell.value).length;
      cell.level = cell.value <= 0 ? 0 : ((1 + steps.filter((s) => cell.value > s).length) as Level);
    }
  }
  return all;
}

/** The unbroken stretch of the year where the average day stays above 35% of the yearly peak. */
function findSeason(days: DaySummary[]): Season | null {
  const sum = new Array<number>(365).fill(0);
  const n = new Array<number>(365).fill(0);
  for (const day of days) {
    // Fold 29 February onto the 28th so every year has the same 365 slots.
    const leap = daysInYear(day.year) === 366;
    const slot = Math.min(364, (leap && day.dayOfYear > 59 ? day.dayOfYear - 1 : day.dayOfYear) - 1);
    sum[slot] += day.index;
    n[slot]++;
  }
  const mean = sum.map((s, i) => (n[i] ? s / n[i] : 0));
  const smooth = mean.map((_, i) => {
    let total = 0;
    for (let k = -7; k <= 7; k++) total += mean[(i + k + 365) % 365];
    return total / 15;
  });
  const peak = Math.max(...smooth);
  if (peak <= 0) return null;
  const at = smooth.indexOf(peak);
  const floor = peak * 0.35;
  let before = 0;
  let after = 0;
  while (before < 182 && smooth[(at - before - 1 + 365) % 365] >= floor) before++;
  while (after < 182 && smooth[(at + after + 1) % 365] >= floor) after++;
  return {
    startDay: ((at - before + 365) % 365) + 1,
    endDay: ((at + after) % 365) + 1,
    days: before + after + 1,
  };
}

export function inSeason(period: YearSummary["criticalPeriod"], date: string): boolean {
  if (!period) return false;
  return period.wraps ? date >= period.start || date <= period.end : date >= period.start && date <= period.end;
}

/** One year of a record, with the typical season expressed in that year's dates. */
export function yearView(record: FireRecord, year: number): YearSummary {
  const days = record.days.filter((d) => d.year === year);
  const totals = { MODIS: { detections: 0, frp: 0 }, VIIRS: { detections: 0, frp: 0 } };
  for (const day of days) {
    for (const sensor of ["MODIS", "VIIRS"] as const) {
      totals[sensor].detections += day.sensors[sensor].detections;
      totals[sensor].frp += day.sensors[sensor].frp;
    }
  }
  const s = record.season;
  return {
    year,
    days,
    totals,
    criticalPeriod: s
      ? { start: dateOfDay(year, s.startDay), end: dateOfDay(year, s.endDay), days: s.days, wraps: s.startDay > s.endDay }
      : null,
    anomalies: days.filter((d) => d.anomaly).map((d) => d.date),
  };
}

/** A single year harmonized on its own: what the landing page shows. */
export function harmonize(hotspots: Hotspot[], year: number): YearSummary {
  return yearView(buildRecord([gridYear(hotspots, year)]), year);
}
