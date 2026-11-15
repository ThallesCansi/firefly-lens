import raw from "../../../public/data/coverage.json";
import { geometryEnvelope, type AnalysisArea, type PolygonGeometry } from "./types";

export type DataKind = "real_harmonized_data" | "real_raw_detections" | "synthetic_demonstration" | "no_historical_coverage";
export interface CoverageEntry {
  country_code: string;
  name: string;
  data_kind: DataKind;
  harmonization_status: string;
  signals_eligible: boolean;
  period: { start: string; end: string };
  geometry?: PolygonGeometry;
  manifest_url?: string;
  sha256?: string;
  scope?: "entire_country_only";
  national_url?: string;
  national_sha256?: string;
  national_period?: { start: string; end: string };
  calibration_url?: string;
  representative_point?: [number, number];
  calibration_metrics?: { relative_bias: number; wape: number; spearman: number };
}
export const coverageCatalog = raw as unknown as { schema_version: string; demo_enabled: false; datasets: CoverageEntry[] };
export const DEMO_ENABLED = false;
export function countryCoverage(code: string): DataKind {
  return coverageCatalog.datasets.find((d) => d.country_code === code)?.data_kind ?? "no_historical_coverage";
}
// Legacy name retained for compatibility; includes national harmonized reports
// whose sensor-map manifests remain explicitly raw.
export const rawPilots = coverageCatalog.datasets.filter((d) => !!d.manifest_url && d.country_code !== "BRA");
export function rawPilotArea(entry: CoverageEntry): AnalysisArea {
  if (!entry.geometry) throw new Error("Raw pilot geometry missing");
  return { id: `raw:${entry.country_code}`, name: entry.name, kind: "preset", geometry: entry.geometry, bbox: geometryEnvelope(entry.geometry) };
}
export function rawPilotFor(area: AnalysisArea): CoverageEntry | undefined {
  return rawPilots.find((entry) => area.id === `raw:${entry.country_code}` || area.id === `signal:country-${entry.country_code}`);
}
