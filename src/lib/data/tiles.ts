import { meta } from "./meta";
import type { BBox } from "./types";

/**
 * One 4° × 4° tile of the Brazil record: 16 × 16 cells of 0.25°.
 * Written by harmonization/pipeline/09_app_data.py as t_{tx}_{ty}.bin.gz.
 *
 * Layout, little-endian, each section padded to 4 bytes:
 *   header    uint32[8]  magic 'FFLB', version, tx, ty, nDaily, nMonthly, nVar, 0
 *   biome     uint8[256] biome code per local cell, 255 = not on the grid
 *   daily     uint16[n] day, aquaD, aquaN, n20D, n20N, n20Km; uint8[n] cell
 *   monthly   float32[m] mu; uint16[m] month; uint8[m] cell
 *   variance  float32[v] var; uint16[v] month; uint8[v] cell
 * A local cell is (iy % 16) * 16 + (ix % 16). Days count from meta.epochDay,
 * months from January of meta.epochYear.
 */
export interface Tile {
  tx: number;
  ty: number;
  biome: Uint8Array;
  daily: {
    day: Uint16Array;
    /** MODIS Aqua detections, by day and by night. */
    aquaD: Uint16Array;
    aquaN: Uint16Array;
    /** VIIRS NOAA-20 detections, by day and by night. */
    n20D: Uint16Array;
    n20N: Uint16Array;
    /** VIIRS degraded to ~1 km: distinct 0.01° subcells lit, per pass. */
    n20Km: Uint16Array;
    cell: Uint8Array;
  };
  /** Harmonized VIIRS (negative binomial model), MODIS-Aqua-equivalent hot spots per cell and month. */
  monthly: { mu: Float32Array; month: Uint16Array; cell: Uint8Array };
  /** Variance of the harmonized value, for the modeled months only. */
  variance: { value: Float32Array; month: Uint16Array; cell: Uint8Array };
}

const MAGIC = 0x424c4646;
const UNITS = meta.tileCells;

export function decodeTile(buffer: ArrayBuffer): Tile {
  const head = new Uint32Array(buffer, 0, 8);
  if (head[0] !== MAGIC) throw new Error("Not a FireFly Lens tile");
  if (head[1] !== meta.version) throw new Error(`Tile version ${head[1]}, expected ${meta.version}`);
  const [, , tx, ty, n, m, v] = head;
  let at = 32;
  const u8 = (len: number) => {
    const out = new Uint8Array(buffer, at, len);
    at += len;
    return out;
  };
  const u16 = (len: number) => {
    const out = new Uint16Array(buffer, at, len);
    at += len * 2;
    return out;
  };
  const f32 = (len: number) => {
    const out = new Float32Array(buffer, at, len);
    at += len * 4;
    return out;
  };
  const align = () => {
    at += (4 - (at % 4)) % 4;
  };
  const biome = u8(UNITS * UNITS);
  const daily = { day: u16(n), aquaD: u16(n), aquaN: u16(n), n20D: u16(n), n20N: u16(n), n20Km: u16(n), cell: u8(n) };
  align();
  const monthly = { mu: f32(m), month: u16(m), cell: u8(m) };
  align();
  const variance = { value: f32(v), month: u16(v), cell: u8(v) };
  return { tx, ty, biome, daily, monthly, variance };
}

async function gunzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(buffer, 0, 2);
  // A server may already have decoded the file (Content-Encoding: gzip).
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return buffer;
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

const AVAILABLE = new Set(meta.tiles.map(([tx, ty]) => `${tx}_${ty}`));
const cache = new Map<string, Promise<Tile>>();

export function loadTile(tx: number, ty: number): Promise<Tile> {
  const key = `${tx}_${ty}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = fetch(`/data/brazil/t_${key}.bin.gz`)
      .then((r) => {
        if (!r.ok) throw new Error(`Tile ${key}: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then(gunzip)
      .then(decodeTile);
    // A failed tile may be fetched again later.
    hit.catch(() => cache.delete(key));
    cache.set(key, hit);
  }
  return hit;
}

/** Grid index of the 0.25° cell column or row that holds a coordinate. */
export const cellIndex = (value: number, origin: number) => Math.floor((value - origin) / meta.cellDeg + 1e-9);

/** The tiles, among those that exist, that overlap an area. */
export function tilesFor([w, s, e, n]: BBox): [number, number][] {
  const [x0, y0] = meta.origin;
  const t = (i: number) => Math.floor(i / UNITS);
  const out: [number, number][] = [];
  for (let tx = t(cellIndex(w, x0)); tx <= t(cellIndex(e - 1e-9, x0)); tx++)
    for (let ty = t(cellIndex(s, y0)); ty <= t(cellIndex(n - 1e-9, y0)); ty++)
      if (AVAILABLE.has(`${tx}_${ty}`)) out.push([tx, ty]);
  return out;
}

/** Centre and share of a cell that lies inside an area (0 to 1, by area in degrees). */
export function cellGeometry(tile: Pick<Tile, "tx" | "ty">, local: number, [w, s, e, n]: BBox) {
  const [x0, y0] = meta.origin;
  const d = meta.cellDeg;
  const ix = tile.tx * UNITS + (local % UNITS);
  const iy = tile.ty * UNITS + Math.floor(local / UNITS);
  const west = x0 + ix * d;
  const south = y0 + iy * d;
  const dx = Math.max(0, Math.min(e, west + d) - Math.max(w, west));
  const dy = Math.max(0, Math.min(n, south + d) - Math.max(s, south));
  return { id: iy * 1000 + ix, lon: west + d / 2, lat: south + d / 2, weight: (dx * dy) / (d * d) };
}
