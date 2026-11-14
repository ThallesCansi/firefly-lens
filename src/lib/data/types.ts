/**
 * FireFly Lens reads real NASA FIRMS detections for Brazil, already filtered,
 * counted on a 0.25° grid and harmonized (see harmonization/).
 *
 * MODIS means MODIS on Aqua; VIIRS means VIIRS on NOAA-20. Terra, Suomi NPP and
 * NOAA-21 are not part of the harmonized record.
 */

export type Sensor = "MODIS" | "VIIRS";

export const SENSORS: readonly Sensor[] = ["MODIS", "VIIRS"];

export const SENSOR_NAME: Record<Sensor, string> = { MODIS: "MODIS Aqua", VIIRS: "VIIRS NOAA-20" };

/** [west, south, east, north] in degrees. */
export type BBox = [number, number, number, number];

export interface Region {
  id: string;
  name: string;
  /** Where the region sits, in a few words. */
  place: string;
  bbox: BBox;
}

/** Largest side of an area of interest, in degrees. */
export const MAX_AREA_SIDE = 12;

/** The records cover Brazil: areas are kept inside this box. */
export const COVERAGE: BBox = [-74, -34, -28.5, 5.5];

/** Keeps an area inside the covered box and within the largest allowed size. */
export function normalizeBBox([w, s, e, n]: BBox): BBox {
  const [cw, cs, ce, cn] = COVERAGE;
  let west = Math.max(cw, Math.min(w, e));
  let east = Math.min(ce, Math.max(w, e));
  let south = Math.max(cs, Math.min(s, n));
  let north = Math.min(cn, Math.max(s, n));
  if (east - west < 0.5) east = Math.min(ce, west + 0.5);
  if (north - south < 0.5) north = Math.min(cn, south + 0.5);
  if (east - west < 0.5) west = east - 0.5;
  if (north - south < 0.5) south = north - 0.5;
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
