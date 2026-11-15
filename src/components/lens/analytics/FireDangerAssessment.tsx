"use client";

import { useEffect, useState } from "react";
import type { AnalysisArea } from "../../../lib/data/types";
import { geometryKey } from "../../../lib/analytics/client";
import { loadFireDanger, type DangerData } from "../../../lib/analytics/weather";
import { numeric } from "./ScientificChart";

const percent = (value: number) => `${numeric(value * 100)}%`;
export function DangerValues({ data }: { data: DangerData }) {
  const [selection, setSelection] = useState(0);
  const row = data.forecasts[Math.min(selection, Math.max(0, data.forecasts.length - 1))];
  if (data.status === "unavailable" || !row) return (
    <div className="analytics-notice" role="status">
      <strong>Meteorological fire danger unavailable</strong>
      <p>No verified numeric FWI is available for this area and forecast window. Weather values are shown only after a source product passes provenance and coverage checks.</p>
      <small>{data.reason?.replaceAll("_", " ")}</small>
    </div>
  );
  return <>
    <p className="analytics-notice"><strong>{data.product_kind === "experimental_deterministic" ? "NASA GFWED / GEOS-5 · experimental forecast" : "Delayed seasonal forecast · ECMWF SEAS5 / GEFF"}</strong><br />
      {data.product_kind === "experimental_deterministic" ? "Official numeric NASA research product. Validity is a daily local-noon index date; no single UTC validity hour is supplied. This is not the operational Copernicus forecast." : "This product is published behind real time. It is a seasonal outlook, with separate ensemble members; it is not the operational GWIS weather forecast."}</p>
    <label>Validity and member{" "}
      <select className="field" value={selection} onChange={(e) => setSelection(Number(e.target.value))}>
        {data.forecasts.map((r, i) => <option key={`${r.issued_at}:${r.valid_date ?? r.valid_at}:${r.member}`} value={i}>{r.valid_date ?? r.valid_at} · {r.member === "deterministic" ? "deterministic" : `member ${r.member}`}</option>)}
      </select>
    </label>
    <p className="analytics-insight">{row.value === null ? "Numeric weather coverage is missing for this validity and member." : `${row.danger_class} meteorological fire danger on the area average (FWI ${numeric(row.value)}). Local grid cells may have higher danger; inspect the distribution below.`}</p>
    <dl className="analytics-metadata">
      <div><dt>FWI · dimensionless</dt><dd>{numeric(row.value)}</dd></div>
      <div><dt>Highest covered grid cell</dt><dd>{numeric(row.maximum)}</dd></div>
      <div><dt>Selected area with valid data</dt><dd>{percent(row.coverage_fraction)}</dd></div>
      <div><dt>{row.valid_date ? "Forecast initialized · UTC" : "Forecast issued · UTC"}</dt><dd>{row.issued_at}</dd></div>
      <div><dt>{row.valid_date ? "Valid date · local-noon field" : "Valid at · UTC"}</dt><dd>{row.valid_date ?? row.valid_at}</dd></div>
      <div><dt>Lead from original initialization</dt><dd>{row.lead_days !== undefined ? `${row.lead_days} days (date granularity)` : `${row.lead_hours} hours`}</dd></div>
      <div><dt>Grid resolution</dt><dd>{data.resolution_degrees?.latitude}° × {data.resolution_degrees?.longitude}°</dd></div>
      <div><dt>FWI climatological comparison</dt><dd>Unavailable · no provider percentile or anomaly imported</dd></div>
    </dl>
    <div className="analytics-table-scroll"><table>
      <caption>Spatial danger distribution · share of the entire selected polygon</caption>
      <thead><tr><th>GWIS class</th><th>Selected area</th></tr></thead>
      <tbody>{row.distribution.map((d) => <tr key={d.class}><th>{d.class}</th><td>{percent(d.area_fraction)}</td></tr>)}
        <tr><th>Missing numeric coverage</th><td>{percent(Math.max(0, 1-row.coverage_fraction))}</td></tr></tbody>
    </table></div>
    <details><summary>Weather provenance and limitations</summary>
      <p>{data.aggregation}</p><p>Source: {data.provenance?.meteorological_source} · system {data.provenance?.system_version} · retrieved {data.provenance?.retrieved_at}</p>
      <p>SHA-256: <code className="analytics-digest">{data.provenance?.sha256}</code></p>
      <ul>{data.limitations?.map((limit) => <li key={limit}>{limit}</li>)}</ul>
      {data.source && <a href={data.source.url} target="_blank" rel="noreferrer">Official product and licence ↗</a>}
    </details>
  </>;
}

export function FireDangerAssessment({ area }: { area: AnalysisArea }) {
  const key = geometryKey(area.geometry);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; attempt: number; data: DangerData } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    const publish = (data: DangerData) => { if (live) setState({ key, attempt, data }); };
    void loadFireDanger(area.geometry, controller.signal).then(publish).catch(() => publish({
      status: "unavailable", reason: "numeric_weather_could_not_be_verified", index: "FWI", units: "dimensionless", forecasts: [],
    }));
    return () => { live = false; controller.abort(); };
  }, [area, key, attempt]);
  const current = state?.key === key && state.attempt === attempt ? state.data : null;
  return <section className="analytics-card" aria-labelledby="fire-danger-heading">
    <span className="analytics-eyebrow">Meteorological Fire Danger</span>
    <h3 id="fire-danger-heading">Fire Danger Assessment</h3>
    <p>Canadian FWI describes weather conditions that can support fire intensity and spread. It does not predict ignition probability, hotspot counts or risk to people and property.</p>
    {current ? <DangerValues key={`${key}:${attempt}`} data={current} /> : <p role="status">Checking numeric weather coverage…</p>}
    {current?.status === "unavailable" && <button type="button" className="btn btn-quiet" onClick={() => setAttempt((n) => n+1)}>Retry weather assessment</button>}
    <p className="analytics-footnote"><a href="/method#fire-danger-risk">Fire danger methods, classes and limitations ↗</a></p>
  </section>;
}
