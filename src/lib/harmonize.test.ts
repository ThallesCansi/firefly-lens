import { describe, expect, it } from "vitest";
import { generateHotspots, mockSource, plantedBursts } from "./data/mock";
import type { BBox } from "./data/types";
import { buildRecord, gridYear, harmonize, type FireRecord } from "./harmonize";

/** Two tiles of the Southern Amazon, aligned to the simulation's tile grid. */
const AREA: BBox = [-60, -12, -52, -8];

function record(bbox: BBox, first: number, last: number): FireRecord {
  const years = [];
  for (let y = first; y <= last; y++) years.push(gridYear(generateHotspots(bbox, `${y}-01-01`, `${y}-12-31`), y));
  return buildRecord(years);
}

const full = record(AREA, 2001, 2025);

describe("simulated source", () => {
  it("produces the same records for the same request", async () => {
    const a = await mockSource.hotspots(AREA, "2020-01-01", "2020-12-31");
    const b = await mockSource.hotspots(AREA, "2020-01-01", "2020-12-31");
    expect(a.length).toBeGreaterThan(500);
    expect(JSON.stringify(a.slice(0, 200))).toBe(JSON.stringify(b.slice(0, 200)));
  });

  it("keeps every detection inside the area and the dates asked for", () => {
    const [west, south, east, north] = AREA;
    for (const h of generateHotspots(AREA, "2019-03-01", "2019-09-30")) {
      expect(h.longitude).toBeGreaterThanOrEqual(west);
      expect(h.longitude).toBeLessThanOrEqual(east);
      expect(h.latitude).toBeGreaterThanOrEqual(south);
      expect(h.latitude).toBeLessThanOrEqual(north);
      expect(h.acq_date >= "2019-03-01" && h.acq_date <= "2019-09-30").toBe(true);
    }
  });

  it("shows a smaller area as a subset of a larger one", () => {
    const inner: BBox = [-58, -11, -55, -9];
    const outer = generateHotspots(AREA, "2021-08-01", "2021-08-31").filter(
      (h) => h.longitude >= inner[0] && h.longitude <= inner[2] && h.latitude >= inner[1] && h.latitude <= inner[3],
    );
    expect(generateHotspots(inner, "2021-08-01", "2021-08-31")).toHaveLength(outer.length);
  });

  it("has no VIIRS detections before the sensor flew", () => {
    const early = generateHotspots(AREA, "2005-01-01", "2005-12-31");
    expect(early.length).toBeGreaterThan(100);
    expect(early.every((h) => h.instrument === "MODIS")).toBe(true);
    const late = generateHotspots(AREA, "2020-01-01", "2020-12-31");
    const viirs = late.filter((h) => h.instrument === "VIIRS").length;
    expect(viirs).toBeGreaterThan((late.length - viirs) * 2);
  });
});

describe("harmonized record", () => {
  it("covers every day from 2001 to 2025 with an index between 0 and 1", () => {
    expect(full.days).toHaveLength(9131);
    for (const day of full.days) {
      expect(day.index).toBeGreaterThanOrEqual(0);
      expect(day.index).toBeLessThanOrEqual(1);
    }
  });

  it("learns that VIIRS lights more cells than MODIS", () => {
    expect(full.calibration.factor).toBeGreaterThan(1.2);
    expect(full.calibration.overlapDays).toBeGreaterThan(5000);
  });

  it("removes the step where VIIRS joins the record", () => {
    // Yearly totals before and after 2012 should be the same order of magnitude:
    // the sensor of origin must not show as a jump.
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const before = mean(full.yearTotals.filter((t) => t.year >= 2003 && t.year <= 2011).map((t) => t.value));
    const after = mean(full.yearTotals.filter((t) => t.year >= 2012 && t.year <= 2017).map((t) => t.value));
    expect(after / before).toBeGreaterThan(0.6);
    expect(after / before).toBeLessThan(1.6);
  });

  it("sets each month against the same month in other years", () => {
    expect(full.months).toHaveLength(25 * 12);
    for (let m = 0; m < 12; m++) {
      const same = full.months.filter((c) => c.month === m);
      expect(same.filter((c) => c.rank === 1).length).toBeGreaterThanOrEqual(1);
      const above = same.filter((c) => c.value > c.median).length;
      expect(above).toBeLessThanOrEqual(12);
    }
  });

  it("finds a fire season late in the year for the southern tropics", () => {
    expect(full.season).not.toBeNull();
    expect(full.season!.days).toBeGreaterThan(20);
    expect(full.season!.days).toBeLessThan(200);
    expect(full.season!.startDay).toBeGreaterThan(180);
  });

  it("flags most planted bursts and little else", () => {
    let planted = 0;
    let caught = 0;
    let flagged = 0;
    for (let year = 2015; year <= 2025; year++) {
      const flags = new Set(full.days.filter((d) => d.year === year && d.anomaly).map((d) => d.date));
      flagged += flags.size;
      for (const date of plantedBursts(AREA, year)) {
        planted++;
        if (flags.has(date)) caught++;
      }
    }
    expect(planted).toBeGreaterThan(3);
    expect(caught / planted).toBeGreaterThanOrEqual(0.7);
    expect(flagged).toBeLessThanOrEqual(planted + 12);
  });

  it("harmonizes a single year on its own", () => {
    const year = harmonize(generateHotspots(AREA, "2025-01-01", "2025-12-31"), 2025);
    expect(year.days).toHaveLength(365);
    expect(year.criticalPeriod).not.toBeNull();
  });
});
