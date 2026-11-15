import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadArea } from "./area";
import { rectangleArea } from "./types";
import { buildRecord } from "../harmonize";
import { evaluateRegion } from "../anomalies";
import { parseRadarSummary, type RadarSummary } from "./radar";

const ROOT = join(__dirname, "../../..");
const readSummary = (): RadarSummary => JSON.parse(readFileSync(join(ROOT, "public/data/brazil/historical-radar.json"), "utf8"));
afterEach(() => vi.unstubAllGlobals());

describe("real historical radar summary", () => {
  it("reproduces every exported monthly value from production modules for all five presets", async () => {
    vi.stubGlobal("fetch", async (url: string) => new Response(readFileSync(join(ROOT, "public", url))));
    const summary = parseRadarSummary(readSummary());
    for (const region of summary.regions) {
      const record = buildRecord(await loadArea(rectangleArea(region.bbox, region.name)));
      expect(region.months).toEqual(record.months.map(({ year, month, value, source, lo, hi, partial }) => ({ year, month, value, source, lo, hi, partial })));
      const results = evaluateRegion(region);
      expect(results).toHaveLength(293);
      expect(results.filter((r) => r.status === "excluded")).toHaveLength(6);
      expect(results.some((r) => r.status === "highlight")).toBe(true);
      expect(results.every((r) => r.ratio === null || Number.isFinite(r.ratio))).toBe(true);
      expect(results.every((r) => !r.referenceYears.includes(r.cell.year))).toBe(true);
    }
  });
  it("fingerprints the actual metadata, tiles, scientific modules and generator", () => {
    const summary = readSummary();
    const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
    const current = summary.inputs.map(({ path }) => {
      const bytes = readFileSync(join(ROOT, path));
      return { path, sha256: hash(/\.(ts|mjs|json)$/.test(path) ? bytes.toString("utf8").replace(/\r\n/g, "\n") : bytes) };
    });
    expect(current).toEqual(summary.inputs);
    expect(hash(JSON.stringify(current))).toBe(summary.sourceFingerprint);
    const changed = structuredClone(current);
    changed[0].sha256 = hash("changed input");
    expect(hash(JSON.stringify(changed))).not.toBe(summary.sourceFingerprint);
  });
  it("rejects mismatched coverage, policy, schema, missing months and invalid counts", () => {
    for (const mutate of [
      (s: RadarSummary) => { s.schemaVersion = 99; },
      (s: RadarSummary) => { s.coverage.lastDay = "2026-11-13"; },
      (s: RadarSummary) => { s.defaultConfig.baseline = [2003, 2025]; },
      (s: RadarSummary) => { s.regions[0].months.pop(); },
      (s: RadarSummary) => { s.regions[0].months[0].value = NaN; },
      (s: RadarSummary) => { s.regions[0].months[0].month = 99; },
    ]) {
      const summary = readSummary(); mutate(summary);
      expect(() => parseRadarSummary(summary)).toThrow(/outdated/);
    }
  });
});

describe("radar data loading", () => {
  it("deduplicates requests and loads only the summary", async () => {
    vi.resetModules();
    const fetch = vi.fn(async () => new Response(JSON.stringify(readSummary())));
    vi.stubGlobal("fetch", fetch);
    const { loadRadarSummary } = await import("./radar");
    const [a, b] = await Promise.all([loadRadarSummary(), loadRadarSummary()]);
    expect(a).toBe(b);
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/data/brazil/historical-radar.json");
  });
  it("evicts failed requests so a retry can succeed", async () => {
    vi.resetModules();
    const fetch = vi.fn().mockResolvedValueOnce(new Response("offline", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(readSummary())));
    vi.stubGlobal("fetch", fetch);
    const { loadRadarSummary } = await import("./radar");
    await expect(loadRadarSummary()).rejects.toThrow(/Try again/);
    await expect(loadRadarSummary()).resolves.toHaveProperty("schemaVersion", 1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
