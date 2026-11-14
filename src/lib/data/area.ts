import { addDays, daysBetween, monthIndex } from "../dates";
import { meta } from "./meta";
import { cellGeometry, loadTile, tilesFor, type Tile } from "./tiles";
import type { BBox } from "./types";

/**
 * Everything the record of an area needs, summed over the 0.25° cells it covers.
 * A cell cut by the area's edge counts by the share of it inside the area.
 */
export interface AreaData {
  bbox: BBox;
  /** Grid cells inside the area, whole or in part. */
  cells: number;
  /** Share of the area's cells in each biome, largest first. */
  biomes: { name: string; share: number }[];
  /** Day 0 of the daily arrays, and their length. */
  firstDay: string;
  days: number;
  aquaD: Float64Array;
  aquaN: Float64Array;
  viirsD: Float64Array;
  viirsN: Float64Array;
  /** VIIRS degraded to ~1 km: subcells lit per pass, summed. */
  viirsKm: Float64Array;
  /** Cells with at least one detection, per sensor and day. */
  aquaCells: Uint16Array;
  viirsCells: Uint16Array;
  /** Month 0 of the monthly arrays (months since January of meta.epochYear), and their length. */
  firstMonth: number;
  months: number;
  /** Harmonized VIIRS, MODIS-Aqua-equivalent hot spots; NaN before VIIRS. */
  mu: Float64Array;
  /** Sum over cells of share² × variance; NaN for the months that are observed. */
  variance: Float64Array;
}

const [Y0, M0] = [Number(meta.firstDay.slice(0, 4)), Number(meta.firstDay.slice(5, 7))];
const [Y1, M1] = [Number(meta.lastDay.slice(0, 4)), Number(meta.lastDay.slice(5, 7))];
export const FIRST_MONTH = monthIndex(meta.epochYear, Y0, M0);
export const LAST_MONTH = monthIndex(meta.epochYear, Y1, M1);
const DAY0 = daysBetween(meta.epochDay, meta.firstDay);
const DAYS = daysBetween(meta.firstDay, meta.lastDay) + 1;

/** Share of each local cell of a tile inside the area (0 when outside or off the grid). */
function weights(tile: Tile, bbox: BBox) {
  const w = new Float64Array(tile.biome.length);
  const at: { id: number; lon: number; lat: number }[] = [];
  for (let c = 0; c < w.length; c++) {
    const g = cellGeometry(tile, c, bbox);
    at.push(g);
    if (tile.biome[c] !== 255) w[c] = g.weight;
  }
  return { w, at };
}

export async function loadArea(bbox: BBox): Promise<AreaData> {
  const tiles = await Promise.all(tilesFor(bbox).map(([tx, ty]) => loadTile(tx, ty)));
  const months = LAST_MONTH - FIRST_MONTH + 1;
  const area: AreaData = {
    bbox,
    cells: 0,
    biomes: [],
    firstDay: meta.firstDay,
    days: DAYS,
    aquaD: new Float64Array(DAYS),
    aquaN: new Float64Array(DAYS),
    viirsD: new Float64Array(DAYS),
    viirsN: new Float64Array(DAYS),
    viirsKm: new Float64Array(DAYS),
    aquaCells: new Uint16Array(DAYS),
    viirsCells: new Uint16Array(DAYS),
    firstMonth: FIRST_MONTH,
    months,
    mu: new Float64Array(months).fill(NaN),
    variance: new Float64Array(months).fill(NaN),
  };
  const biomeWeight = new Map<string, number>();
  for (const tile of tiles) {
    const { w } = weights(tile, bbox);
    w.forEach((x, c) => {
      if (x <= 0) return;
      area.cells++;
      const name = meta.biomes[tile.biome[c]];
      biomeWeight.set(name, (biomeWeight.get(name) ?? 0) + x);
    });
    const d = tile.daily;
    for (let i = 0; i < d.day.length; i++) {
      const x = w[d.cell[i]];
      const k = d.day[i] - DAY0;
      if (x <= 0 || k < 0 || k >= DAYS) continue;
      area.aquaD[k] += x * d.aquaD[i];
      area.aquaN[k] += x * d.aquaN[i];
      area.viirsD[k] += x * d.n20D[i];
      area.viirsN[k] += x * d.n20N[i];
      area.viirsKm[k] += x * d.n20Km[i];
      if (d.aquaD[i] + d.aquaN[i] > 0) area.aquaCells[k]++;
      if (d.n20D[i] + d.n20N[i] > 0) area.viirsCells[k]++;
    }
    const m = tile.monthly;
    for (let i = 0; i < m.mu.length; i++) {
      const x = w[m.cell[i]];
      const k = m.month[i] - FIRST_MONTH;
      if (x <= 0 || k < 0 || k >= months) continue;
      area.mu[k] = (Number.isNaN(area.mu[k]) ? 0 : area.mu[k]) + x * m.mu[i];
    }
    const v = tile.variance;
    for (let i = 0; i < v.value.length; i++) {
      const x = w[v.cell[i]];
      const k = v.month[i] - FIRST_MONTH;
      if (x <= 0 || k < 0 || k >= months) continue;
      area.variance[k] = (Number.isNaN(area.variance[k]) ? 0 : area.variance[k]) + x * x * v.value[i];
    }
  }
  const total = [...biomeWeight.values()].reduce((a, b) => a + b, 0);
  area.biomes = [...biomeWeight]
    .map(([name, x]) => ({ name, share: total ? x / total : 0 }))
    .sort((a, b) => b.share - a.share);
  return area;
}

/** Detections per whole 0.25° cell over a span of days: what the map draws. */
export interface CellCount {
  id: number;
  lon: number;
  lat: number;
  biome: string;
  /** Share of the cell inside the area. */
  weight: number;
  modis: number;
  viirs: number;
}

export interface CellDay {
  date: string;
  cell: CellCount;
  aquaD: number;
  aquaN: number;
  viirsD: number;
  viirsN: number;
  viirsKm: number;
}

/** Every cell-day with a detection in the area and span (inclusive, YYYY-MM-DD). */
export async function cellDays(bbox: BBox, from: string, to: string): Promise<CellDay[]> {
  const tiles = await Promise.all(tilesFor(bbox).map(([tx, ty]) => loadTile(tx, ty)));
  const lo = daysBetween(meta.epochDay, from);
  const hi = daysBetween(meta.epochDay, to);
  const rows: CellDay[] = [];
  for (const tile of tiles) {
    const { w, at } = weights(tile, bbox);
    const cells = new Map<number, CellCount>();
    const d = tile.daily;
    for (let i = 0; i < d.day.length; i++) {
      const c = d.cell[i];
      if (w[c] <= 0 || d.day[i] < lo || d.day[i] > hi) continue;
      let cell = cells.get(c);
      if (!cell) {
        cell = { ...at[c], biome: meta.biomes[tile.biome[c]], weight: w[c], modis: 0, viirs: 0 };
        cells.set(c, cell);
      }
      cell.modis += d.aquaD[i] + d.aquaN[i];
      cell.viirs += d.n20D[i] + d.n20N[i];
      rows.push({
        date: addDays(meta.epochDay, d.day[i]),
        cell,
        aquaD: d.aquaD[i],
        aquaN: d.aquaN[i],
        viirsD: d.n20D[i],
        viirsN: d.n20N[i],
        viirsKm: d.n20Km[i],
      });
    }
  }
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.cell.id - b.cell.id));
}

/** Detections per cell over a span of days, cells without any left out. */
export async function cellCounts(bbox: BBox, from: string, to: string): Promise<CellCount[]> {
  const cells = new Set<CellCount>();
  for (const row of await cellDays(bbox, from, to)) cells.add(row.cell);
  return [...cells];
}
