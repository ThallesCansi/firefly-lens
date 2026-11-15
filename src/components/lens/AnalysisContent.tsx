"use client";

import { Picker } from "@/components/ui/Picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { cellDays } from "@/lib/data/area";
import { fireData } from "@/lib/data/source";
import type { AnalysisArea } from "@/lib/data/types";
import {
  areaGeoJson,
  areaSlug,
  cellDaysCsv,
  dailyCsv,
  download,
  heatmapSvg,
  monthlyCsv,
} from "@/lib/export";
import { MONTHS, count, shortDate } from "@/lib/format";
import type { FireRecord } from "@/lib/harmonize";
import { yearView } from "@/lib/harmonize";
import { useFireRecord } from "@/lib/useFireRecord";
import {
  CalendarLegend,
  FireCalendar,
  type CalendarMode,
} from "./FireCalendar";
import { DayDetail } from "./DayDetail";
import { PagedHistory, againstMedian } from "./HistoryHeatmap";
import { SensorCompare } from "./SensorCompare";
import { AnalyticsReport } from "./analytics/AnalyticsReport";
import { rawPilotFor } from "@/lib/data/coverage";
import { rawCountryCellDaysCsv } from "@/lib/data/raw-pilot";

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

/** Years shown for a range, newest first. */
function useYears(from: string, to: string) {
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  return useMemo(
    () => ALL_YEARS.filter((y) => y >= fromYear && y <= toYear).reverse(),
    [fromYear, toYear],
  );
}

function RecordStatus({
  areaName,
  loading,
  error,
  period,
}: {
  areaName: string;
  loading: boolean;
  error: string | null;
  period?:{start:string;end:string};
}) {
  if (error)
    return (
      <p role="alert" className="rounded-xl bg-canopy p-5">
        {error}
      </p>
    );
  if (!loading) return null;
  return (
    <div role="status" className="flex items-center gap-4 text-[0.9375rem] text-dim">
      <span className="h-1 w-48 overflow-hidden rounded-full bg-bark">
        <span className="block h-full w-1/3 animate-pulse bg-lume" />
      </span>
      Reading {period?.start.slice(0,4) ?? FIRST} to {period?.end.slice(0,4) ?? LAST} for {areaName}
    </div>
  );
}

/**
 * The side panel: every month on record as one heatmap. Selecting a month
 * opens its days; everything else lives in the report below the map.
 */
export function AnalysisCalendar(props: Parameters<typeof HarmonizedAnalysisCalendar>[0]) {
  return <HarmonizedAnalysisCalendar {...props} />;
}

function HarmonizedAnalysisCalendar({
  area,
  period,
  onPeriod,
  from,
  to,
  onReport,
  monthOpen,
  onMonthOpen,
  tourActive = false,
}: {
  area: AnalysisArea;
  period: string;
  onPeriod: (period: string) => void;
  from: string;
  to: string;
  /** Scrolls to the full report under the map. */
  onReport: () => void;
  monthOpen: boolean;
  onMonthOpen: (open: boolean) => void;
  tourActive?: boolean;
}) {
  const { record:cachedRecord, recordArea, loading, error } = useFireRecord(area);
  const record=recordArea?.id===area.id ? cachedRecord : null;
  const setMonthOpen = onMonthOpen;
  const ready = !loading && !error && recordArea?.id === area.id;

  return (
    <div data-tour="analysis-status" data-tour-ready={ready} data-tour-error={error ?? undefined} className={`analysis-content sidebar-calendar ${monthOpen ? "is-month" : ""}`}>
      <RecordStatus areaName={area.name} loading={loading} error={error} period={rawPilotFor(area)?.period} />
      {record && monthOpen ? (
        <MonthDetail
          record={record}
          month={period.slice(0, 7)}
          selected={period.length === 10 ? period : ""}
          onSelect={onPeriod}
          onMonth={onPeriod}
          onBack={() => setMonthOpen(false)}
          tourActive={tourActive}
          ready={ready}
        />
      ) : record ? (
        <div
          data-tour="history"
          data-tour-ready={ready}
          className={`calendar-history transition-opacity duration-200 ${loading ? "opacity-50" : ""}`}
          aria-busy={loading}
        >
          <p className="calendar-intro">Each square is a month. Select one to explore its days.</p>
          <PagedHistory record={record} from={from} to={to} period={period} onPeriod={onPeriod}
            onMonth={(month)=>{ onPeriod(month); setMonthOpen(true); }} />
        </div>
      ) : (
        !error && (
          <div aria-hidden="true" className="grid gap-[2px]">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="h-7 animate-pulse rounded bg-canopy" />
            ))}
          </div>
        )
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button data-tour="open-report" type="button" className="btn btn-primary report-jump" onClick={onReport}>
          See full report below
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
        </button>
        {/* The calendar's own numbers, one press away: the daily series of the area for the range. */}
        <button
          type="button"
          className="btn btn-quiet"
          disabled={!record}
          title={`Daily series of ${area.name}, ${from} to ${to}, as a CSV file`}
          onClick={() =>
            record &&
            download(
              `firefly-lens_${areaSlug(area)}_${from}_${to}_daily.csv`,
              dailyCsv(record.days.filter((d) => d.date.slice(0, 7) >= from && d.date.slice(0, 7) <= to)),
              "text/csv",
            )
          }
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
          </svg>
          <span className="sr-only">Download daily CSV</span>
        </button>
      </div>
    </div>
  );
}

const ARROW = {
  prev: <path d="m15 6-6 6 6 6" />,
  next: <path d="m9 6 6 6-6 6" />,
};

/** One month, day by day, with the chosen day's figures under it. */
function MonthDetail({
  record,
  month,
  selected,
  onSelect,
  onMonth,
  onBack,
  tourActive,
  ready,
}: {
  record: FireRecord;
  /** YYYY-MM */
  month: string;
  selected: string;
  onSelect: (date: string) => void;
  onMonth: (month: string) => void;
  onBack: () => void;
  tourActive: boolean;
  ready: boolean;
}) {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1;
  const [mode, setMode] = useState<CalendarMode>("harmonized");
  const summary = useMemo(() => yearView(record, year), [record, year]);
  const cell = record.months.find((c) => c.year === year && c.month === m);
  const day = summary.days.find((d) => d.date === selected);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (!tourActive) title.current?.focus(); }, [tourActive]);

  const shift = (step: number) => {
    const d = new Date(Date.UTC(year, m + step, 1));
    return stamp(d.getUTCFullYear(), d.getUTCMonth());
  };
  const prev = shift(-1);
  const next = shift(1);
  const sentence = cell ? againstMedian(cell) : null;

  return (
    <div data-tour="month" data-tour-ready={ready} className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="btn btn-text -ml-2" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          All months
        </button>
        <div className="flex gap-1">
          {(["prev", "next"] as const).map((dir) => {
            const target = dir === "prev" ? prev : next;
            const out = target < record.days[0]?.date.slice(0,7) || target > record.days.at(-1)!.date.slice(0,7);
            return (
              <button
                key={dir}
                type="button"
                className="icon-btn"
                disabled={out}
                aria-label={dir === "prev" ? "Previous month" : "Next month"}
                onClick={() => onMonth(target)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {ARROW[dir]}
                </svg>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <h3 ref={title} tabIndex={-1} className="text-2xl outline-none">
          {MONTHS[m]} {year}
        </h3>
        {cell && sentence && (
          <p className="mt-1 text-[0.9375rem] text-dim">
            {sentence[0].toUpperCase() + sentence.slice(1)}
            {" · "}
            {cell.partial ? "incomplete month" : `rank ${cell.rank} of ${cell.rankOf}`}
            {" · "}
            <span className="num text-ink">{count(cell.value)}</span> hot spots
            {cell.source === "modeled" && cell.lo !== null && cell.hi !== null && (
              <>
                , {record.scope ? "parameter range" : "95% range"} <span className="num">{count(cell.lo)}</span>–
                <span className="num">{count(cell.hi)}</span>, estimated from VIIRS
              </>
            )}
          </p>
        )}
      </div>
      <SegmentedTabs label="Calendar source" options={MODES} value={mode} onChange={setMode} />
      {mode === "VIIRS" && month < fireData.viirsStart.slice(0, 7) && (
        <p className="rounded-lg bg-canopy p-3 text-[0.9375rem] text-dim">
          The VIIRS NOAA-20 record starts in April {VIIRS_YEAR}, so this month
          has no VIIRS detections.
        </p>
      )}
      <FireCalendar
        summary={summary}
        mode={mode}
        selected={selected}
        onSelect={onSelect}
        months={[m]}
        gridClassName="grid-cols-1"
        detailed
      />
      <CalendarLegend />
      {day ? (
        <DayDetail day={day} />
      ) : (
        <p className="text-sm text-dim">
          Select a day to see its figures and its detections on the map.
        </p>
      )}
    </div>
  );
}

/**
 * The full report under the map: the range, the year's calendar, the selected
 * day, the two sensors side by side and the downloads.
 */
type ReportProps = {
  area: AnalysisArea;
  period: string;
  onPeriod: (period: string) => void;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  analyticsTab?: "history" | "forecast";
  onAnalyticsTab?: (tab: "history" | "forecast") => void;
};

export function AnalysisReport(props: ReportProps) {
  const covered=rawPilotFor(props.area)?.period;
  return (
    <AnalyticsReport
      tab={props.analyticsTab}
      onTabChange={props.onAnalyticsTab}
      area={props.area}
      period={props.period}
      from={props.from}
      to={props.to}
      controls={
        <div data-tour="range" role="group" aria-label="Date range" className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <MonthPicker label="From" value={props.from} min={covered?.start ?? fireData.firstMonth} max={props.to} onChange={props.onFrom} />
          <MonthPicker label="To" value={props.to} min={props.from} max={covered?.end ?? fireData.lastMonth} onChange={props.onTo} />
          <p className="pb-2 text-[0.8125rem] text-faint">
            History, calendar and downloads use this range. Forecast uses the latest complete origin.
          </p>
        </div>
      }
    >
      <SensorAndCalendarReport {...props} />
    </AnalyticsReport>
  );
}

function SensorAndCalendarReport({
  area,
  period,
  onPeriod,
  from,
  to,
}: {
  area: AnalysisArea;
  period: string;
  onPeriod: (period: string) => void;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}) {
  const country=rawPilotFor(area);
  const observedUntil=country ? 2023 : fireData.observedUntil;
  const year = Number(period.slice(0, 4));
  const setYear = (y: number) => onPeriod(`${y}${period.slice(4, 7)}`);
  const [mode, setMode] = useState<CalendarMode>("harmonized");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { record:cachedRecord, recordArea, loading, error } = useFireRecord(area);
  const record=recordArea?.id===area.id ? cachedRecord : null;
  const shownArea = recordArea ?? area;
  const areaName = area.name;

  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  const shownYear = Math.min(toYear, Math.max(fromYear, year));
  const years = useYears(from, to);
  const summary = useMemo(
    () => (record ? yearView(record, shownYear) : null),
    [record, shownYear],
  );

  const selected = period.length === 10 ? period : "";
  const day = summary?.days.find((d) => d.date === selected);

  const latest = record?.months.find(
    (m) => stamp(m.year, m.month) === period.slice(0, 7),
  );
  const rangeMonths =
    (toYear - fromYear) * 12 +
    Number(to.slice(5, 7)) -
    Number(from.slice(5, 7)) +
    1;
  const fileBase = `firefly-lens_${areaSlug(area)}_${from}_${to}`;

  const exportHotspots = async () => {
    setExporting(true);
    setExportError(null);
    try {
      if (country) {
        const csv=await rawCountryCellDaysCsv(shownArea,`${from}-01`,`${to}-${lastDay(to)}`);
        download(`${fileBase}_raw_country_cell_days.csv`,csv,"text/csv");
        return;
      }
      const rows = await cellDays(shownArea, `${from}-01`, `${to}-${lastDay(to)}`);
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
    <div className="analysis-content flex flex-col gap-12">
      {exportError && (
        <p role="alert" className="text-sm text-ember-4">
          {exportError}
        </p>
      )}
      <RecordStatus areaName={areaName} loading={loading} error={error} period={country?.period} />

      {record && summary && (
        <div
          className={`flex flex-col gap-14 transition-opacity duration-200 ${loading ? "opacity-50" : ""}`}
          aria-busy={loading}
        >
          <section aria-labelledby="history-title" className="flex max-w-[78ch] flex-col gap-3">
            <h3 id="history-title" className="text-2xl md:text-[1.75rem]">
              {latest ? (
                <>
                  {MONTHS[latest.month]} {latest.year}{" "}
                  was {againstMedian(latest)},{" "}
                  <span className="text-dim">
                    {latest.partial
                      ? "incomplete calendar-month coverage"
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
            </h3>
            <p className="text-[0.9375rem] text-dim">
              Counts are hot spots on the MODIS Aqua scale: observed by MODIS
              Aqua through {observedUntil}, and from{" "}
              {observedUntil + 1} converted from VIIRS NOAA-20 by the
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
                    {Math.round((record.overlap.viirsHarmonized / record.overlap.modis) * 100)}%
                  </span>{" "}
                  of the MODIS count.
                </>
              )}{" "}
              {country ? "Entire country; local calibration is not validated" : `${count(record.cells)} grid cells`}
              {record.biomes[0]
                ? `, ${Math.round(record.biomes[0].share * 100)}% ${record.biomes[0].name}`
                : ""}
              .
            </p>
          </section>

          <div className="analysis-report-grid">
            <section aria-labelledby="calendar-title" className="flex min-w-0 flex-col gap-5">
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
                  <h3 id="calendar-title" className="text-xl">
                    {summary.criticalPeriod ? (
                      <>
                        Fire season typically runs {shortDate(summary.criticalPeriod.start)} to{" "}
                        {shortDate(summary.criticalPeriod.end)},{" "}
                        <span className="text-dim">
                          {summary.anomalies.length} unusual{" "}
                          {summary.anomalies.length === 1 ? "day" : "days"} this year
                        </span>
                      </>
                    ) : (
                      "No fire season found in this area"
                    )}
                  </h3>
                </div>
                <SegmentedTabs label="Calendar source" options={MODES} value={mode} onChange={setMode} />
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
                onSelect={onPeriod}
                gridClassName="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
              />
              <CalendarLegend />
            </section>
            <aside aria-label="Selected day" className="analysis-report-day">
              {day ? (
                <DayDetail day={day} />
              ) : (
                <p className="rounded-xl bg-canopy p-5 text-sm text-dim">
                  Select a day in the calendar or the sensor chart to inspect
                  its figures and its detections on the map.
                </p>
              )}
            </aside>
          </div>

          <section aria-labelledby="compare-title" className="flex flex-col gap-4">
            <div>
              <h3 id="compare-title" className="text-xl">
                {shownYear}, as each sensor saw it
              </h3>
              <p className="mt-1 max-w-[70ch] text-[0.9375rem] text-dim">
                MODIS Aqua reported{" "}
                <span className="num text-ink">{count(summary.totals.MODIS.detections)}</span>{" "}
                detections
                {shownYear >= VIIRS_YEAR ? (
                  <>
                    {" "}
                    and VIIRS NOAA-20{" "}
                    <span className="num text-ink">{count(summary.totals.VIIRS.detections)}</span>
                    . The counts differ because the pixels differ, so each row
                    keeps its own scale.
                  </>
                ) : (
                  <>. VIIRS NOAA-20 was not flying yet.</>
                )}{" "}
                Select a day to inspect it.
              </p>
            </div>
            <SensorCompare summary={summary} selected={selected} onSelect={onPeriod} />
          </section>
        </div>
      )}

      <section data-tour="exports" data-tour-ready={!loading && !error && !!record} aria-labelledby="export-title" className="flex flex-col gap-3 border-t border-line pt-8">
        <h3 id="export-title" className="text-lg">
          Download for this area and range
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-quiet"
            disabled={!record || exporting || rangeMonths > HOTSPOT_CSV_MONTHS}
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
                monthlyCsv(record.months.filter((m) => inRange(stamp(m.year, m.month))),country?[2003,2023]:undefined),
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
                heatmapSvg(record.months, years, areaName, {
                  source: fireData.simulated
                    ? "Simulated FIRMS-shaped detections — not observations"
                    : `NASA FIRMS ${country?.name ?? "Brazil"} - MODIS Aqua / VIIRS NOAA-20`,
                  period: `${from} to ${to}`,
                  processing: country ? "Whole-country Level-1 calibration - MODIS Aqua reference - parameter uncertainty only" : "0.25 degree grid - offline NB2 model - MODIS Aqua reference",
                  exportedAt: new Date().toISOString(),
                  from,
                  to,
                }),
                "image/svg+xml",
              )
            }
          >
            Heatmap SVG
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => download(`${fileBase}_area.geojson`, areaGeoJson(area), "application/geo+json")}
          >
            Area GeoJSON
          </button>
        </div>
        {rangeMonths > HOTSPOT_CSV_MONTHS && (
          <p className="text-[0.8125rem] text-faint">
            The grid-cell file covers up to {HOTSPOT_CSV_MONTHS} months. Narrow
            the range to download it.
          </p>
        )}
      </section>
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
        <Picker
          label={`${label} month`}
          value={String(month)}
          options={MONTHS.map((name, m) => ({ value: String(m), label: name, disabled: !allowed(year, m) }))}
          onChange={(v) => set(year, Number(v))}
        />
        <Picker
          label={`${label} year`}
          className="field num"
          value={String(year)}
          options={ALL_YEARS.filter(
            (y) =>
              (!min || y >= Number(min.slice(0, 4))) &&
              (!max || y <= Number(max.slice(0, 4))),
          ).map((y) => ({ value: String(y), label: String(y) }))}
          onChange={(v) => set(Number(v), month)}
        />
      </div>
    </div>
  );
}
