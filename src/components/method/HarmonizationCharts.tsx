"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import data from "../../../public/method/evidence/harmonization-charts.json";

/* Native renderings of the four Stage 7 validation figures. Values come unchanged from
   harmonization-charts.json, exported by harmonization/pipeline/export_method_charts.py. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const toIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const monthLabel = (t: number) => `${MONTHS[t % 12]} ${Math.floor(t / 12)}`;
const count = (v: number) => Math.round(v).toLocaleString("en-US");
const compact = (v: number) =>
  v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}k` : `${v}`;
const percent = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;

function useWidth(initial: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 40) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Up to `target` round ticks covering [min, max]. */
function niceTicks(min: number, max: number, target: number) {
  const raw = (max - min) / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 2; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

type Series = { key: string; label: string; className: string; months: string[]; values: (number | null)[] };
type Band = { label: string; months: string[]; lo: number[]; hi: number[] };
type Mark = { month: string; label: string };

/** Paths split wherever a month is missing, so excluded months show as gaps, not interpolations. */
function segments(points: { t: number; v: number | null }[]) {
  const runs: { t: number; v: number }[][] = [];
  let run: { t: number; v: number }[] = [];
  let last = -Infinity;
  for (const p of points) {
    if (p.v === null || !Number.isFinite(p.v) || p.t !== last + 1) {
      if (run.length) runs.push(run);
      run = [];
    }
    if (p.v !== null && Number.isFinite(p.v)) run.push({ t: p.t, v: p.v });
    last = p.t;
  }
  if (run.length) runs.push(run);
  return runs;
}

function TimeChart({ title, desc, series, band, scale, format, markers = [], circled = [], zero = false, unit, height = 300 }: {
  title: string; desc: string; series: Series[]; band?: Band; scale: "log" | "linear";
  format: (v: number) => string; markers?: Mark[]; circled?: (Mark & { series: string })[]; zero?: boolean; unit: string; height?: number;
}) {
  const id = useId();
  const [ref, width] = useWidth(720);
  const [active, setActive] = useState<number | null>(null);
  const m = { top: 30, right: 14, bottom: 28, left: 50 };
  const w = width - m.left - m.right;
  const h = height - m.top - m.bottom;

  const lookup = useMemo(() => series.map((s) => new Map(s.months.map((ym, i) => [toIndex(ym), s.values[i]]))), [series]);
  const bandLookup = useMemo(() => band && new Map(band.months.map((ym, i) => [toIndex(ym), [band.lo[i], band.hi[i]] as const])), [band]);
  const times = useMemo(() => [...new Set(series.flatMap((s) => s.months.map(toIndex)))].sort((a, b) => a - b), [series]);
  const t0 = times[0], t1 = times.at(-1)!;
  const values = [...series.flatMap((s) => s.values), ...(band ? [...band.lo, ...band.hi] : [])]
    .filter((v): v is number => v !== null && Number.isFinite(v) && (scale === "linear" || v > 0));
  const lo = Math.min(...values), hi = Math.max(...values);

  let y: (v: number) => number;
  let ticks: number[];
  if (scale === "log") {
    const a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi));
    ticks = Array.from({ length: b - a + 1 }, (_, i) => 10 ** (a + i));
    y = (v) => m.top + h - ((Math.log10(Math.max(v, 10 ** a)) - a) / (b - a)) * h;
  } else {
    ticks = niceTicks(Math.min(0, lo), hi, h < 200 ? 4 : 5);
    const a = ticks[0], b = ticks.at(-1)!;
    y = (v) => m.top + h - ((v - a) / (b - a)) * h;
  }
  const x = (t: number) => m.left + ((t - t0) / (t1 - t0)) * w;
  const y0 = Math.floor(t0 / 12), y1 = Math.floor(t1 / 12);
  const yearStep = [1, 2, 3, 4, 5, 10].find((s) => (w / ((t1 - t0) / 12)) * s >= 46) ?? 10;
  const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).filter((yr) => yr * 12 >= t0 && yr % yearStep === 0);

  const line = (run: { t: number; v: number }[]) => run.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const bandPaths = band ? segments(band.months.map((ym, i) => ({ t: toIndex(ym), v: i }))).map((run) => {
    const top = run.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(band.hi[p.v]).toFixed(1)}`).join("");
    const bottom = [...run].reverse().map((p) => `L${x(p.t).toFixed(1)},${y(band.lo[p.v]).toFixed(1)}`).join("");
    return `${top}${bottom}Z`;
  }) : [];

  const nearest = (px: number) => {
    const t = t0 + ((px - m.left) / w) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - t) < Math.abs(times[best] - t)) best = i;
    return best;
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setActive(nearest(((e.clientX - box.left) / box.width) * width));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "PageUp" ? 12 : e.key === "PageDown" ? -12 : 0;
    if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(times.length - 1);
    else if (e.key === "Escape") setActive(null);
    else if (step) setActive((i) => Math.min(times.length - 1, Math.max(0, (i ?? times.length - 1) + step)));
    else return;
    e.preventDefault();
  };

  const t = active === null ? null : times[active];
  const rows = t === null ? [] : [
    ...series.map((s, i) => ({ s, v: lookup[i].get(t) })).filter((r) => r.v !== undefined && r.v !== null)
      .map(({ s, v }) => ({ key: s.key, label: s.label, className: s.className, text: format(v as number) })),
    ...(band && bandLookup?.get(t) ? [{ key: "band", label: "95% band", className: "swatch-band", text: `${format(bandLookup.get(t)![0])} – ${format(bandLookup.get(t)![1])}` }] : []),
  ];
  const summary = t === null ? "" : `${monthLabel(t)}: ${rows.map((r) => `${r.label} ${r.text}`).join("; ")}`;

  return (
    <div className="hchart" ref={ref}>
      <div tabIndex={0} role="group" aria-label={`${title}. Use the left and right arrow keys to read monthly values.`}
        onKeyDown={onKey} onBlur={() => setActive(null)} className="hchart-focus">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-t ${id}-d`}
          className="hchart-svg" onPointerMove={onMove} onPointerLeave={() => setActive(null)}>
          <title id={`${id}-t`}>{title}</title>
          <desc id={`${id}-d`}>{desc}</desc>
          {ticks.map((v) => <g key={v}>
            <line x1={m.left} x2={width - m.right} y1={y(v)} y2={y(v)} className={zero && v === 0 ? "chart-zero" : "chart-grid"} />
            <text x={m.left - 8} y={y(v) + 4} textAnchor="end">{format === percent ? `${v}%` : compact(v)}</text>
          </g>)}
          {years.map((yr) => <text key={yr} x={x(yr * 12)} y={height - 8} textAnchor="middle">{yr}</text>)}
          <text x={m.left} y={14} className="hchart-unit">{unit}</text>
          {bandPaths.map((d, i) => <path key={i} d={d} className="hchart-band" />)}
          {series.map((s) => segments(s.months.map((ym, i) => ({ t: toIndex(ym), v: s.values[i] }))).map((run, i) =>
            run.length === 1
              ? <circle key={`${s.key}${i}`} cx={x(run[0].t)} cy={y(run[0].v)} r={2} className={`hchart-dot ${s.className}`} />
              : <path key={`${s.key}${i}`} d={line(run)} className={`hchart-line ${s.className}`} />))}
          {markers.map((mk) => {
            const mx = x(toIndex(mk.month) - 0.5);
            const right = mx + 8 + mk.label.length * 6.8 > width - m.right; // 11px mono ≈ 6.6px per glyph
            return <g key={mk.month}>
              <line x1={mx} x2={mx} y1={m.top - 6} y2={m.top + h} className="chart-reference" />
              <text x={mx + (right ? -6 : 6)} y={m.top + 6} textAnchor={right ? "end" : "start"} className="hchart-note">{mk.label}</text>
            </g>;
          })}
          {circled.map((c) => {
            const s = series.findIndex((ss) => ss.key === c.series);
            const v = lookup[s].get(toIndex(c.month));
            if (v === undefined || v === null) return null;
            const cx = x(toIndex(c.month)), cy = y(v);
            return <g key={c.month}>
              <circle cx={cx} cy={cy} r={6} className="hchart-ring" />
              <text x={cx + 10} y={cy + 4} className="hchart-note">{c.label}</text>
            </g>;
          })}
          {t !== null && <g aria-hidden="true">
            <line x1={x(t)} x2={x(t)} y1={m.top} y2={m.top + h} className="hchart-crosshair" />
            {series.map((s, i) => {
              const v = lookup[i].get(t);
              return v === undefined || v === null ? null : <circle key={s.key} cx={x(t)} cy={y(v)} r={4} className={`hchart-focus-dot ${s.className}`} />;
            })}
          </g>}
        </svg>
        {t !== null && (
          <div className="hchart-tooltip" aria-hidden="true"
            style={x(t) > width / 2 ? { right: width - x(t) + 12 } : { left: x(t) + 12 }}>
            <strong>{monthLabel(t)}</strong>
            {rows.map((r) => <span key={r.key}><i className={`hchart-swatch ${r.className}`} />{r.label}<b>{r.text}</b></span>)}
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{summary}</p>
    </div>
  );
}

function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <p className="evidence-legend hchart-legend">
      {items.map((it) => <span key={it.label}><i className={`hchart-swatch ${it.className}`} />{it.label}</span>)}
    </p>
  );
}

const observed = data.observed;
const harmonized = data.harmonized;
const aqua: Series = { key: "aqua", label: "Observed Aqua", className: "swatch-aqua", months: observed.month, values: observed.aqua };
const raw: Series = { key: "raw", label: "Raw NOAA-20 VIIRS", className: "swatch-raw", months: observed.month, values: observed.viirsRaw };
const l2: Series = { key: "l2", label: "Harmonized (L2)", className: "swatch-l2", months: harmonized.month, values: harmonized.l2 };
const band: Band = { label: "95% simulation band", months: harmonized.month, lo: harmonized.lo, hi: harmonized.hi };
const calibrationEnd: Mark = { month: data.calibrationEnd, label: "End of calibration" };
const since2018 = (s: Series): Series => {
  const from = s.months.findIndex((ym) => ym >= "2018-01");
  return { ...s, months: s.months.slice(from), values: s.values.slice(from) };
};

export function BrazilSeriesChart() {
  return (
    <>
      <Legend items={[{ label: aqua.label, className: aqua.className }, { label: raw.label, className: raw.className },
        { label: l2.label, className: l2.className }, { label: band.label, className: "swatch-band" }]} />
      <TimeChart title="Brazil monthly hot spots, 2003–2026, logarithmic axis"
        desc={`Monthly Brazil totals from January 2003 to ${monthLabel(toIndex(observed.month.at(-1)!))}: observed MODIS Aqua, raw NOAA-20 VIIRS from 2018, and the held-out Level 2 harmonized prediction with its 95% simulation band. Raw VIIRS runs several times higher than Aqua; the harmonized prediction lies close to Aqua. Gaps mark the two outage months excluded from evaluation.`}
        series={[raw, aqua, l2]} band={band} scale="log" format={count} markers={[calibrationEnd]} unit="Hot spots per month (log scale)" />
    </>
  );
}

export function BrazilZoomChart() {
  return (
    <>
      <Legend items={[{ label: aqua.label, className: aqua.className }, { label: l2.label, className: l2.className },
        { label: band.label, className: "swatch-band" }]} />
      <TimeChart title="Observed Aqua and harmonized VIIRS in Brazil, 2018–2026, linear axis"
        desc="Monthly Brazil totals since 2018: observed MODIS Aqua and the held-out Level 2 prediction with its 95% simulation band. A dashed line marks the end of calibration in January 2024; after it, predictions run above Aqua."
        series={[since2018(aqua), l2]} band={band} scale="linear" format={count} markers={[calibrationEnd]} unit="Hot spots per month" />
    </>
  );
}

export function ResidualsChart() {
  const r = data.residuals;
  const l1s: Series = { key: "l1", label: "Level 1", className: "swatch-l1", months: r.month, values: r.l1 };
  const l2s: Series = { key: "l2", label: "Level 2", className: "swatch-l2", months: r.month, values: r.l2 };
  return (
    <>
      <Legend items={[{ label: "Level 1", className: "swatch-l1" }, { label: "Level 2", className: "swatch-l2" },
        { label: "Aqua outage month", className: "swatch-ring" }]} />
      <TimeChart title="Brazil-wide monthly residuals, predicted / observed − 1"
        desc={`Residuals in percent for Level 1 and Level 2, ${monthLabel(toIndex(r.month[0]))} to ${monthLabel(toIndex(r.month.at(-1)!))}. Residuals stay near zero during calibration and turn negative after January 2024. The ${data.outageMonths.join(" and ")} outage months are circled.`}
        series={[l1s, l2s]} scale="linear" format={percent} zero markers={[calibrationEnd]} unit="Predicted / observed − 1"
        circled={data.outageMonths.map((month) => ({ month, label: "Outage", series: "l2" }))} height={280} />
    </>
  );
}

function BiomePanel({ biome, size }: { biome: (typeof data.biomes)[number]; size: number }) {
  const id = useId();
  const m = { top: 24, right: 10, bottom: 22, left: 38 };
  const w = size - m.left - m.right;
  const h = size - 18 - m.top - m.bottom;
  const all = [...biome.observed, ...biome.predicted].map((v) => v + 1);
  // Same per-panel limits as the pipeline figure: 0.6 × smallest and 1.5 × largest value.
  const lo = Math.log10(Math.max(0.8, Math.min(...all) * 0.6)), hi = Math.log10(Math.max(...all) * 1.5);
  const sx = (v: number) => m.left + ((Math.log10(v + 1) - lo) / (hi - lo)) * w;
  const sy = (v: number) => m.top + h - ((Math.log10(v + 1) - lo) / (hi - lo)) * h;
  const decades = Array.from({ length: Math.floor(hi) - Math.ceil(lo) + 1 }, (_, i) => 10 ** (Math.ceil(lo) + i));
  const step = decades.length > 4 ? 2 : 1;
  const ticks = decades.filter((_, i) => i % step === (decades.length - 1) % step);
  const later = biome.loyo.filter((l) => !l).length;
  return (
    <svg width={size} height={size - 18} viewBox={`0 0 ${size} ${size - 18}`} role="img" aria-labelledby={`${id}-t ${id}-d`} className="hchart-svg">
      <title id={`${id}-t`}>{`${biome.biome}: observed versus predicted biome-month totals`}</title>
      <desc id={`${id}-d`}>{`${biome.loyo.length - later} leave-one-year-out months (2018–2023) and ${later} later months (2024–2026), log(count + 1) axes, with the 1:1 diagonal.`}</desc>
      <text x={m.left} y={14} className="hchart-panel-title">{biome.biome}</text>
      {ticks.map((v) => <g key={v}>
        <line x1={m.left} x2={m.left + w} y1={m.top + h - ((Math.log10(v) - lo) / (hi - lo)) * h} y2={m.top + h - ((Math.log10(v) - lo) / (hi - lo)) * h} className="chart-grid" />
        <line y1={m.top} y2={m.top + h} x1={m.left + ((Math.log10(v) - lo) / (hi - lo)) * w} x2={m.left + ((Math.log10(v) - lo) / (hi - lo)) * w} className="chart-grid" />
        <text x={m.left - 6} y={m.top + h - ((Math.log10(v) - lo) / (hi - lo)) * h + 4} textAnchor="end">{compact(v)}</text>
        <text x={m.left + ((Math.log10(v) - lo) / (hi - lo)) * w} y={m.top + h + 16} textAnchor="middle">{compact(v)}</text>
      </g>)}
      <line x1={m.left} y1={m.top + h} x2={m.left + w} y2={m.top} className="hchart-diagonal" />
      {[true, false].map((loyo) => biome.month.map((ym, i) => biome.loyo[i] !== loyo ? null : (
        loyo
          ? <circle key={ym} cx={sx(biome.observed[i])} cy={sy(biome.predicted[i])} r={3.5} className="hchart-point swatch-loyo">
              <title>{`${monthLabel(toIndex(ym))} (LOYO): observed ${count(biome.observed[i])}, predicted ${count(biome.predicted[i])}`}</title>
            </circle>
          : <rect key={ym} x={sx(biome.observed[i]) - 3.5} y={sy(biome.predicted[i]) - 3.5} width={7} height={7} rx={1}
              transform={`rotate(45 ${sx(biome.observed[i])} ${sy(biome.predicted[i])})`} className="hchart-point swatch-later">
              <title>{`${monthLabel(toIndex(ym))} (later): observed ${count(biome.observed[i])}, predicted ${count(biome.predicted[i])}`}</title>
            </rect>
      )))}
    </svg>
  );
}

export function BiomeScatterChart() {
  const [ref, width] = useWidth(960);
  const cols = width >= 600 ? 3 : 2;
  const gap = 12;
  const size = Math.floor((width - gap * (cols - 1)) / cols);
  return (
    <>
      <Legend items={[{ label: "2018–2023 · leave-one-year-out", className: "swatch-loyo" }, { label: "2024–2026 · later comparison", className: "swatch-later" },
        { label: "1:1 line", className: "swatch-diagonal" }]} />
      <p className="hchart-axes-note">Horizontal: observed Aqua + 1. Vertical: Level 2 prediction + 1. Both axes logarithmic; each panel has its own range.</p>
      <div className="hchart hchart-grid" ref={ref} style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)`, gap }}>
        {data.biomes.map((b) => <BiomePanel key={b.biome} biome={b} size={size} />)}
      </div>
    </>
  );
}
