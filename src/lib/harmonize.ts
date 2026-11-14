import { confidenceClass, type ConfidenceClass, type Hotspot, type Sensor } from "./data/types";
import { dateOfDay, daysInYear } from "./data/mock";

/**
 * Provisional harmonization, stage 1.
 *
 * A hot spot is one observation, not one fire: VIIRS reports several 375 m
 * pixels where MODIS reports a single 1 km pixel, so raw counts from the two
 * sensors are never added together. Instead each sensor's detections are
 * snapped to a shared grid, the lit cells are counted per day, and that count
 * is scaled against the same sensor's own busy-day reference. Only the two
 * scaled values are combined.
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
  /** Lit cells divided by this sensor's reference, capped at 1. */
  scaled: number;
}

/** 0 no fire seen, 5 the busiest days of the year. */
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
  dayOfYear: number;
  sensors: Record<Sensor, SensorDay>;
  /** Harmonized activity, 0 to 1: the mean of the two scaled values. */
  index: number;
  level: Level;
  /** What the surrounding three weeks suggest for this day, 0 to 1. */
  expected: number;
  /** True when the day burns far above its surrounding three weeks. */
  anomaly: boolean;
  /** 1 when both sensors agree on the scaled value, 0 when one sees nothing. */
  agreement: number | null;
}

export interface YearSummary {
  year: number;
  days: DaySummary[];
  /** Lit-cell count that scales to 1 for each sensor. */
  reference: Record<Sensor, number>;
  totals: Record<Sensor, { detections: number; frp: number; activeDays: number }>;
  /** The stretch of the year that carries the fire season. */
  criticalPeriod: { start: string; end: string; days: number } | null;
  anomalies: string[];
}

function emptySensorDay(): SensorDay {
  return {
    detections: 0,
    cells: 0,
    frp: 0,
    day: 0,
    night: 0,
    confidence: { low: 0, nominal: 0, high: 0 },
    scaled: 0,
  };
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

/** Days on each side used to judge what is normal for a date. */
const ANOMALY_WINDOW = 10;
/** Below this index a day is too faint to call unusual. */
const ANOMALY_FLOOR = 0.22;
/** Smallest gap over the neighbours' median that counts as unusual. */
const ANOMALY_MARGIN = 0.15;

export function harmonize(hotspots: Hotspot[], year: number): YearSummary {
  const total = daysInYear(year);
  const sensors: Sensor[] = ["MODIS", "VIIRS"];

  const byDate = new Map<string, number>();
  const days: DaySummary[] = [];
  for (let d = 1; d <= total; d++) {
    const date = dateOfDay(year, d);
    byDate.set(date, d - 1);
    days.push({
      date,
      dayOfYear: d,
      sensors: { MODIS: emptySensorDay(), VIIRS: emptySensorDay() },
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

  const reference = { MODIS: 1, VIIRS: 1 } as Record<Sensor, number>;
  const totals = {
    MODIS: { detections: 0, frp: 0, activeDays: 0 },
    VIIRS: { detections: 0, frp: 0, activeDays: 0 },
  };

  for (const sensor of sensors) {
    const lit: number[] = [];
    days.forEach((day, i) => {
      const s = day.sensors[sensor];
      s.cells = cells[sensor][i].size;
      s.frp = Math.round(s.frp * 10) / 10;
      totals[sensor].detections += s.detections;
      totals[sensor].frp += s.frp;
      if (s.cells > 0) {
        totals[sensor].activeDays++;
        lit.push(s.cells);
      }
    });
    lit.sort((a, b) => a - b);
    // The 95th percentile of burning days: robust to one freak day.
    reference[sensor] = Math.max(1, percentile(lit, 0.95));
    totals[sensor].frp = Math.round(totals[sensor].frp);
  }

  for (const day of days) {
    const m = day.sensors.MODIS;
    const v = day.sensors.VIIRS;
    m.scaled = Math.min(1, m.cells / reference.MODIS);
    v.scaled = Math.min(1, v.cells / reference.VIIRS);
    day.index = (m.scaled + v.scaled) / 2;
    const any = m.detections + v.detections > 0;
    day.level = levelOf(day.index, any);
    const top = Math.max(m.scaled, v.scaled);
    day.agreement = any && top > 0 ? 1 - Math.abs(m.scaled - v.scaled) / top : null;
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
    day.anomaly =
      day.index >= ANOMALY_FLOOR &&
      day.index >= mid * 2 &&
      day.index > mid + Math.max(ANOMALY_MARGIN, 4 * spread);
  });

  return {
    year,
    days,
    reference,
    totals,
    criticalPeriod: findCriticalPeriod(days),
    anomalies: days.filter((d) => d.anomaly).map((d) => d.date),
  };
}

/** The contiguous run around the yearly peak where the smoothed index stays above 35% of it. */
function findCriticalPeriod(days: DaySummary[]): YearSummary["criticalPeriod"] {
  const half = 7;
  const smooth = days.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(days.length - 1, i + half); k++) {
      sum += days[k].index;
      n++;
    }
    return sum / n;
  });
  const peak = Math.max(...smooth);
  if (peak <= 0) return null;
  const at = smooth.indexOf(peak);
  const floor = peak * 0.35;
  let start = at;
  let end = at;
  while (start > 0 && smooth[start - 1] >= floor) start--;
  while (end < days.length - 1 && smooth[end + 1] >= floor) end++;
  return { start: days[start].date, end: days[end].date, days: end - start + 1 };
}
