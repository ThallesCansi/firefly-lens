import { describe, expect, it } from "vitest";
import { boundsCenter, boundsContain, distanceKm, flightDuration, planNavigation, safeBounds, wrapLng } from "./camera";
import { DEFAULT_PROJECTION, projectionSpec, skyFor } from "./projection";

const BRASILIA: [number, number] = [-47.9, -15.8];
const CUIABA: [number, number] = [-56.1, -15.6];
const LISBON: [number, number] = [-9.1, 38.7];

describe("distances and longitudes", () => {
  it("measures great-circle distance", () => {
    expect(distanceKm(BRASILIA, CUIABA)).toBeGreaterThan(850);
    expect(distanceKm(BRASILIA, CUIABA)).toBeLessThan(900);
    expect(distanceKm(BRASILIA, LISBON)).toBeGreaterThan(7000);
  });

  it("folds longitudes into one turn", () => {
    expect(wrapLng(190)).toBe(-170);
    expect(wrapLng(-190)).toBe(170);
    expect(wrapLng(-54)).toBe(-54);
  });
});

describe("bounds", () => {
  it("unwraps an area that crosses the antimeridian", () => {
    const fiji: [number, number, number, number] = [177, -19, -178, -15];
    expect(safeBounds(fiji, "globe")).toEqual([177, -19, 182, -15]);
    expect(boundsCenter(fiji)).toEqual([179.5, -17]);
  });

  it("keeps the flat map away from the poles", () => {
    const [, s, , n] = safeBounds([-60, -89, -40, 89], "mercator");
    expect(s).toBe(-85);
    expect(n).toBe(85);
    expect(safeBounds([-60, -89, -40, 89], "globe")[1]).toBe(-89);
  });

  it("tells whether an area is already in view", () => {
    expect(boundsContain([-80, -40, -30, 10], [-60, -13, -50, -5])).toBe(true);
    expect(boundsContain([-55, -40, -30, 10], [-60, -13, -50, -5])).toBe(false);
  });
});

describe("camera plans", () => {
  const camera = { center: BRASILIA, zoom: 3, projection: "globe" as const };

  it("flies to a search result, longer for a longer trip but never past 4 s", () => {
    const near = planNavigation({ id: 1, center: CUIABA, zoom: 8 }, camera, false);
    const far = planNavigation({ id: 2, center: LISBON, zoom: 8 }, camera, false);
    expect(near.method).toBe("flyTo");
    expect(far.duration).toBeGreaterThan(near.duration);
    expect(far.duration).toBeLessThanOrEqual(4000);
    expect(near.duration).toBeGreaterThanOrEqual(700);
  });

  it("frames bounds with a short glide by default", () => {
    const plan = planNavigation({ id: 1, bounds: [-62, -13, -50, -5], maxZoom: 12 }, camera, false);
    expect(plan.method).toBe("fitBounds");
    expect(plan.duration).toBeLessThanOrEqual(1200);
    expect(plan.maxZoom).toBe(12);
  });

  it("does not animate when the person asked for reduced motion", () => {
    expect(planNavigation({ id: 1, center: LISBON, zoom: 8 }, camera, true)).toMatchObject({ method: "jumpTo", duration: 0 });
    expect(planNavigation({ id: 1, bounds: [-62, -13, -50, -5] }, camera, true).duration).toBe(0);
  });

  it("leaves maxZoom out when the request has none (an explicit undefined breaks MapLibre's fit)", () => {
    const plan = planNavigation({ id: 1, bounds: [-62, -13, -50, -5] }, camera, false);
    expect("maxZoom" in plan).toBe(false);
  });

  it("keeps the current zoom when the request has none", () => {
    expect(planNavigation({ id: 1, center: CUIABA }, camera, false).zoom).toBe(3);
  });

  it("scales flight time with distance and zoom change", () => {
    expect(flightDuration(BRASILIA, BRASILIA, 3, 3)).toBe(700);
    expect(flightDuration(BRASILIA, LISBON, 3, 10)).toBe(4000);
  });
});

describe("projection settings", () => {
  it("opens on the globe", () => {
    expect(DEFAULT_PROJECTION).toBe("globe");
    expect(projectionSpec("globe")).toEqual({ type: "globe" });
  });

  it("keeps a blue atmosphere in both themes, a little stronger at night", () => {
    expect(skyFor("dark")["horizon-color"]).toBe(skyFor("light")["horizon-color"]);
    expect(JSON.stringify(skyFor("dark")["atmosphere-blend"])).not.toBe(JSON.stringify(skyFor("light")["atmosphere-blend"]));
  });
});
