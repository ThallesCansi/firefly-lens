import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateBundle, validateManifest } from "./client";
import { isFailure, type AnomalyRow } from "./contracts";
import { fireflySignals, isHighSeasonalActivity, seasonalAnomaly } from "./signals";
import { geometryContains } from "../interactions/administrative";
import { editableVertices } from "../data/types";

const index = validateManifest(JSON.parse(readFileSync("public/analytics/manifest.json", "utf8")));
const regions = index.regions.map((region) => ({ region,
  bundle: validateBundle(JSON.parse(readFileSync(`public${region.url}`, "utf8")), region) }));

describe("Firefly Signals seasonal classification", () => {
  it("rejects synthetic, raw and unvalidated coverage even with a high seasonal score", () => {
    for (const change of ["synthetic", "raw", "status", "reference"]) {
      const bundle = structuredClone(regions[0].bundle);
      const payload = bundle.sections.anomalies;
      if (change === "synthetic") payload.source.synthetic = true;
      if (change === "raw") payload.source.provenance.kind = "real_raw_detections";
      if (change === "status") payload.data_status = "not_validated";
      if (change === "reference" && !isFailure(payload.data)) payload.data.months.forEach((r) => { r.reference.n_years = 1; });
      expect(fireflySignals([{ region: regions[0].region, bundle }], "2024-06")).toEqual([]);
    }
  });
  it("includes either threshold at the boundary without treating null as zero", () => {
    const row = seasonalAnomaly(regions[0].bundle, "2024-03")!;
    const score = (percentile: number | null, z_score: number | null) =>
      isHighSeasonalActivity({ ...row, percentile, z_score });
    expect(score(90, null)).toBe(true);
    expect(score(null, 2)).toBe(true);
    expect(score(89.99, 1.99)).toBe(false);
    expect(score(0, -3)).toBe(false);
    expect(score(null, null)).toBe(false);
    expect(score(NaN, Infinity)).toBe(false);
  });

  it("uses the exact selected month, including for day selections", () => {
    const signals = fireflySignals(regions, "2024-06");
    expect(signals.some((s) => s.area.name === "Pantanal")).toBe(true);
    expect(fireflySignals(regions, "2024-06-15")).toEqual(signals);
    expect(signals.every((s) => s.anomaly.date === "2024-06")).toBe(true);
    expect(fireflySignals(regions, "2030-06")).toEqual([]);
  });

  it("suppresses partial, missing and ineligible comparisons even with high raw counts", () => {
    const bundle = structuredClone(regions[0].bundle);
    const data = bundle.sections.anomalies.data;
    if (isFailure(data)) throw new Error("Expected prepared anomalies");
    const row = data.months.find((r) => r.date === "2024-03")!;
    const check = (patch: Partial<AnomalyRow>) => {
      data.months = [{ ...row, ...patch }];
      return fireflySignals([{ region: regions[0].region, bundle }], "2024-03");
    };
    expect(check({ complete: false })).toEqual([]);
    expect(check({ value: null })).toEqual([]);
    expect(check({ status: "unavailable" })).toEqual([]);
    expect(check({ status: "insufficient_history" })).toEqual([]);
    expect(check({ value: 1000000, percentile: 50, z_score: 0 })).toEqual([]);
    expect(check({ status: "partially_available", z_score: null, percentile: 95 })).toHaveLength(1);
    bundle.sections.anomalies.data = { status: "unavailable", reason: "insufficient_history" };
    expect(fireflySignals([{ region: regions[0].region, bundle }], "2024-03")).toEqual([]);
    expect(fireflySignals(regions, "2026-11")).toEqual([]);
  });

  it("places every prepared signal inside its exact region and preserves its analysis geometry", () => {
    for (const prepared of regions) {
      const data = prepared.bundle.sections.anomalies.data;
      if (isFailure(data)) throw new Error("Expected prepared anomalies");
      const high = data.months.find((r) => r.complete && isHighSeasonalActivity(r))!;
      const [signal] = fireflySignals([prepared], high.date);
      expect(geometryContains(signal.area.geometry, signal.position)).toBe(true);
      expect(signal.area.geometry).toEqual(prepared.region.geometry);
      expect(signal.area.name).toBe(prepared.region.name);
      expect(editableVertices(signal.area)).toBeNull();
      expect(signal.anomaly).toBe(high);
    }
  });
});
