"use client";

import type { Region } from "@/lib/data/types";
import { MONTHS } from "@/lib/format";

/**
 * The card of the regional flight: which study region is on the map, where it
 * is, and the way to the next one. The regions are the application's study
 * rectangles, not official boundaries; the numbers stay in the map key.
 */
export function RegionFlight({
  stops,
  index,
  period,
  onGo,
  onShowAnalysis,
}: {
  stops: Region[];
  index: number;
  /** The month every stop shows, YYYY-MM. */
  period: string;
  /** Moves to a stop, or ends the flight with null. */
  onGo: (index: number | null) => void;
  /** Ends the flight and opens the analysis of the region on the map. */
  onShowAnalysis: () => void;
}) {
  const stop = stops[index];
  const month = `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
  return (
    <section className="selection-card region-flight map-surface" aria-label="Regional flight">
      <p className="eyebrow" aria-live="polite">
        REGION {index + 1} OF {stops.length} · {month.toUpperCase()}
      </p>
      <h2 className="text-xl">{stop.name}</h2>
      <p className="my-2 text-sm text-dim" title="A study rectangle of the application, not an official boundary">
        {stop.place}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-quiet" disabled={index === 0} onClick={() => onGo(index - 1)}>
          Back
        </button>
        {index < stops.length - 1 ? (
          <button type="button" className="btn btn-primary" onClick={() => onGo(index + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => onGo(0)}>
            Start again
          </button>
        )}
        <button type="button" className="btn btn-text" onClick={onShowAnalysis}>
          Analysis
        </button>
        <button type="button" className="btn btn-text" onClick={() => onGo(null)}>
          End
        </button>
      </div>
    </section>
  );
}
