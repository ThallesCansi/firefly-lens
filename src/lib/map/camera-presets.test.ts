import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fireData } from "../data/source";
import { boundsSamples, BRAZIL_BOUNDS, clampPitch, earthZoom, normalizeBearing, pitchedPadding, presetRequest, viewportPadding } from "./camera-presets";
import { planNavigation } from "./camera";
const pose = { center: [-54, -14] as [number, number], zoom: 4, bearing: 20, pitch: 30, projection: "globe" as const };
const pantanal = fireData.presets().find((p) => p.id === "pantanal")!.bbox;
describe("camera presets", () => {
  it("Brazil framing matches the shipped outline, including Atlantic islands", () => {
    const outline = JSON.parse(readFileSync(new URL("../../../public/data/brazil/brazil.geojson", import.meta.url), "utf8"));
    const extent = [180, 90, -180, -90];
    function visit(node: unknown) {
      if (!Array.isArray(node)) return;
      if (typeof node[0] === "number" && typeof node[1] === "number") {
        extent[0] = Math.min(extent[0], node[0]); extent[1] = Math.min(extent[1], node[1]);
        extent[2] = Math.max(extent[2], node[0]); extent[3] = Math.max(extent[3], node[1]);
      } else node.forEach(visit);
    }
    outline.features.forEach((feature: { geometry: { coordinates: unknown } }) => visit(feature.geometry.coordinates));
    expect(BRAZIL_BOUNDS).toEqual(extent);
  });
  it("uses existing Pantanal geometry and independent Brazil/selected extents", () => {
    expect(presetRequest("pantanal", pose, 900, 700, pantanal, null)?.bounds).toBe(pantanal);
    expect(presetRequest("brazil", pose, 900, 700, pantanal, null)?.bounds).toBe(BRAZIL_BOUNDS);
    expect(presetRequest("selected", pose, 900, 700, pantanal, pantanal)?.bounds).toBe(pantanal);
    expect(presetRequest("selected", pose, 900, 700, pantanal, null)).toBeNull();
  });
  it("Earth uses a responsive point camera rather than a full-world bbox", () => {
    expect(earthZoom(320, 700)).toBeLessThan(earthZoom(1440, 900));
    expect(earthZoom(700, 320)).toBe(earthZoom(320, 700));
    expect(presetRequest("earth", pose, 320, 700, pantanal, null)).not.toHaveProperty("bounds");
  });
  it("orientation actions preserve location and zoom without mutating inputs", () => {
    const before = structuredClone(pose);
    expect(presetRequest("north", pose, 900, 700, pantanal, null)).toMatchObject({ center: pose.center, zoom: 4, pitch: 30, bearing: 0 });
    expect(presetRequest("top", pose, 900, 700, pantanal, null)).toMatchObject({ pitch: 0, bearing: 0 });
    expect(pose).toEqual(before);
  });
  it("constrains attitude and preserves positive drawing space on small viewports", () => {
    expect(clampPitch(99)).toBe(60); expect(clampPitch(-10)).toBe(0); expect(clampPitch(NaN)).toBe(0);
    expect(normalizeBearing(370)).toBe(10); expect(normalizeBearing(-190)).toBe(170);
    const p = pitchedPadding({ top: 70, bottom: 140, left: 64, right: 60 }, 320, 600, 52);
    expect(p.left + p.right).toBeLessThan(320); expect(p.top + p.bottom).toBeLessThan(600);
    expect(boundsSamples(pantanal)).toHaveLength(25);
  });
  it("cinematic only changes intentional navigation; restore and layout keep standard behavior", () => {
    const camera = { ...pose, projection: "globe" as const };
    for (const source of ["restore", "tutorial", "layout"] as const) {
      const request = { id: 1, bounds: pantanal, source };
      expect(planNavigation(request, camera, false, "cinematic")).toEqual(planNavigation(request, camera, false));
    }
    expect(planNavigation({ id: 1, bounds: pantanal }, camera, true, "cinematic").duration).toBe(0);
  });
  it("clears desktop cards and mobile bottom cards without consuming the whole viewport", () => {
    expect(viewportPadding(1440, 1000, [{ left: 20, right: 392, top: 326, bottom: 600 }]).left).toBe(416);
    const mobile = viewportPadding(390, 1000, [{ left: 12, right: 378, top: 700, bottom: 900 }, { left: 80, right: 378, top: 70, bottom: 230 }]);
    expect(mobile.bottom).toBe(316); expect(mobile.top).toBe(246);
    expect(mobile.top + mobile.bottom).toBeLessThan(1000);
  });
  it("keeps antimeridian bounds unwrapped and gives cinematic point flights a different native curve", () => {
    const request = { id: 1, bounds: [177, -19, -178, -15] as [number, number, number, number] };
    expect(planNavigation(request, pose, false, "cinematic").bounds).toEqual([177, -19, 182, -15]);
    const point = { id: 2, center: [140, 35] as [number, number], zoom: 8 };
    expect(planNavigation(point, pose, false, "cinematic").curve).not.toBe(planNavigation(point, pose, false).curve);
  });
});
