import { describe, expect, it } from "vitest";
import type { CellCount } from "@/lib/data/area";
import { heightsAt, planTransition } from "./column-motion";
import { columnTop, columns, type ColumnFeature } from "./columns";

const cell = (id: number, lon: number, lat: number, modis: number, viirs: number): CellCount => ({
  id,
  lon,
  lat,
  biome: "Cerrado",
  weight: 1,
  modis,
  viirs,
});

/** [west, south, east, north] of a column's footprint. */
const extent = (f: ColumnFeature) => {
  const ring = f.geometry.coordinates[0];
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
};

describe("columns", () => {
  it("stands MODIS on the west side and VIIRS on the east side of the cell", () => {
    const features = columns([cell(7, -50, -10, 4, 8)], ["MODIS", "VIIRS"]);
    expect(features.map((f) => f.properties.sensor)).toEqual(["MODIS", "VIIRS"]);
    const [m, v] = features.map(extent);
    expect(m[0]).toBeGreaterThan(-50.125);
    expect(m[2]).toBeLessThan(-50);
    expect(v[0]).toBeGreaterThan(-50);
    expect(v[2]).toBeLessThan(-49.875);
  });

  it("centres a sensor shown alone and keeps it inside the cell", () => {
    const features = columns([cell(7, -50, -10, 4, 8)], ["VIIRS"]);
    expect(features).toHaveLength(1);
    const [w, s, e, n] = extent(features[0]);
    expect((w + e) / 2).toBeCloseTo(-50);
    expect((s + n) / 2).toBeCloseTo(-10);
    expect(w).toBeGreaterThan(-50.125);
    expect(e).toBeLessThan(-49.875);
  });

  it("shares one linear height scale between the sensors", () => {
    const cells = [cell(1, -50, -10, 5, 20), cell(2, -49, -10, 10, 0)];
    const features = columns(cells, ["MODIS", "VIIRS"]);
    const h = (sensor: string, count: number) =>
      features.find((f) => f.properties.sensor === sensor && f.properties.count === count)?.properties.h;
    expect(columnTop(cells, ["MODIS", "VIIRS"])).toBe(20);
    expect(h("VIIRS", 20)).toBe(1);
    expect(h("MODIS", 10)).toBe(0.5);
    expect(h("MODIS", 5)).toBe(0.25);
  });

  it("measures against the sensors shown only", () => {
    const cells = [cell(1, -50, -10, 5, 20)];
    expect(columnTop(cells, ["MODIS"])).toBe(5);
    expect(columns(cells, ["MODIS"])[0].properties.h).toBe(1);
  });

  it("leaves out a sensor with no detections in the cell", () => {
    const features = columns([cell(1, -50, -10, 0, 3)], ["MODIS", "VIIRS"]);
    expect(features.map((f) => f.properties.sensor)).toEqual(["VIIRS"]);
  });

  it("measures against the time-lapse scale and keeps a lone detection visible", () => {
    const features = columns([cell(1, -50, -10, 1, 50)], ["MODIS", "VIIRS"], { modis: 400, viirs: 1000 });
    expect(features[0].properties.h).toBe(0.015);
    expect(features[1].properties.h).toBe(0.05);
  });

  it("gives each cell and sensor an id that holds from month to month", () => {
    const september = columns([cell(41, -50, -10, 2, 9), cell(42, -49, -10, 1, 1)], ["MODIS", "VIIRS"]);
    const october = columns([cell(41, -50, -10, 6, 3)], ["MODIS", "VIIRS"]);
    expect(new Set(september.map((f) => f.id)).size).toBe(4);
    expect(october.map((f) => f.id)).toEqual(september.slice(0, 2).map((f) => f.id));
  });
});

describe("column transitions", () => {
  const month = (cells: CellCount[]) => columns(cells, ["VIIRS"], { modis: 100, viirs: 100 });
  const state = (features: ColumnFeature[]) => ({
    shown: new Map(features.map((f) => [f.id, f.properties.h])),
    drawn: new Map(features.map((f) => [f.id, f])),
  });

  it("raises new columns from the ground and sinks the ones that are gone", () => {
    const before = month([cell(1, -50, -10, 0, 40), cell(2, -49, -10, 0, 80)]);
    const after = month([cell(2, -49, -10, 0, 20), cell(3, -48, -10, 0, 60)]);
    const { shown, drawn } = state(before);
    const plan = planTransition(shown, drawn, after);
    const [gone, kept, fresh] = [1 * 2 + 1, 2 * 2 + 1, 3 * 2 + 1];
    expect(plan.features.map((f) => f.id).sort()).toEqual([gone, kept, fresh]);
    expect([plan.from.get(gone), plan.to.get(gone)]).toEqual([0.4, 0]);
    expect([plan.from.get(kept), plan.to.get(kept)]).toEqual([0.8, 0.2]);
    expect([plan.from.get(fresh), plan.to.get(fresh)]).toEqual([0, 0.6]);
    expect(plan.moves).toBe(true);
  });

  it("starts at the heights on screen and ends at the new ones", () => {
    const before = month([cell(1, -50, -10, 0, 40)]);
    const after = month([cell(1, -50, -10, 0, 90)]);
    const { shown, drawn } = state(before);
    const plan = planTransition(shown, drawn, after);
    expect(heightsAt(plan, 0)).toEqual([[3, 0.4]]);
    expect(heightsAt(plan, 1)).toEqual([[3, 0.9]]);
    const [[, half]] = heightsAt(plan, 0.5);
    expect(half).toBeGreaterThan(0.65);
    expect(half).toBeLessThan(0.9);
  });

  it("has nothing to animate when the heights are the same", () => {
    const same = month([cell(1, -50, -10, 0, 40)]);
    const { shown, drawn } = state(same);
    expect(planTransition(shown, drawn, same).moves).toBe(false);
  });
});
