"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { fireData } from "@/lib/data/source";
import type { BBox } from "@/lib/data/types";
import { areaSlug, dailyCsv, download, heatmapSvg, hotspotsCsv, monthlyCsv } from "@/lib/export";
import { MONTHS, count, shortDate } from "@/lib/format";
import { yearView } from "@/lib/harmonize";
import { useFireRecord, useHotspots } from "@/lib/useFireRecord";
import { AreaForm } from "./AreaForm";
import { CalendarLegend, FireCalendar, type CalendarMode } from "./FireCalendar";
import { DayDetail } from "./DayDetail";
import { HistoryHeatmap, againstMedian } from "./HistoryHeatmap";
import { HotspotMap } from "./HotspotMap";
import { SensorCompare } from "./SensorCompare";

const MODES: { value: CalendarMode; label: string }[] = [
  { value: "harmonized", label: "Harmonized" },
  { value: "MODIS", label: "MODIS only" },
  { value: "VIIRS", label: "VIIRS only" },
];

/** Longest span, in months, offered as a raw hot spot download. */
const HOTSPOT_CSV_MONTHS = 36;

const FIRST = fireData.firstYear;
const LAST = fireData.lastYear;
const ALL_YEARS = Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i);
const stamp = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, "0")}`;
const lastDay = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();

export function LensApp() {
  const presets = useMemo(() => fireData.presets(), []);
  const [areaId, setAreaId] = useState(presets[0].id);
  const [custom, setCustom] = useState<BBox>(presets[0].bbox);
  const [drawing, setDrawing] = useState(false);
  const [from, setFrom] = useState(stamp(FIRST, 0));
  const [to, setTo] = useState(stamp(LAST, 11));
  const [year, setYear] = useState(LAST);
  const [mode, setMode] = useState<CalendarMode>("harmonized");
  const [picked, setPicked] = useState<{ key: string; date: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const mapBox = useRef<HTMLDivElement>(null);

  const preset = presets.find((p) => p.id === areaId);
  const bbox = preset?.bbox ?? custom;
  const areaName = preset?.name ?? "Custom area";
  const areaPlace = preset?.place ?? `${bbox[0]}, ${bbox[1]} to ${bbox[2]}, ${bbox[3]}`;

  const { record, recordKey, loading, progress, error } = useFireRecord(bbox);
  const shownBBox = useMemo(() => (recordKey ? (recordKey.split(",").map(Number) as BBox) : bbox), [recordKey, bbox]);

  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  const shownYear = Math.min(toYear, Math.max(fromYear, year));
  const years = useMemo(() => ALL_YEARS.filter((y) => y >= fromYear && y <= toYear).reverse(), [fromYear, toYear]);
  const summary = useMemo(() => (record ? yearView(record, shownYear) : null), [record, shownYear]);

  // Until a day is picked in this area and year, open on the year's busiest day.
  const viewKey = `${recordKey}:${shownYear}`;
  const selected = useMemo(() => {
    if (!summary) return null;
    if (picked?.key === viewKey) return picked.date;
    return summary.days.reduce((best, d) => (d.index > best.index ? d : best)).date;
  }, [summary, picked, viewKey]);
  const day = summary?.days.find((d) => d.date === selected);
  const dayHotspots = useHotspots(shownBBox, selected ?? `${shownYear}-01-01`, selected ?? `${shownYear}-01-01`);
  const select = (date: string) => setPicked({ key: viewKey, date });

  const latest = record?.months.find((m) => stamp(m.year, m.month) === to);
  const rangeMonths = (toYear - fromYear) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
  const fileBase = `firefly-lens_${preset?.id ?? areaSlug(bbox)}_${from}_${to}`;

  const setArea = useCallback((next: BBox) => {
    setCustom(next);
    setAreaId("custom");
    setDrawing(false);
  }, []);

  const toggleDraw = () => {
    setDrawing((d) => !d);
    mapBox.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const exportHotspots = async () => {
    setExporting(true);
    try {
      const rows = await fireData.hotspots(shownBBox, `${from}-01`, `${to}-${lastDay(to)}`);
      download(`${fileBase}_hotspots.csv`, hotspotsCsv(rows), "text/csv");
    } finally {
      setExporting(false);
    }
  };
  const inRange = (date: string) => date.slice(0, 7) >= from && date.slice(0, 7) <= to;

  return (
    <main id="main" className="wrap flex flex-col gap-8 py-8 md:py-10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl">Burning activity calendar</h1>
          <p className="mt-2 text-dim">
            {areaName} · {areaPlace}
          </p>
        </div>
        <SegmentedTabs
          label="Area of interest"
          options={[...presets.map((p) => ({ value: p.id, label: p.name })), { value: "custom", label: "Custom area" }]}
          value={areaId}
          onChange={(id) => {
            if (id === "custom") setCustom(bbox);
            setAreaId(id);
            setDrawing(false);
          }}
        />
      </div>

      {areaId === "custom" && (
        <AreaForm key={custom.join(",")} bbox={custom} drawing={drawing} onApply={setArea} onToggleDraw={toggleDraw} />
      )}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div role="group" aria-label="Date range" className="flex shrink-0 flex-wrap items-end gap-x-5 gap-y-3">
          <MonthPicker label="From" value={from} max={to} onChange={setFrom} />
          <MonthPicker label="To" value={to} min={from} onChange={setTo} />
        </div>
        <div className="flex flex-col gap-2 xl:items-end">
          <p className="text-[0.8125rem] text-dim">Download for this area and range</p>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <button
              type="button"
              className="btn btn-quiet"
              disabled={!record || exporting || rangeMonths > HOTSPOT_CSV_MONTHS}
              onClick={exportHotspots}
            >
              {exporting ? "Preparing the file…" : "Hot spots CSV"}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={!record}
              onClick={() => record && download(`${fileBase}_daily.csv`, dailyCsv(record.days.filter((d) => inRange(d.date))), "text/csv")}
            >
              Daily series CSV
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={!record}
              onClick={() =>
                record &&
                download(`${fileBase}_monthly.csv`, monthlyCsv(record.months.filter((m) => inRange(stamp(m.year, m.month)))), "text/csv")
              }
            >
              Monthly table CSV
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={!record}
              onClick={() =>
                record &&
                download(`${fileBase}_heatmap.svg`, heatmapSvg(record.months, years, `${areaName}, ${from} to ${to}`), "image/svg+xml")
              }
            >
              Heatmap SVG
            </button>
          </div>
          {rangeMonths > HOTSPOT_CSV_MONTHS && (
            <p className="text-[0.8125rem] text-faint">
              The hot spot file covers up to {HOTSPOT_CSV_MONTHS} months. Narrow the range to download it.
            </p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-canopy p-5">
          {error}
        </p>
      )}

      {loading && (
        <div role="status" className="flex items-center gap-4 text-[0.9375rem] text-dim">
          <span className="h-1 w-48 overflow-hidden rounded-full bg-bark">
            <span className="block h-full bg-lume transition-[width] duration-150" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
          Reading {FIRST} to {LAST} for {areaName}
        </div>
      )}

      {record && summary && selected && day && (
        <div className={`flex flex-col gap-12 transition-opacity duration-200 ${loading ? "opacity-50" : ""}`} aria-busy={loading}>
          <section aria-labelledby="history-title" className="flex flex-col gap-5">
            <div>
              <h2 id="history-title" className="text-xl md:text-2xl">
                {latest ? (
                  <>
                    {MONTHS[latest.month]} {latest.year} was {againstMedian(latest)},{" "}
                    <span className="text-dim">
                      rank {latest.rank} of {record.years.length} for the month
                    </span>
                  </>
                ) : (
                  "Burning activity by month and year"
                )}
              </h2>
              <p className="mt-2 max-w-[70ch] text-[0.9375rem] text-dim">
                Each square is one month of harmonized activity. Before 2012 the record rests on MODIS alone, scaled by{" "}
                <span className="num text-ink">{record.calibration.factor.toFixed(2)}</span> VIIRS cells per MODIS cell,
                a factor learned from the <span className="num text-ink">{count(record.calibration.overlapDays)}</span>{" "}
                days both sensors flew over this area. Select a year to open its calendar.
              </p>
            </div>
            <HistoryHeatmap record={record} years={years} from={from} to={to} selectedYear={shownYear} onSelect={setYear} />
          </section>

          <section aria-labelledby="calendar-title" className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex items-center gap-2 text-[0.9375rem] text-dim">
                  <span className="sr-only">Year shown in the calendar</span>
                  <select value={shownYear} onChange={(e) => setYear(Number(e.target.value))} className="field num text-lg">
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
                <h2 id="calendar-title" className="text-xl">
                  {summary.criticalPeriod ? (
                    <>
                      Fire season typically runs {shortDate(summary.criticalPeriod.start)} to {shortDate(summary.criticalPeriod.end)},{" "}
                      <span className="text-dim">
                        {summary.anomalies.length} unusual {summary.anomalies.length === 1 ? "day" : "days"} this year
                      </span>
                    </>
                  ) : (
                    "No fire season found in this area"
                  )}
                </h2>
              </div>
              <SegmentedTabs label="Calendar source" options={MODES} value={mode} onChange={setMode} />
            </div>
            {mode === "VIIRS" && shownYear < 2012 && (
              <p className="rounded-lg bg-canopy p-3 text-[0.9375rem] text-dim">
                VIIRS started on 20 January 2012. This year has no VIIRS detections, so its calendar is empty.
              </p>
            )}
            <FireCalendar summary={summary} mode={mode} selected={selected} onSelect={select} />
            <CalendarLegend />
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div ref={mapBox} className="h-80 lg:h-auto">
              <HotspotMap bbox={shownBBox} areaName={areaName} hotspots={dayHotspots} drawing={drawing} onDraw={setArea} />
            </div>
            <DayDetail day={day} />
          </div>

          <section aria-labelledby="compare-title" className="flex flex-col gap-4">
            <div>
              <h2 id="compare-title" className="text-xl">
                {shownYear}, as each sensor saw it
              </h2>
              <p className="mt-1 max-w-[70ch] text-[0.9375rem] text-dim">
                MODIS reported <span className="num text-ink">{count(summary.totals.MODIS.detections)}</span> detections
                {shownYear >= 2012 ? (
                  <>
                    {" "}
                    and VIIRS <span className="num text-ink">{count(summary.totals.VIIRS.detections)}</span>. The counts
                    differ because the pixels differ, so each row keeps its own scale.
                  </>
                ) : (
                  <>. VIIRS had not launched yet.</>
                )}{" "}
                Select a day to inspect it.
              </p>
            </div>
            <SensorCompare summary={summary} selected={selected} onSelect={select} />
          </section>
        </div>
      )}

      {!record && !error && (
        <div aria-hidden="true" className="grid gap-[2px]">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="h-7 animate-pulse rounded bg-canopy" />
          ))}
        </div>
      )}
    </main>
  );
}

/** A month and a year, as two selects: works the same in every browser. */
function MonthPicker({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7)) - 1;
  const allowed = (y: number, m: number) => (!min || stamp(y, m) >= min) && (!max || stamp(y, m) <= max);
  const set = (y: number, m: number) => {
    // Moving the year can leave the month outside the range: pull it back in.
    let next = stamp(y, m);
    if (min && next < min) next = min;
    if (max && next > max) next = max;
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-1 text-[0.8125rem] text-dim">
      <span id={`range-${label}`}>{label}</span>
      <div className="flex gap-2" role="group" aria-labelledby={`range-${label}`}>
        <select aria-label={`${label} month`} value={month} onChange={(e) => set(year, Number(e.target.value))} className="field">
          {MONTHS.map((name, m) => (
            <option key={name} value={m} disabled={!allowed(year, m)}>
              {name}
            </option>
          ))}
        </select>
        <select aria-label={`${label} year`} value={year} onChange={(e) => set(Number(e.target.value), month)} className="field num">
          {ALL_YEARS.filter((y) => (!min || y >= Number(min.slice(0, 4))) && (!max || y <= Number(max.slice(0, 4)))).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
