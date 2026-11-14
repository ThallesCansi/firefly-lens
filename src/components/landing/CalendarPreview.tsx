"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarLegend, FireCalendar } from "@/components/lens/FireCalendar";
import { SoftText } from "@/components/ui/SoftText";
import { LEVEL_NAMES } from "@/lib/harmonize";
import { indexScore, longDate } from "@/lib/format";
import { useYearData } from "@/lib/useYearData";

const MONTHS_SHOWN = [6, 7, 8, 9];

export function CalendarPreview() {
  const { data } = useYearData("amazon");
  const [picked, setPicked] = useState<string | null>(null);
  const summary = data?.summary;
  const selected = picked ?? summary?.anomalies.find((d) => d.slice(5) >= "07-01" && d.slice(5) <= "10-31") ?? summary?.days[247].date ?? "";
  const day = summary?.days.find((d) => d.date === selected);

  return (
    <section aria-labelledby="preview-title" className="border-t border-line py-20 md:py-28">
      <div className="wrap">
        <div className="max-w-[44rem]">
          <h2 id="preview-title" className="text-3xl md:text-5xl">
            The fire season, one light per day
          </h2>
          <p className="mt-5 text-lg text-dim">
            Four months of the Southern Amazon. The lights swell as the dry season sets in; a ring marks a day that
            burned far above the weeks around it. Pick any day.
          </p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-16">
          <div className="flex min-h-64 flex-col gap-6">
            {summary ? (
              <>
                <FireCalendar
                  summary={summary}
                  mode="harmonized"
                  selected={selected}
                  onSelect={setPicked}
                  months={MONTHS_SHOWN}
                  gridClassName="grid-cols-2 md:grid-cols-4"
                />
                <CalendarLegend />
              </>
            ) : (
              <div aria-busy="true" aria-label="Loading the calendar" className="h-64 animate-pulse rounded-xl bg-canopy" />
            )}
          </div>

          <div className="flex flex-col justify-between gap-8">
            {day && (
              <div aria-live="polite">
                <p className="text-dim">
                  <SoftText value={longDate(day.date)} />
                </p>
                <p className="mt-2 flex items-baseline gap-3">
                  <span className="num text-6xl leading-none">
                    <SoftText value={indexScore(day.index)} />
                  </span>
                  <span className="text-dim">
                    <SoftText value={LEVEL_NAMES[day.level]} />
                  </span>
                </p>
                <p className="mt-4 text-[0.9375rem] text-dim">
                  MODIS lit <span className="num text-ink">{day.sensors.MODIS.cells}</span> cells from{" "}
                  <span className="num text-ink">{day.sensors.MODIS.detections}</span> detections. VIIRS lit{" "}
                  <span className="num text-ink">{day.sensors.VIIRS.cells}</span> from{" "}
                  <span className="num text-ink">{day.sensors.VIIRS.detections}</span>.
                  {day.anomaly ? " Marked as unusual burning." : ""}
                </p>
              </div>
            )}
            <Link href="/lens" className="btn btn-primary self-start">
              Explore the full year
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
