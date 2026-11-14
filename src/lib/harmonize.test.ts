import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cellCounts, loadArea, type AreaData } from "./data/area";
import { meta } from "./data/meta";
import { decodeTile, tilesFor } from "./data/tiles";
import { drawnArea, normalizeBBox, rectangleArea, type BBox } from "./data/types";
import { buildRecord, yearView, type FireRecord } from "./harmonize";

const PUBLIC = join(__dirname, "../../public");

/**
 * A 12° × 12° area aligned to the 0.25° grid, so every cell counts whole. The
 * expected figures were computed in Python from
 * harmonization/output/grid_monthly_total.parquet over the same 2304 cells.
 */
const AREA: BBox = [-60, -16, -48, -4];
const EXPECTED = {
  cells: 2304,
  modis_2024_09: 44519,
  viirs_2024_09: 324177,
  mu_2026_09: 7011.874,
  var_2026_09: 75728.885,
  modis_2026_09: 6806,
  modis_2003_2025: 1656937,
  median_september: 20551,
};

let area: AreaData;
let record: FireRecord;
const month = (r: FireRecord, year: number, m: number) => r.months.find((c) => c.year === year && c.month === m - 1)!;

beforeAll(async () => {
  vi.stubGlobal("fetch", async (url: string) => new Response(readFileSync(join(PUBLIC, url))));
  area = await loadArea(rectangleArea(AREA));
  record = buildRecord(area);
});

describe("data tiles", () => {
  it("decode with the header the pipeline wrote", () => {
    const [tx, ty] = meta.tiles[0];
    const raw = gunzipSync(readFileSync(join(PUBLIC, `data/brazil/t_${tx}_${ty}.bin.gz`)));
    const tile = decodeTile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    expect([tile.tx, tile.ty]).toEqual([tx, ty]);
    expect(tile.biome.length).toBe(256);
    expect(tile.daily.day.length).toBe(tile.daily.cell.length);
    // Days are sorted, and none falls before MODIS Aqua began.
    expect(tile.daily.day[0]).toBeGreaterThanOrEqual(182);
  });

  it("are listed only where Brazil has grid cells", () => {
    expect(tilesFor([-20, 10, -10, 20])).toEqual([]);
    // Cells 56–103 by 72–119 fall in tiles 3–6 by 4–7.
    expect(tilesFor(AREA).length).toBe(16);
  });
});

describe("an area's record", () => {
  it("covers the same cells as the pipeline", () => {
    expect(area.cells).toBe(EXPECTED.cells);
    expect(area.biomes[0].name).toBe("Amazônia");
  });

  it("is MODIS Aqua as observed through 2025", () => {
    const sep = month(record, 2024, 9);
    expect(sep.source).toBe("observed");
    expect(sep.value).toBe(EXPECTED.modis_2024_09);
    expect(sep.detections.VIIRS).toBe(EXPECTED.viirs_2024_09);
    expect(sep.lo).toBeNull();
    const total = record.months.filter((c) => c.year >= 2003 && c.year <= 2025).reduce((s, c) => s + c.value, 0);
    expect(total).toBe(EXPECTED.modis_2003_2025);
  });

  it("is harmonized VIIRS from 2026, with its interval", () => {
    const sep = month(record, 2026, 9);
    expect(sep.source).toBe("modeled");
    expect(sep.value).toBeCloseTo(EXPECTED.mu_2026_09, 1);
    expect(sep.detections.MODIS).toBe(EXPECTED.modis_2026_09);
    const sd = Math.sqrt(EXPECTED.var_2026_09 + (meta.commonErrorC * EXPECTED.mu_2026_09) ** 2);
    expect(sep.hi! - sep.value).toBeCloseTo(1.96 * sd, 0);
  });

  it("spreads a modeled month over its days without losing any of it", () => {
    const days = record.days.filter((d) => d.date.startsWith("2026-09"));
    expect(days.every((d) => d.source === "modeled")).toBe(true);
    const sum = days.reduce((s, d) => s + d.value, 0);
    expect(sum).toBeCloseTo(month(record, 2026, 9).value, 3);
  });

  it("compares a month with the median of the same month over 2003-2025", () => {
    expect(month(record, 2024, 9).median).toBe(EXPECTED.median_september);
    expect(record.monthlyMedian[8]).toBe(EXPECTED.median_september);
  });

  it("flags the month in progress and keeps it out of the ranks", () => {
    const nov = month(record, 2026, 11);
    expect(nov.partial).toBe(true);
    expect(month(record, 2025, 11).rankOf).toBe(24);
  });

  it("starts with MODIS Aqua and ends on the last day of data", () => {
    expect(record.days[0].date).toBe(meta.firstDay);
    expect(record.days[record.days.length - 1].date).toBe(meta.lastDay);
    expect(record.days.find((d) => d.date === "2018-03-31")!.bothSensors).toBe(false);
    expect(record.days.find((d) => d.date === "2018-04-01")!.bothSensors).toBe(true);
  });

  it("finds a dry-season fire season and scales days from 0 to 1", () => {
    const y = yearView(record, 2024);
    expect(y.criticalPeriod).not.toBeNull();
    expect(y.criticalPeriod!.start.slice(5, 7) >= "06" && y.criticalPeriod!.start.slice(5, 7) <= "08").toBe(true);
    expect(Math.max(...record.days.map((d) => d.index))).toBe(1);
    expect(record.days.every((d) => d.index >= 0)).toBe(true);
  });
});

describe("map cells", () => {
  it("add up to the area's detections when every cell is whole", async () => {
    const cells = await cellCounts(rectangleArea(AREA), "2024-09-01", "2024-09-30");
    expect(cells.reduce((s, c) => s + c.modis, 0)).toBe(EXPECTED.modis_2024_09);
    expect(cells.every((c) => c.weight === 1)).toBe(true);
  });
});

describe("polygon areas", () => {
  it("count half of the cells a diagonal cuts in two", async () => {
    // The triangle under the diagonal of the test area: whole cells below it, halves on it.
    const [w, s, e, n] = AREA;
    const triangle = drawnArea([
      [w, s],
      [e, s],
      [e, n],
    ]);
    const half = await loadArea(triangle);
    expect(half.cells).toBe((48 * 49) / 2);
    const cells = await cellCounts(triangle, "2024-09-01", "2024-09-30");
    expect(cells.filter((c) => c.weight > 0 && c.weight < 1).every((c) => Math.abs(c.weight - 0.5) < 1e-9)).toBe(true);
    const total = cells.reduce((sum, c) => sum + c.weight * c.modis, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(EXPECTED.modis_2024_09);
  });
});

describe("areas", () => {
  it("stay inside the covered box and within 12 degrees", () => {
    expect(normalizeBBox([-100, -50, -80, -40])[0]).toBeGreaterThanOrEqual(-74);
    const big = normalizeBBox([-70, -30, -40, 0]);
    expect(big[2] - big[0]).toBeLessThanOrEqual(12);
    expect(big[3] - big[1]).toBeLessThanOrEqual(12);
  });
});
