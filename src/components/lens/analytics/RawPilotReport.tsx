"use client";
import { useEffect, useState } from "react";
import type { AnalysisArea } from "../../../lib/data/types";
import { loadRawPilot, type RawPilot } from "../../../lib/data/raw-pilot";
import { ScientificChart, numeric } from "./ScientificChart";
import { FireDangerAssessment } from "./FireDangerAssessment";
import "./analytics.css";
import { rawPilotFor } from "../../../lib/data/coverage";

export function RawPilotReport({ area, period, onPeriod, compact = false, onReport }: {
  area: AnalysisArea; period: string; onPeriod?: (period: string) => void; compact?: boolean; onReport?: () => void;
}) {
  const [state, setState] = useState<{ id: string; data?: RawPilot; error?: string } | null>(null);
  const [sensor, setSensor] = useState<"modis" | "viirs">("modis");
  useEffect(() => {
    let live = true;
    void loadRawPilot(area).then((data) => { if (live) setState({ id: area.id, data }); })
      .catch(() => { if (live) setState({ id: area.id, error: "The real raw pilot could not be verified or loaded." }); });
    return () => { live = false; };
  }, [area]);
  const current = state?.id === area.id ? state : null;
  const data = current?.data;
  const row = data?.monthly.find((r) => r.date === period.slice(0,7));
  const calibrated = !!rawPilotFor(area)?.national_url;
  return <div className="analytics-report">
    <section className="analytics-card">
      <span className="analytics-badge">{calibrated ? "Real raw sensor detections · original counts" : "Real raw detections · harmonization not validated"}</span>
      <h3>Historical raw detections · {data?.name ?? area.name}</h3>
      <p>MODIS Aqua and VIIRS NOAA-20 observe different pixel sizes. Explore each sensor separately; these counts do not form a harmonized activity record.</p>
      {!current && <p role="status">Loading the verified country archive summary…</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      {data && <>
        <label>Sensor{" "}<select className="field" value={sensor} onChange={(e) => setSensor(e.target.value as "modis" | "viirs")}>
          <option value="modis">MODIS Aqua · 1 km</option><option value="viirs">VIIRS NOAA-20 · 375 m</option>
        </select></label>
        {onPeriod && <label>Map month{" "}<select className="field" value={row?.date ?? ""} onChange={(e) => onPeriod(e.target.value)}>
          {!row && <option value="" disabled>Choose a covered month</option>}
          {data.monthly.map((r) => <option key={r.date} value={r.date}>{r.date}</option>)}
        </select></label>}
        <ScientificChart title={`${sensor === "modis" ? "MODIS Aqua" : "VIIRS NOAA-20"} monthly detections`}
          description="Real FIRMS country archives, filtered offline. Each point is an observed raw count; no sensor conversion or weather forecast is applied."
          unit="raw satellite detections" series={[{ label: sensor === "modis" ? "Observed MODIS Aqua" : "Observed VIIRS NOAA-20",
            kind: "observed", points: data.monthly.map((r) => ({ label: r.date, value: sensor==="viirs" && r.date<'2018-04' ? null : r[sensor], note: "Standard processing · country archive · uncalibrated" })) }]} />
        <p className="analytics-insight">{row ? `${row.date}: ${numeric(row[sensor])} retained detections from this sensor in the country archive.` : "The selected month is outside this pilot’s historical coverage. Choose a month between " + data.period.start + " and " + data.period.end + "."}</p>
        <p className="analytics-footnote">{data.period.start}–{data.period.end} · {data.source} · 0.25° map cells. The country outline is generalized; detections follow FIRMS country membership.</p>
        {!compact && <details><summary>Sensor comparability and provenance</summary>
          <p>Brazil’s biome calibration has not been transferred. These descriptive sensor ratios do not validate harmonization.</p>
          <div className="analytics-table-scroll"><table><caption>Raw sensor counts by year · Aqua starts July 2002; NOAA-20 starts April 2018</caption>
            <thead><tr><th>Year</th><th>Aqua</th><th>NOAA-20</th><th>Raw ratio</th></tr></thead>
            <tbody>{data.annual.map((r) => <tr key={r.year}><th>{r.year}</th><td>{numeric(r.modis)}</td><td>{numeric(r.viirs)}</td><td>{numeric(r.raw_viirs_to_modis)}</td></tr>)}</tbody>
          </table></div><p>Processed {data.generated_at}. Archive and map-tile checksums are recorded in the coverage manifest.</p>
          <ul>{data.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul>
        </details>}
      </>}
      <p className="analytics-notice">{calibrated ? "These are original sensor counts. Country-wide harmonized activity and eligible seasonal anomalies appear in the national report; statistical forecasts remain subject to independent observation and backtesting gates." : "Seasonal anomalies, statistical activity forecasts and Firefly Signals are unavailable for this raw pilot. They require locally validated harmonized data."}</p>
      <p className="analytics-footnote"><a href="/method#geographic-expansion">Geographic coverage and validation policy ↗</a></p>
      {onReport && <button type="button" className="btn btn-quiet" onClick={onReport}>Full report below</button>}
    </section>
    {!compact && <FireDangerAssessment area={area} />}
  </div>;
}
