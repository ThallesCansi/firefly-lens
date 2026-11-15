import {
  validPoint,
  type GeographicBounds,
  type GeographicPoint,
} from "./navigation";
import type { PolygonGeometry } from "../data/types";
import { countryCoverage } from "../data/coverage";
export type { PolygonGeometry };
export type BoundaryFeature = {
  type: "Feature";
  properties: {
    id: string;
    name: string;
    level: "country" | "state";
    countryCode: string;
    sourceId: string;
    source: string;
    sourceUrl: string;
    license: string;
  };
  geometry: PolygonGeometry;
};
export type AdministrativeCandidate = {
  feature: BoundaryFeature;
  bounds: GeographicBounds;
  center: [number, number];
  centerKind: "bounding-box-center";
  dataCoverage: "brazil" | "raw-pilot" | "national" | "none";
  /** A Brazilian state can be analysed; the whole country is too large for one area. */
  analysis: "available" | "too-large" | "outside-data-coverage";
};

function onSegment(x: number, y: number, a: number[], b: number[]) {
  const cross = (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0]);
  return (
    Math.abs(cross) <= 1e-9 &&
    x >= Math.min(a[0], b[0]) - 1e-9 &&
    x <= Math.max(a[0], b[0]) + 1e-9 &&
    y >= Math.min(a[1], b[1]) - 1e-9 &&
    y <= Math.max(a[1], b[1]) + 1e-9
  );
}
const near = (longitude: number, reference: number) =>
  longitude + 360 * Math.round((reference - longitude) / 360);
function ringLocation(
  point: GeographicPoint,
  ring: number[][],
): "inside" | "outside" | "boundary" {
  if (ring.length < 4) return "outside";
  const xs = ring.map((p) => p[0]);
  // Pole-spanning GeoJSON uses the full longitude extent, not shortest dateline edges.
  const polar =
    Math.max(...xs) - Math.min(...xs) > 359 &&
    ring.some((p) => Math.abs(p[1]) >= 89.999);
  const unwrapped: number[][] = [];
  for (const p of ring)
    unwrapped.push([
      polar ? p[0] : near(p[0], unwrapped.at(-1)?.[0] ?? ring[0][0]),
      p[1],
    ]);
  const x = polar ? point[0] : near(point[0], unwrapped[0][0]),
    y = point[1];
  let inside = false;
  for (let i = 0, j = unwrapped.length - 1; i < unwrapped.length; j = i++) {
    const a = unwrapped[j],
      b = unwrapped[i];
    if (onSegment(x, y, a, b)) return "boundary";
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside ? "inside" : "outside";
}
export function geometryContains(
  geometry: PolygonGeometry,
  point: GeographicPoint,
): boolean {
  if (!validPoint(point)) return false;
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((rings) => {
    const outer = ringLocation(point, rings[0] || []);
    if (outer === "outside") return false;
    for (const hole of rings.slice(1))
      if (ringLocation(point, hole) === "inside") return false;
    return true;
  });
}
export function geometryBounds(geometry: PolygonGeometry): GeographicBounds {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let west = Infinity,
    east = -Infinity,
    south = Infinity,
    north = -Infinity;
  for (const rings of polygons)
    for (const ring of rings)
      for (const point of ring) {
        if (!validPoint(point)) throw new Error("Invalid boundary coordinate");
        west = Math.min(west, point[0]);
        east = Math.max(east, point[0]);
        south = Math.min(south, point[1]);
        north = Math.max(north, point[1]);
      }
  if (!Number.isFinite(west) || west >= east || south >= north)
    throw new Error("Degenerate boundary geometry");
  return [west, south, east, north];
}
export function administrativeCandidate(
  feature: BoundaryFeature,
): AdministrativeCandidate {
  const bounds = geometryBounds(feature.geometry),
    brazil = feature.properties.countryCode === "BRA",
    raw = !brazil && ["real_raw_detections", "real_harmonized_data"].includes(countryCoverage(feature.properties.countryCode));
  return {
    feature,
    bounds,
    center: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
    centerKind: "bounding-box-center",
    dataCoverage: brazil ? "brazil" : raw ? (countryCoverage(feature.properties.countryCode) === "real_harmonized_data" ? "national" : "raw-pilot") : "none",
    analysis: raw ? "available" : !brazil
      ? "outside-data-coverage"
      : feature.properties.level === "state"
        ? "available"
        : "too-large",
  };
}
export function identifyRegions(
  point: GeographicPoint,
  features: BoundaryFeature[],
) {
  return features
    .filter((f) => geometryContains(f.geometry, point))
    .map(administrativeCandidate)
    .sort((a, b) =>
      a.feature.properties.name.localeCompare(b.feature.properties.name),
    );
}

export class BoundaryRepository {
  private loaded = new Map<string, BoundaryFeature[]>();
  constructor(private fetcher: typeof fetch = (...args) => fetch(...args)) {}
  async load(
    level: "country" | "state",
    signal?: AbortSignal,
  ): Promise<BoundaryFeature[]> {
    const cached = this.loaded.get(level);
    if (cached) return cached;
    const response = await this.fetcher(
      "/interaction-boundaries/" +
        (level === "country" ? "countries" : "states") +
        ".geojson",
      { signal },
    );
    if (!response.ok)
      throw new Error("Administrative boundaries could not be loaded.");
    const data = (await response.json()) as {
      type?: string;
      features?: BoundaryFeature[];
    };
    if (
      data.type !== "FeatureCollection" ||
      !Array.isArray(data.features) ||
      !data.features.length
    )
      throw new Error("Invalid boundary collection");
    for (const feature of data.features) {
      if (
        feature.type !== "Feature" ||
        !["Polygon", "MultiPolygon"].includes(feature.geometry?.type) ||
        !feature.properties?.id ||
        !feature.properties?.name ||
        feature.properties.level !== level
      )
        throw new Error("Invalid administrative boundary");
      geometryBounds(feature.geometry);
    }
    this.loaded.set(level, data.features);
    return data.features;
  }
}
export type AdministrativeState = {
  phase: "idle" | "loading" | "ready" | "empty" | "error";
  candidates: AdministrativeCandidate[];
  selected: AdministrativeCandidate | null;
  message: string;
};
export class AdministrativeSelectionController {
  private state: AdministrativeState = {
    phase: "idle",
    candidates: [],
    selected: null,
    message:
      "Activate country/state selection, then click a geographic location.",
  };
  private listeners = new Set<() => void>();
  private abort: AbortController | null = null;
  private generation = 0;
  constructor(
    private repository = new BoundaryRepository(),
    private onPreview: (
      selection: AdministrativeCandidate | null,
    ) => void = () => {},
    private onConfirm: (selection: AdministrativeCandidate) => void = () => {},
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(state: AdministrativeState) {
    this.state = state;
    this.listeners.forEach((fn) => fn());
  }
  async selectAt(point: GeographicPoint, level: "country" | "state") {
    this.abort?.abort();
    const token = ++this.generation;
    const controller = new AbortController();
    this.abort = controller;
    this.onPreview(null);
    if (!validPoint(point)) {
      this.emit({
        phase: "error",
        candidates: [],
        selected: null,
        message: "Invalid map coordinate.",
      });
      return;
    }
    this.emit({
      phase: "loading",
      candidates: [],
      selected: null,
      message: "Identifying administrative boundary...",
    });
    try {
      const features = await this.repository.load(level, controller.signal);
      if (controller.signal.aborted || token !== this.generation) return;
      const candidates = identifyRegions(point, features),
        selected = candidates[0] ?? null;
      this.emit({
        phase: selected ? "ready" : "empty",
        candidates,
        selected,
        message: selected
          ? selected.analysis === "available"
            ? "Use this state as the area of interest, or click elsewhere to change it."
            : "Confirm this boundary for display. Choose a Brazilian state to analyse it."
          : level === "state"
            ? "No Brazilian state at this location."
            : "No country in the simplified boundary dataset at this location.",
      });
      this.onPreview(selected);
    } catch (error) {
      if (!controller.signal.aborted && token === this.generation)
        this.emit({
          phase: "error",
          candidates: [],
          selected: null,
          message:
            error instanceof Error ? error.message : "Boundary lookup failed.",
        });
    }
  }
  choose(id: string) {
    const selected = this.state.candidates.find(
      (c) => c.feature.properties.id === id,
    );
    if (selected) {
      this.emit({ ...this.state, selected });
      this.onPreview(selected);
    }
  }
  confirm() {
    if (this.state.selected) {
      this.onConfirm(this.state.selected);
      this.emit({
        ...this.state,
        message:
          this.state.selected.analysis === "available"
            ? "State set as the area of interest."
            : "Boundary confirmed for display. No historical analysis was requested.",
      });
    }
  }
  cancel() {
    this.abort?.abort();
    this.generation++;
    this.onPreview(null);
    this.emit({
      phase: "idle",
      candidates: [],
      selected: null,
      message: "Administrative selection cancelled.",
    });
  }
}
