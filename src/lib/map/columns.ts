import type { CellCount } from "@/lib/data/area";
import type { Sensor } from "@/lib/data/types";

/**
 * Footprint of a column inside its 0.25° cell, in degrees. Columns are kept
 * slender on purpose: the ground between them stays in view, and a tall column
 * hides less of what stands behind it.
 */
const PAIR = { width: 0.085, depth: 0.11, gap: 0.012 };
const SINGLE = { width: 0.14, depth: 0.14 };

/** The camera angle of the 3D view, in degrees from straight down. */
export const TILT_PITCH = 52;

/** See-through enough to read the map and the columns behind, solid enough to read as a volume. */
export const COLUMN_OPACITY = 0.8;

/** Height of the tallest column in metres at zoom 5, where a selected area is usually framed. */
const TOP_HEIGHT_Z5 = 310_000;
/** How much the height shrinks per zoom level. */
const SHRINK = Math.SQRT1_2;
const heightAt = (zoom: number) => TOP_HEIGHT_Z5 * SHRINK ** (zoom - 5);

/** A column's height from 0 to 1: the one being animated when there is one, else the one in the data. */
const H = ["coalesce", ["feature-state", "h"], ["get", "h"]];

/**
 * Column height in metres. Each zoom level doubles the base of a column on
 * screen; its height grows more slowly, so columns neither tower over a close
 * view nor flatten into tiles.
 */
export const COLUMN_HEIGHT = [
  "interpolate",
  ["exponential", SHRINK],
  ["zoom"],
  1,
  ["*", heightAt(1), H],
  13,
  ["*", heightAt(13), H],
];

export interface ColumnFeature {
  type: "Feature";
  /** Stable for a cell and sensor, so a column keeps its identity from one month to the next. */
  id: number;
  geometry: { type: "Polygon"; coordinates: number[][][] };
  properties: { sensor: Sensor; count: number; h: number };
}

const rectangle = (lon: number, lat: number, width: number, depth: number) => {
  const [w, e, s, n] = [lon - width / 2, lon + width / 2, lat - depth / 2, lat + depth / 2];
  return {
    type: "Polygon" as const,
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  };
};

/**
 * Detections that reach the full column height: the busiest cell of either
 * sensor shown, or `scale` when frames of a time-lapse must share one.
 */
export function columnTop(cells: CellCount[], sensors: Sensor[], scale?: { modis: number; viirs: number }): number {
  const of = (key: "modis" | "viirs") => scale?.[key] ?? cells.reduce((top, c) => Math.max(top, c[key]), 0);
  return Math.max(1, sensors.includes("MODIS") ? of("modis") : 0, sensors.includes("VIIRS") ? of("viirs") : 0);
}

/**
 * One column per grid cell and sensor, standing on the cell. Height is the
 * detection count on a linear scale shared by both sensors, so a MODIS column
 * and the VIIRS column beside it compare directly. With both sensors shown,
 * MODIS stands on the west side of the cell and VIIRS on the east; a sensor
 * shown alone stands in the middle.
 */
export function columns(
  cells: CellCount[],
  sensors: Sensor[],
  scale?: { modis: number; viirs: number },
): ColumnFeature[] {
  const modis = sensors.includes("MODIS");
  const viirs = sensors.includes("VIIRS");
  const top = columnTop(cells, sensors, scale);
  // A lone detection still stands clear of the ground.
  const height = (n: number) => Math.max(0.015, Math.min(1, n / top));
  const both = modis && viirs;
  const offset = both ? (PAIR.width + PAIR.gap) / 2 : 0;
  const { width, depth } = both ? PAIR : SINGLE;
  const features: ColumnFeature[] = [];
  for (const c of cells) {
    if (modis && c.modis > 0)
      features.push({
        type: "Feature",
        id: c.id * 2,
        geometry: rectangle(c.lon - offset, c.lat, width, depth),
        properties: { sensor: "MODIS", count: c.modis, h: height(c.modis) },
      });
    if (viirs && c.viirs > 0)
      features.push({
        type: "Feature",
        id: c.id * 2 + 1,
        geometry: rectangle(c.lon + offset, c.lat, width, depth),
        properties: { sensor: "VIIRS", count: c.viirs, h: height(c.viirs) },
      });
  }
  return features;
}

export const collection = (features: ColumnFeature[]) => ({ type: "FeatureCollection" as const, features });
