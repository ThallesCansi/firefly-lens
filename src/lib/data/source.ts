import type { BBox, Hotspot, Region } from "./types";
import { mockSource } from "./mock";

/**
 * The one seam between the interface and the data. Everything on screen is
 * computed from what `hotspots` returns.
 */
export interface FireDataSource {
  /** True when the records are generated rather than observed. */
  readonly simulated: boolean;
  /** First and last calendar year the source can serve. */
  readonly firstYear: number;
  readonly lastYear: number;
  /** Ready-made areas of interest. */
  presets(): Region[];
  /** Every detection from both sensors inside the area, between two dates (inclusive, YYYY-MM-DD). */
  hotspots(bbox: BBox, from: string, to: string): Promise<Hotspot[]>;
}

export const fireData: FireDataSource = mockSource;

/** The most recent year on record: what the landing page and single-year views show. */
export const DATA_YEAR = fireData.lastYear;
