import { readFileSync } from "node:fs";
import { describe, expect, it, afterEach, vi } from "vitest";
import { presetArea } from "./types";
import { meta } from "./meta";
import { countryCoverage, DEMO_ENABLED, rawPilots, rawPilotArea } from "./coverage";
import { rawPilotCells, validateRawPilot, loadNationalAnalytics, loadCountryRecord,rawCountryCellDaysCsv,type RawPilot } from "./raw-pilot";

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
    expect(validateRawPilot(pilot, area).monthly).toHaveLength(282);
    expect(() => validateRawPilot({ ...pilot, synthetic: true } as unknown as RawPilot, area)).toThrow();
  });
  it("loads the integrity-checked country report with its own period and calibration scope", async () => {
    vi.stubGlobal("fetch",vi.fn(async (url: string) => new Response(readFileSync(`public${url}`))));
    const bundle = await loadNationalAnalytics(area);
    expect(bundle.sections.history.period).toEqual({ start:"2002-07",end:"2025-12" });
    expect(bundle.sections.history.source.provenance.scope).toBe("entire_country_only");
    expect(bundle.sections.history.source.provenance.kind).toBe("real_country_harmonized");
  });
  it("loads only selected-period map tiles, reuses cache and rejects uncovered requests", async () => {
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
    const days=await rawPilotCells(area,"2023-09-01");
    expect(days.every((cell)=>cell.modis>=0 && cell.viirs>=0)).toBe(true);
    expect(fetcher.mock.calls.some(([url])=>url.includes("map-days/2023-09"))).toBe(true);
    await expect(rawPilotCells(area,"2002-07-01")).rejects.toThrow("coverage");
  });
  it("reconciles the old and converted country calendars, day maps and raw CSV to the same source",async()=>{
    const fetcher=vi.fn(async(url:string)=>new Response(readFileSync(`public${url}`)));
    vi.stubGlobal("fetch",fetcher);
    const record=await loadCountryRecord(area);
    expect(record.years[0]).toBe(2002);
    expect(record.months).toHaveLength(282);
    expect(record.days[0].date).toBe("2002-07-04");
    for (const date of ["2003-09","2017-02","2023-09","2025-09"]) {
      const month=record.months.find((row)=>`${row.year}-${String(row.month+1).padStart(2,"0")}`===date)!;
      const daily=record.days.filter((day)=>day.date.startsWith(date));
      expect(daily.reduce((sum,day)=>sum+day.value,0)).toBeCloseTo(month.value,6);
      expect(month.source).toBe(date>"2023-12"?"modeled":"observed");
      if (date<"2018-04") expect(daily.every((day)=>!day.bothSensors && day.sensors.VIIRS.estimate===null)).toBe(true);
    }
    const date="2003-09-01";
    const cells=await rawPilotCells(area,date);
    const day=record.days.find((row)=>row.date===date)!;
    expect(cells.reduce((sum,cell)=>sum+cell.modis,0)).toBe(day.sensors.MODIS.detections);
    const csv=(await rawCountryCellDaysCsv(area,date,date)).trim().split("\n");
    expect(csv[0]).toBe("date,cell_id,longitude,latitude,modis_aqua_raw,viirs_noaa20_raw");
    expect(csv.slice(1).reduce((sum,row)=>sum+Number(row.split(",")[4]),0)).toBe(day.sensors.MODIS.detections);
    expect(csv.slice(1).every((row)=>row.endsWith(","))).toBe(true);
    expect(fetcher.mock.calls.every(([url])=>url.startsWith("/data/continental/paraguay/"))).toBe(true);
  });
});

it("turns each prepared region into a fixed, non-editable area with its own outline", () => {
  for (const preset of meta.presets) {
    const area = presetArea(preset);
    expect(area).toMatchObject({ id: `preset:${preset.id}`, kind: "preset", name: preset.name });
    if (preset.geometry) expect(area.geometry).toBe(preset.geometry);
    const [w, s, e, n] = area.bbox;
    expect(w < e && s < n).toBe(true);
  }
});
