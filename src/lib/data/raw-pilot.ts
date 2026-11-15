import type { AnalysisArea, PolygonGeometry } from "./types";
import type { CellCount } from "./area";
import { geometryKey, validateBundle } from "../analytics/client";
import type { Bundle } from "../analytics/contracts";
import { assertFiniteTree } from "../analytics/contracts";
import { rawPilotFor } from "./coverage";

export interface RawPilot {
  schema_version: "1.0.0";
  country_code: string;
  name: string;
  data_kind: "real_raw_detections";
  synthetic: false;
  harmonization_status: "not_validated";
  signals_eligible: false;
  geometry: PolygonGeometry;
  period: { start: string; end: string };
  monthly: { date: string; modis: number; viirs: number; viirs_1km: number }[];
  annual: { year: number; modis: number; viirs: number; raw_viirs_to_modis: number | null }[];
  tiles: Record<string, { tx: number; ty: number; url: string; sha256: string; decoded_sha256: string }[]>;
  source: string;
  limitations: string[];
  generated_at: string;
}
const sha256 = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
const manifests = new Map<string, Promise<RawPilot>>();
const tiles = new Map<string, Promise<CellCount[]>>();
const national = new Map<string, Promise<Bundle>>();

export function loadNationalAnalytics(area: AnalysisArea): Promise<Bundle> {
  const entry = rawPilotFor(area);
  if (!entry?.national_url || !entry.national_sha256 || !entry.national_period ||
      entry.harmonization_status !== "evaluated_country_aggregate" || entry.scope !== "entire_country_only")
    return Promise.reject(new Error("No evaluated harmonization for this country"));
  const key = `${entry.national_url}:${geometryKey(area.geometry)}`;
  let hit = national.get(key);
  if (!hit) {
    hit = (async () => {
      const response = await fetch(entry.national_url!);
      if (!response.ok) throw new Error("National analytics unavailable");
      const bytes = await response.arrayBuffer();
      if (await sha256(bytes) !== entry.national_sha256) throw new Error("National analytics checksum mismatch");
      const bundle = validateBundle(JSON.parse(new TextDecoder().decode(bytes)), {
        id: `country-${entry.country_code}`, name: entry.name, geometry: area.geometry, url: entry.national_url!, sha256: entry.national_sha256!, forecast_status: "",
      }, { ...entry.national_period!, forecastOrigin: entry.national_period!.end });
      if (bundle.sections.history.source.provenance.kind !== "real_country_harmonized" ||
          bundle.sections.history.source.provenance.scope !== "entire_country_only") throw new Error("Invalid national calibration scope");
      return bundle;
    })();
    national.set(key, hit);
    hit.catch(() => national.delete(key));
  }
  return hit;
}

export function validateRawPilot(value: RawPilot, area: AnalysisArea): RawPilot {
  assertFiniteTree(value);
  const entry = rawPilotFor(area);
  if (!entry || value.schema_version !== "1.0.0" || value.country_code !== entry.country_code ||
      value.data_kind !== "real_raw_detections" || value.synthetic !== false ||
      value.signals_eligible !== false || value.harmonization_status !== "not_validated" ||
      geometryKey(value.geometry) !== geometryKey(area.geometry) ||
      !Array.isArray(value.monthly) || !Array.isArray(value.annual) || !value.tiles ||
      !Array.isArray(value.limitations) || typeof value.source !== "string" ||
      value.monthly.some((r) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.date) || ![r.modis,r.viirs,r.viirs_1km].every((n) => Number.isInteger(n) && n >= 0)))
    throw new Error("Invalid real raw pilot contract");
  return value;
}
export function loadRawPilot(area: AnalysisArea): Promise<RawPilot> {
  const entry = rawPilotFor(area);
  if (!entry?.manifest_url || !entry.sha256) return Promise.reject(new Error("No published raw pilot for this exact selection"));
  const key = `${entry.manifest_url}:${geometryKey(area.geometry)}`;
  let hit = manifests.get(key);
  if (!hit) {
    hit = (async () => {
      const response = await fetch(entry.manifest_url!);
      if (!response.ok) throw new Error("Raw pilot unavailable");
      const bytes = await response.arrayBuffer();
      if (await sha256(bytes) !== entry.sha256) throw new Error("Raw pilot integrity check failed");
      return validateRawPilot(JSON.parse(new TextDecoder().decode(bytes)), area);
    })();
    manifests.set(key, hit);
    hit.catch(() => manifests.delete(key));
  }
  return hit;
}

/** Fetch one month only; full detection archives and Parquet remain offline. */
export async function rawPilotCells(area: AnalysisArea, period: string): Promise<CellCount[]> {
  const data = await loadRawPilot(area);
  if (period.length !== 7) throw new Error("The raw pilot provides monthly maps only");
  if (period < data.period.start || period > data.period.end) throw new Error(`Raw pilot coverage is ${data.period.start}–${data.period.end}`);
  const [w,s,e,n] = area.bbox;
  const entries = (data.tiles[period] ?? []).filter((t) => -180+(t.tx+1)*4 > w && -180+t.tx*4 < e && -90+(t.ty+1)*4 > s && -90+t.ty*4 < n);
  return (await Promise.all(entries.map((tile) => {
    let hit = tiles.get(tile.url);
    if (!hit) {
      hit = (async () => {
        if (!/^\/data\/continental\/[a-z]+\/map\/\d{4}-\d{2}\/\d+_\d+\.json\.gz$/.test(tile.url)) throw new Error("Invalid raw tile URL");
        const response = await fetch(tile.url);
        if (!response.ok) throw new Error("Raw tile unavailable");
        const bytes = await response.arrayBuffer();
        const compressed = new Uint8Array(bytes)[0] === 0x1f && new Uint8Array(bytes)[1] === 0x8b;
        if (await sha256(bytes) !== (compressed ? tile.sha256 : tile.decoded_sha256)) throw new Error("Raw tile integrity check failed");
        const decoded = compressed ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer() : bytes;
        const rows: unknown = JSON.parse(new TextDecoder().decode(decoded));
        assertFiniteTree(rows);
        if (!Array.isArray(rows)) throw new Error("Invalid raw tile");
        return rows.map((r) => {
          if (!Array.isArray(r) || r.length !== 5 || !r.every((v) => typeof v === "number") ||
              !Number.isInteger(r[0]) || Math.abs(r[1]) > 180 || Math.abs(r[2]) > 90 ||
              ![r[3],r[4]].every((v) => Number.isInteger(v) && v >= 0)) throw new Error("Invalid raw tile row");
          return { id: r[0], lon: r[1], lat: r[2], modis: r[3], viirs: r[4], biome: "Uncalibrated country pilot", weight: 1 };
        });
      })();
      tiles.set(tile.url, hit);
      hit.catch(() => tiles.delete(tile.url));
      if (tiles.size > 32) tiles.delete(tiles.keys().next().value!);
    }
    return hit;
  }))).flat();
}
