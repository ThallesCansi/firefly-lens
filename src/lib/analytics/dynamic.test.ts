import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rectangleArea } from "../data/types";
import { loadDynamicAnalytics } from "./dynamic";
import { observeAnalytics, type AnalyticsState } from "./useAnalytics";

const bundle = JSON.parse(readFileSync("public/analytics/pantanal.json", "utf8"));
const area = { ...rectangleArea([-1, -1, 1, 1]), geometry: bundle.geometry };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
afterEach(() => vi.unstubAllGlobals());

describe("dynamic regional analytics", () => {
  it("posts only geometry and data version and validates Python contracts", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(bundle));
    vi.stubGlobal("fetch", fetcher);
    expect((await loadDynamicAnalytics(area.geometry, "history", new AbortController().signal)).region_id).toBe(bundle.region_id);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/analytics/history");
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(["data_version", "geometry", "horizon", "schema_version"]);
    expect(body.data_version.seriesEnd).toBe("2026-10");
    expect(body.geometry).toEqual(area.geometry);
  });
  it("rejects another region and synthetic data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(bundle)));
    await expect(loadDynamicAnalytics(rectangleArea([-55, -20, -54, -19]).geometry, "history", new AbortController().signal)).rejects.toThrow(/region mismatch/);
    const synthetic = structuredClone(bundle);
    synthetic.sections.history.source.synthetic = true;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(synthetic)));
    await expect(loadDynamicAnalytics(area.geometry, "history", new AbortController().signal)).rejects.toThrow(/Synthetic/);
  });
  it("publishes History before Forecast, preserving it on model failure", async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(bundle))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const states: AnalyticsState[] = [];
    const cancel = observeAnalytics(area, (state) => states.push(state));
    await tick();
    expect(states[0].bundle).toEqual(bundle);
    expect(states[0].forecastLoading).toBe(true);
    finish(Response.json({ detail: "analytics_processing_error" }, { status: 500 }));
    await tick();
    expect(states.at(-1)?.bundle).toEqual(bundle);
    expect(states.at(-1)?.forecastError).toBe("analytics_processing_error");
    cancel();
  });
  it("ignores late History after rapidly changing regions and aborts the request", async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
      .mockImplementation(() => Promise.resolve(Response.json(bundle)));
    vi.stubGlobal("fetch", fetcher);
    const oldStates: AnalyticsState[] = [], newStates: AnalyticsState[] = [];
    const cancelOld = observeAnalytics(area, (state) => oldStates.push(state));
    cancelOld();
    const cancelNew = observeAnalytics({ ...area, id: "new-selection" }, (state) => newStates.push(state));
    finish(Response.json(bundle));
    await tick(); await tick();
    expect(oldStates).toEqual([]);
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    expect(newStates.at(-1)?.bundle).toEqual(bundle);
    cancelNew();
  });
  it("ignores a late Forecast result after cancellation", async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(bundle))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const states: AnalyticsState[] = [];
    const cancel = observeAnalytics(area, (state) => states.push(state));
    await tick(); cancel(); finish(Response.json(bundle)); await tick();
    expect(states).toHaveLength(1);
  });
});
