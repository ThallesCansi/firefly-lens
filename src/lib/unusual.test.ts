import { describe, expect, it } from "vitest";
import {
  UNUSUAL_FLOOR,
  isUnusual,
  tailProbability,
  unusualMonth,
  unusualThreshold,
  type CellHistory,
  type UnusualRules,
} from "./unusual";

const RULES: UnusualRules = { base: [2003, 2025], observedUntil: 2025 };
const FIRST = 2002;
const YEARS = 2026 - FIRST + 1;

/** A cell whose September holds `value(year)`; every other month is empty. */
function cell(value: (year: number) => number): Float32Array {
  const aqua = new Float32Array(YEARS * 12);
  for (let y = FIRST; y < FIRST + YEARS; y++) aqua[(y - FIRST) * 12 + 8] = value(y);
  return aqua;
}
const september = (y: number) => (y - FIRST) * 12 + 8;
const history = (cells: Float32Array[], modeled: CellHistory["modeled"] = new Map()): CellHistory => ({
  firstYear: FIRST,
  aqua: new Map(cells.map((c, i) => [i, c])),
  modeled,
});

describe("isUnusual", () => {
  const others = Array.from({ length: 22 }, (_, i) => 10 + i); // 10 … 31

  it("asks for a value higher than at least 90% of the other years", () => {
    expect(isUnusual(30, others)).toBe(true); // 20 of 22 below
    expect(isUnusual(29, others)).toBe(false); // 19 of 22 below
  });

  it("does not count a tie as higher", () => {
    expect(isUnusual(8, new Array(22).fill(8))).toBe(false);
    expect(isUnusual(9, new Array(22).fill(8))).toBe(true);
  });

  it("ignores faint signals, however rare for the cell", () => {
    const quiet = new Array(22).fill(0);
    expect(isUnusual(UNUSUAL_FLOOR - 1, quiet)).toBe(false);
    expect(isUnusual(UNUSUAL_FLOOR, quiet)).toBe(true);
  });

  it("judges nothing without a reference", () => {
    expect(isUnusual(100, [])).toBe(false);
  });
});

describe("unusualThreshold", () => {
  it("is the smallest whole count the test accepts", () => {
    const records = [
      Array.from({ length: 22 }, (_, i) => 10 + i),
      Array.from({ length: 23 }, (_, i) => (i * 37) % 61),
      new Array(23).fill(0),
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 3, 400],
    ];
    for (const others of records) {
      const threshold = unusualThreshold(others);
      for (let k = 0; k <= 450; k++) expect(isUnusual(k, others)).toBe(k >= threshold);
    }
  });

  it("is the floor in a cell that never burned", () => {
    expect(unusualThreshold(new Array(23).fill(0))).toBe(UNUSUAL_FLOOR);
  });
});

describe("tailProbability", () => {
  it("is Poisson when the variance does not exceed the mean", () => {
    expect(tailProbability(1, 2, 2)).toBeCloseTo(1 - Math.exp(-2), 10);
    expect(tailProbability(3, 2, 2)).toBeCloseTo(1 - 5 * Math.exp(-2), 10);
  });

  it("is negative binomial when the count is overdispersed", () => {
    // Mean 4, variance 12: size 2, success probability 1/3.
    expect(tailProbability(1, 4, 12)).toBeCloseTo(8 / 9, 10);
    expect(tailProbability(2, 4, 12)).toBeCloseTo(20 / 27, 10);
  });

  it("falls as the count to reach rises, from 1 to 0", () => {
    const reach = [0, 1, 5, 20, 50, 100, 400, 5000].map((k) => tailProbability(k, 40, 40 + 0.5 * 40 * 40));
    expect(reach[0]).toBe(1);
    for (let i = 1; i < reach.length; i++) expect(reach[i]).toBeLessThan(reach[i - 1]);
    expect(reach.at(-1)).toBeLessThan(1e-12);
  });

  it("handles a mean too large for a plain exponential, and no fire at all", () => {
    expect(tailProbability(100, 5000, 5000)).toBeCloseTo(1, 10);
    expect(tailProbability(5, 0, 0)).toBe(0);
  });
});

describe("unusualMonth", () => {
  it("flags the cell that stands out in the year judged, leaving that year out of its own reference", () => {
    const steady = cell(() => 20);
    const spike = cell((y) => (y === 2020 ? 90 : 20));
    const result = unusualMonth(history([steady, spike]), 2020, 8, RULES);
    expect([...result.ids]).toEqual([1]);
    expect(result.modeled).toBe(false);
    expect(unusualMonth(history([steady, spike]), 2019, 8, RULES).ids.size).toBe(0);
  });

  it("would miss a record year if it were left in its own reference", () => {
    // 2024 and 2025 are the two highest years. Against the other 22, 2024 is
    // above 21 of them (95%); with itself among the 23 it would still pass,
    // but the third highest year shows the difference: above 20 of 22 (91%)
    // when held out, 20 of 23 (87%) when not.
    const rising = cell((y) => (y >= 2003 && y <= 2025 ? y - 1990 : 0));
    expect(unusualMonth(history([rising]), 2023, 8, RULES).ids.has(0)).toBe(true);
    expect(isUnusual(2023 - 1990, Array.from({ length: 23 }, (_, i) => 2003 + i - 1990))).toBe(false);
  });

  it("judges a modeled month by the probability that its count would pass", () => {
    const steady = cell(() => 20); // unusual from 21 hot spots
    const at = september(2026);
    const modeled = (mean: number): CellHistory["modeled"] =>
      new Map([[0, new Map([[at, [mean, mean + 0.5 * mean * mean] as [number, number]]])]]);
    const likely = unusualMonth(history([steady], modeled(60)), 2026, 8, RULES);
    expect(likely.modeled).toBe(true);
    expect(likely.ids.has(0)).toBe(true);
    expect(likely.count).toBeCloseTo(tailProbability(21, 60, 60 + 0.5 * 3600), 10);
    // A central estimate just above every reference year: less likely than not.
    const doubtful = unusualMonth(history([steady], modeled(24)), 2026, 8, RULES);
    expect(doubtful.ids.has(0)).toBe(false);
    expect(doubtful.count).toBeGreaterThan(0.2);
    expect(doubtful.count).toBeLessThan(0.5);
  });

  it("counts an observed month by its cells and a modeled month by its probabilities", () => {
    // Three high years, so the third highest value of the record is 90.
    const cells = Array.from({ length: 4 }, () => cell((y) => (y >= 2018 && y <= 2020 ? 90 : 20)));
    const observed = unusualMonth(history(cells), 2020, 8, RULES);
    expect(observed.count).toBe(observed.ids.size);
    const at = september(2026);
    const estimates: CellHistory["modeled"] = new Map(
      cells.map((_, i) => [i, new Map([[at, [30, 30 + 0.5 * 900] as [number, number]]])]),
    );
    const result = unusualMonth(history(cells, estimates), 2026, 8, RULES);
    // Each cell is unusual from 91 hot spots; none is likely, yet together they add up.
    expect(result.ids.size).toBe(0);
    expect(result.count).toBeCloseTo(4 * tailProbability(91, 30, 480), 10);
  });

  it("does not use MODIS Aqua itself after the observed years", () => {
    const aquaSpike = cell((y) => (y === 2026 ? 500 : 20));
    expect(unusualMonth(history([aquaSpike]), 2026, 8, RULES).ids.size).toBe(0);
  });

  it("reports how many cells are unusual in a typical reference year", () => {
    // Twelve cells, each with one standout year, spread over 2003–2014: one
    // unusual cell in each of those years, none in the other eleven.
    const cells = Array.from({ length: 12 }, (_, i) => cell((y) => (y === 2003 + i ? 80 : 10)));
    expect(unusualMonth(history(cells), 2010, 8, RULES).typical).toBe(1);
    // Every cell stands out in the same year: an ordinary year has none.
    const together = Array.from({ length: 12 }, () => cell((y) => (y === 2010 ? 80 : 10)));
    const result = unusualMonth(history(together), 2010, 8, RULES);
    expect(result.ids.size).toBe(12);
    expect(result.typical).toBe(0);
  });

  it("judges the months before the reference period against all of it", () => {
    const early = cell((y) => (y === 2002 ? 70 : 10));
    expect(unusualMonth(history([early]), 2002, 8, RULES).ids.has(0)).toBe(true);
  });
});
