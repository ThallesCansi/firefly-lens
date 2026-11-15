"use client";

import { useEffect, useState } from "react";
import type { AnalysisArea } from "../../../lib/data/types";
import { geometryKey } from "../../../lib/analytics/client";
import { DANGER_CLASSES, fireDangerFor, type DangerData, type DangerForecast } from "../../../lib/analytics/weather";
import { Lume } from "@/components/firefly/Lume";
import { numeric } from "./ScientificChart";

/** "Very high" → "very-high": the class's colour token in analytics.css. */
export const dangerSlug = (danger: string) => danger.toLowerCase().replace(/\s+/g, "-");
/** Low and Moderate read as calm; from High up, FireFlighter is on alert. */
export const isAlarming = (danger: string) => DANGER_CLASSES.indexOf(danger as typeof DANGER_CLASSES[number]) >= 2;

/** The assessment of one area, shared by the report and the side panel. */
export function useFireDanger(area: AnalysisArea, attempt = 0): DangerData | null {
  const key = geometryKey(area.geometry);
  const [state, setState] = useState<{ key: string; attempt: number; data: DangerData } | null>(null);
  useEffect(() => {
    let live = true;
    const publish = (data: DangerData) => { if (live) setState({ key, attempt, data }); };
    fireDangerFor(area.geometry).then(publish).catch(() => publish({
      status: "unavailable", reason: "numeric_weather_could_not_be_verified", index: "FWI", units: "dimensionless", forecasts: [],
    }));
    return () => { live = false; };
  }, [area, key, attempt]);
  return state?.key === key && state.attempt === attempt ? state.data : null;
}

/** The first validity with a value: what "now" means for a summary. */
export const firstForecast = (data: DangerData | null): DangerForecast | undefined =>
  data?.status === "available" ? data.forecasts.find((row) => row.value !== null && row.danger_class) : undefined;

/** A calm forest, or the same forest burning; FireFlighter in front. */
function DangerScene({ alarming }: { alarming: boolean }) {
  const trees = [[18, 64, 1], [44, 70, 0.8], [104, 62, 1.1], [132, 70, 0.85], [152, 66, 0.95]] as const;
  return (
    <svg className="danger-scene" viewBox="0 0 170 96" aria-hidden="true" data-alarming={alarming}>
      <rect className="danger-sky" width="170" height="96" rx="14" />
      {alarming
        ? <g className="danger-smoke"><circle cx="40" cy="22" r="10" /><circle cx="56" cy="16" r="8" /><circle cx="128" cy="20" r="11" /><circle cx="144" cy="13" r="7" /></g>
        : <circle className="danger-sun" cx="142" cy="20" r="8" />}
      <path className="danger-ground" d="M0 78q42-8 85-2t85-4v24H0z" />
      {trees.map(([x, base, s]) => (
        <g key={x} transform={`translate(${x} ${base}) scale(${s})`}>
          <rect className="danger-trunk" x="-1.6" y="-4" width="3.2" height="10" />
          <path className="danger-tree" d="M0-34 12-6H-12z" />
        </g>
      ))}
      {alarming && (
        <g className="danger-flames">
          {[[24, 70], [48, 76], [108, 68], [136, 76], [154, 72]].map(([x, y], i) => (
            <g key={x} transform={`translate(${x} ${y})`} style={{ animationDelay: `${i * 0.17}s` }}>
              <path className="danger-flame-outer" d="M0 0c-8 0-10-8-6-15 1 5 4 5 4 1 0-6 3-10 7-14-1 7 6 10 6 18 0 6-4 10-11 10z" />
              <path className="danger-flame-inner" d="M1 0c-4 0-5-4-3-8 1 2 2 2 2 0 0-3 2-5 4-7 0 4 3 6 3 9 0 4-2 6-6 6z" />
            </g>
          ))}
        </g>
      )}
      <g transform="translate(64 34)">
        <Lume size={46} mood={alarming ? "alert" : "idle"} />
      </g>
    </svg>
  );
}

/** The class scale, the current class marked. */
function DangerScale({ danger }: { danger: string }) {
  return (
    <ol className="danger-scale" aria-label="GWIS fire danger classes">
      {DANGER_CLASSES.map((name) => (
        <li key={name} data-danger={dangerSlug(name)} aria-current={name === danger ? "true" : undefined}>
          <span>{name}</span>
        </li>
      ))}
    </ol>
  );
}

/** The verdict at the top of the assessment: the class, in its colour, and what it looks like. */
export function DangerVerdict({ row }: { row: DangerForecast }) {
  if (row.value === null || !row.danger_class) return null;
  const alarming = isAlarming(row.danger_class);
  return (
    <div className="danger-verdict" data-danger={dangerSlug(row.danger_class)} role="status">
      <DangerScene alarming={alarming} />
      <div className="danger-verdict-text">
        <span className="danger-verdict-label">Fire danger · {row.valid_date ?? row.valid_at?.slice(0, 10)}</span>
        <strong className="danger-badge">{row.danger_class}</strong>
        <p>
          {alarming
            ? "FireFlighter is on alert: weather favours intense, fast-spreading fire here."
            : "FireFlighter is calm: weather does not favour intense fire here."}{" "}
          Area average FWI <span className="num">{numeric(row.value)}</span>.
        </p>
        <DangerScale danger={row.danger_class} />
      </div>
    </div>
  );
}

/** The side panel's one line: today's class, coloured, linking to the full assessment. */
export function DangerChip({ area, onOpen }: { area: AnalysisArea; onOpen?: () => void }) {
  const data = useFireDanger(area);
  const row = firstForecast(data);
  if (!data) return <p className="danger-chip" data-danger="loading" role="status">Checking today’s fire danger…</p>;
  if (!row?.danger_class) return null;
  return (
    <button type="button" className="danger-chip" data-danger={dangerSlug(row.danger_class)} onClick={onOpen}
      title="Open the fire danger assessment in the report">
      <Lume size={22} mood={isAlarming(row.danger_class) ? "alert" : "idle"} />
      <span>Fire danger now</span>
      <strong>{row.danger_class}</strong>
      <span className="num">FWI {numeric(row.value)}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
    </button>
  );
}
