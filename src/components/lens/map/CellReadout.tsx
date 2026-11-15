import type { CellCount } from "@/lib/data/area";
import { cellPlace } from "@/lib/map/readout";

const whole = (n: number) => Math.round(n).toLocaleString("en-GB");
/** A modeled value: one decimal while it is small, so 0.4 does not read as 0. */
const estimate = (n: number) => (n < 10 ? n.toLocaleString("en-GB", { maximumFractionDigits: 1 }) : whole(n));

/**
 * The numbers of the cell under the pointer: what each sensor recorded, VIIRS
 * converted to the MODIS Aqua scale, and whether the month is unusual. Columns
 * and marks show the shape of the fire activity; this gives the exact values.
 */
export function CellReadout({
  cell,
  harmonized,
  unusual,
  month,
}: {
  cell: CellCount;
  /** VIIRS on the MODIS Aqua scale for the month; null when the model has no value, undefined when no month is shown. */
  harmonized?: number | null;
  /** "observed" when the month is unusually high, "likely" when a modeled month probably is. */
  unusual?: "observed" | "likely" | null;
  /** Name of the calendar month, for the unusual line. */
  month?: string;
}) {
  return (
    <>
      <p className="cell-readout-place">
        {cellPlace(cell.lon, cell.lat)}
        <span className="text-faint"> · {cell.biome}</span>
      </p>
      <dl className="cell-readout-values">
        <div>
          <dt>
            <span aria-hidden="true" className="sensor-ring" />
            MODIS Aqua
          </dt>
          <dd className="num">{whole(cell.modis)}</dd>
        </div>
        <div>
          <dt>
            <span aria-hidden="true" className="sensor-dot" />
            VIIRS NOAA-20
          </dt>
          <dd className="num">{whole(cell.viirs)}</dd>
        </div>
        {harmonized != null && (
          <div className="cell-readout-model">
            <dt>VIIRS on the MODIS Aqua scale</dt>
            <dd className="num">≈ {estimate(harmonized)}</dd>
          </div>
        )}
      </dl>
      {unusual && (
        <p className="cell-readout-unusual">
          <span aria-hidden="true" className="unusual-glow" />
          {unusual === "likely" ? "Likely unusually high" : "Unusually high"}
          {month ? ` for ${month}` : ""}
        </p>
      )}
    </>
  );
}
