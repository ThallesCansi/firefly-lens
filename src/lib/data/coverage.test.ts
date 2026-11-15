import { readFileSync } from "node:fs";
import { describe, expect, it, afterEach, vi } from "vitest";
import { countryCoverage, DEMO_ENABLED, rawPilots, rawPilotArea } from "./coverage";
import { rawPilotCells, validateRawPilot, loadNationalAnalytics, type RawPilot } from "./raw-pilot";

const entry = rawPilots[0];
const area = rawPilotArea(entry);
const pilot: RawPilot = JSON.parse(readFileSync(`public${entry.manifest_url}`, "utf8"));
afterEach(() => vi.unstubAllGlobals());

describe("explicit geographic coverage", () => {
  it("distinguishes Brazil's spatial coverage, national harmonization and uncovered countries", () => {
    expect(countryCoverage("BRA")).toBe("real_harmonized_data");
    expect(countryCoverage("PRY")).toBe("real_harmonized_data");
    expect(countryCoverage("PER")).toBe("real_harmonized_data");
    expect(countryCoverage("USA")).toBe("no_historical_coverage");
    expect(DEMO_ENABLED).toBe(false);
    expect(validateRawPilot(pilot, area).monthly).toHaveLength(93);
    expect(() => validateRawPilot({ ...pilot, synthetic: true } as unknown as RawPilot, area)).toThrow();
  });
  it("loads the integrity-checked country report with its own period and calibration scope", async () => {
    vi.stubGlobal("fetch",vi.fn(async (url: string) => new Response(readFileSync(`public${url}`))));
    const bundle = await loadNationalAnalytics(area);
    expect(bundle.sections.history.period).toEqual({ start:"2018-04",end:"2025-12" });
    expect(bundle.sections.history.source.provenance.scope).toBe("entire_country_only");
    expect(bundle.sections.history.source.provenance.kind).toBe("real_country_harmonized");
  });
  it("loads only selected-month map tiles, reuses cache and rejects daily or uncovered requests", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const bytes = readFileSync(`public${url}`);
      return new Response(bytes);
    });
    vi.stubGlobal("fetch", fetcher);
    const cells = await rawPilotCells(area,"2023-09");
    const month = pilot.monthly.find((r) => r.date === "2023-09")!;
    expect(cells.reduce((sum,c) => sum+c.modis,0)).toBe(month.modis);
    expect(cells.reduce((sum,c) => sum+c.viirs,0)).toBe(month.viirs);
    expect(fetcher.mock.calls.every(([url]) => url.endsWith("manifest.json") || url.includes("/2023-09/"))).toBe(true);
    const calls = fetcher.mock.calls.length;
    await rawPilotCells(area,"2023-09");
    expect(fetcher).toHaveBeenCalledTimes(calls);
    await expect(rawPilotCells(area,"2026-09")).rejects.toThrow("coverage");
    await expect(rawPilotCells(area,"2023-09-01")).rejects.toThrow("monthly");
  });
});
