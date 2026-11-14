/**
 * Shapes follow the NASA FIRMS active-fire CSV so the simulated source can be
 * swapped for the real API without touching the components.
 */

export type Sensor = "MODIS" | "VIIRS";

export const SENSORS: readonly Sensor[] = ["MODIS", "VIIRS"];

export type Satellite = "Terra" | "Aqua" | "Suomi NPP" | "NOAA-20";

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

export interface Region {
  id: string;
  name: string;
  /** Where the region sits, in a few words. */
  place: string;
  /** [west, south, east, north] in degrees. */
  bbox: [number, number, number, number];
}

export type ConfidenceClass = "low" | "nominal" | "high";

export function confidenceClass(c: Confidence): ConfidenceClass {
  if (c === "l") return "low";
  if (c === "n") return "nominal";
  if (c === "h") return "high";
  if (c < 30) return "low";
  if (c < 80) return "nominal";
  return "high";
}
