"use client";
import { useEffect, useState } from "react";
import { isFailure, type Bundle } from "../../../lib/analytics/contracts";
import type { PolygonGeometry } from "../../../lib/data/types";
import { loadRetrospective } from "../../../lib/analytics/retrospective";
import { ScientificChart, numeric } from "./ScientificChart";

export function RetrospectiveForecast({ bundle }: { bundle: Bundle }) {
  const history = bundle.sections.history.data;
  const eligible = !isFailure(history) ? history.monthly.filter((r) => r.valid_for_reference) : [];
  const origins = eligible.slice(96,-3);
  const [origin,setOrigin] = useState(origins.at(-1)?.date ?? "");
  const [request,setRequest] = useState<{ origin: string; attempt: number } | null>(null);
  const [state,setState] = useState<{ request: typeof request; result?: Bundle; error?: string } | null>(null);
  useEffect(() => {
    if (!request) return;
    const controller = new AbortController(); let live = true;
    void loadRetrospective(bundle.geometry as PolygonGeometry, request.origin, controller.signal)
      .then((result) => { if (live) setState({ request,result }); })
      .catch((error) => { if (live) setState({ request,error: error instanceof Error ? error.message : "Retrospective processing failed" }); });
    return () => { live=false; controller.abort(); };
  },[bundle,request]);
  if (!origins.length) return null;
  const current = state?.request === request ? state : null;
  const forecast = current?.result?.sections.forecast.data;
  return <section className="analytics-card">
    <span className="analytics-eyebrow">Retrospective experiment · past dates only</span>
    <h3>What would the model have forecast?</h3>
    <p>Choose a historical origin. The existing Python model sees only eligible observations and backtest outcomes available by that origin. Later observations are shown separately for comparison.</p>
    <p className="analytics-footnote">This is a final-vintage hindcast: the stored historical record may contain later revisions. A publication-vintage archive is unavailable, so these results do not certify real-time operational performance at that past date.</p>
    <label>Historical forecast origin{" "}<select className="field" value={origin} onChange={(e) => setOrigin(e.target.value)}>
      {origins.map((r) => <option key={r.date} value={r.date}>{r.date}</option>)}
    </select></label>{" "}
    <button type="button" className="btn btn-quiet" onClick={() => setRequest({ origin,attempt:(request?.attempt ?? 0)+1 })}>Run retrospective forecast</button>
    {request && !current && <p role="status">Processing the historical origin…</p>}
    {current?.error && <p role="alert">{current.error}</p>}
    {forecast && !isFailure(forecast) && <>
      <p className="analytics-insight">Origin {forecast.forecast_origin} · model {forecast.model?.replaceAll("_"," ") ?? "unavailable"} · {forecast.forecast_status}. This is a past forecast experiment, not a current outlook.</p>
      {forecast.forecast_status !== "experimental" && <p className="analytics-notice">This origin does not meet the existing validation gates: {forecast.reason?.replaceAll("_"," ")}. No prediction is filled in.</p>}
      <ScientificChart title="Past forecast and later eligible observations" unit="Aqua-equivalent hot spots"
        description="Dashed predictions were generated at the selected past origin. Observations are later verification data; missing or quality-excluded truth remains a gap."
        series={[{ label:"Retrospective prediction",kind:"forecast",points:forecast.predictions.map((p) => ({ label:p.date,value:p.value,lower:p.lower,upper:p.upper,note:`Origin ${forecast.forecast_origin} · ${p.horizon}-month lead` })) },
          { label:"Later eligible MODIS observations",kind:"observed",points:forecast.predictions.map((p) => {
            const actual = !isFailure(history) ? history.monthly.find((r) => r.date===p.date) : undefined;
            return { label:p.date,value:actual?.valid_for_reference ? actual.value : null,note:actual?.valid_for_reference ? "Observed after forecast origin; excluded from its training" : "Verification truth unavailable or quality-excluded" };
          }) }]} />
      <div className="analytics-table-scroll"><table><caption>Model holdout evidence available at the past origin · Aqua-equivalent hot spots</caption>
        <thead><tr><th>Model</th><th>Cases</th><th>MAE</th><th>RMSE</th></tr></thead>
        <tbody>{Object.entries(forecast.backtesting.validation?.metrics ?? {}).map(([name,m]) => <tr key={name}><th>{name.replaceAll("_"," ")}</th><td>{m?.n}</td><td>{numeric(m?.mae)}</td><td>{numeric(m?.rmse)}</td></tr>)}</tbody>
      </table></div>
    </>}
  </section>;
}
