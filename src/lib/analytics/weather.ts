import type { PolygonGeometry } from "../data/types";
import { geometryKey } from "./client";
import { assertFiniteTree } from "./contracts";
import { dataVersion, retryDelay } from "./dynamic";

export const DANGER_CLASSES = ["Low", "Moderate", "High", "Very high", "Extreme", "Very extreme"] as const;
export interface DangerForecast {
  issued_at: string;
  valid_at: string | null;
  lead_hours: number | null;
  valid_date?: string;
  lead_days?: number;
  validity_basis?: string;
  member: string;
  value: number | null;
  coverage_fraction: number;
  danger_class: string | null;
  maximum: number | null;
  percentile: number | null;
  anomaly: number | null;
  distribution: { class: string; area_fraction: number }[];
}
export interface DangerData {
  status: "available" | "unavailable";
  reason: string | null;
  index: "FWI";
  units: "dimensionless";
  forecasts: DangerForecast[];
  product_kind?: "delayed_seasonal" | "experimental_deterministic";
  source?: { url: string; doi?: string };
  resolution_degrees?: { latitude: number; longitude: number };
  provenance?: { meteorological_source: string; retrieved_at: string; system_version: string; sha256: string };
  aggregation?: string;
  limitations?: string[];
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object";
const fraction = (value: unknown): value is number => typeof value === "number" && value >= 0 && value <= 1;
const numberOrNull = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);

/** Fail closed before showing any numeric weather value. */
export function validateDanger(value: unknown): DangerData {
  assertFiniteTree(value);
  if (!object(value) || !["available", "unavailable"].includes(String(value.status)) ||
      value.index !== "FWI" || value.units !== "dimensionless" || !Array.isArray(value.forecasts))
    throw new Error("Invalid fire danger contract");
  if (value.status === "unavailable" && !value.forecasts.length) return value as unknown as DangerData;
  const provenance = value.provenance;
  const nasa = value.source_id === "nasa_gfwed_geos5" && value.product_kind === "experimental_deterministic";
  if ((!nasa && (value.source_id !== "copernicus_ewds_cems_fire_seasonal" || value.product_kind !== "delayed_seasonal")) ||
      !object(provenance) || provenance.synthetic !== false ||
      !["meteorological_source", "retrieved_at", "system_version", "sha256"].every((key) => typeof provenance[key] === "string") ||
      !object(value.resolution_degrees) || !(Number(value.resolution_degrees.latitude) > 0) || !(Number(value.resolution_degrees.longitude) > 0))
    throw new Error("Unverified numeric fire danger provenance");
  for (const row of value.forecasts) {
    if (!object(row) || typeof row.issued_at !== "string" || !Number.isFinite(Date.parse(row.issued_at))) throw new Error("Invalid weather issuance");
    const datesValid = nasa
      ? typeof row.valid_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.valid_date) && Number.isFinite(Date.parse(row.valid_date)) &&
        new Date(row.valid_date).toISOString().slice(0,10) === row.valid_date && row.valid_at === null && row.lead_hours === null &&
        typeof row.lead_days === "number" && row.lead_days >= 0 && Number.isInteger(row.lead_days) &&
        (Date.parse(row.valid_date)-Date.parse(row.issued_at.slice(0,10)))/86400000 === row.lead_days
      : typeof row.valid_at === "string" && Number.isFinite(Date.parse(row.valid_at)) &&
        typeof row.lead_hours === "number" && row.lead_hours >= 0 &&
        Math.abs((Date.parse(row.valid_at)-Date.parse(row.issued_at))/3600000-row.lead_hours) <= 1e-7;
    if (!datesValid ||
        typeof row.member !== "string" || !numberOrNull(row.value) || !numberOrNull(row.maximum) ||
        !fraction(row.coverage_fraction) || !Array.isArray(row.distribution) || row.distribution.length !== 6 ||
        row.distribution.some((d, i) => !object(d) || d.class !== DANGER_CLASSES[i] || !fraction(d.area_fraction)) ||
        Math.abs(row.distribution.reduce((sum, d) => sum + d.area_fraction, 0) - row.coverage_fraction) > 0.001 ||
        (row.value !== null && !DANGER_CLASSES.includes(row.danger_class as typeof DANGER_CLASSES[number])))
      throw new Error("Invalid numeric fire danger row");
  }
  return value as unknown as DangerData;
}

/** Prepared exact geometries are computed offline in Python; no browser raster statistics. */
async function weatherSnapshot(geometry: PolygonGeometry, signal: AbortSignal): Promise<DangerData | null> {
  const response = await fetch("/data/weather/snapshots.json", { signal });
  if (!response.ok) return null;
  const raw = await response.json();
  if (raw.schema_version !== "1.0.0" || !Array.isArray(raw.regions)) throw new Error("Invalid weather snapshots");
  const match = raw.regions.find((entry: { geometry: unknown }) => geometryKey(entry.geometry) === geometryKey(geometry));
  if (!match) return null;
  const data = validateDanger(match.data);
  const now = Date.now(), today = new Date(now).toISOString().slice(0,10);
  const forecasts = data.forecasts.filter((r) => r.valid_date ? r.valid_date >= today : r.valid_at !== null && Date.parse(r.valid_at) >= now);
  return { ...data, forecasts, status: forecasts.some((r) => r.value !== null) ? "available" : "unavailable",
    reason: forecasts.length ? data.reason : "cached_official_weather_forecast_expired" };
}

export async function loadFireDanger(geometry: PolygonGeometry, signal: AbortSignal): Promise<DangerData> {
  // Exact offline assessments are already authoritative Python results. Prefer
  // valid ones so optional raster initialization never delays historical work.
  try { const prepared = await weatherSnapshot(geometry,signal); if (prepared?.status === "available") return prepared; } catch { /* query the independent service */ }
  let response: Response;
  for (let attempt = 0; ; attempt++) {
    response = await fetch("/api/analytics/fire-weather", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ schema_version: "1.0.0", geometry, data_version: dataVersion, horizon: 3 }),
    });
    if (response.status !== 429 || attempt >= 3) break;
    await response.body?.cancel();
    await retryDelay(signal);
  }
  if (!response.ok) {
    try { const snapshot = await weatherSnapshot(geometry, signal); if (snapshot) return snapshot; } catch { /* fail closed */ }
    return { status: "unavailable", reason: response.status === 429 ? "service_busy_retry" : "weather_service_unavailable", index: "FWI", units: "dimensionless", forecasts: [] };
  }
  const result = await response.json();
  if (result.schema_version !== "1.0.0" || geometryKey(result.geometry) !== geometryKey(geometry))
    throw new Error("Fire danger geometry mismatch");
  return validateDanger(result.data);
}

const dangerCache = new Map<string, { at: number; result: Promise<DangerData> }>();
/** How long one area's assessment is reused: the source products change daily at most. */
const DANGER_TTL = 10 * 60 * 1000;
/**
 * One shared request per area: the report and the side panel's summary both
 * show the same assessment. A failed or unavailable answer is not kept, so a
 * retry asks again. Callers that stop waiting do not cancel it for the others.
 */
export function fireDangerFor(geometry: PolygonGeometry): Promise<DangerData> {
  const key = geometryKey(geometry);
  const hit = dangerCache.get(key);
  if (hit && Date.now() - hit.at < DANGER_TTL) return hit.result;
  const result = loadFireDanger(geometry, new AbortController().signal);
  dangerCache.set(key, { at: Date.now(), result });
  const forget = () => { if (dangerCache.get(key)?.result === result) dangerCache.delete(key); };
  result.then((data) => { if (data.status !== "available") forget(); }, forget);
  return result;
}
