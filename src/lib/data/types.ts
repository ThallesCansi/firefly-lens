/**
 * Shapes follow the NASA FIRMS active-fire CSV so the simulated source can be
 * swapped for the real API without touching the components.
 */

export type Sensor = "MODIS" | "VIIRS";

export const SENSORS: readonly Sensor[] = ["MODIS", "VIIRS"];

export type Satellite = "Terra" | "Aqua" | "Suomi NPP" | "NOAA-20" | "NOAA-21";

/** MODIS reports confidence as 0-100; VIIRS as low / nominal / high. */
export type Confidence = number | "l" | "n" | "h";

export interface Hotspot {
  latitude: number;
  longitude: number;
  /** Brightness temperature in kelvin (MODIS band 21/22, VIIRS I-4). */
  brightness: number;
  /** YYYY-MM-DD, UTC. */
  acq_date: string;
  /** HHMM, UTC. */
  acq_time: string;
  satellite: Satellite;
  instrument: Sensor;
  confidence: Confidence;
  /** Fire radiative power in megawatts. */
  frp: number;
  daynight: "D" | "N";
}

/** [west, south, east, north] in degrees. */
export type BBox = [number, number, number, number];

export interface Region {
  id: string;
  name: string;
  /** Where the region sits, in a few words. */
  place: string;
  bbox: BBox;
}

/** The first day VIIRS detections exist; before it the record is MODIS alone. */
export const VIIRS_START = "2012-01-20";

/** Largest side of an area of interest, in degrees. */
export const MAX_AREA_SIDE = 12;

export type ConfidenceClass = "low" | "nominal" | "high";

export function confidenceClass(c: Confidence): ConfidenceClass {
  if (c === "l") return "low";
  if (c === "n") return "nominal";
  if (c === "h") return "high";
  if (c < 30) return "low";
  if (c < 80) return "nominal";
  return "high";
}

/** Keeps an area inside the world and within the largest allowed size. */
export function normalizeBBox([w, s, e, n]: BBox): BBox {
  let west = Math.max(-180, Math.min(w, e));
  let east = Math.min(180, Math.max(w, e));
  let south = Math.max(-90, Math.min(s, n));
  let north = Math.min(90, Math.max(s, n));
  if (east - west < 0.5) east = Math.min(180, west + 0.5);
  if (north - south < 0.5) north = Math.min(90, south + 0.5);
  if (east - west > MAX_AREA_SIDE) {
    const mid = (east + west) / 2;
    west = mid - MAX_AREA_SIDE / 2;
    east = mid + MAX_AREA_SIDE / 2;
  }
  if (north - south > MAX_AREA_SIDE) {
    const mid = (north + south) / 2;
    south = mid - MAX_AREA_SIDE / 2;
    north = mid + MAX_AREA_SIDE / 2;
  }
  const r = (x: number) => Math.round(x * 100) / 100;
  return [r(west), r(south), r(east), r(north)];
}
