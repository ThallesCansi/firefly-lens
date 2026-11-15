import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  clearAnalyticsCache,
  geometryKey,
  loadAnalytics,
  validateBundle,
  validateManifest,
  type RegionEntry,
} from "./client";
import { isFailure, type Bundle } from "./contracts";
import type { PolygonGeometry } from "../data/types";

const read = (path: string) => readFileSync(`public/analytics/${path}`, "utf8");
const manifest = JSON.parse(read("manifest.json"));
const entry: RegionEntry = manifest.regions[0];
const real = (): Bundle => JSON.parse(read(`${entry.id}.json`));
afterEach(() => {
  clearAnalyticsCache();
  vi.unstubAllGlobals();
});

describe("real Python exports", () => {
  it("accepts a section-level forecast failure without discarding valid history", () => {
    const b = real();
    b.sections.forecast.data_status = "unavailable";
    b.sections.forecast.data = {
      status: "unavailable",
      reason: "insufficient_history",
    };
    const validated = validateBundle(b, entry);
    expect(isFailure(validated.sections.forecast.data)).toBe(true);
    expect(isFailure(validated.sections.history.data)).toBe(false);
  });
  it("rejects future training and a numeric outlook without recent eligible observations", () => {
    const b = real(),
      f = b.sections.forecast.data;
    if (isFailure(f)) throw new Error("Expected forecast envelope");
    f.training_period.end = "2027-01";
    expect(() => validateBundle(b, entry)).toThrow(/future/);
    f.training_period.end = "2023-12";
    f.forecast_status = "experimental";
    f.predictions[0].value = 100;
    expect(() => validateBundle(b, entry)).toThrow();
  });
  it("validates all five exact geometries and their integrity hashes", () => {
    const index = validateManifest(manifest);
    expect(index.regions).toHaveLength(5);
    for (const region of index.regions) {
      const raw = read(`${region.id}.json`);
      expect(createHash("sha256").update(raw).digest("hex")).toBe(
        region.sha256,
      );
      expect(validateBundle(JSON.parse(raw), region).region_id).toBe(region.id);
    }
  });
  it("preserves real partial months, null anomalies and unavailable forecasts", () => {
    const b = real(),
      h = b.sections.history.data,
      a = b.sections.anomalies.data,
      f = b.sections.forecast.data;
    if (isFailure(h) || isFailure(a) || isFailure(f))
      throw new Error("Expected section data");
    expect(h.monthly[0].complete).toBe(false);
    expect(h.monthly.at(-1)?.complete).toBe(false);
    expect(a.months.at(-1)?.z_score).toBeNull();
    expect(f.forecast_status).toBe("unavailable");
    expect(f.predictions.every((p) => p.value === null)).toBe(true);
    expect(f.backtesting.validation?.metrics.sarima?.mae).toBeGreaterThan(0);
  });
  it.each([
    "synthetic",
    "region",
    "units",
    "nonfinite",
    "old_origin",
    "unsupported_schema",
    "missing_summary",
    "invalid_metric",
  ])("rejects %s before it reaches charts", (kind) => {
    const b = real();
    const h = b.sections.history;
    if (kind === "synthetic") h.source.synthetic = true;
    if (kind === "region") b.region_id = "other";
    if (kind === "units") h.units = "dimensionless";
    if (kind === "nonfinite" && !isFailure(h.data))
      h.data.monthly[0].value = Infinity;
    if (kind === "old_origin" && !isFailure(b.sections.forecast.data))
      b.sections.forecast.data.forecast_origin = "2023-12";
    if (kind === "unsupported_schema")
      Object.assign(b, { schema_version: "2.0.0" });
    if (kind === "missing_summary" && !isFailure(h.data))
      Object.assign(h.data, { summary: {} });
    if (kind === "invalid_metric" && !isFailure(b.sections.forecast.data))
      Object.assign(
        b.sections.forecast.data.backtesting.validation!.metrics.sarima!,
        { mae: "wrong" },
      );
    expect(() => validateBundle(b, entry)).toThrow();
  });
  it("rejects data-version mismatch and incomplete manifest metadata", () => {
    const wrong = structuredClone(manifest);
    wrong.data_meta.observedUntil = 2001;
    expect(() => validateManifest(wrong)).toThrow(/version/);
    wrong.data_meta = {};
    expect(() => validateManifest(wrong)).toThrow(/Incomplete/);
  });
});

describe("geometry identity", () => {
  it("accepts rotated/reversed rings but never another shape with the same envelope", () => {
    const a = entry.geometry;
    if (a.type !== "Polygon") throw new Error("Expected polygon");
    const ring = a.coordinates[0].slice(0, -1).reverse();
    const rotated = [...ring.slice(1), ring[0], ring[1]];
    expect(geometryKey({ type: "Polygon", coordinates: [rotated] })).toBe(
      geometryKey(a),
    );
    const triangle = {
      type: "Polygon",
      coordinates: [
        [
          a.coordinates[0][0],
          a.coordinates[0][1],
          a.coordinates[0][2],
          a.coordinates[0][0],
        ],
      ],
    };
    expect(geometryKey(triangle)).not.toBe(geometryKey(a));
    expect(
      geometryKey({
        type: "Polygon",
        coordinates: [a.coordinates[0], a.coordinates[0]],
      }),
    ).not.toBe(geometryKey(a));
  });
  it("rejects broken and nonfinite rings", () => {
    expect(() =>
      geometryKey({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [Infinity, 0],
          ],
        ],
      }),
    ).toThrow();
    expect(() => geometryKey({ type: "Polygon", coordinates: [] })).toThrow();
  });
});

describe("static loader", () => {
  function mockFetch() {
    return vi.fn(
      async (url: string) =>
        new Response(read(url.split("/").at(-1)!), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
  }
  it("loads validated regional JSON and caches identical content", async () => {
    const fetcher = mockFetch();
    vi.stubGlobal("fetch", fetcher);
    expect((await loadAnalytics(entry.geometry)).status).toBe("available");
    await loadAnalytics(entry.geometry);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const second = manifest.regions[1];
    const result = await loadAnalytics(second.geometry);
    expect(result.status === "available" && result.bundle.region_id).toBe(
      second.id,
    );
  });
  it("returns unsupported without fetching any other region", async () => {
    const fetcher = mockFetch();
    vi.stubGlobal("fetch", fetcher);
    const arbitrary: PolygonGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    };
    expect((await loadAnalytics(arbitrary)).status).toBe("unsupported");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects corrupt content and retries a failed regional request", async () => {
    let failed = true;
    const fetcher = vi.fn(
      async (url: string) =>
        new Response(
          url.includes(entry.id) && failed
            ? "{}"
            : read(url.split("/").at(-1)!),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(loadAnalytics(entry.geometry)).rejects.toThrow(/integrity/);
    failed = false;
    expect((await loadAnalytics(entry.geometry)).status).toBe("available");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("retries a failed manifest request", async () => {
    const fetcher = mockFetch().mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    await expect(loadAnalytics(entry.geometry)).rejects.toThrow("offline");
    expect((await loadAnalytics(entry.geometry)).status).toBe("available");
  });
});
