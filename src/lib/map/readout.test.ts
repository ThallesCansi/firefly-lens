import { describe, expect, it } from "vitest";
import { meta } from "../data/meta";
import { cellGeometry } from "../data/tiles";
import { prepare } from "../geo/clip";
import { rectangleArea } from "../data/types";
import { cellIdAt, cellPlace, cellRing, placeReadout } from "./readout";

describe("cellIdAt", () => {
  it("gives a point the id the data tiles give its cell", () => {
    const shape = prepare(rectangleArea(meta.bounds).geometry);
    for (const [tx, ty, local] of [
      [5, 5, 0],
      [5, 5, 37],
      [7, 3, 255],
    ]) {
      const cell = cellGeometry({ tx, ty }, local, shape);
      const d = meta.cellDeg;
      // The centre and points just inside each corner all belong to the cell.
      for (const [dx, dy] of [
        [0, 0],
        [-0.49, -0.49],
        [0.49, 0.49],
        [-0.49, 0.49],
      ])
        expect(cellIdAt(cell.lon + dx * d, cell.lat + dy * d)).toBe(cell.id);
      expect(cellIdAt(cell.lon + 0.51 * d, cell.lat)).not.toBe(cell.id);
    }
  });
});

describe("cellRing", () => {
  it("is the closed square of one cell", () => {
    const ring = cellRing(-55.625, -12.375);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    expect(ring[0]).toEqual([-55.75, -12.5]);
    expect(ring[2]).toEqual([-55.5, -12.25]);
  });
});

describe("placeReadout", () => {
  const size = { width: 200, height: 120 };
  const map = { width: 1000, height: 600 };

  it("sits below and to the right of the pointer", () => {
    expect(placeReadout([100, 100], size, map)).toEqual([116, 116]);
  });

  it("switches side instead of leaving the map", () => {
    expect(placeReadout([900, 100], size, map)).toEqual([684, 116]);
    expect(placeReadout([100, 550], size, map)).toEqual([116, 414]);
    expect(placeReadout([950, 590], size, map)).toEqual([734, 454]);
  });

  it("stays on the map when there is room on neither side", () => {
    expect(placeReadout([100, 60], size, { width: 250, height: 150 })).toEqual([0, 0]);
  });
});

describe("cellPlace", () => {
  it("names the hemisphere instead of using a sign", () => {
    expect(cellPlace(-55.625, -12.375)).toBe("12.38°S 55.63°W");
    expect(cellPlace(10.125, 3.875)).toBe("3.88°N 10.13°E");
  });
});
