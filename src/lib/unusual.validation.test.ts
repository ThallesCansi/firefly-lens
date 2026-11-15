import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { cellHistory } from "./data/history";
import { meta } from "./data/meta";
import { loadTile, tilesFor } from "./data/tiles";
import { rectangleArea } from "./data/types";
import { UNUSUAL_PROBABILITY, isUnusual, tailProbability, unusualThreshold } from "./unusual";

/**
 * Checks the rule for modeled months against months where the answer is known.
 *
 * From April 2018 the files hold both the MODIS Aqua count of each cell and
 * the harmonized VIIRS value. For February, May, August, September, October
 * and November of 2019–2023, over every cell of Brazil, this test asks the
 * modeled rule which cells are unusual and compares with the observed counts.
 * The Method page quotes these results.
 *
 * Two limits. The per-cell variance is shipped for the modeled months only, so
 * here it is rebuilt from the mean with the median dispersion of those shipped
 * variances. And 2019–2023 are years the harmonization model was fitted on.
 */
const YEARS = [2019, 2020, 2021, 2022, 2023];
const MONTHS = [1, 4, 7, 8, 9, 10];

const totals = { observed: 0, expected: 0, glowing: 0, hits: 0 };

beforeAll(async () => {
  globalThis.fetch = (async (url: string) => new Response(readFileSync(`public${url}`))) as unknown as typeof fetch;
  const area = rectangleArea(meta.bounds);
  const history = await cellHistory(area);
  const at = (year: number, month0: number) => (year - history.firstYear) * 12 + month0;

  // The harmonized value of every cell-month, read straight from the tiles.
  const harmonized = new Map<number, Map<number, number>>();
  for (const [tx, ty] of tilesFor(area.bbox)) {
    const tile = await loadTile(tx, ty);
    for (let i = 0; i < tile.monthly.mu.length; i++) {
      const local = tile.monthly.cell[i];
      const id =
        (tile.ty * meta.tileCells + Math.floor(local / meta.tileCells)) * 1000 +
        tile.tx * meta.tileCells +
        (local % meta.tileCells);
      let cell = harmonized.get(id);
      if (!cell) harmonized.set(id, (cell = new Map()));
      cell.set(tile.monthly.month[i], tile.monthly.mu[i]);
    }
  }

  const dispersions: number[] = [];
  for (const cell of history.modeled.values())
    for (const [mean, variance] of cell.values()) if (mean >= 5) dispersions.push((variance - mean) / (mean * mean));
  dispersions.sort((a, b) => a - b);
  const dispersion = dispersions[dispersions.length >> 1];

  for (const year of YEARS)
    for (const month of MONTHS)
      for (const [id, aqua] of history.aqua) {
        const others: number[] = [];
        for (let y = meta.climatologyBase[0]; y <= meta.climatologyBase[1]; y++) if (y !== year) others.push(aqua[at(y, month)]);
        const observed = isUnusual(aqua[at(year, month)], others);
        const mean = harmonized.get(id)?.get(at(year, month)) ?? 0;
        const probability = mean > 0 ? tailProbability(unusualThreshold(others), mean, mean + dispersion * mean * mean) : 0;
        const glows = probability >= UNUSUAL_PROBABILITY;
        totals.expected += probability;
        if (observed) totals.observed++;
        if (glows) totals.glowing++;
        if (observed && glows) totals.hits++;
      }
}, 120_000);

describe("the modeled rule, against 30 observed months over Brazil", () => {
  it("expects about as many unusual cells as MODIS Aqua recorded", () => {
    expect(totals.observed).toBeGreaterThan(10_000);
    expect(totals.expected / totals.observed).toBeGreaterThan(0.95);
    expect(totals.expected / totals.observed).toBeLessThan(1.05);
  });

  it("is right about three glowing cells in four", () => {
    expect(totals.hits / totals.glowing).toBeGreaterThan(0.72);
  });

  it("lights fewer than half of the cells that were unusual", () => {
    expect(totals.hits / totals.observed).toBeGreaterThan(0.35);
    expect(totals.hits / totals.observed).toBeLessThan(0.5);
  });
});
