import { validBounds, validPoint, type SearchSuggestion } from "./navigation";
export class GeocodeRateLimit extends Error {
  constructor(public retryAfterSeconds: number) {
    super("Please wait before searching again");
  }
}
type PhotonFeature = {
  geometry?: { coordinates?: number[] };
  properties?: {
    name?: string;
    city?: string;
    county?: string;
    district?: string;
    state?: string;
    country?: string;
    type?: string;
    osm_value?: string;
    extent?: number[];
  };
};
export function photonSuggestions(data: unknown): SearchSuggestion[] {
  const features = (data as { features?: PhotonFeature[] })?.features;
  if (!Array.isArray(features)) throw new Error("Malformed geocoder response");
  const results: SearchSuggestion[] = [];
  for (const feature of features) {
    const p = feature.properties,
      point = feature.geometry?.coordinates;
    if (!p || !point || !validPoint(point)) continue;
    const label = [
      ...new Set(
        [p.name, p.district, p.city, p.county, p.state, p.country].filter(
          (v): v is string => typeof v === "string" && !!v.trim(),
        ),
      ),
    ].join(", ");
    if (!label) continue;
    const extent = p.extent;
    const bounds =
      extent?.length === 4
        ? [extent[0], extent[3], extent[2], extent[1]]
        : undefined;
    const kind = p.type ?? p.osm_value ?? "place";
    const result: SearchSuggestion = {
      label,
      center: [point[0], point[1]],
      zoom:
        kind === "country"
          ? 4
          : ["state", "county", "region"].includes(kind)
            ? 6
            : 10,
      kind,
    };
    if (validBounds(bounds)) result.bounds = bounds;
    if (
      !results.some(
        (r) =>
          r.label === label && r.center.every((x, i) => x === result.center[i]),
      )
    )
      results.push(result);
  }
  return results.slice(0, 5);
}
/** One upstream request at a time per server process. Cache hits bypass its frequency gate. */
export class GeocodeBroker {
  private cache = new Map<
    string,
    { results: SearchSuggestion[]; expires: number }
  >();
  private pending = new Map<string, Promise<SearchSuggestion[]>>();
  private notBefore = 0;
  constructor(
    private upstream: (query: string) => Promise<SearchSuggestion[]>,
    private now = Date.now,
  ) {}
  search(query: string): Promise<SearchSuggestion[]> {
    const key = query
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase();
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now())
      return Promise.resolve(cached.results);
    const same = this.pending.get(key);
    if (same) return same;
    if (this.pending.size || this.now() < this.notBefore)
      return Promise.reject(
        new GeocodeRateLimit(
          Math.max(1, Math.ceil((this.notBefore - this.now()) / 1000)),
        ),
      );
    this.notBefore = this.now() + 1100;
    const task = Promise.resolve()
      .then(() => this.upstream(key))
      .then((results) => {
        if (this.cache.size >= 300)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, {
          results,
          expires: this.now() + 24 * 60 * 60 * 1000,
        });
        return results;
      })
      .catch((error) => {
        if (error instanceof GeocodeRateLimit)
          this.notBefore = Math.max(
            this.notBefore,
            this.now() + error.retryAfterSeconds * 1000,
          );
        throw error;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, task);
    return task;
  }
}
