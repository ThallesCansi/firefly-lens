"use client";

import { useId, useState } from "react";

export interface PlotPoint {
  label: string;
  value: number | null;
  lower?: number | null;
  upper?: number | null;
  note?: string;
  partial?: boolean;
}
export interface PlotSeries {
  label: string;
  kind?: "observed" | "estimated" | "forecast" | "reference";
  points: PlotPoint[];
}
export const numeric = (value: number | null | undefined) =>
  value == null
    ? "Unavailable"
    : new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);

/** Display geometry only. Every plotted statistic and bound is supplied by Python. */
export function ScientificChart({
  title,
  description,
  unit,
  series,
  bars = false,
  forecastStart,
}: {
  title: string;
  description: string;
  unit: string;
  series: PlotSeries[];
  bars?: boolean;
  forecastStart?: string;
}) {
  const id = useId();
  const [active, setActive] = useState(0);
  const points = series[0]?.points ?? [];
  const values = series
    .flatMap((s) => s.points.flatMap((p) => [p.value, p.lower, p.upper]))
    .filter((v): v is number => v != null && Number.isFinite(v));
  const low = Math.min(0, ...values),
    high = Math.max(1, ...values);
  const x = (i: number) => 70 + (i * 790) / Math.max(1, points.length - 1);
  const y = (v: number) => 235 - ((v - low) * 210) / (high - low);
  const selected = Math.min(active, Math.max(0, points.length - 1));
  const boundary = forecastStart
    ? points.findIndex((p) => p.label === forecastStart)
    : -1;
  function line(ps: PlotPoint[]) {
    let pen = false;
    return ps
      .map((p, i) => {
        if (p.value == null || p.partial) {
          pen = false;
          return "";
        }
        const command = `${pen ? "L" : "M"}${x(i)},${y(p.value)}`;
        pen = true;
        return command;
      })
      .join(" ");
  }
  // Separate polygons prevent missing bounds from being bridged.
  function bands(ps: PlotPoint[]) {
    const segments: number[][] = [];
    let segment: number[] = [];
    ps.forEach((p, i) => {
      if (p.lower != null && p.upper != null && !p.partial) segment.push(i);
      else if (segment.length) {
        segments.push(segment);
        segment = [];
      }
    });
    if (segment.length) segments.push(segment);
    return segments.map((indices) =>
      indices
        .map((i) => `${x(i)},${y(ps[i].upper!)}`)
        .concat([...indices].reverse().map((i) => `${x(i)},${y(ps[i].lower!)}`))
        .join(" "),
    );
  }
  return (
    <figure className="analytics-chart" aria-labelledby={`${id}-title`}>
      <figcaption>
        <h4 id={`${id}-title`}>{title}</h4>
        <p>{description}</p>
      </figcaption>
      {!values.length ? (
        <p className="analytics-notice">
          No eligible values in this range. Missing values are not zero.
        </p>
      ) : (
        <>
          <div className="analytics-plot-scroll">
            <svg
              viewBox="0 0 900 275"
              role="img"
              aria-labelledby={`${id}-svg-title ${id}-desc`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  setActive(
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? points.length - 1
                        : Math.max(
                            0,
                            Math.min(
                              points.length - 1,
                              selected + (e.key === "ArrowRight" ? 1 : -1),
                            ),
                          ),
                  );
                }
              }}
              onPointerMove={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                setActive(
                  Math.max(
                    0,
                    Math.min(
                      points.length - 1,
                      Math.round(
                        ((((e.clientX - box.left) * 900) / box.width - 70) *
                          Math.max(1, points.length - 1)) /
                          790,
                      ),
                    ),
                  ),
                );
              }}
            >
              <title id={`${id}-svg-title`}>{`${title} — ${unit}`}</title>
              <desc id={`${id}-desc`}>
                Use left and right arrows to inspect values. Full values are in
                the table below. Gaps mean unavailable; isolated hollow points
                are partial periods.
              </desc>
              {[0, 0.5, 1].map((p) => {
                const value = low + p * (high - low);
                return (
                  <g key={p}>
                    <line
                      x1="70"
                      x2="860"
                      y1={y(value)}
                      y2={y(value)}
                      className="analytics-gridline"
                    />
                    <text x="60" y={y(value) + 4} textAnchor="end">
                      {new Intl.NumberFormat("en", {
                        notation: "compact",
                        maximumFractionDigits: 1,
                      }).format(value)}
                    </text>
                  </g>
                );
              })}
              {series.map((s) => (
                <g
                  key={s.label}
                  className={`analytics-series analytics-series-${s.kind ?? "observed"}`}
                >
                  {bands(s.points).map((polygon, i) => (
                    <polygon
                      key={i}
                      points={polygon}
                      className="analytics-band"
                    />
                  ))}
                  {!bars && (
                    <path
                      d={line(s.points)}
                      fill="none"
                      className="analytics-line"
                    />
                  )}
                  {s.points.map((p, i) =>
                    p.value == null ? null : bars ? (
                      <rect
                        key={i}
                        x={
                          x(i) - Math.max(1, Math.min(15, 320 / points.length))
                        }
                        width={Math.max(2, Math.min(30, 640 / points.length))}
                        y={Math.min(y(0), y(p.value))}
                        height={Math.max(1, Math.abs(y(p.value) - y(0)))}
                        className={
                          p.value < 0
                            ? "analytics-negative"
                            : "analytics-positive"
                        }
                      />
                    ) : (
                      (p.partial || points.length < 30) && (
                        <circle
                          key={i}
                          cx={x(i)}
                          cy={y(p.value)}
                          r="3"
                          className={
                            p.partial ? "analytics-partial" : "analytics-point"
                          }
                        />
                      )
                    ),
                  )}
                </g>
              ))}
              {boundary >= 0 && (
                <g>
                  <line
                    x1={x(boundary)}
                    x2={x(boundary)}
                    y1="25"
                    y2="235"
                    className="analytics-forecast-boundary"
                  />
                  <text x={x(boundary) - 6} y="18" textAnchor="end">
                    Forecast horizon →
                  </text>
                </g>
              )}
              {points.length > 0 && (
                <line
                  x1={x(selected)}
                  x2={x(selected)}
                  y1="25"
                  y2="235"
                  className="analytics-cursor"
                />
              )}
              {points
                .filter(
                  (_, i) =>
                    i === 0 ||
                    i === points.length - 1 ||
                    (points.length > 12 && i === Math.floor(points.length / 2)),
                )
                .map((p) => (
                  <text
                    key={p.label}
                    x={x(points.indexOf(p))}
                    y="260"
                    textAnchor="middle"
                  >
                    {p.label}
                  </text>
                ))}
            </svg>
          </div>
          <div className="analytics-readout" aria-live="polite">
            <strong>{points[selected]?.label}</strong>
            {series.map((s) => {
              const p = s.points[selected];
              return (
                <span key={s.label}>
                  {s.label}: {numeric(p?.value)} {unit}
                  {p?.lower != null && p.upper != null
                    ? ` [${numeric(p.lower)}–${numeric(p.upper)}]`
                    : ""}
                  {p?.note ? ` · ${p.note}` : ""}
                </span>
              );
            })}
          </div>
        </>
      )}
      <div className="analytics-legend">
        {series.map((s) => (
          <span
            key={s.label}
            className={`${bars ? "" : "analytics-key"} analytics-series-${s.kind ?? "observed"}`}
          >
            {s.label}
          </span>
        ))}
        {bars ? (
          <span>Orange: above reference · Blue: below reference</span>
        ) : (
          <span>Hollow point: partial · shaded area: stated interval</span>
        )}
      </div>
      <details>
        <summary>View chart data</summary>
        <div className="analytics-table-scroll">
          <table>
            <caption>
              {title} · {unit}
            </caption>
            <thead>
              <tr>
                <th>Period</th>
                {series.map((s) => (
                  <th key={s.label}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={p.label}>
                  <th>{p.label}</th>
                  {series.map((s) => {
                    const v = s.points[i];
                    return (
                      <td key={s.label}>
                        {numeric(v?.value)}
                        {v?.lower != null && v.upper != null
                          ? ` [${numeric(v.lower)}, ${numeric(v.upper)}]`
                          : ""}
                        {v?.note ? ` · ${v.note}` : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
