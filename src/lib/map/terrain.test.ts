import { afterEach, describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { createTerrain, TERRAIN_DEM, TERRAIN_EXAGGERATION, TERRAIN_SOURCE, terrainPresentation } from "./terrain";

afterEach(() => vi.useRealTimers());
function fixture() {
  vi.useFakeTimers();
  const listeners = new Map<string, Set<(event: object) => void>>();
  const sources = new Map<string, object>();
  let attached: { source: string; exaggeration: number } | null = null;
  const order: string[] = [];
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string, source: object) => sources.set(id, source)),
    removeSource: vi.fn((id: string) => { expect(attached).toBeNull(); order.push("remove"); sources.delete(id); }),
    getTerrain: () => attached,
    setTerrain: vi.fn((options) => { order.push(options ? "attach" : "detach"); attached = options; }),
    isSourceLoaded: vi.fn(() => true),
    on: (type: string, fn: (event: object) => void) => listeners.set(type, new Set([...(listeners.get(type) ?? []), fn])),
    off: (type: string, fn: (event: object) => void) => listeners.get(type)?.delete(fn),
  };
  const change = vi.fn(); const terrain = createTerrain(map as unknown as MapLibreMap, change);
  const emit = (type: string, event: object) => [...listeners.get(type) ?? []].forEach((fn) => fn(event));
  const content = { sourceId: TERRAIN_SOURCE, sourceDataType: "content" };
  return { terrain, map, change, emit, listeners, content, order };
}
describe("terrain lifecycle", () => {
  it("uses the real capped Terrarium source and physical exaggeration", () => {
    expect(TERRAIN_DEM).toMatchObject({ type: "raster-dem", encoding: "terrarium", tileSize: 512, maxzoom: 12,
      tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"] });
    expect(TERRAIN_DEM.attribution).toContain("https://mapterhorn.com/attribution/");
    expect(TERRAIN_EXAGGERATION).toBe(1);
  });
  it("makes no DEM requests off, waits for style and installs idempotently", () => {
    const f = fixture(); f.terrain.styleLoaded(); expect(f.map.addSource).not.toHaveBeenCalled();
    f.terrain.styleLoading(); f.terrain.setEnabled(true); expect(f.map.setTerrain).not.toHaveBeenCalled();
    f.terrain.styleLoaded(); f.terrain.setEnabled(true); f.terrain.styleLoaded();
    expect(f.map.addSource).toHaveBeenCalledTimes(1); expect(f.map.setTerrain).toHaveBeenCalledTimes(1);
    expect(f.change).toHaveBeenLastCalledWith("loading");
    f.emit("sourcedata", { ...f.content, sourceDataType: "metadata" }); expect(f.change).not.toHaveBeenCalledWith("active");
    f.emit("sourcedata", { sourceId: TERRAIN_SOURCE, tile: { dem: {} } });
    expect(f.change).toHaveBeenLastCalledWith("active"); f.terrain.dispose();
  });
  it("detaches before removing source and restores only when requested after a style change", () => {
    const f = fixture(); f.terrain.setEnabled(true); f.terrain.styleLoaded();
    f.terrain.styleLoading(); expect(f.order.slice(-2)).toEqual(["detach", "remove"]);
    f.terrain.styleLoaded(); expect(f.map.addSource).toHaveBeenCalledTimes(2);
    f.terrain.setEnabled(false); f.terrain.styleLoading(); f.terrain.styleLoaded();
    expect(f.map.addSource).toHaveBeenCalledTimes(2); expect(f.map.getTerrain()).toBeNull(); f.terrain.dispose();
  });
  it("ignores old tile completion and queued errors after an off/on cycle", async () => {
    const f = fixture(); f.terrain.styleLoaded(); f.terrain.setEnabled(true);
    const old = [...f.listeners.get("sourcedata")!][0];
    f.emit("error", { sourceId: TERRAIN_SOURCE, error: new Error("HTTP 503") });
    f.terrain.setEnabled(false); f.terrain.setEnabled(true); old(f.content); await Promise.resolve();
    expect(f.change).toHaveBeenLastCalledWith("loading"); expect(f.map.getTerrain()).not.toBeNull();
    f.emit("sourcedata", f.content); expect(f.change).toHaveBeenLastCalledWith("active"); f.terrain.dispose();
  });
  it("fails safely, filters unrelated/aborted requests, and retries only after explicit action", async () => {
    const f = fixture(); f.terrain.styleLoaded(); f.terrain.setEnabled(true);
    f.emit("error", { sourceId: "hotspots", error: new Error("HTTP 503") });
    f.emit("error", { sourceId: TERRAIN_SOURCE, error: new Error("AbortError") }); await Promise.resolve();
    expect(f.map.getTerrain()).not.toBeNull();
    f.emit("error", { sourceId: TERRAIN_SOURCE, error: new Error("HTTP 503") }); await Promise.resolve();
    expect(f.map.getTerrain()).toBeNull(); expect(f.change).toHaveBeenLastCalledWith("unavailable");
    f.terrain.setEnabled(true); expect(f.map.addSource).toHaveBeenCalledTimes(1);
    f.terrain.setEnabled(false); f.terrain.setEnabled(true); expect(f.map.addSource).toHaveBeenCalledTimes(2); f.terrain.dispose();
  });
  it("bounds initial loading and invalidates timeout/error callbacks on teardown", async () => {
    const f = fixture(); f.terrain.styleLoaded(); f.terrain.setEnabled(true);
    await vi.advanceTimersByTimeAsync(25_001); expect(f.change).toHaveBeenLastCalledWith("unavailable");
    f.terrain.setEnabled(false); f.terrain.setEnabled(true); f.terrain.dispose();
    const count = f.change.mock.calls.length; await vi.advanceTimersByTimeAsync(30_000);
    expect(f.change).toHaveBeenCalledTimes(count); expect(f.listeners.get("sourcedata")?.size).toBe(0);
  });
});
describe("terrain scientific presentation", () => {
  it.each([false, true])("preserves column preference %s through activation, suspension, failure and exit", (chosen) => {
    expect(terrainPresentation(true, false, "loading", chosen, false)).toEqual({ terrainEnabled: true, inColumns: false });
    expect(terrainPresentation(true, false, "active", chosen, false).inColumns).toBe(false);
    expect(terrainPresentation(true, true, "off", chosen, false).inColumns).toBe(chosen);
    expect(terrainPresentation(true, true, "off", chosen, true).inColumns).toBe(true);
    expect(terrainPresentation(true, false, "unavailable", chosen, false).inColumns).toBe(chosen);
    expect(terrainPresentation(false, false, "off", chosen, false).inColumns).toBe(chosen);
  });
});
