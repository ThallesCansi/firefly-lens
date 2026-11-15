import type { AnalysisArea, PolygonGeometry } from "./types";
import type { CellCount } from "./area";
import { geometryKey, validateBundle } from "../analytics/client";
import type { Bundle } from "../analytics/contracts";
import { assertFiniteTree } from "../analytics/contracts";
import { rawPilotFor } from "./coverage";
import { buildRecord, type FireRecord } from "../harmonize";
import type { AreaData } from "./area";
import { daysBetween } from "../dates";
import { isFailure } from "../analytics/contracts";

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
  daily?: Record<string, { url:string; sha256:string; decoded_sha256:string }>;
  day_tiles?: Record<string, {url:string;sha256:string;decoded_sha256:string}[]>;
}
const sha256 = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
const manifests = new Map<string, Promise<RawPilot>>();
const tiles = new Map<string, Promise<number[][]>>();
const national = new Map<string, Promise<Bundle>>();

/** Verify compressed bytes or a hosting provider's transparently decoded body. */
async function decodedJson(entry: { url:string; sha256:string; decoded_sha256:string }): Promise<unknown> {
  const response = await fetch(entry.url);
  if (!response.ok) throw new Error("Country data unavailable");
  const bytes = await response.arrayBuffer();
  const compressed = new Uint8Array(bytes)[0] === 0x1f && new Uint8Array(bytes)[1] === 0x8b;
  if (await sha256(bytes) !== (compressed ? entry.sha256 : entry.decoded_sha256)) throw new Error("Country data checksum mismatch");
  const decoded = compressed ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer() : bytes;
  const value: unknown = JSON.parse(new TextDecoder().decode(decoded));
  assertFiniteTree(value);
  return value;
}

/** Same calendar presentation as Brazil, using only this country's own sources. */
export async function loadCountryRecord(area: AnalysisArea): Promise<FireRecord> {
  const [raw,bundle] = await Promise.all([loadRawPilot(area),loadNationalAnalytics(area)]);
  const calendar = (bundle as Bundle & { calendar?: { first_day:string; last_day:string; observed_until:number; reference:[number,number]; viirs_monthly:Record<string,number> } }).calendar;
  if (!calendar || !raw.daily || calendar.first_day.slice(0,7)!==raw.period.start || calendar.last_day.slice(0,7)!==raw.period.end || calendar.observed_until!==2023)
    throw new Error("Country daily calendar unavailable");
  const days = daysBetween(calendar.first_day,calendar.last_day)+1;
  if (!(days>0 && days<15000)) throw new Error("Invalid country calendar span");
  const firstYear=Number(calendar.first_day.slice(0,4));
  const firstMonth=Number(calendar.first_day.slice(5,7))-1;
  const count = (Number(calendar.last_day.slice(0,4))-firstYear)*12+Number(calendar.last_day.slice(5,7))-firstMonth;
  const data: AreaData = { area,bbox:area.bbox,cells:0,biomes:[],firstDay:calendar.first_day,days,
    aquaD:new Float64Array(days),aquaN:new Float64Array(days),viirsD:new Float64Array(days),viirsN:new Float64Array(days),
    viirsKm:new Float64Array(days),aquaCells:new Uint16Array(days),viirsCells:new Uint16Array(days),firstMonth,months:count,
    mu:new Float64Array(count).fill(NaN),variance:new Float64Array(count).fill(NaN) };
  const seen = new Set<string>();
  const years = Object.entries(raw.daily);
  if (years.length!==Number(calendar.last_day.slice(0,4))-firstYear+1) throw new Error("Missing country calendar years");
  // Four small year summaries at a time; never fetch other countries or native archives.
  for (let i=0; i<years.length; i+=4) {
    await Promise.all(years.slice(i,i+4).map(async ([year,entry]) => {
      if (!new RegExp(`^/data/continental/[a-z]+/daily/${year}\\.json\\.gz$`).test(entry.url)) throw new Error("Invalid country daily URL");
      const rows = await decodedJson(entry);
      if (!Array.isArray(rows)) throw new Error("Invalid country daily rows");
      for (const row of rows) {
        if (!Array.isArray(row) || row.length!==8 || typeof row[0]!=="string" || !row[0].startsWith(year+"-") || seen.has(row[0]) ||
            !row.slice(1).every((value) => Number.isSafeInteger(value) && value>=0)) throw new Error("Invalid country daily row");
        const offset=daysBetween(calendar.first_day,row[0]);
        if (!Number.isInteger(offset) || offset<0 || offset>=days) throw new Error("Country day outside coverage");
        seen.add(row[0]);
        [data.aquaD,data.aquaN,data.viirsD,data.viirsN,data.viirsKm,data.aquaCells,data.viirsCells].forEach((values,j) => { values[offset]=row[j+1]; });
      }
    }));
  }
  for (const [date,value] of Object.entries(calendar.viirs_monthly)) {
    const at=(Number(date.slice(0,4))-firstYear)*12+Number(date.slice(5,7))-1-firstMonth;
    if (!Number.isFinite(value) || value<0 || at<0 || at>=count || date<'2018-04') throw new Error("Invalid converted country month");
    data.mu[at]=value;
  }
  const record=buildRecord(data,{ epochYear:firstYear,observedUntil:calendar.observed_until,climatologyBase:calendar.reference,
    commonErrorC:0,viirsStart:"2018-04-01",partialMonth:"" });
  const history=bundle.sections.history.data, climate=bundle.sections.climatology.data;
  if (isFailure(history) || isFailure(climate)) throw new Error("Country monthly authority unavailable");
  for (const cell of record.months) {
    const date=`${cell.year}-${String(cell.month+1).padStart(2,"0")}`;
    const authority=history.monthly.find((row) => row.date===date);
    if (!authority || authority.value===null || Math.abs(authority.value-cell.value)>1e-6*Math.max(1,cell.value)) throw new Error("Daily/monthly country reconciliation failed");
    cell.partial=!authority.complete; cell.lo=authority.lower; cell.hi=authority.upper;
    const reference=climate.months.find((row) => row.month===cell.month+1)?.median;
    cell.median=reference ?? 0; cell.ratio=reference ? cell.value/reference : null;
  }
  record.scope="entire_country_only";
  return record;
}

/** Source counts only; country factors are never distributed over map cells. */
export async function rawCountryCellDaysCsv(area:AnalysisArea,from:string,to:string): Promise<string> {
  const data=await loadRawPilot(area);
  if (!data.day_tiles || from.slice(0,7)<data.period.start || to.slice(0,7)>data.period.end || from>to) throw new Error("Country export outside coverage");
  const months=Object.keys(data.day_tiles).filter((month)=>month>=from.slice(0,7) && month<=to.slice(0,7)).sort();
  if (months.length>36) throw new Error("Country cell exports are limited to 36 months");
  const lines=["date,cell_id,longitude,latitude,modis_aqua_raw,viirs_noaa20_raw"];
  for (const month of months) {
    const blocks=await Promise.all(data.day_tiles[month].map((entry)=>decodedJson(entry)));
    for (const rows of blocks) {
      if (!Array.isArray(rows)) throw new Error("Invalid daily cell export");
      for (const row of rows) {
        if (!Array.isArray(row) || row.length!==6 || !row.every(Number.isFinite) || !Number.isInteger(row[3]) || row[3]<1 || row[3]>31 || row[4]<0 || row[5]<0) throw new Error("Invalid daily cell export row");
        const date=`${month}-${String(row[3]).padStart(2,"0")}`;
        if (date>=from && date<=to) lines.push([date,row[0],row[1],row[2],row[4],date<'2018-04-01'?"":row[5]].join(","));
      }
    }
  }
  return lines.join("\n")+"\n";
}

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

/** Fetch selected-month partitions; a daily view reuses that month's daily blocks. */
export async function rawPilotCells(area: AnalysisArea, period: string): Promise<CellCount[]> {
  const data = await loadRawPilot(area);
  const daily=period.length===10;
  const month=period.slice(0,7);
  if (!/^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/.test(period) || !Number.isFinite(Date.parse(daily?period:period+"-01")) || (daily && new Date(period).toISOString().slice(0,10)!==period)) throw new Error("Invalid country period");
  if (month < data.period.start || month > data.period.end || (daily && period<'2002-07-04')) throw new Error(`Country coverage is ${data.period.start}–${data.period.end}`);
  if (daily && !data.day_tiles) throw new Error("Daily country maps unavailable");
  const [w,s,e,n] = area.bbox;
  const entries = daily ? data.day_tiles![month] ?? [] : (data.tiles[month] ?? []).filter((t) => -180+(t.tx+1)*4 > w && -180+t.tx*4 < e && -90+(t.ty+1)*4 > s && -90+t.ty*4 < n);
  const blocks=await Promise.all(entries.map((tile) => {
    let hit = tiles.get(tile.url);
    if (!hit) {
      hit = (async () => {
        if (!/^\/data\/continental\/[a-z]+\/(map\/\d{4}-\d{2}\/\d+_\d+|map-days\/\d{4}-\d{2})\.json\.gz$/.test(tile.url)) throw new Error("Invalid raw tile URL");
        const rows=await decodedJson(tile);
        if (!Array.isArray(rows)) throw new Error("Invalid raw tile");
        return rows.map((r) => {
          if (!Array.isArray(r) || r.length !== (daily?6:5) || !r.every((v) => typeof v === "number") ||
              !Number.isInteger(r[0]) || Math.abs(r[1]) > 180 || Math.abs(r[2]) > 90 ||
              !r.slice(3).every((v) => Number.isInteger(v) && v >= 0) || (daily && !(r[3]>=1 && r[3]<=31))) throw new Error("Invalid raw tile row");
          return r as number[];
        });
      })();
      tiles.set(tile.url, hit);
      hit.catch(() => tiles.delete(tile.url));
      if (tiles.size > 32) tiles.delete(tiles.keys().next().value!);
    }
    return hit;
  }));
  return blocks.flat().filter((row)=>!daily || row[3]===Number(period.slice(8,10))).map((row)=>({
    id:row[0],lon:row[1],lat:row[2],modis:row[daily?4:3],viirs:row[daily?5:4],biome:"Country sensor counts · national calibration only",weight:1,
  }));
}
