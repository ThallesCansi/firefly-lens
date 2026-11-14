"use client";

import { useRef, useState } from "react";
import type { FireRecord, Level, MonthCell } from "@/lib/harmonize";
import { MONTHS, count } from "@/lib/format";

const EMBER: Record<Level, string> = {
  0: "var(--color-ember-0)",
  1: "var(--color-ember-1)",
  2: "var(--color-ember-2)",
  3: "var(--color-ember-3)",
  4: "var(--color-ember-4)",
  5: "var(--color-ember-5)",
};

/** How a month compares with the same month in other years, in words. */
export function againstMedian(cell: MonthCell): string {
  if (cell.ratio === null)
    return cell.value > 0
      ? "burning in a month that is usually quiet"
      : "quiet, as usual";
  if (cell.ratio >= 1.05)
    return `${Math.round((cell.ratio - 1) * 100)}% above the ${MONTHS[cell.month]} median`;
  if (cell.ratio <= 0.95)
    return `${Math.round((1 - cell.ratio) * 100)}% below the ${MONTHS[cell.month]} median`;
  return `at the ${MONTHS[cell.month]} median`;
}

/**
 * Every month on record, years down and months across. Colour is how much
 * burned; a ring marks a month at least twice its own median.
 */
export function HistoryHeatmap({
  record,
  years,
  from,
  to,
  selectedYear,
  onSelect,
  onSelectMonth,
  selectedMonth,
}: {
  record: FireRecord;
  /** Years to show, newest first. */
  years: number[];
  /** Months outside this span (YYYY-MM) are dimmed. */
  from: string;
  to: string;
  selectedYear: number;
  onSelect: (year: number) => void;
  onSelectMonth?: (year: number, month: number) => void;
  selectedMonth?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{
    x: number;
    y: number;
    cell: MonthCell;
  } | null>(null);
  const [shown, setShown] = useState(false);

  const byKey = new Map(record.months.map((m) => [`${m.year}:${m.month}`, m]));
  const totals = new Map(record.yearTotals.map((t) => [t.year, t]));
  const top = Math.max(...record.yearTotals.map((t) => t.value), 1);
  const typical = record.yearTotals[0]?.median ?? 0;

  const show = (el: HTMLElement, cell: MonthCell) => {
    const box = root.current?.getBoundingClientRect();
    if (!box) return;
    const r = el.getBoundingClientRect();
    setTip({
      x: Math.min(
        box.width - 130,
        Math.max(130, r.left + r.width / 2 - box.left),
      ),
      y: r.top - box.top - 8,
      cell,
    });
    setShown(true);
  };

  return (
    <div ref={root} className="relative" onPointerLeave={() => setShown(false)}>
      <table className="w-full table-fixed border-separate border-spacing-[2px] text-[0.8125rem]">
        <caption className="sr-only">
          Harmonized burning activity by month and year
        </caption>
        <thead>
          <tr className="text-faint">
            <th scope="col" className="w-12 text-left font-normal">
              <span className="sr-only">Year</span>
            </th>
            {MONTHS.map((m) => (
              <th key={m} scope="col" className="pb-1 text-center font-normal">
                <abbr title={m} className="no-underline">
                  <span className="sm:hidden">{m[0]}</span>
                  <span className="hidden sm:inline">{m.slice(0, 3)}</span>
                </abbr>
              </th>
            ))}
            <th scope="col" className="w-[22%] pb-1 pl-3 text-left font-normal">
              Year total
            </th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => {
            const total = totals.get(year);
            const active = year === selectedYear;
            return (
              <tr key={year}>
                <th scope="row" className="p-0 text-left font-normal">
                  <button
                    type="button"
                    onClick={() => onSelect(year)}
                    aria-pressed={active}
                    className={`num w-full cursor-pointer rounded py-1 text-left transition-colors hover:text-ink ${active ? "text-lume" : "text-dim"}`}
                  >
                    {year}
                  </button>
                </th>
                {MONTHS.map((_, m) => {
                  const cell = byKey.get(`${year}:${m}`);
                  if (!cell) return <td key={m} />;
                  const stamp = `${year}-${String(m + 1).padStart(2, "0")}`;
                  const inRange = stamp >= from && stamp <= to;
                  const high = cell.ratio !== null && cell.ratio >= 2 && !cell.partial;
                  return (
                    <td key={m} className="p-0">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectMonth
                            ? onSelectMonth(year, m)
                            : onSelect(year)
                        }
                        onPointerEnter={(e) => show(e.currentTarget, cell)}
                        onFocus={(e) => show(e.currentTarget, cell)}
                        onBlur={() => setShown(false)}
                        aria-label={`${MONTHS[m]} ${year}: ${againstMedian(cell)}`}
                        aria-pressed={selectedMonth === stamp}
                        className={`relative block h-6 w-full cursor-pointer rounded-[3px] outline-offset-1 transition-[filter] hover:brightness-125 sm:h-7 ${inRange ? "" : "opacity-30"}`}
                        style={{
                          background: EMBER[cell.level],
                          outline:
                            selectedMonth === stamp
                              ? "2px solid var(--color-ink)"
                              : undefined,
                        }}
                      >
                        {high && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-[2px] rounded-[2px] border-[1.5px] border-lume"
                          />
                        )}
                        {cell.source === "modeled" && (
                          <span
                            aria-hidden="true"
                            className="absolute bottom-[3px] right-[3px] block size-[5px] rounded-full bg-ink/80"
                          />
                        )}
                      </button>
                    </td>
                  );
                })}
                <td className="p-0 pl-3">
                  {total && (
                    <span
                      className="relative block h-6 sm:h-7"
                      title={`${year}: ${count(total.value)} hot spots${total.complete ? "" : " (part of the year)"}`}
                    >
                      <span
                        className="absolute inset-y-[5px] left-0 rounded-r-[3px]"
                        style={{
                          width: `${(total.value / top) * 100}%`,
                          background: active
                            ? "var(--color-lume)"
                            : "var(--color-faint)",
                        }}
                      />
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 w-px bg-ink"
                        style={{ left: `${(typical / top) * 100}%` }}
                      />
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.8125rem] text-dim">
        <div className="flex items-center gap-2">
          <span>Less burning</span>
          <span className="flex gap-[2px]" aria-hidden="true">
            {([0, 1, 2, 3, 4, 5] as Level[]).map((l) => (
              <span
                key={l}
                className="block size-4 rounded-[3px]"
                style={{ background: EMBER[l] }}
              />
            ))}
          </span>
          <span>More</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="block size-4 rounded-[3px] border-[1.5px] border-lume"
          />
          <span>At least twice the month&rsquo;s median</span>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-4 w-px bg-ink" />
          <span>Median year</span>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="relative block size-4 rounded-[3px] bg-ember-2">
            <span className="absolute bottom-[3px] right-[3px] block size-[5px] rounded-full bg-ink/80" />
          </span>
          <span>Estimated from VIIRS</span>
        </div>
      </div>

      <div
        className="t-tt"
        role="tooltip"
        data-show={shown}
        style={{
          ["--tt-x" as string]: `${tip?.x ?? 0}px`,
          ["--tt-y" as string]: `${tip?.y ?? 0}px`,
          transform: "translate(-50%, -100%)",
        }}
      >
        {tip && (
          <>
            <span className="block font-medium">
              {MONTHS[tip.cell.month]} {tip.cell.year}
            </span>
            <span className="block">
              {againstMedian(tip.cell)[0].toUpperCase() +
                againstMedian(tip.cell).slice(1)}
            </span>
            <span className="block">
              {tip.cell.partial ? (
                "Month in progress"
              ) : (
                <>
                  Rank <span className="num">{tip.cell.rank}</span> of{" "}
                  <span className="num">{tip.cell.rankOf}</span>
                </>
              )}{" "}
              · <span className="num">{count(tip.cell.value)}</span> hot spots
            </span>
            {tip.cell.source === "modeled" && tip.cell.lo !== null && tip.cell.hi !== null && (
              <span className="block">
                From VIIRS, 95%: <span className="num">{count(tip.cell.lo)}</span>–
                <span className="num">{count(tip.cell.hi)}</span>
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
