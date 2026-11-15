import type { AreaData } from "./data/area";
import { meta } from "./data/meta";
import type { Sensor } from "./data/types";
import { addDays, dateOfDay, daysInYear, monthStamp } from "./dates";

/**
 * One record per area, in MODIS-Aqua-equivalent hot spots.
 *
 * The harmonization itself happens offline (harmonization/, negative binomial
 * model on a 0.25° grid, validated year by year). This module turns the area's
 * sums into what the interface shows:
 *
 *  1. Through `meta.observedUntil` (2025) the series is MODIS Aqua as observed.
 *     From then on it is VIIRS NOAA-20 converted to the MODIS Aqua scale.
 *  2. The model works by month. A month's harmonized VIIRS total is spread over
 *     its days in proportion to the VIIRS detections of each day (degraded to
 *     ~1 km), so the days always add up to the month.
 *  3. Each day is scaled against the area's own busy day (95th percentile of
 *     burning days) into an index from 0 to 1, for the calendar.
 *  4. Each month is set against the median of the same month over 2003–2025,
 *     computed on the area's own monthly totals.
 */

export type Source = "observed" | "modeled";

export interface SensorDay {
  /** Detections as reported, summed over the area. */
  detections: number;
  /** 0.25° cells with at least one detection. */
  cells: number;
  day: number;
  night: number;
  /** This sensor's view of the day in MODIS-Aqua-equivalent hot spots; null when the sensor did not fly. */
  estimate: number | null;
  /** That estimate on the 0-1 index. */
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
  /** False before VIIRS NOAA-20: the day rests on MODIS Aqua alone. */
  bothSensors: boolean;
  /** Observed MODIS Aqua, or VIIRS converted by the model. */
  source: Source;
  /** Harmonized activity in MODIS-Aqua-equivalent hot spots. */
  value: number;
  /** Harmonized activity, 0 to 1. */
  index: number;
  level: Level;
  /** What the surrounding three weeks suggest for this day, 0 to 1. */
  expected: number;
  /** True when the day burns far above its surrounding three weeks. */
  anomaly: boolean;
  /** 1 when MODIS Aqua and harmonized VIIRS agree, 0 when one sees nothing. */
  agreement: number | null;
}

/** One calendar month of one year, set against the same month in other years. */
export interface MonthCell {
  year: number;
  /** 0 to 11. */
  month: number;
  /** Harmonized hot spots in the month (MODIS-Aqua-equivalent). */
  value: number;
  source: Source;
  /** 95% interval of a modeled month; null when observed. */
  lo: number | null;
  hi: number | null;
  /** The record covers only part of this calendar month. */
  partial: boolean;
  /** Raw detections in the month, per sensor, as reported. */
  detections: Record<Sensor, number>;
  /** VIIRS converted to the MODIS Aqua scale, from April 2018; null before. */
  viirsHarmonized: number | null;
  /** Median of this calendar month over the base years. */
  median: number;
  /** value / median, or null when the median is zero. */
  ratio: number | null;
  /** 1 is the highest this calendar month has been, out of `rankOf` complete months. */
  rank: number;
  rankOf: number;
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
  scope?: "entire_country_only";
  years: number[];
  days: DaySummary[];
  /** Hot spots that scale to an index of 1. */
  reference: number;
  months: MonthCell[];
  /** Median for each calendar month, over the base years. */
  monthlyMedian: number[];
  /** `complete` is false for years that started or ended mid-way. */
  yearTotals: { year: number; value: number; median: number; complete: boolean }[];
  season: Season | null;
  /** Grid cells in the area, and its biomes. */
  cells: number;
  biomes: { name: string; share: number }[];
  /** Both sensors over the years MODIS Aqua is still the reference. */
  overlap: { from: string; to: string; modis: number; viirs: number; viirsHarmonized: number } | null;
}

/** One year of a record, in the shape the calendar and charts read. */
export interface YearSummary {
  year: number;
  days: DaySummary[];
  totals: Record<Sensor, { detections: number }>;
  /** The typical fire season, as dates in this year. */
  criticalPeriod: { start: string; end: string; days: number; wraps: boolean } | null;
  anomalies: string[];
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

export function median(values: number[]): number {
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

export type RecordContext = Pick<typeof meta, "observedUntil" | "climatologyBase" | "commonErrorC" | "viirsStart" | "partialMonth" | "epochYear">;

export function buildRecord(area: AreaData, context: RecordContext = meta): FireRecord {
  const { observedUntil, climatologyBase, commonErrorC, viirsStart, partialMonth, epochYear } = context;
  const monthOf = (date: string) =>
    (Number(date.slice(0, 4)) - epochYear) * 12 + Number(date.slice(5, 7)) - 1 - area.firstMonth;

  // Monthly sums of the daily columns.
  const n = area.months;
  const mAqua = new Float64Array(n);
  const mViirs = new Float64Array(n);
  const mKm = new Float64Array(n);
  const mDays = new Float64Array(n);
  const dates: string[] = [];
  const dayMonth = new Int32Array(area.days);
  for (let k = 0; k < area.days; k++) {
    const date = addDays(area.firstDay, k);
    const m = monthOf(date);
    dates.push(date);
    dayMonth[k] = m;
    mAqua[m] += area.aquaD[k] + area.aquaN[k];
    mViirs[m] += area.viirsD[k] + area.viirsN[k];
    mKm[m] += area.viirsKm[k];
    mDays[m]++;
  }

  // Steps 1 and 2: one value per day.
  const days: DaySummary[] = dates.map((date, k) => {
    const m = dayMonth[k];
    const year = Number(date.slice(0, 4));
    const both = date >= viirsStart;
    const mu = area.mu[m];
    const viirsEstimate =
      both && !Number.isNaN(mu) ? (mKm[m] > 0 ? (mu * area.viirsKm[k]) / mKm[m] : mu / mDays[m]) : null;
    const aqua = area.aquaD[k] + area.aquaN[k];
    const viirs = area.viirsD[k] + area.viirsN[k];
    const modeled = year > observedUntil && viirsEstimate !== null;
    const dayOfYear = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
    return {
      date,
      year,
      dayOfYear,
      sensors: {
        MODIS: { detections: aqua, cells: area.aquaCells[k], day: area.aquaD[k], night: area.aquaN[k], estimate: aqua, scaled: 0 },
        VIIRS: {
          detections: both ? viirs : 0,
          cells: area.viirsCells[k],
          day: area.viirsD[k],
          night: area.viirsN[k],
          estimate: viirsEstimate,
          scaled: 0,
        },
      },
      bothSensors: both,
      source: modeled ? "modeled" : "observed",
      value: modeled ? (viirsEstimate as number) : aqua,
      index: 0,
      level: 0,
      expected: 0,
      anomaly: false,
      agreement: null,
    };
  });

  // Step 3: scale against the area's own busy day.
  const burning = days.map((d) => d.value).filter((v) => v > 0).sort((a, b) => a - b);
  const reference = Math.max(1, percentile(burning, 0.95));
  for (const day of days) {
    const a = day.sensors.MODIS;
    const v = day.sensors.VIIRS;
    a.scaled = Math.min(1, (a.estimate ?? 0) / reference);
    v.scaled = Math.min(1, (v.estimate ?? 0) / reference);
    day.index = Math.min(1, day.value / reference);
    day.level = levelOf(day.index, a.detections + v.detections > 0);
    if (v.estimate !== null) {
      const top = Math.max(a.estimate ?? 0, v.estimate);
      day.agreement = top > 0 ? 1 - Math.abs((a.estimate ?? 0) - v.estimate) / top : null;
    }
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

  // Step 4: months against their own history.
  const months: MonthCell[] = [];
  for (let m = 0; m < n; m++) {
    const abs = area.firstMonth + m;
    const year = epochYear + Math.floor(abs / 12);
    const month = abs % 12;
    const mu = area.mu[m];
    const modeled = year > observedUntil && !Number.isNaN(mu);
    const value = modeled ? mu : mAqua[m];
    const sd = modeled ? Math.sqrt((Number.isNaN(area.variance[m]) ? 0 : area.variance[m]) + (commonErrorC * value) ** 2) : 0;
    months.push({
      year,
      month,
      value,
      source: modeled ? "modeled" : "observed",
      lo: modeled ? Math.max(0, value - 1.96 * sd) : null,
      hi: modeled ? value + 1.96 * sd : null,
      partial: monthStamp(year, month) === partialMonth || mDays[m] < new Date(Date.UTC(year,month+1,0)).getUTCDate(),
      detections: { MODIS: mAqua[m], VIIRS: mViirs[m] },
      viirsHarmonized: Number.isNaN(mu) ? null : mu,
      median: 0,
      ratio: null,
      rank: 1,
      rankOf: 1,
      level: 0,
    });
  }
  const inBase = (year: number) => year >= climatologyBase[0] && year <= climatologyBase[1];
  const top = Math.max(percentile(months.map((c) => c.value).filter((v) => v > 0).sort((a, b) => a - b), 0.98), 1e-9);
  const steps = [0.03, 0.1, 0.3, 0.6].map((f) => f * top);
  const monthlyMedian = Array.from({ length: 12 }, (_, m) => {
    const same = months.filter((c) => c.month === m);
    const mid = median(same.filter((c) => inBase(c.year)).map((c) => c.value));
    const ranked = same.filter((c) => !c.partial);
    for (const cell of same) {
      cell.median = mid;
      cell.ratio = mid > 0 ? cell.value / mid : null;
      cell.rank = 1 + ranked.filter((o) => o.value > cell.value).length;
      cell.rankOf = ranked.length;
      cell.level = cell.value <= 0 ? 0 : ((1 + steps.filter((s) => cell.value > s).length) as Level);
    }
    return mid;
  });

  const years = [...new Set(months.map((c) => c.year))];
  const totals = years.map((year) => {
    const of = months.filter((c) => c.year === year);
    return { year, value: of.reduce((s, c) => s + c.value, 0), complete: of.length === 12 && !of.some((c) => c.partial) };
  });
  const typical = median(totals.filter((t) => inBase(t.year)).map((t) => t.value));

  const both = months.filter((c) => c.viirsHarmonized !== null && c.year <= observedUntil);
  const overlap = both.length
    ? {
        from: monthStamp(both[0].year, both[0].month),
        to: monthStamp(both[both.length - 1].year, both[both.length - 1].month),
        modis: both.reduce((s, c) => s + c.detections.MODIS, 0),
        viirs: both.reduce((s, c) => s + c.detections.VIIRS, 0),
        viirsHarmonized: both.reduce((s, c) => s + (c.viirsHarmonized ?? 0), 0),
      }
    : null;

  return {
    years,
    days,
    reference,
    months,
    monthlyMedian,
    yearTotals: totals.map((t) => ({ ...t, median: typical })),
    season: findSeason(days),
    cells: area.cells,
    biomes: area.biomes,
    overlap,
  };
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
  const totals = { MODIS: { detections: 0 }, VIIRS: { detections: 0 } };
  for (const day of days) {
    totals.MODIS.detections += day.sensors.MODIS.detections;
    totals.VIIRS.detections += day.sensors.VIIRS.detections;
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
