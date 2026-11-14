import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  administrativeCandidate,
  geometryContains,
  identifyRegions,
  type BoundaryFeature,
  type PolygonGeometry,
} from "./administrative";
import {
  RectangleEditor,
  resizeRectangle,
  moveRectangle,
  validateRectangle,
} from "./rectangle-editor";
import { PanelSizeController, panelLimits } from "./panel-size";
const square: PolygonGeometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4],
      [2, 2],
    ],
  ],
};
const boundaries = (kind: string) =>
  JSON.parse(
    readFileSync(
      resolve("public/interaction-boundaries/" + kind + ".geojson"),
      "utf8",
    ),
  ).features as BoundaryFeature[];
describe("administrative identification", () => {
  it("uses Polygon/MultiPolygon topology including holes and boundary points", () => {
    expect(geometryContains(square, [1, 1])).toBe(true);
    expect(geometryContains(square, [3, 3])).toBe(false);
    expect(geometryContains(square, [0, 5])).toBe(true);
    expect(
      geometryContains(
        {
          type: "MultiPolygon",
          coordinates: [
            square.coordinates,
            [
              [
                [20, 0],
                [22, 0],
                [22, 2],
                [20, 2],
                [20, 0],
              ],
            ],
          ],
        },
        [21, 1],
      ),
    ).toBe(true);
  });
  it("handles dateline-crossing rings without selecting their large bounding envelope", () => {
    const dateline: PolygonGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [170, -10],
          [-170, -10],
          [-170, 10],
          [170, 10],
          [170, -10],
        ],
      ],
    };
    expect(geometryContains(dateline, [179, 0])).toBe(true);
    expect(geometryContains(dateline, [-179, 0])).toBe(true);
    expect(geometryContains(dateline, [0, 0])).toBe(false);
  });
  it("identifies real IBGE states and Natural Earth countries, including unavailable coverage", () => {
    const states = boundaries("states"),
      countries = boundaries("countries");
    expect(states).toHaveLength(27);
    expect(countries.length).toBeGreaterThanOrEqual(170);
    for (const country of countries)
      expect(administrativeCandidate(country).bounds).toHaveLength(4);
    expect(
      identifyRegions([-46.63, -23.55], states)[0].feature.properties.sourceId,
    ).toBe("35");
    expect(
      identifyRegions([-43.2, -22.9], states)[0].feature.properties.sourceId,
    ).toBe("33");
    expect(identifyRegions([-46.63, -23.55], countries)[0].analysis).toBe(
      "requires-polygon-clipping",
    );
    expect(identifyRegions([-120, 38], countries)[0].dataCoverage).toBe("none");
    expect(identifyRegions([-30, 0], countries)).toHaveLength(0);
    const brazil = administrativeCandidate(
      countries.find((c) => c.properties.countryCode === "BRA")!,
    );
    expect(brazil.centerKind).toBe("bounding-box-center");
    expect(brazil.feature.geometry.type).toMatch(/Polygon/);
  });
});
describe("geographic rectangle editing", () => {
  const box: [number, number, number, number] = [-50, -14, -42, -6];
  it("normalizes crossed corners and enforces minimum and maximum side lengths", () => {
    expect(resizeRectangle(box, "nw", [-40, -16])).toEqual([
      -42, -16, -40, -14,
    ]);
    const degenerate = resizeRectangle(box, "nw", [-42, -14]);
    expect(validateRectangle(degenerate)).toBe(true);
    expect(degenerate[2] - degenerate[0]).toBe(0.5);
    const large = resizeRectangle(box, "nw", [-74, 5]);
    expect(large[2] - large[0]).toBeLessThanOrEqual(12);
    expect(large[3] - large[1]).toBeLessThanOrEqual(12);
  });
  it("moves the whole area without changing dimensions, clamped to Brazil coverage", () => {
    const moved = moveRectangle(box, [-46, -10], [-179, -50]);
    expect(validateRectangle(moved)).toBe(true);
    expect(moved[0]).toBe(-74);
    expect(moved[2] - moved[0]).toBe(8);
    expect(moved[3] - moved[1]).toBe(8);
  });
  it("previews during a gesture and commits only on explicit confirmation", () => {
    const preview = vi.fn(),
      confirm = vi.fn();
    const editor = new RectangleEditor(box, {
      onPreview: preview,
      onConfirm: confirm,
    });
    editor.begin("nw", [-50, -6]);
    editor.update([-48, -8]);
    editor.update([-47, -7]);
    expect(preview).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
    expect(editor.confirm()).toBe(false);
    editor.endDrag();
    expect(editor.confirm()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(box).toEqual([-50, -14, -42, -6]);
  });
  it("cancels back to original geometry and safely ignores globe sky/occluded inverse projections", () => {
    const cancel = vi.fn();
    const editor = new RectangleEditor(box, { onCancel: cancel });
    editor.begin("nw", [-50, -6]);
    expect(editor.update(null)).toBe(false);
    editor.update([-48, -8]);
    editor.cancel();
    expect(editor.snapshot().draft).toEqual(box);
    expect(cancel).toHaveBeenCalledWith(box);
  });
  it("rejects degenerate inputs and unsafe antimeridian jumps rather than fabricating a rectangle", () => {
    expect(() => new RectangleEditor([-50, -14, -50, -6])).toThrow();
    const editor = new RectangleEditor(box);
    editor.begin("nw", [-50, -6]);
    expect(editor.update([179, 0])).toBe(false);
    expect(editor.snapshot().draft).toEqual(box);
    expect(editor.snapshot().error).toMatch(/Antimeridian/);
  });
});
describe("panel width limits", () => {
  it("preserves a minimum map area, clamps widths and disables horizontal resize on mobile", () => {
    const p = new PanelSizeController();
    p.setViewport(1440);
    p.setWidth(2000);
    expect(p.snapshot().width).toBe(960);
    p.setWidth(0);
    expect(p.snapshot().width).toBe(320);
    p.setViewport(760);
    p.setWidth(900);
    expect(p.snapshot().width).toBe(440);
    expect(760 - p.snapshot().width).toBeGreaterThanOrEqual(320);
    p.setViewport(390);
    const before = p.snapshot().width;
    p.begin(200);
    p.update(10);
    expect(p.snapshot().width).toBe(before);
    expect(p.snapshot().limits.mobile).toBe(true);
    expect(panelLimits(320).max).toBe(0);
  });
  it("supports cancel/reset and restores a preferred width after viewport constraints ease", () => {
    const p = new PanelSizeController();
    p.setViewport(1440);
    p.setWidth(800);
    p.setViewport(900);
    expect(p.snapshot().width).toBe(580);
    p.setViewport(1440);
    expect(p.snapshot().width).toBe(800);
    p.begin(500);
    p.update(400);
    expect(p.snapshot().width).toBe(900);
    p.cancel();
    expect(p.snapshot().width).toBe(800);
    p.reset();
    expect(p.snapshot().width).toBe(600);
  });
});
