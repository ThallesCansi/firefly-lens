import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutocompleteController, SearchHttpError } from "./autocomplete";
import {
  coordinateSuggestion,
  navigationForSearch,
  type SearchSuggestion,
} from "./navigation";
const suggestion = (label: string): SearchSuggestion => ({
  label,
  center: [-46, -23],
  zoom: 10,
});
const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
describe("autocomplete scheduling and stale responses", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("debounces keystrokes, returns suggestions and caches normalized queries", async () => {
    const loader = vi.fn(async () => [suggestion("Berlin, Germany")]);
    const c = new AutocompleteController(loader);
    c.setQuery("Ber");
    await vi.advanceTimersByTimeAsync(300);
    c.setQuery("Berlin");
    await vi.advanceTimersByTimeAsync(649);
    expect(loader).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(c.snapshot().phase).toBe("ready");
    expect(c.snapshot().results[0].label).toBe("Berlin, Germany");
    c.setQuery(" BERLIN ");
    expect(c.snapshot().results).toHaveLength(1);
    expect(loader).toHaveBeenCalledTimes(1);
    c.dispose();
  });
  it("shows no-results and enforces minimum input", async () => {
    const loader = vi.fn(async () => []);
    const c = new AutocompleteController(loader);
    c.setQuery("ab");
    await vi.advanceTimersByTimeAsync(2000);
    expect(loader).not.toHaveBeenCalled();
    c.setQuery("unknown");
    await vi.advanceTimersByTimeAsync(650);
    expect(c.snapshot().phase).toBe("empty");
    expect(c.snapshot().message).toContain("No places");
    c.dispose();
  });
  it("aborts obsolete requests and ignores even non-cooperative out-of-order replies", async () => {
    const first = deferred<SearchSuggestion[]>(),
      second = deferred<SearchSuggestion[]>();
    const signals: AbortSignal[] = [];
    const loader = vi.fn((_q: string, signal: AbortSignal) => {
      signals.push(signal);
      return signals.length === 1 ? first.promise : second.promise;
    });
    const c = new AutocompleteController(loader);
    c.setQuery("Paris");
    await vi.advanceTimersByTimeAsync(650);
    c.setQuery("Porto");
    expect(signals[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1100);
    second.resolve([suggestion("Porto")]);
    await vi.advanceTimersByTimeAsync(0);
    first.resolve([suggestion("Paris")]);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.snapshot().results[0].label).toBe("Porto");
    c.close();
    expect(c.snapshot().results).toEqual([]);
    c.dispose();
  });
  it("cancels pending debounce and requests on Escape/close", async () => {
    const task = deferred<SearchSuggestion[]>();
    let signal: AbortSignal | undefined;
    const loader = vi.fn((_q: string, s: AbortSignal) => {
      signal = s;
      return task.promise;
    });
    const c = new AutocompleteController(loader);
    c.setQuery("Rome");
    c.close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(loader).not.toHaveBeenCalled();
    c.setQuery("Rome", true);
    await vi.advanceTimersByTimeAsync(0);
    c.close();
    expect(signal?.aborted).toBe(true);
    task.resolve([suggestion("Rome")]);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.snapshot().phase).toBe("idle");
    c.dispose();
  });
  it("honors Retry-After without concurrent retry bursts and exposes HTTP failures", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new SearchHttpError(429, 2000))
      .mockResolvedValueOnce([suggestion("Lisbon")]);
    const c = new AutocompleteController(loader);
    c.setQuery("Lisbon");
    await vi.advanceTimersByTimeAsync(650);
    expect(c.snapshot().phase).toBe("waiting");
    await vi.advanceTimersByTimeAsync(1999);
    expect(loader).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(c.snapshot().phase).toBe("ready");
    c.dispose();
    const failed = new AutocompleteController(async () => {
      throw new SearchHttpError(502);
    });
    failed.setQuery("Paris");
    await vi.advanceTimersByTimeAsync(650);
    expect(failed.snapshot().phase).toBe("error");
    failed.dispose();
  });
  it("resolves valid coordinates locally and rejects invalid latitude/longitude without geocoding", () => {
    const loader = vi.fn();
    const c = new AutocompleteController(loader);
    for (const q of ["91, 0", "-91, 20", "20,181", "NaN,0", "1,"]) {
      c.setQuery(q);
      expect(c.snapshot().phase).toBe("error");
    }
    c.setQuery("-23.55, -46.63");
    expect(c.snapshot().results[0].center).toEqual([-46.63, -23.55]);
    expect(loader).not.toHaveBeenCalled();
    expect(coordinateSuggestion("S\u00e3o Paulo")).toBeNull();
    expect(coordinateSuggestion("Nantes, France")).toBeNull();
    c.dispose();
  });
});
describe("search navigation compatibility", () => {
  it("preserves legacy fields and uses bounds and reduced-motion hints without a map instance", () => {
    const source = {
      label: "Brazil",
      center: [-53, -10] as [number, number],
      bounds: [-74, -34, -28, 6] as [number, number, number, number],
      zoom: 4,
    };
    const request = navigationForSearch(source, {
      from: [2, 48],
      reducedMotion: true,
    });
    expect(request.center).toEqual(source.center);
    expect(request.bounds).toEqual(source.bounds);
    expect(request.motion.durationMs).toBe(0);
    expect(request.animation).toBe("jump");
    expect(request.maxZoom).toBe(12);
    expect(request.motion.interruptible).toBe(true);
    expect(typeof request.id).toBe("number");
    request.center[0] = 1;
    expect(source.center[0]).toBe(-53);
  });
  it("adapts duration to distance within practical limits, including near the dateline", () => {
    const near = navigationForSearch(
      { label: "near", center: [-46.631, -23.55], zoom: 10 },
      { from: [-46.63, -23.55] },
    );
    const far = navigationForSearch(
      { label: "far", center: [139, 35], zoom: 10 },
      { from: [-46, -23] },
    );
    expect(near.motion.durationMs).toBeLessThan(far.motion.durationMs);
    expect(far.animation).toBe("fly");
    expect(far.motion.durationMs).toBeLessThanOrEqual(2000);
    expect(
      navigationForSearch(
        { label: "date line", center: [-179, 0], zoom: 5 },
        { from: [179, 0] },
      ).motion.durationMs,
    ).toBeLessThan(1000);
  });
});
