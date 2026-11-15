"use client";
import { useEffect, useState, type ReactNode } from "react";
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
  renderHistory?: (bundle: Bundle) => ReactNode; renderForecast?: (bundle: Bundle) => ReactNode };

export function CountryReport(props: Props) {
  return rawPilotFor(props.area)?.national_url ? <NationalReport {...props} /> : <RawPilotReport {...props} />;
}

function NationalReport({ area, period, compact, onPeriod, onReport, renderHistory, renderForecast }: Props) {
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
      <p>Country-specific MODIS/VIIRS calibration evaluated on 2022–2023 held out from a fit ending in 2021. Subnational patterns are not validated; map rings and dots remain raw detections.</p>
      {metrics && <p className="analytics-insight">Held-out national months: bias {numeric(100*metrics.relative_bias)}% · weighted absolute error {numeric(100*metrics.wape)}% · rank correlation {numeric(metrics.spearman)}.</p>}
      <p className="analytics-footnote">Solid: observed Aqua through 2023. Dashed: country-converted VIIRS from 2024. The seasonal reference is short (2018–2023). Ranges show calibration-parameter variability only; post-2023 extrapolation and local ecosystem skill remain uncertain.</p>
      {!current && <p role="status">Loading verified national harmonization…</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      {onPeriod && rows.length > 0 && <label>Map month{" "}<select className="field" value={selected?.date ?? ""} onChange={(e) => onPeriod(e.target.value)}>
        {!selected && <option value="" disabled>Choose a covered month</option>}
        {rows.map((r) => <option key={r.date} value={r.date}>{r.date}</option>)}
      </select></label>}
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
      <p className="analytics-footnote"><a href={rawPilotFor(area)?.calibration_url}>Country calibration, holdout metrics and limitations ↗</a> · <a href="/method#geographic-expansion">Methods ↗</a></p>
      {bundle && !compact && renderForecast && <details><summary>Statistical Activity Forecast · availability and model evidence</summary>{renderForecast(bundle)}</details>}
      {!compact && <details><summary>Raw sensor record and provenance</summary><RawPilotReport area={area} period={period} compact /></details>}
      {onReport && <button type="button" className="btn btn-quiet" onClick={onReport}>Full report below</button>}
    </section>
    {!compact && <FireDangerAssessment area={area} />}
  </div>;
}
