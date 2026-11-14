import type { FireDataSource } from "./source";
import type { Hotspot, Region, Satellite } from "./types";

/**
 * Deterministic stand-in for FIRMS. It simulates fire events first, then lets
 * each sensor "see" them the way the real instruments differ: MODIS in coarse
 * 1 km pixels that miss small fires, VIIRS in 375 m pixels that catch more and
 * report several detections for one fire.
 */

interface RegionModel extends Region {
  /** Day of year when the fire season peaks. */
  peakDay: number;
  /** Season width, in days (standard deviation). */
  seasonWidth: number;
  /** Events per day in the quiet months. */
  baseline: number;
  /** Extra events per day at the peak. */
  peak: number;
  /** Days of year with a planted burst of unusual burning. */
  anomalies: number[];
}

const MODELS: RegionModel[] = [
  {
    id: "amazon",
    name: "Southern Amazon",
    place: "Brazil, arc of deforestation",
    bbox: [-62, -13, -50, -5],
    peakDay: 248,
    seasonWidth: 24,
    baseline: 1.2,
    peak: 46,
    anomalies: [142, 203, 310],
  },
  {
    id: "cerrado",
    name: "Cerrado",
    place: "Brazil, central savanna",
    bbox: [-50, -14, -42, -6],
    peakDay: 262,
    seasonWidth: 28,
    baseline: 1.6,
    peak: 38,
    anomalies: [121, 188, 331],
  },
  {
    id: "california",
    name: "Northern California",
    place: "United States, Sierra Nevada and coast ranges",
    bbox: [-124, 38, -119, 42],
    peakDay: 232,
    seasonWidth: 30,
    baseline: 0.4,
    peak: 22,
    anomalies: [24, 165, 318],
  },
  {
    id: "borneo",
    name: "Borneo",
    place: "Indonesia, Kalimantan peatlands",
    bbox: [109, -4, 117, 2],
    peakDay: 268,
    seasonWidth: 22,
    baseline: 0.8,
    peak: 34,
    anomalies: [58, 196, 339],
  },
];

/** Days of year the simulation plants as unusual, for tests and the method page. */
export function plantedAnomalies(regionId: string): number[] {
  return MODELS.find((m) => m.id === regionId)?.anomalies ?? [];
}

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

/** Local solar overpass hours for each platform. */
const PASSES: { satellite: Satellite; sensor: "MODIS" | "VIIRS"; hour: number; day: boolean }[] = [
  { satellite: "Terra", sensor: "MODIS", hour: 10.5, day: true },
  { satellite: "Aqua", sensor: "MODIS", hour: 13.5, day: true },
  { satellite: "Terra", sensor: "MODIS", hour: 22.5, day: false },
  { satellite: "Aqua", sensor: "MODIS", hour: 1.5, day: false },
  { satellite: "Suomi NPP", sensor: "VIIRS", hour: 13.5, day: true },
  { satellite: "NOAA-20", sensor: "VIIRS", hour: 12.7, day: true },
  { satellite: "Suomi NPP", sensor: "VIIRS", hour: 1.5, day: false },
  { satellite: "NOAA-20", sensor: "VIIRS", hour: 0.7, day: false },
];

function utcTime(localHour: number, longitude: number, jitter: number): string {
  let h = localHour - longitude / 15 + jitter;
  h = ((h % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${pad(hh)}${pad(mm)}`;
}

function generate(model: RegionModel, year: number): Hotspot[] {
  const rand = prng(hashSeed(`${model.id}:${year}`));
  const [west, south, east, north] = model.bbox;
  const width = east - west;
  const height = north - south;

  // Fires cluster along a few fronts rather than spreading evenly.
  const fronts = Array.from({ length: 9 }, () => ({
    lon: west + width * (0.12 + 0.76 * rand()),
    lat: south + height * (0.12 + 0.76 * rand()),
    spread: 0.05 + 0.1 * rand(),
    weight: 0.4 + rand(),
  }));
  const totalWeight = fronts.reduce((sum, f) => sum + f.weight, 0);

  const out: Hotspot[] = [];
  const total = daysInYear(year);

  for (let day = 1; day <= total; day++) {
    const z = (day - model.peakDay) / model.seasonWidth;
    const season = model.baseline + model.peak * Math.exp(-0.5 * z * z);
    // Day-to-day weather: a slow wobble plus the occasional cloudy day.
    const weather = 0.75 + 0.5 * rand();
    const cloud = rand() < 0.12 ? 0.25 + 0.4 * rand() : 1;
    const burst = model.anomalies.includes(day) ? 22 + season * 2.6 : 0;
    const events = poisson(rand, season * weather + burst);
    const date = dateOfDay(year, day);

    for (let e = 0; e < events; e++) {
      let pick = rand() * totalWeight;
      let front = fronts[0];
      for (const f of fronts) {
        pick -= f.weight;
        if (pick <= 0) {
          front = f;
          break;
        }
      }
      const lon = Math.min(east, Math.max(west, front.lon + gaussian(rand) * front.spread * width));
      const lat = Math.min(north, Math.max(south, front.lat + gaussian(rand) * front.spread * height));
      // Fire radiative power is heavy-tailed: many small fires, few very large.
      const power = Math.exp(2.4 + 1.05 * gaussian(rand));
      const burnsAtNight = rand() < Math.min(0.85, power / 90);

      for (const pass of PASSES) {
        if (!pass.day && !burnsAtNight) continue;
        if (rand() > (pass.day ? 0.62 : 0.5) * cloud) continue;

        if (pass.sensor === "MODIS") {
          // A 1 km pixel needs a fire of some size before it registers.
          const seen = 1 - Math.exp(-power / 26);
          if (rand() > seen) continue;
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
          const seen = 1 - Math.exp(-power / 5);
          if (rand() > seen) continue;
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
  return out;
}

function round(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

const cache = new Map<string, Hotspot[]>();

export function generateHotspots(regionId: string, year: number): Hotspot[] {
  const key = `${regionId}:${year}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const model = MODELS.find((m) => m.id === regionId);
  if (!model) throw new Error(`Unknown region "${regionId}"`);
  const made = generate(model, year);
  cache.set(key, made);
  return made;
}

export const mockSource: FireDataSource = {
  simulated: true,
  regions: () => MODELS.map(({ id, name, place, bbox }) => ({ id, name, place, bbox })),
  hotspots: async (regionId, year) => generateHotspots(regionId, year),
};
