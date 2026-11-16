import { describe, expect, it } from "vitest";
import type { StyleSpecification } from "maplibre-gl";
import { IMAGERY_LAYER, withImagery } from "./basemap";

/** The shape of the Liberty style, reduced to what decides where the picture goes. */
const style = {
  version: 8,
  sources: { openmaptiles: { type: "vector", url: "https://example.test/tiles" } },
  layers: [
    { id: "background", type: "background" },
    { id: "natural_earth", type: "raster", source: "ne" },
    { id: "landcover_wood", type: "fill", source: "openmaptiles", "source-layer": "landcover" },
    { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water" },
    { id: "road_motorway", type: "line", source: "openmaptiles", "source-layer": "transportation" },
    { id: "boundary_2", type: "line", source: "openmaptiles", "source-layer": "boundary" },
    { id: "label_city", type: "symbol", source: "openmaptiles", "source-layer": "place" },
  ],
} as unknown as StyleSpecification;

type Raster = { id: string; layout: { visibility: string }; paint: Record<string, unknown> };
const ids = (s: StyleSpecification) => s.layers.map((l) => l.id);
const imagery = (s: StyleSpecification) => s.layers.find((l) => l.id === IMAGERY_LAYER) as unknown as Raster;

describe("withImagery", () => {
  it("defaults to Sentinel without applying NASA's local-zoom fade", () => {
    const output = withImagery(style, "light", "satellite");
    expect(output.sources[IMAGERY_LAYER]).toMatchObject({ maxzoom: 14, tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg"] });
    expect(imagery(output).paint["raster-opacity"]).toBe(1);
  });
  it("puts the picture over land and water, under roads, borders and names", () => {
    expect(ids(withImagery(style, "light", "satellite"))).toEqual([
      "background",
      "natural_earth",
      "landcover_wood",
      "water",
      IMAGERY_LAYER,
      "road_motorway",
      "boundary_2",
      "label_city",
    ]);
  });

  it("keeps the layer but hides it for the drawn map", () => {
    expect(imagery(withImagery(style, "light", "satellite")).layout.visibility).toBe("visible");
    expect(imagery(withImagery(style, "light", "map")).layout.visibility).toBe("none");
  });

  it("darkens the picture only in the dark theme", () => {
    expect(imagery(withImagery(style, "dark", "satellite")).paint["raster-brightness-max"]).toBeLessThan(1);
    expect(imagery(withImagery(style, "light", "satellite")).paint["raster-brightness-max"]).toBeUndefined();
  });

  it("asks NASA GIBS for tiles without a key and credits it", () => {
    const source = withImagery(style, "light", "satellite", "nasa-blue-marble").sources[IMAGERY_LAYER] as {
      tiles: string[];
      attribution: string;
    };
    expect(source.tiles[0]).toMatch(/^https:\/\/gibs\.earthdata\.nasa\.gov\/.+\{z\}\/\{y\}\/\{x\}\.jpeg$/);
    expect(source.tiles[0]).not.toMatch(/key|token/i);
    expect(source.attribution).toContain("NASA GIBS");
  });

  it("leaves the original style untouched", () => {
    withImagery(style, "dark", "satellite");
    expect(ids(style)).not.toContain(IMAGERY_LAYER);
  });
});
