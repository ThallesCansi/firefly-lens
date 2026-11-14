import { renderHistorySvg, type SvgProvenance } from "./export-svg";
import type { BBox, Hotspot } from "./data/types";
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

/** Hot spots in the column order of a FIRMS download. */
export function hotspotsCsv(hotspots: Hotspot[]): string {
  return toCsv(
    ["latitude", "longitude", "brightness", "acq_date", "acq_time", "satellite", "instrument", "confidence", "frp", "daynight"],
    hotspots.map((h) => [h.latitude, h.longitude, h.brightness, h.acq_date, h.acq_time, h.satellite, h.instrument, h.confidence, h.frp, h.daynight]),
  );
}

export function dailyCsv(days: DaySummary[]): string {
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return toCsv(
    ["date", "modis_detections", "modis_cells", "viirs_detections", "viirs_cells", "sensors", "harmonized_cells", "index_0_100", "level", "unusual_burning"],
    days.map((d) => [
      d.date,
      d.sensors.MODIS.detections,
      d.sensors.MODIS.cells,
      d.bothSensors ? d.sensors.VIIRS.detections : null,
      d.bothSensors ? d.sensors.VIIRS.cells : null,
      d.bothSensors ? "MODIS+VIIRS" : "MODIS",
      r(d.value),
      Math.round(d.index * 100),
      LEVEL_NAMES[d.level],
      d.anomaly,
    ]),
  );
}

export function monthlyCsv(months: MonthCell[]): string {
  const r = (x: number) => Math.round(x * 10) / 10;
  return toCsv(
    ["year", "month", "harmonized_cell_days", "median_for_month", "ratio_to_median", "rank_for_month", "modis_detections", "viirs_detections"],
    months.map((m) => [
      m.year,
      MONTHS[m.month],
      r(m.value),
      r(m.median),
      m.ratio === null ? null : Math.round(m.ratio * 100) / 100,
      m.rank,
      m.detections.MODIS,
      m.detections.VIIRS,
    ]),
  );
}

/** The months-by-years heatmap as a standalone, annotated SVG file. */
export function heatmapSvg(months: MonthCell[], years: number[], title: string, provenance?: SvgProvenance): string {
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

export function areaSlug(bbox: BBox): string {
  return bbox.map((n) => String(n).replace("-", "m").replace(".", "p")).join("_");
}
