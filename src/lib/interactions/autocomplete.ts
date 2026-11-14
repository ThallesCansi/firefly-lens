import {
  coordinateSuggestion,
  validBounds,
  validPoint,
  type SearchSuggestion,
} from "./navigation";

export type AutocompleteState = {
  query: string;
  phase: "idle" | "waiting" | "loading" | "ready" | "empty" | "error";
  results: SearchSuggestion[];
  message: string;
};
export class SearchHttpError extends Error {
  constructor(
    public status: number,
    public retryAfterMs = 0,
  ) {
    super(
      status === 429
        ? "Search rate limited. Please wait before trying again."
        : "Search unavailable. Try again or enter latitude, longitude.",
    );
  }
}
export async function fetchSuggestions(
  query: string,
  signal: AbortSignal,
): Promise<SearchSuggestion[]> {
  const response = await fetch("/api/geocode?q=" + encodeURIComponent(query), {
    signal,
  });
  if (!response.ok) {
    const retry = response.headers.get("Retry-After") || "1";
    const delay = /^\d+(\.\d+)?$/.test(retry)
      ? Number(retry) * 1000
      : Math.max(0, Date.parse(retry) - Date.now());
    throw new SearchHttpError(
      response.status,
      Number.isFinite(delay) ? delay : 1000,
    );
  }
  const value: unknown = await response.json();
  if (!Array.isArray(value)) throw new Error("Malformed geocoder response");
  return value
    .filter(
      (r): r is SearchSuggestion =>
        typeof r?.label === "string" &&
        validPoint(r.center ?? []) &&
        Number.isFinite(r.zoom) &&
        (r.bounds === undefined || validBounds(r.bounds)),
    )
    .slice(0, 5);
}
export class AutocompleteController {
  private state: AutocompleteState = {
    query: "",
    phase: "idle",
    results: [],
    message: "",
  };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;
  private generation = 0;
  private lastStarted = -Infinity;
  private cache = new Map<
    string,
    { results: SearchSuggestion[]; expires: number }
  >();
  private debounceMs: number;
  private minIntervalMs: number;
  private minCharacters: number;
  constructor(
    private loader = fetchSuggestions,
    options: {
      debounceMs?: number;
      minIntervalMs?: number;
      minCharacters?: number;
    } = {},
  ) {
    this.debounceMs = options.debounceMs ?? 650;
    this.minIntervalMs = options.minIntervalMs ?? 1100;
    this.minCharacters = options.minCharacters ?? 3;
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(state: AutocompleteState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  private invalidate() {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.abort?.abort();
    this.abort = null;
  }
  setQuery(query: string, immediate = false) {
    this.invalidate();
    const token = this.generation;
    const text = query.normalize("NFKC").trim().replace(/\s+/g, " ");
    const base = { query, results: [] as SearchSuggestion[] };
    if (text.length > 160) {
      this.emit({
        ...base,
        phase: "error",
        message: "Keep searches within 160 characters.",
      });
      return;
    }
    const coordinate = coordinateSuggestion(text);
    if (coordinate) {
      this.emit(
        coordinate === "invalid"
          ? {
              ...base,
              phase: "error",
              message:
                "Use latitude -90 to 90, longitude -180 to 180, separated by a comma.",
            }
          : {
              ...base,
              results: [coordinate],
              phase: "ready",
              message:
                "Coordinates ready. Select to navigate; no analysis area is selected.",
            },
      );
      return;
    }
    if (text.length < this.minCharacters) {
      this.emit({
        ...base,
        phase: "idle",
        message: text
          ? "Type at least " + this.minCharacters + " characters."
          : "",
      });
      return;
    }
    const key = text.toLocaleLowerCase();
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      this.finish(query, cached.results);
      return;
    }
    this.emit({ ...base, phase: "waiting", message: "Waiting to search..." });
    this.schedule(token, query, text, immediate ? 0 : this.debounceMs, 0);
  }
  private schedule(
    token: number,
    query: string,
    text: string,
    delay: number,
    attempt: number,
  ) {
    this.timer = setTimeout(
      () => void this.run(token, query, text, attempt),
      Math.max(delay, this.lastStarted + this.minIntervalMs - Date.now(), 0),
    );
  }
  private async run(
    token: number,
    query: string,
    text: string,
    attempt: number,
  ) {
    if (token !== this.generation) return;
    const controller = new AbortController();
    this.abort = controller;
    this.lastStarted = Date.now();
    this.emit({
      query,
      phase: "loading",
      results: [],
      message: "Searching...",
    });
    try {
      const results = await this.loader(text, controller.signal);
      if (controller.signal.aborted || token !== this.generation) return;
      if (this.cache.size >= 50)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(text.toLocaleLowerCase(), {
        results,
        expires: Date.now() + 30 * 60 * 1000,
      });
      this.finish(query, results);
    } catch (error) {
      if (controller.signal.aborted || token !== this.generation) return;
      if (
        error instanceof SearchHttpError &&
        error.status === 429 &&
        attempt < 2 &&
        error.retryAfterMs <= 5000
      ) {
        this.emit({
          query,
          phase: "waiting",
          results: [],
          message: "Search rate limited. Waiting before retrying...",
        });
        this.schedule(
          token,
          query,
          text,
          Math.max(1000, error.retryAfterMs),
          attempt + 1,
        );
      } else
        this.emit({
          query,
          phase: "error",
          results: [],
          message:
            error instanceof SearchHttpError
              ? error.message
              : "Search unavailable. Try again or enter latitude, longitude.",
        });
    }
  }
  private finish(query: string, results: SearchSuggestion[]) {
    this.emit({
      query,
      results,
      phase: results.length ? "ready" : "empty",
      message: results.length
        ? "Choose a place to navigate. This does not select an analysis area."
        : "No places found. Try a country, state, city or latitude, longitude.",
    });
  }
  close(query = this.state.query) {
    this.invalidate();
    this.emit({ query, phase: "idle", results: [], message: "" });
  }
  dispose() {
    this.invalidate();
    this.listeners.clear();
  }
}
