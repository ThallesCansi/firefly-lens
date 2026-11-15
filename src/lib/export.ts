import { renderHistorySvg, type SvgProvenance } from "./export-svg";
import type { CellDay } from "./data/area";
import type { AnalysisArea } from "./data/types";
import { LEVEL_NAMES, type DaySummary, type MonthCell } from "./harmonize";
import { MONTHS } from "./format";

type Cell = string | number | boolean | null;

function toCsv(header: string[], rows: Cell[][]): string {
  const cell = (v: Cell) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Detections per 0.25° grid cell and day: the finest level the app holds. */
export function cellDaysCsv(rows: CellDay[]): string {
  return toCsv(
    [
      "date",
      "cell_id",
      "cell_lat",
      "cell_lon",
      "biome",
      "share_of_cell_in_area",
      "modis_aqua_day",
      "modis_aqua_night",
      "viirs_noaa20_day",
      "viirs_noaa20_night",
      "viirs_noaa20_1km_cells",
    ],
    rows.map((r) => [
      r.date,
      r.cell.id,
      r.cell.lat,
      r.cell.lon,
      r.cell.biome,
      r3(r.cell.weight),
      r.aquaD,
      r.aquaN,
      r.viirsD,
      r.viirsN,
      r.viirsKm,
    ]),
  );
}

export function dailyCsv(days: DaySummary[]): string {
  return toCsv(
    [
      "date",
      "modis_aqua_detections",
      "viirs_noaa20_detections",
      "viirs_harmonized",
      "harmonized_hotspots",
      "source",
      "index_0_100",
      "level",
      "unusual_burning",
    ],
    days.map((d) => [
      d.date,
      r3(d.sensors.MODIS.detections),
      d.bothSensors ? r3(d.sensors.VIIRS.detections) : null,
      d.sensors.VIIRS.estimate === null ? null : r3(d.sensors.VIIRS.estimate),
      r3(d.value),
      d.source === "observed" ? "observed_modis" : "modeled_viirs",
      Math.round(d.index * 100),
      LEVEL_NAMES[d.level],
      d.anomaly,
    ]),
  );
}

export function monthlyCsv(months: MonthCell[]): string {
  return toCsv(
    [
      "year",
      "month",
      "harmonized_hotspots",
      "source",
      "lo95",
      "hi95",
      "partial_month",
      "median_for_month_2003_2025",
      "ratio_to_median",
      "rank_for_month",
      "months_ranked",
      "modis_aqua_detections",
      "viirs_noaa20_detections",
      "viirs_harmonized",
    ],
    months.map((m) => [
      m.year,
      MONTHS[m.month],
      r1(m.value),
      m.source === "observed" ? "observed_modis" : "modeled_viirs",
      m.lo === null ? null : r1(m.lo),
      m.hi === null ? null : r1(m.hi),
      m.partial,
      r1(m.median),
      m.ratio === null ? null : Math.round(m.ratio * 100) / 100,
      m.rank,
      m.rankOf,
      r1(m.detections.MODIS),
      r1(m.detections.VIIRS),
      m.viirsHarmonized === null ? null : r1(m.viirsHarmonized),
    ]),
  );
}

/** The months-by-years heatmap as a standalone, annotated SVG file. */
export function heatmapSvg(
  months: MonthCell[],
  years: number[],
  title: string,
  provenance?: SvgProvenance,
): string {
  return renderHistorySvg(months, years, title, provenance);
}

export function download(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A short file-name part for an area: a named region, or the drawn shape's envelope. */
export function areaSlug(area: AnalysisArea): string {
  if (area.kind === "state" || area.kind === "preset")
    return area.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
  return area.bbox
    .map((n) => String(Math.round(n * 100) / 100).replace("-", "m").replace(".", "p"))
    .join("_");
}

/** The area's outline as a GeoJSON feature, to reuse the same area in a GIS. */
export function areaGeoJson(area: AnalysisArea): string {
  return (
    JSON.stringify(
      {
        type: "Feature",
        properties: { name: area.name, kind: area.kind, id: area.id },
        geometry: area.geometry,
      },
      null,
      1,
    ) + "\n"
  );
}
