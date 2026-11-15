import { describe, expect, it, vi } from "vitest";
import { afterPaint, TourSession, type TourWorkspace, type WorkspaceSnapshot } from "./session";
import { stepIndex } from "./steps";
import { readTourOutcome, saveTourOutcome, TOUR_KEY } from "./persistence";

const saved: WorkspaceSnapshot = {
  area: null, analyzed: null, analysis: false, expanded: false, drawing: false,
  coordinates: true, searching: false, period: "2020-08-16", from: "2019-01", to: "2021-12",
  sensors: ["MODIS"], monthOpen: true, cardOpen: true, analyticsTab: "forecast",
  bounds: [-60, -20, -50, -10], projection: "mercator",
};
function fixture(prepare: TourWorkspace["prepare"] = async () => {}) {
  const workspace = { capture: vi.fn(() => structuredClone(saved)), prepare: vi.fn(prepare), restore: vi.fn(), keep: vi.fn() };
  return { workspace, session: new TourSession(workspace) };
}
describe("Lume session coordination", () => {
  it("captures once and replays without replacing the original workspace", async () => {
    const { workspace, session } = fixture();
    await session.start(); await session.go(stepIndex("forecast")); await session.start();
    expect(workspace.capture).toHaveBeenCalledTimes(1);
    expect(session.snapshot().index).toBe(0);
    session.finish(false);
    expect(workspace.restore).toHaveBeenCalledExactlyOnceWith(saved);
  });
  it("aborts stale preparations and lets only the latest step become ready", async () => {
    let resolveOld!: () => void;
    const { session, workspace } = fixture((id) => id === "welcome" ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve());
    const old = session.start();
    const firstSignal = workspace.prepare.mock.calls[0][1];
    await session.go(2); resolveOld(); await old;
    expect(firstSignal.aborted).toBe(true);
    expect(session.snapshot()).toMatchObject({ phase: "ready", index: 2 });
  });
  it("does not revive an exited tour when a pending preparation finishes", async () => {
    let resolve!: () => void;
    const { session, workspace } = fixture(() => new Promise((r) => { resolve = r; }));
    const pending = session.start(); session.finish(false); resolve(); await pending;
    expect(session.snapshot().phase).toBe("idle");
    expect(workspace.restore).toHaveBeenCalledTimes(1);
  });
  it("supports failure, retry and a partial completion without dependent data views", async () => {
    const { session } = fixture();
    await session.start(); await session.go(stepIndex("history"));
    session.fail("Offline"); expect(session.snapshot().phase).toBe("error");
    await session.retry(); expect(session.snapshot().phase).toBe("ready");
    session.fail("Offline"); await session.skipSection();
    expect(session.snapshot().index).toBe(stepIndex("complete"));
    expect(session.snapshot().skipped).toEqual(["history"]);
  });
  it("prepares conditional views on Back instead of reusing stale DOM", async () => {
    const { session, workspace } = fixture();
    await session.start(); await session.go(stepIndex("month")); await session.go(stepIndex("history"));
    expect(workspace.prepare.mock.calls.at(-1)?.[0]).toBe("history");
    expect(workspace.prepare.mock.calls.at(-2)?.[1].aborted).toBe(true);
  });
  it("keeps the example only by explicit choice and cleans up idempotently", async () => {
    const { session, workspace } = fixture();
    await session.start(); session.finish(true); session.dispose();
    expect(workspace.keep).toHaveBeenCalledTimes(1);
    expect(workspace.restore).not.toHaveBeenCalled();
  });
  it("ignores invalid navigation and exposes actionable preparation errors", async () => {
    const { session } = fixture(async () => { throw new Error("No Pantanal preset"); });
    await session.start(); await session.go(-1); await session.go(999);
    expect(session.snapshot()).toMatchObject({ phase: "error", index: 0, error: "No Pantanal preset" });
  });
  it("uses fresh React actions for retry/restoration while retaining the original snapshot", async () => {
    const { session } = fixture();
    await session.start();
    const next = { capture: vi.fn(), prepare: vi.fn(async () => {}), retry: vi.fn(), restore: vi.fn(), keep: vi.fn() };
    session.setWorkspace(next);
    await session.go(stepIndex("science")); await session.retry(); session.finish(false);
    expect(next.retry).toHaveBeenCalledWith("science");
    expect(next.restore).toHaveBeenCalledWith(saved);
    expect(next.capture).not.toHaveBeenCalled();
  });
  it("cancels pending layout work immediately on exit", async () => {
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 42));
    vi.stubGlobal("cancelAnimationFrame", cancel);
    try {
      const controller = new AbortController();
      const paint = afterPaint(controller.signal);
      controller.abort();
      await expect(paint).rejects.toMatchObject({ name: "AbortError" });
      expect(cancel).toHaveBeenCalledWith(42);
      await expect(afterPaint(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    } finally { vi.unstubAllGlobals(); }
  });
  it("replay clears skipped sections without discarding the saved workspace", async () => {
    const { session, workspace } = fixture();
    await session.start(); await session.go(stepIndex("history")); await session.skipSection();
    expect(session.snapshot().skipped).toEqual(["history"]);
    await session.start();
    expect(session.snapshot().skipped).toEqual([]);
    expect(workspace.capture).toHaveBeenCalledTimes(1);
  });
});
describe("independent tour persistence", () => {
  it("distinguishes completed, dismissed and partial tours with a versioned key", () => {
    for (const value of ["completed", "dismissed", "partial"] as const) {
      const setItem = vi.fn(); saveTourOutcome(value, { setItem });
      expect(setItem).toHaveBeenCalledWith(TOUR_KEY, value);
      expect(readTourOutcome({ getItem: () => value })).toBe(value);
    }
    expect(readTourOutcome({ getItem: () => "1" })).toBeNull();
    expect(TOUR_KEY).not.toBe("firefly-lens-intro-done");
  });
  it("tolerates blocked storage", () => {
    expect(readTourOutcome({ getItem: () => { throw new Error("blocked"); } })).toBeNull();
    expect(() => saveTourOutcome("dismissed", { setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });
});
