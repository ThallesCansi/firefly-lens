import { meta } from "./data/meta";

/**
 * Which cells of the map burn unusually for the month shown.
 *
 * A cell-month is unusual when it is higher than at least 90% of the same
 * calendar month in the other reference years (2003–2025) of that same cell,
 * and reaches a minimum of hot spots. Four choices keep the judgement sound:
 *
 *  1. The year being judged is left out of its own reference. Judging a year
 *     against a threshold it helped to set makes exceedances rarer inside the
 *     reference period than outside it.
 *  2. The test is a rank, not a fitted distribution: counts per cell are
 *     skewed and full of zeros, so a mean and a standard deviation mislead.
 *     "Higher" is strict, so a value tied with the reference is not unusual.
 *  3. In a modeled month (VIIRS converted to the MODIS Aqua scale) the count
 *     MODIS Aqua would have recorded in a cell is not known: the model gives
 *     its distribution, a negative binomial with the stored mean and variance.
 *     A cell is unusual when that count is more likely than not to pass the
 *     test. The symmetric 95% range the record uses for an area cannot serve
 *     here: in one cell the distribution is so skewed that its low end is zero.
 *  4. Many cells are judged at once, so some pass by chance: with 23 reference
 *     years, up to about one cell in eight in an ordinary year. The number of
 *     unusual cells is therefore reported next to the number that is typical
 *     for that calendar month, counted the same way over the reference years.
 *     For a modeled month the number reported is the expected one, the sum of
 *     the cells' probabilities, which compares with observed years on equal
 *     terms.
 */

/** Share of the other reference years a cell-month must exceed. */
export const UNUSUAL_SHARE = 0.9;

/**
 * Fewest hot spots (MODIS-Aqua-equivalent) in the month for a cell to count.
 * In a cell that rarely burns, one or two detections outrank every other year;
 * the floor keeps such faint signals out. It is a judgement threshold, not a
 * statistical one.
 */
export const UNUSUAL_FLOOR = 5;

/** The monthly record of every cell of an area, as far as the judgement needs it. */
export interface CellHistory {
  /** Year of the first twelve entries of each `aqua` array. */
  firstYear: number;
  /** MODIS Aqua detections per cell: twelve calendar months per year, from `firstYear`. */
  aqua: Map<number, Float32Array>;
  /** Harmonized VIIRS per cell for the modeled months, keyed like the `aqua` index: [value, variance]. */
  modeled: Map<number, Map<number, [number, number]>>;
}

/** A modeled cell glows when its count is at least this likely to pass the test. */
export const UNUSUAL_PROBABILITY = 0.5;

export interface UnusualRules {
  /** First and last reference year. */
  base: [number, number];
  /** Through this year a month is MODIS Aqua as observed; after it, modeled. */
  observedUntil: number;
}

const RULES: UnusualRules = { base: meta.climatologyBase, observedUntil: meta.observedUntil };

/** True when `value` reaches the floor and is strictly higher than at least 90% of `others`. */
export function isUnusual(value: number, others: ArrayLike<number>): boolean {
  if (!(value >= UNUSUAL_FLOOR) || others.length === 0) return false;
  let below = 0;
  for (let i = 0; i < others.length; i++) if (others[i] < value) below++;
  return below >= UNUSUAL_SHARE * others.length;
}

/** The smallest whole count that is unusual against `others`: the same test, solved for the value. */
export function unusualThreshold(others: ArrayLike<number>): number {
  if (others.length === 0) return Infinity;
  const sorted = Array.from(others).sort((a, b) => a - b);
  const needed = Math.ceil(UNUSUAL_SHARE * sorted.length - 1e-9);
  return Math.max(UNUSUAL_FLOOR, Math.floor(sorted[needed - 1]) + 1);
}

/**
 * Probability that a count reaches `k`, for a count with the given mean and
 * variance: negative binomial, or Poisson when the variance does not exceed
 * the mean. Summed term by term in logarithms, so large means do not underflow.
 */
export function tailProbability(k: number, mean: number, variance: number): number {
  const reach = Math.ceil(k);
  if (reach <= 0) return 1;
  if (!(mean > 0) || !Number.isFinite(reach)) return 0;
  const over = variance > mean;
  // Negative binomial with size r: variance = mean + mean² / r.
  const r = over ? (mean * mean) / (variance - mean) : 0;
  const ratio = over ? Math.log(mean / (r + mean)) : Math.log(mean);
  let logTerm = over ? r * Math.log(r / (r + mean)) : -mean;
  let below = 0;
  for (let i = 0; i < reach; i++) {
    below += Math.exp(logTerm);
    logTerm += ratio + (over ? Math.log((i + r) / (i + 1)) : -Math.log(i + 1));
  }
  return Math.min(1, Math.max(0, 1 - below));
}

export interface UnusualMonth {
  /** Cells that are unusually high this month; in a modeled month, the ones more likely than not to be. */
  ids: Set<number>;
  /** How many cells are unusual: a count when observed, the sum of the cells' probabilities when modeled. */
  count: number;
  /** Unusual cells in a typical year: the median over the reference years, counted the same way. */
  typical: number;
  /** The month is modeled: `count` is an expectation and `ids` holds probable cells. */
  modeled: boolean;
}

/** Judges every cell of `history` for one month (`month0` is 0 to 11). */
export function unusualMonth(
  history: CellHistory,
  year: number,
  month0: number,
  rules: UnusualRules = RULES,
): UnusualMonth {
  const [first, last] = rules.base;
  const modeled = year > rules.observedUntil;
  const at = (y: number) => (y - history.firstYear) * 12 + month0;
  const ids = new Set<number>();
  let expected = 0;
  const perYear = new Array<number>(last - first + 1).fill(0);
  const reference = new Float64Array(last - first + 1);
  const others = new Float64Array(last - first);

  for (const [id, aqua] of history.aqua) {
    for (let y = first; y <= last; y++) reference[y - first] = aqua[at(y)] ?? 0;
    // Each reference year against the others: what an ordinary year looks like.
    for (let y = first; y <= last; y++) {
      let n = 0;
      for (let o = first; o <= last; o++) if (o !== y) others[n++] = reference[o - first];
      if (isUnusual(reference[y - first], others)) {
        perYear[y - first]++;
        if (y === year) ids.add(id);
      }
    }
    if (year >= first && year <= last) continue;
    // A year outside the reference is judged against all of it.
    if (!modeled) {
      if (isUnusual(aqua[at(year)] ?? 0, reference)) ids.add(id);
      continue;
    }
    const estimate = history.modeled.get(id)?.get(at(year));
    if (!estimate) continue;
    const probability = tailProbability(unusualThreshold(reference), estimate[0], estimate[1]);
    expected += probability;
    if (probability >= UNUSUAL_PROBABILITY) ids.add(id);
  }
  const sorted = [...perYear].sort((a, b) => a - b);
  const mid = (sorted.length - 1) / 2;
  const typical = (sorted[Math.floor(mid)] + sorted[Math.ceil(mid)]) / 2;
  return { ids, count: modeled ? expected : ids.size, typical, modeled };
}
