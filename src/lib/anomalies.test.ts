import { describe, expect, it } from "vitest";
import { compareAnomalies, DEFAULT_RADAR_CONFIG, evaluateRegion, type RadarRegion } from "./anomalies";
import { monthQuality, type RadarMonth } from "./data/month-quality";

const month = (year: number, value = 100, m = 8): RadarMonth => ({
  year, month: m, value, source: year > 2025 ? "modeled" : "observed",
  lo: year > 2025 ? value * 0.5 : null, hi: year > 2025 ? value * 1.5 : null, partial: false,
});
const region = (months: RadarMonth[]): RadarRegion => ({ id: "test", name: "Test", place: "Brazil", bbox: [-60, -10, -58, -8], months });
const baseline = (value = 100) => Array.from({ length: 21 }, (_, i) => month(2003 + i, value));

describe("independent monthly quality", () => {
  it("excludes July 2002 and metadata partial months without changing the input", () => {
    const july = month(2002, 5, 6);
    expect(monthQuality(july).reasons).toContain("partial");
    expect(july.partial).toBe(false);
    expect(monthQuality(month(2026, 100, 10)).eligible).toBe(false);
    expect(monthQuality(month(2026, 100, 9)).eligible).toBe(true);
  });
  it("excludes all four months touched by documented outages, not adjacent months", () => {
    for (const [year, m] of [[2020, 7], [2020, 8], [2022, 2], [2022, 3]])
      expect(monthQuality(month(year, 100, m)).reasons).toContain("gap");
    expect(monthQuality(month(2020, 100, 9)).eligible).toBe(true);
    expect(monthQuality(month(2022, 100, 4)).eligible).toBe(true);
  });
  it("honors coverage boundaries, extra partial metadata and source consistency", () => {
    const coverage = { firstDay: "2003-09-02", lastDay: "2026-10-31", seriesEnd: "2026-10", partialMonth: "", partialMonths: ["2004-09"], observedUntil: 2025 };
    expect(monthQuality(month(2003), coverage).eligible).toBe(false);
    expect(monthQuality(month(2004), coverage).eligible).toBe(false);
    expect(monthQuality({ ...month(2026), source: "observed" }).reasons).toContain("source");
  });
  it("rejects invalid counts and malformed modeled intervals", () => {
    for (const value of [NaN, Infinity, -1]) expect(monthQuality(month(2024, value)).eligible).toBe(false);
    for (const interval of [{ lo: null, hi: 150 }, { lo: -1, hi: 150 }, { lo: 101, hi: 150 }, { lo: 0, hi: Infinity }])
      expect(monthQuality({ ...month(2026), ...interval }).eligible).toBe(false);
  });
});

describe("historical radar comparisons", () => {
  it("excludes the evaluated year and defaults to 2003–2023", () => {
    const r = region([...baseline(), month(2024, 10000), month(2025, 10000)]);
    const result = evaluateRegion(r).find((c) => c.cell.year === 2003)!;
    expect(result.referenceYears).not.toContain(2003);
    expect(result.referenceYears).not.toContain(2024);
    expect(result.referenceYears).toHaveLength(19); // September 2020 is excluded.
    expect(result.median).toBe(100);
    const extended = evaluateRegion(r, { ...DEFAULT_RADAR_CONFIG, baseline: [2003, 2025] })[0];
    expect(extended.referenceYears).toContain(2025);
  });
  it("finds a large positive anomaly and preserves source and nominal interval", () => {
    const target = month(2026, 300);
    const result = evaluateRegion(region([...baseline(), target])).at(-1)!;
    expect(result.status).toBe("highlight");
    expect(result.ratio).toBe(3);
    expect(result.cell).toBe(target);
    expect(result.cell.lo).toBe(150);
    expect(result.rank).toBe(1);
  });
  it("does not divide by zero or promote tiny counts", () => {
    const zero = evaluateRegion(region([...baseline(0), month(2024, 300)])).at(-1)!;
    expect(zero.status).toBe("zero-median");
    expect(zero.ratio).toBeNull();
    expect(evaluateRegion(region([...baseline(1), month(2024, 5)])).at(-1)!.status).toBe("ordinary");
  });
  it("requires adequate reference years and all configurable thresholds", () => {
    expect(evaluateRegion(region([month(2003), month(2024, 400)])).at(-1)!.status).toBe("insufficient");
    const r = region([...baseline(), month(2024, 200)]);
    expect(evaluateRegion(r).at(-1)!.status).toBe("highlight");
    for (const override of [{ minRatio: 3 }, { minCount: 201 }, { minExcess: 101 }])
      expect(evaluateRegion(r, { ...DEFAULT_RADAR_CONFIG, ...override }).at(-1)!.status).toBe("ordinary");
    const skewed = region([...baseline().map((m, i) => ({ ...m, value: i < 15 ? 100 : 1000 })), month(2024, 300)]);
    expect(evaluateRegion(skewed).at(-1)!.status).toBe("ordinary");
  });
  it("retains excluded months for exploration, without ratio or rank", () => {
    const r = evaluateRegion(region([...baseline(), month(2026, 5000, 10)]));
    expect(r.at(-1)!.status).toBe("excluded");
    expect(r.at(-1)!.ratio).toBeNull();
    expect(r.at(-1)!.rank).toBeNull();
    expect(r.find((x) => x.cell.year === 2020)!.status).toBe("excluded");
  });
  it("shares ranks for ties, excludes gaps from the rank denominator and sorts stably", () => {
    const r = evaluateRegion(region([...baseline(), month(2024, 300), month(2025, 300)]));
    const top = r.filter((x) => x.status === "highlight").sort(compareAnomalies);
    expect(top.map((x) => x.rank)).toEqual([1, 1]);
    expect(top[0].rankOf).toBe(22);
    expect(top[0].cell.year).toBe(2025);
  });
  it("does not mutate scientific inputs and rejects invalid configuration", () => {
    const r = region(baseline());
    const before = JSON.stringify(r);
    evaluateRegion(r);
    expect(JSON.stringify(r)).toBe(before);
    expect(() => evaluateRegion(r, { ...DEFAULT_RADAR_CONFIG, quantile: 2 })).toThrow();
  });
});
