import { meta } from "./meta";
import type { Region } from "./types";

/**
 * What the interface needs to know about the record before loading any of it.
 * The record itself is read per area through ./area.
 */
export const fireData = {
  /** True when the records are generated rather than observed. */
  simulated: false,
  /** Where the records come from. */
  coverage: "Brazil",
  firstYear: Number(meta.firstDay.slice(0, 4)),
  lastYear: Number(meta.lastDay.slice(0, 4)),
  /** First and last month with data, YYYY-MM. */
  firstMonth: meta.firstDay.slice(0, 7),
  lastMonth: meta.lastDay.slice(0, 7),
  firstDay: meta.firstDay,
  lastDay: meta.lastDay,
  /** First day of the VIIRS NOAA-20 record. */
  viirsStart: meta.viirsStart,
  /** Last year of observed MODIS Aqua in the series; later years are harmonized VIIRS. */
  observedUntil: meta.observedUntil,
  /** Ready-made areas of interest. */
  presets(): Region[] {
    return meta.presets;
  },
};

/** The most recent complete year: what the landing page shows. */
export const DATA_YEAR = meta.observedUntil;
