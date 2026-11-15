import { afterEach, describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { createController } from "./controller";
import { DEFAULT_CAMERA_PROFILE } from "./camera";

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const frames = new Map<number, FrameRequestCallback>(); let sequence = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const preference = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => preference);
  const handlers = new Map<string, ((event: object) => void)[]>();
  const emit = (type: string, event: object = {}) => handlers.get(type)?.forEach((handler) => handler(event));
  const handler = () => ({ enable: vi.fn(), disable: vi.fn() });
  const canvas = new EventTarget();
  let pose = { center: [10, -20], zoom: 4, bearing: 12, pitch: 0 };
  let lastEvent: object = {};
  const move = vi.fn((options, data) => { pose = { ...pose, ...options }; lastEvent = data; });
  const map = {
    on: vi.fn((type, callback) => { handlers.set(type, [...handlers.get(type) ?? [], callback]); }),
    getCanvas: () => canvas,
    getContainer: () => ({ clientWidth: 900, clientHeight: 700, closest: () => null, getBoundingClientRect: () => ({ left: 0, top: 0 }) }),
    getCenter: () => ({ lng: pose.center[0], lat: pose.center[1] }),
    getZoom: () => pose.zoom, getBearing: () => pose.bearing, getPitch: () => pose.pitch, getMinZoom: () => -2,
    getPadding: () => (pose as typeof pose & { padding?: object }).padding,
    getBounds: () => ({ getWest: () => -60, getSouth: () => -20, getEast: () => -50, getNorth: () => -10 }),
    stop: vi.fn(() => emit("moveend", lastEvent)),
    cameraForBounds: vi.fn((_bounds, options) => ({ center: [0, 0], zoom: 5, bearing: options.bearing, padding: options.padding })),
    flyTo: vi.fn(move), easeTo: vi.fn(move), jumpTo: vi.fn(move),
    project: vi.fn(() => ({ x: 450, y: 300 })),
    setProjection: vi.fn(), dragPan: handler(), scrollZoom: handler(), boxZoom: handler(), doubleClickZoom: handler(),
    touchZoomRotate: handler(), keyboard: handler(), dragRotate: handler(), touchPitch: handler(),
  };
  const hooks = { onProjection: vi.fn(), onFlightChange: vi.fn() };
  const controller = createController(map as unknown as MapLibreMap, class { constructor(public x: number, public y: number) {} }, "globe", hooks);
  const flush = () => { const jobs = [...frames.values()]; frames.clear(); jobs.forEach((callback) => callback(0)); };
  return { controller, map, move, hooks, canvas, preference, emit, flush, arrive: () => emit("moveend", lastEvent) };
}
describe("camera coordination", () => {
  it("defaults to Cinematic without moving or changing initial framing", () => {
    const f = fixture(); const initial = f.controller.getCameraPose(); f.flush();
    expect(DEFAULT_CAMERA_PROFILE).toBe("cinematic"); expect(f.move).not.toHaveBeenCalled();
    expect(f.controller.getCameraPose()).toEqual(initial);
    f.controller.navigate({ id: 1, bounds: [-60, -20, -50, -10] }); f.flush();
    expect(f.map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ pitch: 35, curve: 1.8 }), expect.anything());
  });
  it("cycles Cinematic → Standard → Cinematic without moving on selection or retaining defaults", () => {
    const f = fixture(); const request = { id: 1, bounds: [-60, -20, -50, -10] as [number, number, number, number] };
    f.controller.navigate(request); f.flush(); f.arrive();
    expect(f.move.mock.calls.at(-1)?.[0]).toMatchObject({ pitch: 35, curve: 1.8 });
    const pose = f.controller.getCameraPose(); const count = f.move.mock.calls.length;
    f.controller.setCameraProfile("standard"); f.flush();
    expect(f.move).toHaveBeenCalledTimes(count); expect(f.controller.getCameraPose()).toEqual(pose);
    f.controller.navigate(request); f.flush(); f.arrive();
    expect(f.map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: 0, bearing: 0 }), expect.anything());
    const standard = f.move.mock.calls.at(-1)![0]; expect(standard.duration).toBeLessThanOrEqual(1200); expect(standard.curve).toBeUndefined();
    f.controller.setCameraProfile("cinematic"); f.flush(); expect(f.move).toHaveBeenCalledTimes(count + 1);
    f.controller.navigate(request); f.flush();
    expect(f.map.flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: 35, curve: 1.8 }), expect.anything());
  });
  it("Standard point flights clear previous cinematic attitude and use baseline curve/duration", () => {
    const f = fixture(); f.controller.navigate({ id: 1, center: [20, 0], pitch: 35, bearing: 27 }); f.flush(); f.arrive();
    f.controller.setCameraProfile("standard");
    f.controller.navigate({ id: 2, center: [21, 1], zoom: 5 }); f.flush();
    expect(f.map.flyTo).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: 0, bearing: 0, curve: 1.6 }), expect.anything());
  });
  it("Standard preserves explicit column tilt and explicit camera/restoration requests", () => {
    const f = fixture(); f.controller.setCameraProfile("standard"); f.controller.setTilt(true); f.flush(); f.arrive();
    f.controller.navigate({ id: 1, bounds: [-60, -20, -50, -10] }); f.flush();
    expect(f.move.mock.calls.at(-1)?.[0].pitch).toBe(52);
    f.controller.navigate({ id: 2, center: [20, 0], pitch: 41, bearing: 23, source: "restore", animation: "jump" }); f.flush();
    expect(f.move.mock.calls.at(-1)?.[0]).toMatchObject({ pitch: 41, bearing: 23, duration: 0 });
  });
  it.each(["standard", "cinematic"] as const)("Lume and reduced motion retain priority over %s", (profile) => {
    const f = fixture(); f.controller.setCameraProfile(profile); f.controller.setTutorialActive(true);
    f.controller.navigate({ id: 1, bounds: [-60, -20, -50, -10] }); f.flush(); expect(f.move).not.toHaveBeenCalled();
    f.preference.matches = true;
    f.controller.navigate({ id: 2, bounds: [-60, -20, -50, -10], pitch: 0, source: "tutorial" }); f.flush();
    expect(f.map.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ pitch: 0, duration: 0 }), expect.anything());
  });
  it("coalesces selection and tilt into one operation and fits the actual pitched viewport", () => {
    const f = fixture();
    f.controller.navigate({ id: 1, bounds: [-60, -20, -50, -10] });
    f.controller.setTilt(true); f.flush();
    expect(f.move).toHaveBeenCalledTimes(1);
    expect(f.move.mock.calls[0][0].pitch).toBe(52);
    expect(f.map.cameraForBounds.mock.calls[0][1].padding.top).toBeGreaterThan(90);
    f.arrive(); expect(f.hooks.onFlightChange).toHaveBeenLastCalledWith(false);
  });
  it("enabling cinematic does not move the map; tutorial/restore never inherit it", () => {
    const f = fixture(); f.controller.setCameraProfile("cinematic"); f.flush(); expect(f.move).not.toHaveBeenCalled();
    f.controller.navigate({ id: 1, bounds: [-60, -20, -50, -10] }); f.flush(); expect(f.move.mock.calls[0][0].pitch).toBe(35);
    f.controller.setTutorialActive(true);
    f.controller.navigate({ id: 2, center: [20, 0] }); f.flush(); expect(f.move).toHaveBeenCalledTimes(1);
    f.controller.navigate({ id: 3, center: [20, 0], pitch: 0, animation: "jump", source: "tutorial" }); f.flush();
    expect(f.move.mock.calls[1][0].duration).toBe(0);
  });
  it("only the newest queued navigation runs", () => {
    const f = fixture(); f.controller.navigate({ id: 1, center: [1, 1] }); f.controller.navigate({ id: 2, center: [2, 2] }); f.flush();
    expect(f.move).toHaveBeenCalledTimes(1); expect(f.move.mock.calls[0][0].center).toEqual([2, 2]);
  });
  it.each(["pointerdown", "touchstart", "wheel", "keydown"])("%s cancels queued work and prevents resize from restarting it", (type) => {
    const f = fixture(); f.controller.navigate({ id: 1, bounds: [-60, -20, -50, -10] });
    f.canvas.dispatchEvent(new Event(type)); f.flush(); f.controller.refit(); f.flush();
    expect(f.move).not.toHaveBeenCalled();
  });
  it("a gesture invalidates pending arrival corrections, even if old moveend arrives later", () => {
    const f = fixture(); f.map.project.mockReturnValue({ x: -100, y: -100 });
    f.controller.navigate({ id: 1, bounds: [-60, -20, -50, -10], pitch: 52 }); f.flush();
    f.canvas.dispatchEvent(new Event("wheel")); f.arrive(); f.flush(); expect(f.move).toHaveBeenCalledTimes(1);
  });
  it("bounds validation uses one measured, smooth settling correction", () => {
    const f = fixture(); f.map.project.mockReturnValue({ x: -100, y: -100 });
    f.controller.navigate({ id: 1, bounds: [-60, -20, -50, -10], pitch: 52 }); f.flush();
    f.arrive(); f.arrive(); f.arrive(); expect(f.move).toHaveBeenCalledTimes(2);
    expect(f.move.mock.calls[1][0].duration).toBe(420);
    expect(f.hooks.onFlightChange).toHaveBeenLastCalledWith(false);
  });
  it("resize preserves framing until the person moves the map", () => {
    const f = fixture(); f.controller.navigate({ id: 1, bounds: [-60, -20, -50, -10] }); f.flush(); f.arrive();
    f.controller.refit(); f.flush(); expect(f.move).toHaveBeenCalledTimes(2);
    f.emit("movestart", { originalEvent: {} }); f.controller.refit(); f.flush(); expect(f.move).toHaveBeenCalledTimes(2);
  });
  it("never resets native gesture handlers or momentum, even on repeated input/movestart", () => {
    const f = fixture();
    for (let i = 0; i < 20; i++) {
      f.canvas.dispatchEvent(new Event("wheel")); f.canvas.dispatchEvent(new Event("pointerdown"));
      f.emit("movestart", { originalEvent: {} });
    }
    expect(f.map.stop).not.toHaveBeenCalled();
    expect(f.map.dragPan.disable).not.toHaveBeenCalled();
    expect(f.hooks.onFlightChange).not.toHaveBeenCalled();
  });
  it("a gesture invalidates an active flight without using public Map.stop", () => {
    const f = fixture(); f.controller.navigate({ id: 1, center: [20, 0] }); f.flush();
    f.map.stop.mockClear(); f.canvas.dispatchEvent(new Event("pointerdown"));
    f.emit("movestart", { originalEvent: {} }); f.arrive(); f.controller.refit(); f.flush();
    expect(f.map.stop).not.toHaveBeenCalled(); expect(f.move).toHaveBeenCalledTimes(1);
    expect(f.hooks.onFlightChange).toHaveBeenLastCalledWith(false);
  });
  it("tilt cannot unlock drawing, and release restores only the appropriate handlers", () => {
    const f = fixture(); f.controller.lockCamera(true); f.controller.setTilt(true); f.flush();
    expect(f.map.dragRotate.enable).not.toHaveBeenCalled(); expect(f.move).not.toHaveBeenCalled();
    f.controller.lockCamera(false); expect(f.map.dragRotate.enable).toHaveBeenCalledTimes(1);
    f.controller.setTilt(false); expect(f.map.dragRotate.disable).toHaveBeenCalled();
  });
  it("restores the complete pose without cinematic movement", () => {
    const f = fixture(); f.controller.setCameraProfile("cinematic");
    const pose = { center: [-56, -18] as [number, number], zoom: 6, bearing: -30, pitch: 40, projection: "mercator" as const,
      padding: { top: 90, bottom: 140, left: 300, right: 60 } };
    f.controller.restoreCamera(pose); f.flush(); expect(f.controller.getCameraPose()).toEqual(pose);
    expect(f.move.mock.calls[0][0].duration).toBe(0);
  });
  it("reduced motion jumps and a runtime preference change cancels active work", () => {
    const f = fixture(); f.preference.matches = true;
    f.controller.navigate({ id: 1, center: [1, 1] }); f.flush(); expect(f.move.mock.calls[0][0].duration).toBe(0);
    f.controller.navigate({ id: 2, center: [2, 2] }); f.preference.dispatchEvent(new Event("change")); f.flush();
    expect(f.move).toHaveBeenCalledTimes(1);
  });
  it("remove cancels queued frames and cleans native listeners", () => {
    const f = fixture(); f.controller.navigate({ id: 1, center: [1, 1] }); f.emit("remove"); f.flush();
    expect(f.move).not.toHaveBeenCalled();
    const calls = f.map.stop.mock.calls.length; f.canvas.dispatchEvent(new Event("wheel")); expect(f.map.stop).toHaveBeenCalledTimes(calls);
  });
});
