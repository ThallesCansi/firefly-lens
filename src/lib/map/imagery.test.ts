import { afterEach, describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { createImagery } from "./imagery";
import { DEFAULT_IMAGERY, IMAGERY_LAYER, IMAGERY_PROVIDERS } from "./imagery-providers";
import { withImagery } from "./basemap";

afterEach(() => vi.useRealTimers());
function fixture(externalCredits: readonly ("eox-sentinel-2025")[] = []) {
  vi.useFakeTimers();
  const initial = withImagery({ version: 8, sources: {}, layers: [
    { id: "ground", type: "background" }, { id: "labels", type: "symbol", source: "labels" },
  ] } as StyleSpecification, "light", "map");
  let layers = initial.layers.slice();
  const sources = new Map(Object.entries(initial.sources));
  const listeners = new Map<string, Set<(event: object) => void>>();
  const map = {
    getStyle: () => ({ layers }), getSource: (id: string) => sources.get(id), getLayer: (id: string) => layers.find((l) => l.id === id),
    addSource: vi.fn((id, spec) => sources.set(id, spec)), removeSource: vi.fn((id) => sources.delete(id)),
    addLayer: vi.fn((layer, before) => { const at = layers.findIndex((l) => l.id === before); layers.splice(at < 0 ? layers.length : at, 0, layer); }),
    removeLayer: vi.fn((id) => { layers = layers.filter((l) => l.id !== id); }),
    isSourceLoaded: () => true,
    on: (type: string, fn: (event: object) => void) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(fn); },
    off: (type: string, fn: (event: object) => void) => listeners.get(type)?.delete(fn),
  };
  const change = vi.fn(); const manager = createImagery(map as unknown as MapLibreMap, change, { externalCredits });
  const emit = (type: string, event: object) => [...listeners.get(type) ?? []].forEach((fn) => fn(event));
  const source = () => map.addSource.mock.calls.at(-1)![0];
  return { map, manager, emit, source, change, sources, listeners };
}

describe("imagery providers", () => {
  it("keeps NASA default and preserves EOX WMTS row/column order, credits, date and zoom cap", () => {
    expect(DEFAULT_IMAGERY).toBe("nasa-blue-marble");
    const eox = IMAGERY_PROVIDERS["eox-sentinel-2025"];
    expect(eox.mosaicYear).toBe(2025);
    expect(eox.source).toMatchObject({ tileSize: 256, minzoom: 0, maxzoom: 14 });
    expect(eox.source.tiles![0]).toContain("2025_3857/default/g/{z}/{y}/{x}.jpg");
    for (const credit of ["EOxCloudless", "EOX IT Services GmbH", "Copernicus Sentinel data 2025", "by-nc-sa/4.0", "independent of analysis dates"]) expect(eox.source.attribution).toContain(credit);
    expect(eox.reference).toContain("independent of the analysis dates");
  });
  it.each(["light", "dark"] as const)("keeps EOX opaque through local zooms in %s without mutating NASA", (theme) => {
    expect(IMAGERY_PROVIDERS["eox-sentinel-2025"].paint(theme)["raster-opacity"]).toBe(1);
    expect(IMAGERY_PROVIDERS[DEFAULT_IMAGERY].paint(theme)["raster-opacity"]).toEqual(["interpolate", ["linear"], ["zoom"], 9, 1, 11.5, 0]);
  });
});

describe("imagery lifecycle", () => {
  it("delegates only explicitly external credits without mutating provider metadata", () => {
    const f = fixture(["eox-sentinel-2025"]); f.manager.configure(DEFAULT_IMAGERY, true, "light"); f.manager.styleLoaded();
    expect(f.map.addSource.mock.calls.at(-1)![1].attribution).toContain("NASA GIBS");
    f.manager.configure("eox-sentinel-2025", true, "light");
    expect(f.map.addSource.mock.calls.at(-1)![1].attribution).toBeUndefined();
    expect(IMAGERY_PROVIDERS["eox-sentinel-2025"].source.attribution).toContain("Copernicus Sentinel data 2025");
    f.manager.dispose();
  });
  it("does not fetch hidden imagery and swaps only raster resources, beneath labels", () => {
    const f = fixture(); f.manager.styleLoaded(); expect(f.map.addSource).not.toHaveBeenCalled();
    f.manager.configure(DEFAULT_IMAGERY, true, "light");
    expect(f.map.getStyle().layers.map((l) => l.id)).toEqual(["ground", IMAGERY_LAYER, "labels"]);
    f.emit("sourcedata", { sourceId: f.source(), tile: {} }); expect(f.change).toHaveBeenLastCalledWith("active");
    f.manager.configure("eox-sentinel-2025", true, "light");
    expect(f.sources.size).toBe(1); expect(f.map.addSource.mock.calls.at(-1)![1].maxzoom).toBe(14);
    expect(f.map.getStyle().layers.map((l) => l.id)).toEqual(["ground", IMAGERY_LAYER, "labels"]);
    f.manager.configure("eox-sentinel-2025", false, "light"); expect(f.sources.size).toBe(0);
    expect(f.change).toHaveBeenLastCalledWith("off"); f.manager.dispose();
  });
  it("rejects late errors and completion after rapid switches and disposal", async () => {
    const f = fixture(); f.manager.configure(DEFAULT_IMAGERY, true, "light"); f.manager.styleLoaded();
    const old = f.source(), callback = [...f.listeners.get("sourcedata")!][0];
    f.emit("error", { sourceId: old, error: new Error("HTTP 503") });
    f.manager.configure("eox-sentinel-2025", true, "light");
    callback({ sourceId: old, tile: {} }); await Promise.resolve();
    expect(f.change).toHaveBeenLastCalledWith("loading");
    f.emit("sourcedata", { sourceId: f.source(), tile: {} }); expect(f.change).toHaveBeenLastCalledWith("active");
    f.manager.dispose(); const count = f.change.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000); expect(f.change).toHaveBeenCalledTimes(count);
    expect(f.listeners.get("error")?.size).toBe(0);
  });
  it("fails to cartography without touching terrain, ignores aborts, and supports explicit retry", async () => {
    const f = fixture(); f.manager.configure("eox-sentinel-2025", true, "light"); f.manager.styleLoaded();
    f.emit("error", { sourceId: "mapterhorn-terrain", error: new Error("HTTP 503") });
    f.emit("error", { sourceId: f.source(), error: new Error("AbortError") }); await Promise.resolve();
    expect(f.change).toHaveBeenLastCalledWith("loading");
    f.emit("error", { sourceId: f.source(), error: new Error("HTTP 429") }); await Promise.resolve();
    expect(f.change).toHaveBeenLastCalledWith("unavailable"); expect(f.map.getLayer("labels")).toBeDefined();
    expect(f.sources.size).toBe(0); f.manager.retry();
    expect(f.change).toHaveBeenLastCalledWith("loading"); f.manager.dispose();
  });
  it("bounds loading and restores the current provider after theme/style replacement", async () => {
    const f = fixture(); f.manager.configure("eox-sentinel-2025", true, "light"); f.manager.styleLoaded();
    await vi.advanceTimersByTimeAsync(25_001); expect(f.change).toHaveBeenLastCalledWith("unavailable");
    f.manager.styleLoading(); f.manager.configure("eox-sentinel-2025", true, "dark");
    expect(f.sources.size).toBe(0); f.manager.styleLoaded();
    expect(f.map.addLayer.mock.calls.at(-1)![0].paint["raster-brightness-max"]).toBe(0.8);
    expect(f.map.addSource.mock.calls.at(-1)![1].tiles[0]).toContain("s2cloudless-2025");
    f.manager.dispose();
  });
});
