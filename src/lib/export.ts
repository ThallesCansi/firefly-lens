import type { CellDay } from "./data/area";
import type { BBox } from "./data/types";
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

const EMBER = ["#2b332c", "#6a2f1d", "#a63f1c", "#dc5f1f", "#f59a35", "#ffdc78"];

/** The months-by-years heatmap as a standalone SVG file. */
export function heatmapSvg(months: MonthCell[], years: number[], title: string): string {
  const cell = 26;
  const left = 56;
  const top = 64;
  const width = left + 12 * cell + 24;
  const height = top + years.length * cell + 28;
  const byKey = new Map(months.map((m) => [`${m.year}:${m.month}`, m]));
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif" font-size="11">`,
    `<rect width="100%" height="100%" fill="#0b0e0c"/>`,
    `<text x="${left}" y="24" fill="#eef0e6" font-size="14">${title.replace(/[<&>]/g, "")}</text>`,
    `<text x="${left}" y="42" fill="#a6ae9f">Hot spots by month, MODIS-Aqua-equivalent: observed to 2025, VIIRS harmonized after. A ring marks a month at least twice its median.</text>`,
  ];
  MONTHS.forEach((name, m) => parts.push(`<text x="${left + m * cell + cell / 2}" y="${top - 6}" fill="#a6ae9f" text-anchor="middle">${name[0]}</text>`));
  years.forEach((year, row) => {
    const y = top + row * cell;
    parts.push(`<text x="${left - 8}" y="${y + cell / 2 + 4}" fill="#a6ae9f" text-anchor="end">${year}</text>`);
    for (let m = 0; m < 12; m++) {
      const c = byKey.get(`${year}:${m}`);
      if (!c) continue;
      const x = left + m * cell;
      parts.push(`<rect x="${x + 1}" y="${y + 1}" width="${cell - 2}" height="${cell - 2}" rx="3" fill="${EMBER[c.level]}"/>`);
      if (c.ratio !== null && c.ratio >= 2) {
        parts.push(`<rect x="${x + 2.5}" y="${y + 2.5}" width="${cell - 5}" height="${cell - 5}" rx="2" fill="none" stroke="#d8f24e" stroke-width="1.5"/>`);
      }
    }
  });
  parts.push(`<text x="${left}" y="${height - 8}" fill="#7d8677">FireFly Lens · NASA FIRMS, Brazil</text>`, `</svg>`);
  return parts.join("\n");
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
