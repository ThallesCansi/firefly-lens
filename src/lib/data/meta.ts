import raw from "../../../public/data/brazil/meta.json";
import type { BBox, Region } from "./types";

/**
 * What the Brazil data files contain. Written by
 * harmonization/pipeline/09_app_data.py next to the files themselves.
 */
export interface BrazilMeta {
  version: number;
  /** South-west corner of the 0.25° grid, [lon, lat]. */
  origin: [number, number];
  cellDeg: number;
  /** Cells per side of one data tile. */
  tileCells: number;
  /** Day 0 of the daily columns, and the year of month 0 of the monthly ones. */
  epochDay: string;
  epochYear: number;
  /** First and last day with detections (MODIS Aqua starts on 4 July 2002). */
  firstDay: string;
  lastDay: string;
  /** First day of VIIRS NOAA-20 standard processing. */
  viirsStart: string;
  /** Through this year the series is MODIS Aqua as observed; after it, VIIRS harmonized. */
  observedUntil: number;
  /** Last complete month, and the month still in progress. */
  seriesEnd: string;
  partialMonth: string;
  /** Years whose months give the historical median. */
  climatologyBase: [number, number];
  /** Error shared by all cells of a month, as a fraction of the total (calibrated in validation). */
  commonErrorC: number;
  biomes: string[];
  presets: Region[];
  tiles: [number, number][];
  bounds: BBox;
  sources: string;
}

export const meta = raw as unknown as BrazilMeta;
