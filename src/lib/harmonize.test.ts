import { describe, expect, it } from "vitest";
import { dateOfDay, generateHotspots, mockSource, plantedAnomalies } from "./data/mock";
import { harmonize } from "./harmonize";

const YEAR = 2025;

describe("simulated source", () => {
  it("produces the same records for the same region and year", async () => {
    const a = await mockSource.hotspots("amazon", YEAR);
    const b = await mockSource.hotspots("amazon", YEAR);
    expect(a.length).toBeGreaterThan(1000);
    expect(JSON.stringify(a.slice(0, 200))).toBe(JSON.stringify(b.slice(0, 200)));
  });

  it("keeps every detection inside its region", () => {
    for (const region of mockSource.regions()) {
      const [west, south, east, north] = region.bbox;
      for (const h of generateHotspots(region.id, YEAR)) {
        expect(h.longitude).toBeGreaterThanOrEqual(west - 0.05);
        expect(h.longitude).toBeLessThanOrEqual(east + 0.05);
        expect(h.latitude).toBeGreaterThanOrEqual(south - 0.05);
        expect(h.latitude).toBeLessThanOrEqual(north + 0.05);
      }
    }
  });

  it("gives VIIRS more detections than MODIS, as the real sensors do", () => {
    const all = generateHotspots("amazon", YEAR);
    const viirs = all.filter((h) => h.instrument === "VIIRS").length;
    const modis = all.length - viirs;
    expect(viirs).toBeGreaterThan(modis * 2);
  });
});

describe("harmonize", () => {
  it("covers every day of the year for every region", () => {
    for (const region of mockSource.regions()) {
      const summary = harmonize(generateHotspots(region.id, YEAR), YEAR);
      expect(summary.days).toHaveLength(365);
      for (const day of summary.days) {
        expect(day.index).toBeGreaterThanOrEqual(0);
        expect(day.index).toBeLessThanOrEqual(1);
      }
    }
  });

  it("never lets the index exceed what either sensor reports alone", () => {
    const summary = harmonize(generateHotspots("cerrado", YEAR), YEAR);
    for (const day of summary.days) {
      const { MODIS, VIIRS } = day.sensors;
      expect(day.index).toBeLessThanOrEqual(Math.max(MODIS.scaled, VIIRS.scaled) + 1e-9);
    }
  });

  it("flags the planted bursts and little else", () => {
    for (const region of mockSource.regions()) {
      const summary = harmonize(generateHotspots(region.id, YEAR), YEAR);
      const planted = plantedAnomalies(region.id).map((d) => dateOfDay(YEAR, d));
      for (const date of planted) {
        expect(summary.anomalies, `${region.id} ${date}`).toContain(date);
      }
      expect(summary.anomalies.length, region.id).toBeLessThanOrEqual(planted.length + 4);
    }
  });

  it("finds a fire season inside the year", () => {
    const summary = harmonize(generateHotspots("amazon", YEAR), YEAR);
    expect(summary.criticalPeriod).not.toBeNull();
    expect(summary.criticalPeriod!.days).toBeGreaterThan(20);
    expect(summary.criticalPeriod!.days).toBeLessThan(200);
  });
});
