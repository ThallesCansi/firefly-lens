import { describe, expect, it } from "vitest";
import type { PolygonGeometry } from "../data/types";
import { cellShare, prepare } from "./clip";

const poly = (...rings: number[][][]): PolygonGeometry => ({ type: "Polygon", coordinates: rings });
const square = (w: number, s: number, e: number, n: number) => [
  [w, s],
  [e, s],
  [e, n],
  [w, n],
  [w, s],
];

describe("cellShare", () => {
  it("is 1 for a cell inside and 0 for a cell outside", () => {
    const p = prepare(poly(square(-60, -16, -48, -4)));
    expect(cellShare(p, -55, -10, 0.25)).toBe(1);
    expect(cellShare(p, -60, -16, 0.25)).toBe(1);
    expect(cellShare(p, -47, -10, 0.25)).toBe(0);
    expect(cellShare(p, -48, -10, 0.25)).toBe(0);
  });

  it("measures a cell cut by an edge", () => {
    const p = prepare(poly(square(-60.1, -16, -48, -4)));
    expect(cellShare(p, -60.25, -10, 0.25)).toBeCloseTo(0.4, 9);
  });

  it("is a half for a triangle along the cell's diagonal", () => {
    const p = prepare(
      poly([
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 0],
      ]),
    );
    expect(cellShare(p, 0, 0, 1)).toBeCloseTo(0.5, 9);
  });

  it("works for concave rings in either winding", () => {
    // An L: the top-right quarter of the 2 × 2 square is missing.
    const l = [
      [0, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [1, 2],
      [0, 2],
      [0, 0],
    ];
    expect(cellShare(prepare(poly(l)), 0, 0, 2)).toBeCloseTo(0.75, 9);
    expect(cellShare(prepare(poly([...l].reverse())), 0, 0, 2)).toBeCloseTo(0.75, 9);
    expect(cellShare(prepare(poly(l)), 1, 1, 1)).toBe(0);
  });

  it("subtracts holes and adds the parts of a multipolygon", () => {
    const holed = prepare(poly(square(0, 0, 4, 4), square(1, 1, 3, 3)));
    expect(cellShare(holed, 0, 0, 4)).toBeCloseTo(0.75, 9);
    const multi = prepare({
      type: "MultiPolygon",
      coordinates: [[square(0, 0, 1, 1)], [square(3, 3, 4, 4)]],
    });
    expect(cellShare(multi, 0, 0, 4)).toBeCloseTo(2 / 16, 9);
  });
});
