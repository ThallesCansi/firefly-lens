import { describe, it, expect, vi } from "vitest";
import { bindSelectionLayer, rectangleGeometry } from "./map-tool-layer";
import type { MapLike } from "../map/map-contract";
function fakeStyle() {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>(),
    layers = new Map<string, unknown>([["modis", {}]]);
  const map: MapLike = {
    addSource: vi.fn((id: string) => {
      sources.set(id, { setData: vi.fn() });
    }),
    getSource: (id) => sources.get(id),
    removeSource: (id) => sources.delete(id),
    addLayer: vi.fn((layer: unknown) => {
      layers.set((layer as { id: string }).id, layer);
    }),
    getLayer: (id) => layers.get(id),
    removeLayer: (id) => layers.delete(id),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
  };
  return { map, sources, layers };
}
describe("workspace selection layer integration", () => {
  it("renders Polygon geometry without replacing engine layers and clears only tool-owned assets", () => {
    const style = fakeStyle(),
      unsubscribe = vi.fn();
    const binding = bindSelectionLayer({
      onStyleReady: (setup) => {
        setup(style.map);
        return unsubscribe;
      },
    });
    const geometry = rectangleGeometry([-50, -14, -42, -6]);
    binding.setGeometry(geometry);
    expect(style.map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tool-workspace-selection-fill" }),
      "modis",
    );
    expect(
      style.sources.get("tool-workspace-selection")!.setData,
    ).toHaveBeenLastCalledWith({
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry }],
    });
    binding.setGeometry(null);
    expect(
      style.sources.get("tool-workspace-selection")!.setData,
    ).toHaveBeenLastCalledWith({ type: "FeatureCollection", features: [] });
    binding.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect([...style.layers.keys()]).toEqual(["modis"]);
    expect(style.sources.size).toBe(0);
  });
  it("restores the latest geometry after a theme or basemap reload", () => {
    let reload!: (map: MapLike) => void;
    const first = fakeStyle(),
      next = fakeStyle();
    const binding = bindSelectionLayer({
      onStyleReady: (setup) => {
        reload = setup;
        setup(first.map);
        return () => {};
      },
    });
    const geometry = rectangleGeometry([-48, -16, -47, -15]);
    binding.setGeometry(geometry);
    reload(next.map);
    expect(
      next.sources.get("tool-workspace-selection")!.setData,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        features: [expect.objectContaining({ geometry })],
      }),
    );
    expect(next.layers.size).toBe(3);
    binding.dispose();
  });
});
