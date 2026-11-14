import type { FireDataSource } from "./source";
import type { BBox, Hotspot, Region, Satellite, Sensor } from "./types";
import { VIIRS_START } from "./types";

/**
 * Deterministic stand-in for FIRMS, 2001 to 2025.
 *
 * The world is cut into 4-degree tiles. Each tile has its own fire season and
 * fire-prone spots, each year its own weather, and each satellite the dates it
 * was actually flying. Fire events are simulated first; then each sensor "sees"
 * them the way the real instruments differ: MODIS in coarse 1 km pixels that
 * miss small fires, VIIRS in 375 m pixels that catch more and report several
 * detections for one fire. Any area of interest reads the same tiles, so a
 * small area inside a large one shows a subset of the same fires.
 */

const TILE = 4;
const FIRST_YEAR = 2001;
const LAST_YEAR = 2025;

const PRESETS: Region[] = [
  { id: "amazon", name: "Southern Amazon", place: "Brazil, arc of deforestation", bbox: [-62, -13, -50, -5] },
  { id: "cerrado", name: "Cerrado", place: "Brazil, central savanna", bbox: [-50, -14, -42, -6] },
  { id: "california", name: "Northern California", place: "United States, Sierra Nevada and coast ranges", bbox: [-124, 38, -119, 42] },
  { id: "borneo", name: "Borneo", place: "Indonesia, Kalimantan peatlands", bbox: [109, -4, 117, 2] },
];

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, and identical on every machine. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function poisson(rand: () => number, mean: number): number {
  if (mean <= 0) return 0;
  if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * gaussian(rand)));
  const limit = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > limit);
  return k - 1;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dateOfDay(year: number, dayOfYear: number): string {
  const d = new Date(Date.UTC(year, 0, dayOfYear));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

/** Local solar overpass hours, and the first day each platform's record starts. */
const PASSES: { satellite: Satellite; sensor: Sensor; hour: number; day: boolean; since: string }[] = [
  { satellite: "Terra", sensor: "MODIS", hour: 10.5, day: true, since: "2000-11-01" },
  { satellite: "Aqua", sensor: "MODIS", hour: 13.5, day: true, since: "2002-07-04" },
  { satellite: "Terra", sensor: "MODIS", hour: 22.5, day: false, since: "2000-11-01" },
  { satellite: "Aqua", sensor: "MODIS", hour: 1.5, day: false, since: "2002-07-04" },
  { satellite: "Suomi NPP", sensor: "VIIRS", hour: 13.5, day: true, since: VIIRS_START },
  { satellite: "NOAA-20", sensor: "VIIRS", hour: 12.7, day: true, since: "2018-01-01" },
  { satellite: "Suomi NPP", sensor: "VIIRS", hour: 1.5, day: false, since: VIIRS_START },
  { satellite: "NOAA-20", sensor: "VIIRS", hour: 0.7, day: false, since: "2018-01-01" },
];

function utcTime(localHour: number, longitude: number, jitter: number): string {
  let h = localHour - longitude / 15 + jitter;
  h = ((h % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${pad(hh)}${pad(mm)}`;
}

function round(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

interface TileModel {
  peakDay: number;
  seasonWidth: number;
  baseline: number;
  peak: number;
  fronts: { lon: number; lat: number; spread: number; weight: number }[];
  totalWeight: number;
}

const models = new Map<string, TileModel>();

function tileModel(ti: number, tj: number): TileModel {
  const key = `${ti}:${tj}`;
  const hit = models.get(key);
  if (hit) return hit;
  const rand = prng(hashSeed(`tile:${key}`));
  const latitude = (tj + 0.5) * TILE;
  // The dry season sets the calendar: late in the year south of the equator,
  // mid-year in the northern mid-latitudes, early in the northern tropics.
  const centre = latitude < -3 ? 250 : latitude > 23 ? 228 : latitude > 3 ? 62 : 258;
  const prone = 0.3 + 1.5 * rand() ** 1.6;
  const fronts = Array.from({ length: 4 }, () => ({
    lon: (ti + 0.1 + 0.8 * rand()) * TILE,
    lat: (tj + 0.1 + 0.8 * rand()) * TILE,
    spread: 0.14 + 0.3 * rand(),
    weight: 0.4 + rand(),
  }));
  const model: TileModel = {
    peakDay: centre + (rand() - 0.5) * 36,
    seasonWidth: 19 + 12 * rand(),
    baseline: (0.12 + 0.3 * rand()) * prone,
    peak: (7 + 6 * rand()) * prone,
    fronts,
    totalWeight: fronts.reduce((sum, f) => sum + f.weight, 0),
  };
  models.set(key, model);
  return model;
}

/** A wet or dry year is shared by a whole 20-degree block, as real climate swings are. */
function yearFactor(ti: number, tj: number, year: number): number {
  const rand = prng(hashSeed(`year:${Math.floor(ti / 5)}:${Math.floor(tj / 5)}:${year}`));
  return Math.exp(0.36 * gaussian(rand));
}

/** Days of the year when a tile gets a planted burst of unusual burning. */
function tileBursts(ti: number, tj: number, year: number): number[] {
  const rand = prng(hashSeed(`burst:${ti}:${tj}:${year}`));
  return rand() < 0.4 ? [1 + Math.floor(rand() * (daysInYear(year) - 1))] : [];
}

const tileCache = new Map<string, Hotspot[]>();
const TILE_CACHE_SIZE = 16;

function generateTileYear(ti: number, tj: number, year: number): Hotspot[] {
  const key = `${ti}:${tj}:${year}`;
  const hit = tileCache.get(key);
  if (hit) return hit;

  const model = tileModel(ti, tj);
  const rand = prng(hashSeed(`fires:${key}`));
  const climate = yearFactor(ti, tj, year);
  const bursts = tileBursts(ti, tj, year);
  const west = ti * TILE;
  const south = tj * TILE;
  const out: Hotspot[] = [];
  const total = daysInYear(year);

  for (let day = 1; day <= total; day++) {
    const z = (day - model.peakDay) / model.seasonWidth;
    const zWrap = (day - model.peakDay + (day < model.peakDay ? 365 : -365)) / model.seasonWidth;
    const season = model.baseline + model.peak * climate * (Math.exp(-0.5 * z * z) + Math.exp(-0.5 * zWrap * zWrap));
    const weather = 0.75 + 0.5 * rand();
    const cloud = rand() < 0.12 ? 0.25 + 0.4 * rand() : 1;
    const burst = bursts.includes(day) ? 26 + season * 3 : 0;
    const events = poisson(rand, season * weather + burst);
    if (events === 0) continue;
    const date = dateOfDay(year, day);

    for (let e = 0; e < events; e++) {
      let pick = rand() * model.totalWeight;
      let front = model.fronts[0];
      for (const f of model.fronts) {
        pick -= f.weight;
        if (pick <= 0) {
          front = f;
          break;
        }
      }
      const lon = Math.min(west + TILE - 0.02, Math.max(west + 0.02, front.lon + gaussian(rand) * front.spread));
      const lat = Math.min(south + TILE - 0.02, Math.max(south + 0.02, front.lat + gaussian(rand) * front.spread));
      // Fire radiative power is heavy-tailed: many small fires, few very large.
      const power = Math.exp(2.4 + 1.05 * gaussian(rand));
      const burnsAtNight = rand() < Math.min(0.85, power / 90);

      for (const pass of PASSES) {
        if (date < pass.since) continue;
        if (!pass.day && !burnsAtNight) continue;
        if (rand() > (pass.day ? 0.62 : 0.5) * cloud) continue;

        if (pass.sensor === "MODIS") {
          // A 1 km pixel needs a fire of some size before it registers.
          if (rand() > 1 - Math.exp(-power / 26)) continue;
          const pixels = power > 140 && rand() < 0.5 ? 2 : 1;
          for (let p = 0; p < pixels; p++) {
            out.push({
              latitude: round(lat + (rand() - 0.5) * 0.009 + p * 0.009, 4),
              longitude: round(lon + (rand() - 0.5) * 0.009, 4),
              brightness: round(305 + Math.min(150, power * 0.7) + 8 * rand(), 1),
              acq_date: date,
              acq_time: utcTime(pass.hour, lon, (rand() - 0.5) * 0.6),
              satellite: pass.satellite,
              instrument: "MODIS",
              confidence: Math.round(Math.min(100, 28 + power * 0.9 + 22 * rand())),
              frp: round((power / pixels) * (0.8 + 0.4 * rand()), 1),
              daynight: pass.day ? "D" : "N",
            });
          }
        } else {
          if (rand() > 1 - Math.exp(-power / 5)) continue;
          // One fire fills several 375 m pixels.
          const pixels = Math.min(9, 1 + Math.floor(power / 16 + rand() * 2.4));
          for (let p = 0; p < pixels; p++) {
            const share = power / pixels;
            out.push({
              latitude: round(lat + gaussian(rand) * 0.0045, 4),
              longitude: round(lon + gaussian(rand) * 0.0045, 4),
              brightness: round(300 + Math.min(67, share * 1.6) + 6 * rand(), 1),
              acq_date: date,
              acq_time: utcTime(pass.hour, lon, (rand() - 0.5) * 0.6),
              satellite: pass.satellite,
              instrument: "VIIRS",
              confidence: share > 9 ? "h" : share > 2 || rand() < 0.7 ? "n" : "l",
              frp: round(share * (0.8 + 0.4 * rand()), 1),
              daynight: pass.day ? "D" : "N",
            });
          }
        }
      }
    }
  }

  if (tileCache.size >= TILE_CACHE_SIZE) tileCache.delete(tileCache.keys().next().value!);
  tileCache.set(key, out);
  return out;
}

function tilesOf([west, south, east, north]: BBox): [number, number][] {
  const out: [number, number][] = [];
  for (let ti = Math.floor(west / TILE); ti * TILE < east; ti++) {
    for (let tj = Math.floor(south / TILE); tj * TILE < north; tj++) out.push([ti, tj]);
  }
  return out;
}

/** Every simulated detection inside an area between two dates, in date order. */
export function generateHotspots(bbox: BBox, from: string, to: string): Hotspot[] {
  const [west, south, east, north] = bbox;
  const firstYear = Math.max(FIRST_YEAR, Number(from.slice(0, 4)));
  const lastYear = Math.min(LAST_YEAR, Number(to.slice(0, 4)));
  const out: Hotspot[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const inYear: Hotspot[] = [];
    for (const [ti, tj] of tilesOf(bbox)) {
      for (const h of generateTileYear(ti, tj, year)) {
        if (h.acq_date < from || h.acq_date > to) continue;
        if (h.longitude < west || h.longitude > east || h.latitude < south || h.latitude > north) continue;
        inYear.push(h);
      }
    }
    inYear.sort((a, b) => (a.acq_date < b.acq_date ? -1 : a.acq_date > b.acq_date ? 1 : 0));
    for (const h of inYear) out.push(h);
  }
  return out;
}

/** Dates the simulation plants as unusual inside an area and year, for tests. */
export function plantedBursts(bbox: BBox, year: number): string[] {
  return tilesOf(bbox)
    .flatMap(([ti, tj]) => tileBursts(ti, tj, year))
    .map((day) => dateOfDay(year, day))
    .sort();
}

export const mockSource: FireDataSource = {
  simulated: true,
  firstYear: FIRST_YEAR,
  lastYear: LAST_YEAR,
  presets: () => PRESETS,
  hotspots: async (bbox, from, to) => generateHotspots(bbox, from, to),
};
