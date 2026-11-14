"use client";

import { useMemo, useState } from "react";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { cellDays } from "@/lib/data/area";
import { fireData } from "@/lib/data/source";
import type { BBox } from "@/lib/data/types";
import {
  areaSlug,
  cellDaysCsv,
  dailyCsv,
  download,
  heatmapSvg,
  monthlyCsv,
} from "@/lib/export";
import { MONTHS, count, shortDate } from "@/lib/format";
import { yearView } from "@/lib/harmonize";
import { useFireRecord } from "@/lib/useFireRecord";
import {
  CalendarLegend,
  FireCalendar,
  type CalendarMode,
} from "./FireCalendar";
import { DayDetail } from "./DayDetail";
import { HistoryHeatmap, againstMedian } from "./HistoryHeatmap";
import { SensorCompare } from "./SensorCompare";

const MODES: { value: CalendarMode; label: string }[] = [
  { value: "harmonized", label: "Harmonized" },
  { value: "MODIS", label: "MODIS Aqua" },
  { value: "VIIRS", label: "VIIRS, harmonized" },
];

/** Longest span, in months, offered as a grid-cell download. */
const HOTSPOT_CSV_MONTHS = 36;
const VIIRS_YEAR = Number(fireData.viirsStart.slice(0, 4));

const FIRST = fireData.firstYear;
const LAST = fireData.lastYear;
const ALL_YEARS = Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i);
const stamp = (year: number, month: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}`;
const lastDay = (ym: string) =>
  new Date(
    Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0),
  ).getUTCDate();

export function AnalysisContent({
  bbox,
  areaName,
  period,
  onPeriod,
  from,
  to,
  onFrom,
  onTo,
}: {
  bbox: BBox;
  areaName: string;
  period: string;
  onPeriod: (period: string) => void;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}) {
  const setFrom = onFrom;
  const setTo = onTo;
  const year = Number(period.slice(0, 4));
  const setYear = (y: number) => onPeriod(`${y}${period.slice(4, 7)}`);
  const [mode, setMode] = useState<CalendarMode>("harmonized");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { record, recordKey, loading, error } = useFireRecord(bbox);
  const shownBBox = useMemo(
    () => (recordKey ? (recordKey.split(",").map(Number) as BBox) : bbox),
    [recordKey, bbox],
  );

  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  const shownYear = Math.min(toYear, Math.max(fromYear, year));
  const years = useMemo(
    () => ALL_YEARS.filter((y) => y >= fromYear && y <= toYear).reverse(),
    [fromYear, toYear],
  );
  const summary = useMemo(
    () => (record ? yearView(record, shownYear) : null),
    [record, shownYear],
  );

  const selected = period.length === 10 ? period : "";
  const day = summary?.days.find((d) => d.date === selected);
  const select = onPeriod;

  const latest = record?.months.find(
    (m) => stamp(m.year, m.month) === period.slice(0, 7),
  );
  const rangeMonths =
    (toYear - fromYear) * 12 +
    Number(to.slice(5, 7)) -
    Number(from.slice(5, 7)) +
    1;
  const fileBase = `firefly-lens_${areaSlug(bbox)}_${from}_${to}`;

  const exportHotspots = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const rows = await cellDays(
        shownBBox,
        `${from}-01`,
        `${to}-${lastDay(to)}`,
      );
      download(`${fileBase}_cell_days.csv`, cellDaysCsv(rows), "text/csv");
    } catch {
      setExportError("The download could not be prepared. Please try again.");
    } finally {
      setExporting(false);
    }
  };
  const inRange = (date: string) =>
    date.slice(0, 7) >= from && date.slice(0, 7) <= to;

  return (
    <div className="analysis-content flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div
          role="group"
          aria-label="Date range"
          className="flex shrink-0 flex-wrap items-end gap-x-5 gap-y-3"
        >
          <MonthPicker
            label="From"
            value={from}
            min={fireData.firstMonth}
            max={to}
            onChange={setFrom}
          />
          <MonthPicker
            label="To"
            value={to}
            min={from}
            max={fireData.lastMonth}
            onChange={setTo}
          />
        </div>
      </div>

      {exportError && (
        <p role="alert" className="text-sm text-ember-4">
          {exportError}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-canopy p-5">
          {error}
        </p>
      )}

      {loading && (
        <div
          role="status"
          className="flex items-center gap-4 text-[0.9375rem] text-dim"
        >
          <span className="h-1 w-48 overflow-hidden rounded-full bg-bark">
            <span className="block h-full w-1/3 animate-pulse bg-lume" />
          </span>
          Reading {FIRST} to {LAST} for {areaName}
        </div>
      )}

      {record && summary && (
        <div
          className={`flex flex-col gap-12 transition-opacity duration-200 ${loading ? "opacity-50" : ""}`}
          aria-busy={loading}
        >
          <section
            aria-labelledby="history-title"
            className="flex flex-col gap-5"
          >
            <div>
              <h2 id="history-title" className="text-xl md:text-2xl">
                {latest ? (
                  <>
                    {MONTHS[latest.month]} {latest.year}{" "}
                    {latest.partial ? "so far is" : "was"}{" "}
                    {againstMedian(latest)},{" "}
                    <span className="text-dim">
                      {latest.partial
                        ? "the month is still in progress"
                        : `rank ${latest.rank} of ${latest.rankOf} for the month`}
                      {latest.source === "modeled" &&
                        latest.lo !== null &&
                        latest.hi !== null &&
                        ` · ${count(latest.value)} hot spots, 95% range ${count(latest.lo)}–${count(latest.hi)}, estimated from VIIRS`}
                    </span>
                  </>
                ) : (
                  "Burning activity by month and year"
                )}
              </h2>
              <p className="mt-2 max-w-[70ch] text-[0.9375rem] text-dim">
                Each square is one month, in hot spots on the MODIS Aqua scale:
                observed by MODIS Aqua through {fireData.observedUntil}, and from{" "}
                {fireData.observedUntil + 1} converted from VIIRS NOAA-20 by the
                harmonization model, with a 95% range.
                {record.overlap && record.overlap.modis > 0 && (
                  <>
                    {" "}
                    Here, from {record.overlap.from} to {record.overlap.to}, VIIRS
                    reported{" "}
                    <span className="num text-ink">
                      {(record.overlap.viirs / record.overlap.modis).toFixed(1)}×
                    </span>{" "}
                    as many hot spots as MODIS Aqua; harmonized, it comes to{" "}
                    <span className="num text-ink">
                      {Math.round(
                        (record.overlap.viirsHarmonized / record.overlap.modis) *
                          100,
                      )}
                      %
                    </span>{" "}
                    of the MODIS count.
                  </>
                )}{" "}
                {count(record.cells)} grid cells
                {record.biomes[0]
                  ? `, ${Math.round(record.biomes[0].share * 100)}% ${record.biomes[0].name}`
                  : ""}
                . Select a year to open its calendar.
              </p>
            </div>
            <HistoryHeatmap
              record={record}
              years={years}
              from={from}
              to={to}
              selectedYear={shownYear}
              selectedMonth={period.slice(0, 7)}
              onSelect={setYear}
              onSelectMonth={(y, m) => onPeriod(stamp(y, m))}
            />
          </section>

          <section
            aria-labelledby="calendar-title"
            className="flex flex-col gap-5"
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex items-center gap-2 text-[0.9375rem] text-dim">
                  <span className="sr-only">Year shown in the calendar</span>
                  <select
                    value={shownYear}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="field num text-lg"
                  >
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
                      Fire season typically runs{" "}
                      {shortDate(summary.criticalPeriod.start)} to{" "}
                      {shortDate(summary.criticalPeriod.end)},{" "}
                      <span className="text-dim">
                        {summary.anomalies.length} unusual{" "}
                        {summary.anomalies.length === 1 ? "day" : "days"} this
                        year
                      </span>
                    </>
                  ) : (
                    "No fire season found in this area"
                  )}
                </h2>
              </div>
              <SegmentedTabs
                label="Calendar source"
                options={MODES}
                value={mode}
                onChange={setMode}
              />
            </div>
            {mode === "VIIRS" && shownYear < VIIRS_YEAR && (
              <p className="rounded-lg bg-canopy p-3 text-[0.9375rem] text-dim">
                The VIIRS NOAA-20 record starts in April {VIIRS_YEAR}. This year
                has no VIIRS detections, so its calendar is empty.
              </p>
            )}
            <FireCalendar
              summary={summary}
              mode={mode}
              selected={selected}
              onSelect={select}
              gridClassName="grid-cols-2 sm:grid-cols-3"
            />
            <CalendarLegend />
          </section>

          {day ? (
            <DayDetail day={day} />
          ) : (
            <p className="text-sm text-dim">
              Select a day in the calendar or sensor chart to inspect its
              figures and detections on the map.
            </p>
          )}

          <section
            aria-labelledby="compare-title"
            className="flex flex-col gap-4"
          >
            <div>
              <h2 id="compare-title" className="text-xl">
                {shownYear}, as each sensor saw it
              </h2>
              <p className="mt-1 max-w-[70ch] text-[0.9375rem] text-dim">
                MODIS Aqua reported{" "}
                <span className="num text-ink">
                  {count(summary.totals.MODIS.detections)}
                </span>{" "}
                detections
                {shownYear >= VIIRS_YEAR ? (
                  <>
                    {" "}
                    and VIIRS NOAA-20{" "}
                    <span className="num text-ink">
                      {count(summary.totals.VIIRS.detections)}
                    </span>
                    . The counts differ because the pixels differ, so each row
                    keeps its own scale.
                  </>
                ) : (
                  <>. VIIRS NOAA-20 was not flying yet.</>
                )}{" "}
                Select a day to inspect it.
              </p>
            </div>
            <SensorCompare
              summary={summary}
              selected={selected}
              onSelect={select}
            />
          </section>
        </div>
      )}

      <section aria-label="Export analysis">
        <div className="flex flex-col gap-2 xl:items-end">
          <p className="text-[0.8125rem] text-dim">
            Download for this area and range
          </p>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <button
              type="button"
              className="btn btn-quiet"
              disabled={
                !record || exporting || rangeMonths > HOTSPOT_CSV_MONTHS
              }
              onClick={exportHotspots}
            >
              {exporting ? "Preparing the file…" : "Grid-cell counts CSV"}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={!record}
              onClick={() =>
                record &&
                download(
                  `${fileBase}_daily.csv`,
                  dailyCsv(record.days.filter((d) => inRange(d.date))),
                  "text/csv",
                )
              }
            >
              Daily series CSV
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={!record}
              onClick={() =>
                record &&
                download(
                  `${fileBase}_monthly.csv`,
                  monthlyCsv(
                    record.months.filter((m) =>
                      inRange(stamp(m.year, m.month)),
                    ),
                  ),
                  "text/csv",
                )
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
                download(
                  `${fileBase}_heatmap.svg`,
                  heatmapSvg(
                    record.months,
                    years,
                    `${areaName}, ${from} to ${to}`,
                  ),
                  "image/svg+xml",
                )
              }
            >
              Heatmap SVG
            </button>
          </div>
          {rangeMonths > HOTSPOT_CSV_MONTHS && (
            <p className="text-[0.8125rem] text-faint">
              The grid-cell file covers up to {HOTSPOT_CSV_MONTHS} months. Narrow
              the range to download it.
            </p>
          )}
        </div>
      </section>

      {!record && !error && (
        <div aria-hidden="true" className="grid gap-[2px]">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="h-7 animate-pulse rounded bg-canopy" />
          ))}
        </div>
      )}
    </div>
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
  const allowed = (y: number, m: number) =>
    (!min || stamp(y, m) >= min) && (!max || stamp(y, m) <= max);
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
      <div
        className="flex gap-2"
        role="group"
        aria-labelledby={`range-${label}`}
      >
        <select
          aria-label={`${label} month`}
          value={month}
          onChange={(e) => set(year, Number(e.target.value))}
          className="field"
        >
          {MONTHS.map((name, m) => (
            <option key={name} value={m} disabled={!allowed(year, m)}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} year`}
          value={year}
          onChange={(e) => set(Number(e.target.value), month)}
          className="field num"
        >
          {ALL_YEARS.filter(
            (y) =>
              (!min || y >= Number(min.slice(0, 4))) &&
              (!max || y <= Number(max.slice(0, 4))),
          ).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
