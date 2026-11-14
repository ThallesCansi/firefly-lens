"use client";

import { useMemo, useState } from "react";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { DATA_YEAR, fireData } from "@/lib/data/source";
import { count, shortDate } from "@/lib/format";
import { useYearData } from "@/lib/useYearData";
import { CalendarLegend, FireCalendar, type CalendarMode } from "./FireCalendar";
import { DayDetail } from "./DayDetail";
import { HotspotMap } from "./HotspotMap";
import { SensorCompare } from "./SensorCompare";

const MODES: { value: CalendarMode; label: string }[] = [
  { value: "harmonized", label: "Harmonized" },
  { value: "MODIS", label: "MODIS only" },
  { value: "VIIRS", label: "VIIRS only" },
];

export function LensApp() {
  const regions = useMemo(() => fireData.regions(), []);
  const [regionId, setRegionId] = useState(regions[0].id);
  const [mode, setMode] = useState<CalendarMode>("harmonized");
  const [picked, setPicked] = useState<{ regionId: string; date: string } | null>(null);
  const { data, loading, error } = useYearData(regionId);

  const region = regions.find((r) => r.id === (data?.regionId ?? regionId))!;
  const summary = data?.summary;

  // Until a day is picked in this region, open on its busiest day.
  const selected = useMemo(() => {
    if (!summary || !data) return null;
    if (picked?.regionId === data.regionId) return picked.date;
    return summary.days.reduce((best, d) => (d.index > best.index ? d : best)).date;
  }, [summary, data, picked]);

  const day = summary?.days.find((d) => d.date === selected);
  const dayHotspots = useMemo(
    () => (data && selected ? data.hotspots.filter((h) => h.acq_date === selected) : []),
    [data, selected],
  );
  const select = (date: string) => data && setPicked({ regionId: data.regionId, date });

  return (
    <main id="main" className="wrap flex flex-col gap-8 py-8 md:py-10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl">Fire calendar, {DATA_YEAR}</h1>
          <p className="mt-2 text-dim">
            {region.name} · {region.place}
          </p>
        </div>
        <SegmentedTabs
          label="Region"
          options={regions.map((r) => ({ value: r.id, label: r.name }))}
          value={regionId}
          onChange={setRegionId}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-canopy p-5">
          {error}
        </p>
      )}

      {!summary && !error && <CalendarSkeleton />}

      {summary && selected && day && (
        <div className={`flex flex-col gap-8 transition-opacity duration-200 ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
          <section aria-labelledby="calendar-title" className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <h2 id="calendar-title" className="text-xl">
                {summary.criticalPeriod ? (
                  <>
                    Fire season from {shortDate(summary.criticalPeriod.start)} to {shortDate(summary.criticalPeriod.end)},{" "}
                    <span className="text-dim">
                      with {summary.anomalies.length} unusual {summary.anomalies.length === 1 ? "day" : "days"} outside the pattern
                    </span>
                  </>
                ) : (
                  "No fire season found this year"
                )}
              </h2>
              <SegmentedTabs label="Calendar source" options={MODES} value={mode} onChange={setMode} />
            </div>
            <FireCalendar summary={summary} mode={mode} selected={selected} onSelect={select} />
            <CalendarLegend />
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="h-80 lg:h-auto">
              <HotspotMap region={region} hotspots={dayHotspots} />
            </div>
            <DayDetail day={day} />
          </div>

          <section aria-labelledby="compare-title" className="flex flex-col gap-4">
            <div>
              <h2 id="compare-title" className="text-xl">
                The same year, as each sensor saw it
              </h2>
              <p className="mt-1 max-w-[70ch] text-[0.9375rem] text-dim">
                MODIS reported <span className="num text-ink">{count(summary.totals.MODIS.detections)}</span> detections and VIIRS{" "}
                <span className="num text-ink">{count(summary.totals.VIIRS.detections)}</span>. The counts differ because the
                pixels differ, so each row keeps its own scale. Select a day to inspect it.
              </p>
            </div>
            <SensorCompare summary={summary} selected={selected} onSelect={select} />
          </section>
        </div>
      )}
    </main>
  );
}

function CalendarSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the calendar" className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="aspect-[7/6] animate-pulse rounded-lg bg-canopy" />
      ))}
    </div>
  );
}
