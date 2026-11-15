import { DEFAULT_RADAR_CONFIG, type RadarConfig, type RadarRegion } from "../anomalies";
import { meta } from "./meta";
import { MONTH_QUALITY_VERSION, type MonthCoverage } from "./month-quality";

export const RADAR_SCHEMA_VERSION = 1;
export interface RadarSummary {
  schemaVersion: number;
  qualityVersion: number;
  coverage: MonthCoverage;
  defaultConfig: RadarConfig;
  sourceFingerprint: string;
  inputs: { path: string; sha256: string }[];
  intervalDescription: string;
  regions: RadarRegion[];
}

/** Reject incompatible/stale deployments and malformed data before displaying cards.
 * Full source/content freshness is checked by radar:check before dev/build.
 */
export function parseRadarSummary(raw: unknown): RadarSummary {
  const data = raw as RadarSummary | null;
  const fail = () => { throw new Error("The radar summary is incompatible or outdated. Regenerate it with pnpm radar:generate."); };
  if (!data || data.schemaVersion !== RADAR_SCHEMA_VERSION || data.qualityVersion !== MONTH_QUALITY_VERSION ||
      JSON.stringify(data.defaultConfig) !== JSON.stringify(DEFAULT_RADAR_CONFIG) ||
      !data.coverage || ["firstDay", "lastDay", "seriesEnd", "partialMonth", "observedUntil"].some(
        (key) => data.coverage[key as keyof MonthCoverage] !== meta[key as keyof MonthCoverage & keyof typeof meta]) ||
      !/^[a-f0-9]{64}$/.test(data.sourceFingerprint) || !Array.isArray(data.inputs) ||
      !Array.isArray(data.regions) || data.regions.length !== meta.presets.length) return fail();
  const count = Number(meta.lastDay.slice(0, 4)) * 12 + Number(meta.lastDay.slice(5, 7)) -
    Number(meta.firstDay.slice(0, 4)) * 12 - Number(meta.firstDay.slice(5, 7)) + 1;
  for (const preset of meta.presets) {
    const region = data.regions.find((r) => r.id === preset.id);
    if (!region || region.name !== preset.name || JSON.stringify(region.bbox) !== JSON.stringify(preset.bbox) ||
        !Array.isArray(region.months) || region.months.length !== count) return fail();
    const start = Number(meta.firstDay.slice(0, 4)) * 12 + Number(meta.firstDay.slice(5, 7)) - 1;
    for (const [i, cell] of region.months.entries()) {
      if (!cell || cell.year * 12 + cell.month !== start + i || !Number.isInteger(cell.year) ||
          !Number.isInteger(cell.month) || cell.month < 0 || cell.month > 11 ||
          !Number.isFinite(cell.value) || cell.value < 0 || typeof cell.partial !== "boolean" ||
          !["observed", "modeled"].includes(cell.source) ||
          [cell.lo, cell.hi].some((v) => v !== null && !Number.isFinite(v))) return fail();
    }
  }
  return data;
}

let cached: Promise<RadarSummary> | null = null;
export function loadRadarSummary(): Promise<RadarSummary> {
  if (!cached) {
    cached = fetch("/data/brazil/historical-radar.json")
      .then((response) => {
        if (!response.ok) throw new Error("The historical radar could not be loaded. Try again.");
        return response.json();
      }).then(parseRadarSummary).catch((error) => { cached = null; throw error; });
  }
  return cached;
}
