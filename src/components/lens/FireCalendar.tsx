"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Sensor } from "@/lib/data/types";
import {
  LEVEL_NAMES,
  inSeason,
  levelOf,
  type DaySummary,
  type Level,
  type YearSummary,
} from "@/lib/harmonize";
import { MONTHS, indexScore, weekdayDate } from "@/lib/format";
import { ScientificInfo } from "@/components/ui/ScientificInfo";

export type CalendarMode = "harmonized" | Sensor;

/** Each day is a point of light: it grows and warms as fire activity rises. */
const DOT_SIZE: Record<Level, string> = {
  0: "16%",
  1: "30%",
  2: "44%",
  3: "58%",
  4: "74%",
  5: "90%",
};
const DOT_COLOR: Record<Level, string> = {
  0: "var(--color-ember-0)",
  1: "var(--color-ember-1)",
  2: "var(--color-ember-2)",
  3: "var(--color-ember-3)",
  4: "var(--color-ember-4)",
  5: "var(--color-ember-5)",
};

export function dayValue(
  day: DaySummary,
  mode: CalendarMode,
): { value: number; level: Level } {
  if (mode === "harmonized") return { value: day.index, level: day.level };
  const s = day.sensors[mode];
  return { value: s.scaled, level: levelOf(s.scaled, s.detections > 0) };
}

export function FireCalendar({
  summary,
  mode,
  selected,
  onSelect,
  months,
  gridClassName = "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6",
}: {
  summary: YearSummary;
  mode: CalendarMode;
  selected: string;
  onSelect: (date: string) => void;
  /** Zero-based months to show; the whole year when omitted. */
  months?: number[];
  /** Column classes for the month blocks. */
  gridClassName?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  const [tip, setTip] = useState<{
    x: number;
    y: number;
    day: DaySummary;
  } | null>(null);
  const [tipShown, setTipShown] = useState(false);

  const blocks = useMemo(() => {
    const byMonth: DaySummary[][] = Array.from({ length: 12 }, () => []);
    for (const day of summary.days)
      byMonth[Number(day.date.slice(5, 7)) - 1].push(day);
    return (months ?? byMonth.map((_, i) => i)).map((m) => {
      const first = new Date(`${byMonth[m][0].date}T00:00:00Z`).getUTCDay();
      return { month: m, days: byMonth[m], offset: (first + 6) % 7 };
    });
  }, [summary, months]);

  const visible = useMemo(() => blocks.flatMap((b) => b.days), [blocks]);
  const season = summary.criticalPeriod;
  const focusDate = visible.some((d) => d.date === selected)
    ? selected
    : visible[0]?.date;

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    root.current
      ?.querySelector<HTMLElement>(`[data-date="${selected}"]`)
      ?.focus();
  }, [selected]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      PageUp: -28,
      PageDown: 28,
    }[e.key];
    if (!step) return;
    e.preventDefault();
    const at = visible.findIndex((d) => d.date === focusDate);
    const next = visible[Math.min(visible.length - 1, Math.max(0, at + step))];
    if (next && next.date !== selected) {
      moveFocus.current = true;
      onSelect(next.date);
    }
  };

  const showTip = (el: HTMLElement, day: DaySummary) => {
    const box = root.current?.getBoundingClientRect();
    if (!box) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(
      box.width - 96,
      Math.max(96, r.left + r.width / 2 - box.left),
    );
    setTip({ x, y: r.top - box.top - 8, day });
    setTipShown(true);
  };

  const tipValue = tip ? dayValue(tip.day, mode) : null;

  return (
    <div
      ref={root}
      className="relative"
      onPointerLeave={() => setTipShown(false)}
    >
      <div
        role="grid"
        aria-label={`Fire activity by day, ${summary.year}`}
        onKeyDown={onKeyDown}
        className={`grid gap-x-5 gap-y-6 ${gridClassName}`}
      >
        {blocks.map(({ month, days, offset }) => (
          <div key={month} role="rowgroup">
            <h3 className="mb-2 font-sans text-[0.8125rem] font-medium tracking-normal text-dim">
              {MONTHS[month]}
            </h3>
            <div className="grid grid-cols-7" role="row">
              {Array.from({ length: offset }, (_, i) => (
                <span key={`pad-${i}`} aria-hidden="true" />
              ))}
              {days.map((day) => {
                const { level } = dayValue(day, mode);
                const seasonal = inSeason(season, day.date);
                const isSelected = day.date === selected;
                return (
                  <button
                    key={day.date}
                    type="button"
                    role="gridcell"
                    data-date={day.date}
                    tabIndex={day.date === focusDate ? 0 : -1}
                    aria-selected={isSelected}
                    aria-label={`${weekdayDate(day.date)}: ${LEVEL_NAMES[level]}${day.anomaly ? ", unusual burning" : ""}`}
                    onClick={() => onSelect(day.date)}
                    onPointerEnter={(e) => showTip(e.currentTarget, day)}
                    onFocus={(e) => showTip(e.currentTarget, day)}
                    onBlur={() => setTipShown(false)}
                    className={`group relative grid aspect-square cursor-pointer place-items-center outline-offset-0 ${seasonal ? "bg-bark" : ""}`}
                  >
                    <span
                      aria-hidden="true"
                      className="calendar-dot block aspect-square rounded-full transition-[width,background-color] duration-300 ease-out-expo group-hover:brightness-125"
                      style={{
                        width: DOT_SIZE[level],
                        background: DOT_COLOR[level],
                      }}
                    />
                    {day.anomaly && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-[6%] rounded-full border-[1.5px] border-lume"
                      />
                    )}
                    {isSelected && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 rounded-[3px] border-2 border-ink"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div
        className="t-tt"
        role="tooltip"
        data-show={tipShown}
        style={{
          ["--tt-x" as string]: `${tip?.x ?? 0}px`,
          ["--tt-y" as string]: `${tip?.y ?? 0}px`,
          transform: "translate(-50%, -100%)",
        }}
      >
        {tip && tipValue && (
          <>
            <span className="block font-medium">
              {weekdayDate(tip.day.date)}
            </span>
            <span className="block">
              {LEVEL_NAMES[tipValue.level]} ·{" "}
              <span className="num">{indexScore(tipValue.value)}</span>
              {tip.day.anomaly ? " · unusual" : ""}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** The key to the calendar's light. */
export function CalendarLegend() {
  const levels: Level[] = [0, 1, 2, 3, 4, 5];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.8125rem] text-dim">
      <div className="flex items-center gap-2">
        <span>No fire</span>
        <span className="flex items-center gap-1" aria-hidden="true">
          {levels.map((l) => (
            <span key={l} className="grid size-5 place-items-center">
              <span
                className="calendar-dot block aspect-square rounded-full"
                style={{ width: DOT_SIZE[l], background: DOT_COLOR[l] }}
              />
            </span>
          ))}
        </span>
        <span>Extreme</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="block size-4 rounded-full border-[1.5px] border-lume"
        />
        <span>
          Unusual burning <ScientificInfo concept="anomaly" />
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="block size-4 bg-bark ring-1 ring-line"
        />
        <span>Typical fire season</span>
      </div>
    </div>
  );
}
