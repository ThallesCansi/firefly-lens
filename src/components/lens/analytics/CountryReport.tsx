"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import type { AnalysisArea } from "../../../lib/data/types";
import { rawPilotFor } from "../../../lib/data/coverage";
import { loadNationalAnalytics } from "../../../lib/data/raw-pilot";
import { isFailure, type Bundle } from "../../../lib/analytics/contracts";
import { ScientificChart, numeric } from "./ScientificChart";
import { RawPilotReport } from "./RawPilotReport";
import { FireDangerAssessment } from "./FireDangerAssessment";
import "./analytics.css";

type Props = { area: AnalysisArea; period: string; compact?: boolean;
  onPeriod?: (period: string) => void; onReport?: () => void;
  tab?:"history"|"forecast"; onTabChange?:(tab:"history"|"forecast")=>void;
  controls?:ReactNode; legacy?:ReactNode;
  renderHistory?: (bundle: Bundle) => ReactNode; renderForecast?: (bundle: Bundle) => ReactNode };

export function CountryReport(props: Props) {
  return rawPilotFor(props.area)?.national_url ? <NationalReport {...props} /> : <RawPilotReport {...props} />;
}

function NationalReport({ area, period, compact, onPeriod, onReport, renderHistory, renderForecast,tab:controlledTab,onTabChange,controls,legacy }: Props) {
  const [localTab,setLocalTab]=useState<"history"|"forecast">("history");
  const tab=controlledTab ?? localTab;
  const setTab=onTabChange ?? setLocalTab;
  const id=useId();
  const [state, setState] = useState<{ id: string; bundle?: Bundle; error?: string } | null>(null);
  useEffect(() => {
    let live = true;
    void loadNationalAnalytics(area).then((bundle) => { if (live) setState({ id: area.id, bundle }); })
      .catch(() => { if (live) setState({ id: area.id, error: "The national harmonization could not be verified. No other region is substituted." }); });
    return () => { live = false; };
  }, [area]);
  const current = state?.id === area.id ? state : null;
  const bundle = current?.bundle;
  const history = bundle?.sections.history.data;
  const rows = history && !isFailure(history) ? history.monthly : [];
  const selected = rows.find((r) => r.date === period.slice(0,7));
  const metrics = rawPilotFor(area)?.calibration_metrics;
  return <div className="analytics-report">
    <section className="analytics-card">
      <span className="analytics-badge">Real harmonized data · entire country only</span>
      <h3>National fire activity · {rawPilotFor(area)?.name}</h3>
      <p>Explore observed Aqua from July 2002 and country-converted VIIRS from 2024. Calibration applies to national totals; map cells remain raw detections.</p>
      <details><summary>Country calibration and uncertainty</summary>
        <p>Country-specific MODIS/VIIRS calibration evaluated on 2022–2023 held out from a fit ending in 2021. Subnational patterns are not validated.</p>
        {metrics && <p>Held-out months: bias {numeric(100*metrics.relative_bias)}% · weighted absolute error {numeric(100*metrics.wape)}% · rank correlation {numeric(metrics.spearman)}.</p>}
        <p>Seasonal reference: eligible observed months in 2003–2023. Ranges show calibration-parameter variability only; post-2023 extrapolation remains uncertain. Daily converted values distribute monthly activity by daily degraded VIIRS detections, as in the Brazilian calendar; daily predictions are not independently validated.</p>
      </details>
      {!current && <p role="status">Loading verified national harmonization…</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      {onPeriod && rows.length > 0 && <label>Map month{" "}<select className="field" value={selected?.date ?? ""} onChange={(e) => onPeriod(e.target.value)}>
        {!selected && <option value="" disabled>Choose a covered month</option>}
        {rows.map((r) => <option key={r.date} value={r.date}>{r.date}</option>)}
      </select></label>}
      {!compact && <>
        <div role="tablist" aria-label="Analysis report" className="analytics-tabs">
          {(["history","forecast"] as const).map((value)=><button key={value} type="button" role="tab" data-tour={`tab-${value}`}
            id={`${id}-${value}-tab`} aria-controls={`${id}-${value}`} aria-selected={tab===value} tabIndex={tab===value?0:-1}
            onClick={()=>setTab(value)} onKeyDown={(event)=>{
              if (["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) {
                event.preventDefault(); const next=event.key==="Home"?"history":event.key==="End"?"forecast":value==="history"?"forecast":"history";
                setTab(next); document.getElementById(`${id}-${next}-tab`)?.focus();
              }
            }}>{value==="history"?"History":"Forecast"}</button>)}
        </div>
        {controls}
      </>}
      <div role="tabpanel" id={`${id}-history`} aria-labelledby={`${id}-history-tab`} hidden={!compact && tab!=="history"}>
      {bundle && !compact && renderHistory ? renderHistory(bundle) : rows.length > 0 && <>
        <ScientificChart title="Historical Fire Activity" unit="Aqua-equivalent hot spots"
          description="Whole-country monthly series. Shading is the country-year bootstrap parameter range, not a full prediction interval."
          series={(["observed_modis","modeled_viirs"] as const).map((source) => ({
            label: source === "observed_modis" ? "Observed MODIS Aqua" : "Country-converted VIIRS",
            kind: source === "observed_modis" ? "observed" : "estimated",
            points: rows.map((r) => ({ label: r.date, value: r.source === source ? r.value : null,
              lower: r.source === source ? r.lower : null, upper: r.source === source ? r.upper : null,
              partial: !r.complete, note: `${r.source} · ${r.flags.join(" · ")}` })),
          }))} />
        <p className="analytics-insight">{selected ? `${selected.date}: ${numeric(selected.value)} Aqua-equivalent hot spots for the entire country (${selected.source === "modeled_viirs" ? "VIIRS estimate" : "MODIS observation"}).` : "The selected month has no national harmonized value."}</p>
      </>}
      {!compact && legacy && <details><summary>Calendar, sensors & downloads</summary>{legacy}</details>}
      </div>
      <p className="analytics-footnote"><a href={rawPilotFor(area)?.calibration_url}>Country calibration, holdout metrics and limitations ↗</a> · <a href="/method#geographic-expansion">Methods ↗</a></p>
      {bundle && !compact && renderForecast && <div role="tabpanel" id={`${id}-forecast`} aria-labelledby={`${id}-forecast-tab`} hidden={tab!=="forecast"}>{renderForecast(bundle)}</div>}
      {!compact && <details><summary>Raw sensor record and provenance</summary><RawPilotReport area={area} period={period} compact /></details>}
      {onReport && <button type="button" className="btn btn-quiet" onClick={onReport}>Full report below</button>}
    </section>
    {!compact && <FireDangerAssessment area={area} />}
  </div>;
}
