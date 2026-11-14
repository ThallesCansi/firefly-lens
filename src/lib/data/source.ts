import type { Hotspot, Region } from "./types";
import { mockSource } from "./mock";

/**
 * The one seam between the interface and the data. Stage 2 adds a FIRMS-backed
 * implementation behind a Next.js route handler and swaps it in here.
 */
export interface FireDataSource {
  /** True when the records are generated rather than observed. */
  readonly simulated: boolean;
  regions(): Region[];
  /** Every detection from both sensors for one region and calendar year. */
  hotspots(regionId: string, year: number): Promise<Hotspot[]>;
}

export const DATA_YEAR = 2025;

export const fireData: FireDataSource = mockSource;
