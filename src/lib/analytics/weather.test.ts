import { describe, expect, it, vi, afterEach } from "vitest";
import { validateDanger, loadFireDanger, DANGER_CLASSES } from "./weather";
import { rectangleArea } from "../data/types";
import { readFileSync } from "node:fs";

const geometry = rectangleArea([-1, -1, 1, 1]).geometry;
const product = () => ({ status: "available", reason: null, index: "FWI", units: "dimensionless",
  source_id: "copernicus_ewds_cems_fire_seasonal", product_kind: "delayed_seasonal",
  provenance: { synthetic: false, meteorological_source: "SEAS5", retrieved_at: "2026-11-14T00:00:00Z", system_version: "4.1", sha256: "a".repeat(64) },
  resolution_degrees: { latitude: 1, longitude: 1 },
  forecasts: [{ issued_at: "2026-11-01T00:00:00Z", valid_at: "2026-11-16T00:00:00Z", lead_hours: 360,
    member: "0", value: 30, maximum: 80, coverage_fraction: .75, danger_class: "High", percentile: null, anomaly: null,
    distribution: DANGER_CLASSES.map((c, i) => ({ class: c, area_fraction: i === 2 ? .75 : 0 })) }],
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("numeric weather contract", () => {
  it("preserves real NASA daily dates without inventing a validity hour and expires cached forecasts", async () => {
    const snapshots = JSON.parse(readFileSync("public/data/weather/snapshots.json","utf8"));
    const region = snapshots.regions.find((r: { id: string }) => r.id === "PRY");
    const real = validateDanger(region.data);
    expect(real.product_kind).toBe("experimental_deterministic");
    expect(real.forecasts[0].valid_at).toBeNull();
    expect(real.forecasts[0].lead_hours).toBeNull();
    const first = real.forecasts[0], last = real.forecasts.at(-1)!;
    expect(first.lead_days).toBe((Date.parse(first.valid_date!)-Date.parse(first.issued_at.slice(0,10)))/86400000);
    vi.useFakeTimers(); vi.setSystemTime(new Date(`${first.valid_date}T15:00:00Z`));
    const fetcher=vi.fn(async (url: string) => url.includes("snapshots") ? Response.json(snapshots) : Response.json({}, { status:503 }));
    vi.stubGlobal("fetch",fetcher);
    expect((await loadFireDanger(region.geometry,new AbortController().signal)).status).toBe("available");
    expect(fetcher.mock.calls.every(([url]) => url.includes("snapshots"))).toBe(true);
    vi.setSystemTime(new Date(Date.parse(last.valid_date!)+86400000));
    const expired = await loadFireDanger(region.geometry,new AbortController().signal);
    expect(expired.status).toBe("unavailable");
    expect(expired.forecasts).toEqual([]);
    const malformed = structuredClone(region.data); malformed.forecasts[0].lead_days=99;
    expect(() => validateDanger(malformed)).toThrow();
  });
  it("accepts a complete numeric product and explicit unavailability", () => {
    expect(validateDanger(product()).forecasts[0].maximum).toBe(80);
    expect(validateDanger({ status: "unavailable", reason: "no_provider", index: "FWI", units: "dimensionless", forecasts: [] }).status).toBe("unavailable");
  });
  it("rejects synthetic products, wrong units, missing provenance and inconsistent leads or coverage", () => {
    for (const change of [
      (p: ReturnType<typeof product>) => { p.provenance.synthetic = true; },
      (p: ReturnType<typeof product>) => { p.units = "hotspots"; },
      (p: ReturnType<typeof product>) => { p.forecasts[0].lead_hours = 24; },
      (p: ReturnType<typeof product>) => { p.forecasts[0].coverage_fraction = 1.1; },
      (p: ReturnType<typeof product>) => { p.forecasts[0].distribution[2].area_fraction = .1; },
    ]) {
      const value = product(); change(value);
      expect(() => validateDanger(value)).toThrow();
    }
    const { provenance: _, ...missing } = product(); void _;
    expect(() => validateDanger(missing)).toThrow();
  });
  it("does not reuse another polygon’s weather and keeps service failures unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ schema_version: "1.0.0", geometry: rectangleArea([2,2,3,3]).geometry, data: product() })));
    await expect(loadFireDanger(geometry, new AbortController().signal)).rejects.toThrow("geometry mismatch");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: "unconfigured" }, { status: 503 })));
    expect((await loadFireDanger(geometry, new AbortController().signal)).status).toBe("unavailable");
  });
});
