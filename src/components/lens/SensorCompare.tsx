"use client";

import { useEffect, useRef, useState } from "react";
import { scaleLinear } from "d3-scale";
import { max } from "d3-array";
import { SENSORS, type Sensor } from "@/lib/data/types";
import type { YearSummary } from "@/lib/harmonize";
import { MONTHS, weekdayDate } from "@/lib/format";

const ROW = 76;
const GAP = 34;
const COLOR: Record<Sensor, string> = { MODIS: "var(--color-modis)", VIIRS: "var(--color-viirs)" };

/**
 * Two small multiples on one time axis. Each sensor keeps its own scale because
 * their counts are not comparable; that is the point the chart makes.
 */
export function SensorCompare({
  summary,
  selected,
  onSelect,
}: {
  summary: YearSummary;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const days = summary.days;
  const step = width / days.length;
  const height = 18 + ROW * 2 + GAP + 24;
  const selectedAt = days.findIndex((d) => d.date === selected);
  const at = hover ?? selectedAt;
  const shown = days[at];

  const pick = (clientX: number) => {
    const left = box.current?.getBoundingClientRect().left ?? 0;
    return Math.min(days.length - 1, Math.max(0, Math.floor((clientX - left) / step)));
  };

  const monthStarts = days.map((d, i) => ({ d, i })).filter(({ d }) => d.date.endsWith("-01"));

  return (
    <div>
      <div ref={box} className="relative" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Shared-grid cells lit per day by MODIS and by VIIRS, ${summary.year}. Each sensor has its own scale.`}
            className="block touch-pan-y text-ink"
            onPointerMove={(e) => setHover(pick(e.clientX))}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => onSelect(days[pick(e.clientX)].date)}
          >
            {SENSORS.map((sensor, row) => {
              const top = row * (ROW + GAP) + 18;
              const peak = max(days, (d) => d.sensors[sensor].cells) ?? 1;
              const y = scaleLinear().domain([0, peak]).range([0, ROW - 18]);
              return (
                <g key={sensor} transform={`translate(0 ${top})`}>
                  <text x={0} y={-6} className="fill-ink text-[0.8125rem] font-medium">
                    {sensor}
                  </text>
                  <text x={52} y={-6} className="fill-faint text-[0.75rem]">
                    cells lit per day · busiest day {peak}
                  </text>
                  <line x1={0} x2={width} y1={ROW - 0.5} y2={ROW - 0.5} stroke="var(--color-line)" />
                  {days.map((d, i) => {
                    const h = y(d.sensors[sensor].cells);
                    if (h <= 0) return null;
                    return (
                      <rect
                        key={d.date}
                        x={i * step + 0.25}
                        y={ROW - 1 - h}
                        width={Math.max(0.6, step - 0.5)}
                        height={h}
                        fill={COLOR[sensor]}
                        opacity={hover === null || hover === i ? 1 : 0.55}
                      />
                    );
                  })}
                </g>
              );
            })}

            {/* month ticks, shared by both rows */}
            {monthStarts.map(({ d, i }) => (
              <text key={d.date} x={i * step + 2} y={height - 6} className="fill-faint text-[0.6875rem]">
                {width < 560 ? MONTHS[Number(d.date.slice(5, 7)) - 1][0] : MONTHS[Number(d.date.slice(5, 7)) - 1].slice(0, 3)}
              </text>
            ))}

            {/* selected day, then the hover crosshair */}
            {selectedAt >= 0 && (
              <line x1={(selectedAt + 0.5) * step} x2={(selectedAt + 0.5) * step} y1={0} y2={height - 24} stroke="var(--color-ink)" strokeWidth={1} />
            )}
            {hover !== null && hover !== selectedAt && (
              <line x1={(hover + 0.5) * step} x2={(hover + 0.5) * step} y1={0} y2={height - 24} stroke="var(--color-faint)" strokeDasharray="2 3" />
            )}
          </svg>
        )}
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.875rem] text-dim" aria-live="polite">
        <span className="text-ink">{shown ? weekdayDate(shown.date) : ""}</span>
        {shown &&
          SENSORS.map((sensor) => (
            <span key={sensor} className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="block size-2.5 rounded-[2px]" style={{ background: COLOR[sensor] }} />
              {sensor} <span className="num text-ink">{shown.sensors[sensor].cells}</span> cells from{" "}
              <span className="num text-ink">{shown.sensors[sensor].detections}</span> detections
            </span>
          ))}
      </p>
    </div>
  );
}
