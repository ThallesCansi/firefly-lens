import { meta } from "../data/meta";
import type { PolygonGeometry } from "../data/types";
import {
  assertFiniteTree,
  SECTIONS,
  validatePayload,
  validateViewData,
  type Bundle,
} from "./contracts";

export interface RegionEntry {
  id: string;
  name: string;
  geometry: PolygonGeometry;
  url: string;
  sha256: string;
  forecast_status: string;
  representative_point?: [number, number];
}
export interface Manifest {
  schema_version: "1.0.0";
  generated_at: string;
  data_meta: Record<string, unknown>;
  regions: RegionEntry[];
  coverage: string;
}
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Exact geometry identity, independent of ring starting vertex/winding/order.
 * No rounding, envelope matching, simplification, point clipping or statistics.
 */
export function geometryKey(value: unknown): string {
  if (
    !object(value) ||
    (value.type !== "Polygon" && value.type !== "MultiPolygon") ||
    !Array.isArray(value.coordinates)
  )
    throw new Error("Invalid analytics geometry");
  const polygons =
    value.type === "Polygon" ? [value.coordinates] : value.coordinates;
  const canonical = polygons.map((rings: unknown) => {
    if (!Array.isArray(rings) || !rings.length)
      throw new Error("Empty polygon");
    const keys = rings.map((ring: unknown) => {
      if (!Array.isArray(ring) || ring.length < 4)
        throw new Error("Invalid ring");
      const points = ring.map((p: unknown) => {
        if (
          !Array.isArray(p) ||
          p.length !== 2 ||
          !p.every((n) => typeof n === "number" && Number.isFinite(n)) ||
          Math.abs(p[0]) > 180 ||
          Math.abs(p[1]) > 90
        )
          throw new Error("Invalid coordinates");
        return JSON.stringify(p);
      });
      if (points[0] !== points.at(-1)) throw new Error("Ring must be closed");
      points.pop();
      const smallest = points.reduce((a, b) => (a < b ? a : b));
      const versions = [points, [...points].reverse()].flatMap((order) =>
        order.flatMap((point, i) =>
          point === smallest
            ? [[...order.slice(i), ...order.slice(0, i)].join(";")]
            : [],
        ),
      );
      return versions.sort()[0];
    });
    return JSON.stringify([keys[0], keys.slice(1).sort()]);
  });
  return JSON.stringify(canonical.sort());
}

export function validateManifest(value: unknown): Manifest {
  assertFiniteTree(value);
  if (
    !object(value) ||
    value.schema_version !== "1.0.0" ||
    !Array.isArray(value.regions) ||
    !object(value.data_meta) ||
    typeof value.generated_at !== "string"
  )
    throw new Error("Unsupported analytics manifest");
  for (const key of [
    "version",
    "firstDay",
    "lastDay",
    "seriesEnd",
    "partialMonth",
    "observedUntil",
    "climatologyBase",
    "cellDeg",
    "commonErrorC",
  ])
    if (!(key in value.data_meta))
      throw new Error("Incomplete analytics data version");
  for (const [key, expected] of Object.entries(value.data_meta))
    if (
      JSON.stringify(meta[key as keyof typeof meta]) !==
      JSON.stringify(expected)
    )
      throw new Error(
        "Analytics snapshot does not match the app data version. Re-export required.",
      );
  const ids = new Set();
  for (const entry of value.regions) {
    if (
      !object(entry) ||
      typeof entry.id !== "string" ||
      typeof entry.name !== "string" ||
      typeof entry.url !== "string" ||
      !/^\/analytics\/[a-z0-9-]+\.json$/.test(entry.url) ||
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      ids.has(entry.id)
    )
      throw new Error("Invalid analytics region entry");
    geometryKey(entry.geometry);
    ids.add(entry.id);
  }
  return value as unknown as Manifest;
}

export function validateBundle(value: unknown, entry: RegionEntry, expected = {
  start: meta.firstDay.slice(0, 7), end: meta.lastDay.slice(0, 7), forecastOrigin: meta.seriesEnd,
}): Bundle {
  assertFiniteTree(value);
  if (
    !object(value) ||
    value.schema_version !== "1.0.0" ||
    value.region_id !== entry.id ||
    !object(value.sections) ||
    geometryKey(value.geometry) !== geometryKey(entry.geometry)
  )
    throw new Error("Analytics region mismatch");
  for (const section of SECTIONS) {
    const payload = value.sections[section];
    validatePayload(payload);
    if (
      !object(payload) ||
      payload.region_id !== entry.id ||
      payload.section !== section ||
      !object(payload.source) ||
      payload.source.synthetic !== false ||
      payload.data_status === "synthetic" ||
      geometryKey(payload.geometry) !== geometryKey(entry.geometry)
    )
      throw new Error("Synthetic or mismatched analytics cannot be displayed");
    if (
      !object(payload.period) ||
      payload.period.start !== expected.start ||
      payload.period.end !== expected.end
    )
      throw new Error("Analytics coverage mismatch");
    if (
      payload.units !==
      (section === "fire_weather"
        ? "dimensionless"
        : "MODIS-Aqua-equivalent hotspots")
    )
      throw new Error("Analytics units mismatch");
    validateViewData(section, payload.data);
  }
  const bundle = value as unknown as Bundle;
  const forecast = bundle.sections.forecast.data;
  if ("forecast_origin" in forecast) {
    if (forecast.forecast_origin !== expected.forecastOrigin)
      throw new Error(
        "Retrospective forecasts cannot be shown as a current outlook",
      );
    if (
      (forecast.training_period.end &&
        forecast.training_period.end > forecast.forecast_origin) ||
      (forecast.last_complete_observation_used &&
        forecast.last_complete_observation_used > forecast.forecast_origin)
    )
      throw new Error("Forecast training cannot include future observations");
    if (
      forecast.forecast_status === "experimental" &&
      forecast.predictions.some((p) => p.value !== null) &&
      forecast.last_complete_observation_used !== forecast.forecast_origin
    )
      throw new Error(
        "Numeric forecast needs observations reaching its origin",
      );
    for (const point of forecast.predictions)
      if (point.date <= forecast.forecast_origin)
        throw new Error("Forecast date must follow its origin");
    if (
      forecast.forecast_status !== "experimental" &&
      forecast.predictions.some((p) => p.value !== null)
    )
      throw new Error(
        "Unvalidated numeric forecasts are not operational results",
      );
  }
  return bundle;
}

let manifestPromise: Promise<Manifest> | undefined;
const cache = new Map<string, Promise<Bundle>>();
async function manifest(): Promise<Manifest> {
  if (!manifestPromise) {
    manifestPromise = fetch("/analytics/manifest.json")
      .then((response) => {
        if (!response.ok)
          throw new Error(`Analytics manifest: HTTP ${response.status}`);
        return response.json();
      })
      .then(validateManifest);
    manifestPromise.catch(() => {
      manifestPromise = undefined;
    });
  }
  return manifestPromise;
}
export type AnalyticsResult =
  | { status: "available"; bundle: Bundle; region: RegionEntry }
  | { status: "unsupported"; regions: RegionEntry[] };
/** Discover the prepared catalog through the same version checks as analysis. */
export async function loadAnalyticsRegions(): Promise<RegionEntry[]> {
  return (await manifest()).regions;
}
export async function loadAnalytics(
  geometry: PolygonGeometry,
): Promise<AnalyticsResult> {
  const key = geometryKey(geometry);
  const index = await manifest();
  const entry = index.regions.find(
    (region) => geometryKey(region.geometry) === key,
  );
  if (!entry) return { status: "unsupported", regions: index.regions };
  let hit = cache.get(entry.sha256);
  if (!hit) {
    hit = fetch(entry.url).then(async (response) => {
      if (!response.ok)
        throw new Error(`Analytics region: HTTP ${response.status}`);
      const text = await response.text();
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
      );
      const hash = Array.from(new Uint8Array(digest), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== entry.sha256)
        throw new Error("Analytics integrity check failed");
      return validateBundle(JSON.parse(text), entry);
    });
    cache.set(entry.sha256, hit);
    hit.catch(() => cache.delete(entry.sha256));
  }
  return { status: "available", bundle: await hit, region: entry };
}
export function clearAnalyticsCache() {
  manifestPromise = undefined;
  cache.clear();
}
