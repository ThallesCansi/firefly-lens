"use client";

import { useId, useState, type ReactNode } from "react";
import type { AnalysisArea } from "@/lib/data/types";
import { meta } from "@/lib/data/meta";
import { useFireRecord } from "@/lib/useFireRecord";
import { useAnalytics } from "@/lib/analytics/useAnalytics";
import {
  isFailure,
  type Bundle,
  type MonthlyRow,
  type ForecastData,
  type Metric,
  type Model,
} from "@/lib/analytics/contracts";
import { ScientificChart, numeric, type PlotSeries } from "./ScientificChart";
import "./analytics.css";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const models: Model[] = ["seasonal_median", "seasonal_naive", "sarima"];
const modelName = (model: string | null | undefined) =>
  model === "sarima"
    ? "SARIMA"
    : model === "seasonal_naive"
      ? "Seasonal naive"
      : model === "seasonal_median"
        ? "Seasonal median"
        : "Unavailable";
const reason = (value: string | null | undefined) =>
  value?.replaceAll("_", " ") ?? "Unavailable";
const unit = "Aqua-equivalent hot spots";
function historicalSeries(rows: MonthlyRow[]): PlotSeries[] {
  return (["observed_modis", "modeled_viirs"] as const).map((source) => ({
    label:
      source === "observed_modis"
        ? "Observed MODIS Aqua"
        : "Estimated from VIIRS",
    kind: source === "observed_modis" ? "observed" : "estimated",
    points: rows.map((r) => ({
      label: r.date,
      value: r.source === source ? r.value : null,
      lower: r.source === source ? r.lower : null,
      upper: r.source === source ? r.upper : null,
      partial: !r.complete,
      note: [!r.complete ? "partial month" : "", ...(r.flags ?? [])]
        .filter(Boolean)
        .map(reason)
        .join(" · "),
    })),
  }));
}

function History({
  bundle,
  from,
  to,
  period,
}: {
  bundle: Bundle;
  from: string;
  to: string;
  period: string;
}) {
  const [resolution, setResolution] = useState("monthly");
  const [metric, setMetric] = useState<
    "absolute" | "percent" | "z_score" | "robust_z" | "percentile"
  >("absolute");
  const history = bundle.sections.history.data,
    climate = bundle.sections.climatology.data,
    anomalies = bundle.sections.anomalies.data;
  if (isFailure(history))
    return (
      <p className="analytics-notice">
        History unavailable: {reason(history.reason)}
      </p>
    );
  const rows = history.monthly.filter((r) => r.date >= from && r.date <= to);
  const selected = history.monthly.find((r) => r.date === period.slice(0, 7));
  const selectedAnomaly = !isFailure(anomalies)
    ? anomalies.months.find((r) => r.date === period.slice(0, 7))
    : undefined;
  const year = Number(period.slice(0, 4));
  const selectedClimate = !isFailure(climate)
    ? climate.months.find((r) => r.month === Number(period.slice(5, 7)))
    : undefined;
  const metrics = {
    absolute: "Absolute anomaly",
    percent: "Percent anomaly",
    z_score: "Z-score",
    robust_z: "Robust Z-score",
    percentile: "Percentile",
  };
  return (
    <div className="analytics-stack">
      <div className="analytics-stats">
        <div>
          <span>{selected?.date ?? "Selected month"}</span>
          <strong>{numeric(selected?.value)}</strong>
          <small>
            {selected
              ? `${selected.complete ? "Complete" : "Partial"} · ${selected.source === "modeled_viirs" ? "VIIRS estimate" : "MODIS observation"}`
              : "No value for this period"}
          </small>
        </div>
        <div>
          <span>Same-month anomaly</span>
          <strong>
            {numeric(selectedAnomaly?.percent)}
            {selectedAnomaly?.percent != null ? "%" : ""}
          </strong>
          <small>
            {selectedAnomaly?.percent == null
              ? reason(selectedAnomaly?.null_reasons?.percent)
              : `${selectedAnomaly.reference.n_years} eligible past years · relative to mean`}
          </small>
        </div>
        <div>
          <span>Highest eligible complete year</span>
          <strong>{history.summary.highest_year ?? "Unavailable"}</strong>
          <small>Full record · quality policy applied</small>
        </div>
        <div>
          <span>Highest eligible month</span>
          <strong>{history.summary.highest_month ?? "Unavailable"}</strong>
          <small>Full record · partial months excluded</small>
        </div>
      </div>
      <p className="analytics-footnote">
        Fixed-reference median for {MONTHS[Number(period.slice(5, 7)) - 1]}:{" "}
        {numeric(selectedClimate?.median)} {unit}, from{" "}
        {selectedClimate?.n_years ?? 0} eligible years. The anomaly above uses
        its own past-only mean reference.
      </p>
      <section className="analytics-card">
        <div className="analytics-card-heading">
          <div>
            <span className="analytics-eyebrow">01 / Historical record</span>
            <h3>The record, over time</h3>
          </div>
          <label>
            Resolution{" "}
            <select
              className="field"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </label>
        </div>
        {resolution === "monthly" ? (
          <ScientificChart
            title="Monthly activity"
            description="MODIS observations and harmonized VIIRS estimates are separate series. Shading is harmonization uncertainty, not a forecast interval."
            unit={unit}
            series={historicalSeries(rows)}
          />
        ) : (
          <ScientificChart
            title="Annual activity"
            description="Only complete, policy-eligible years have totals. Partial or excluded years remain gaps; no annualization is applied."
            unit={unit}
            series={[
              {
                label: "Eligible annual totals",
                points: history.annual
                  .filter(
                    (r) =>
                      r.year >= Number(from.slice(0, 4)) &&
                      r.year <= Number(to.slice(0, 4)),
                  )
                  .map((r) => ({
                    label: String(r.year),
                    value: r.total,
                    note: `${r.valid_months} eligible months; full calendar-year total`,
                  })),
              },
            ]}
          />
        )}
        <p className="analytics-footnote">
          {from}–{to}. Annual points use full calendar years within the selected
          years. Descriptive annual trend across the full record:{" "}
          {numeric(history.summary.trend.slope_per_year)} hot spots/year (
          {history.summary.trend.n_years} eligible years); this is neither a
          significance test nor a forecast.
        </p>
      </section>
      <section className="analytics-card">
        <span className="analytics-eyebrow">02 / Seasonal reference</span>
        <h3>What is typical for each month?</h3>
        {isFailure(climate) ? (
          <p className="analytics-notice">{reason(climate.reason)}</p>
        ) : (
          <>
            <ScientificChart
              title={`Seasonal profile · ${year}`}
              description={`Python reference: ${climate.reference.start_year}–${climate.reference.end_year}, at least ${climate.reference.min_years} eligible years per month. Shading: 25th–75th percentiles, not prediction uncertainty.`}
              unit={unit}
              series={[
                {
                  label: "Historical median",
                  kind: "reference",
                  points: climate.months.map((r) => ({
                    label: MONTHS[r.month - 1],
                    value: r.median,
                    lower: r.p25,
                    upper: r.p75,
                    note: `${r.n_years} years: ${r.years_used.join(", ")}`,
                  })),
                },
                {
                  label: `${year} activity`,
                  kind: year > meta.observedUntil ? "estimated" : "observed",
                  points: climate.months.map((r) => {
                    const value = history.monthly.find(
                      (p) => p.year === year && p.month === r.month,
                    );
                    return {
                      label: MONTHS[r.month - 1],
                      value: value?.value ?? null,
                      partial: value ? !value.complete : false,
                      note: value
                        ? `${value.source}${!value.complete ? " · partial" : ""}`
                        : "No data",
                    };
                  }),
                },
              ]}
            />
            <p className="analytics-footnote">
              The fixed seasonal reference and the operational anomaly reference
              serve different purposes. Anomalies use eligible years strictly
              before each target year.
            </p>
          </>
        )}
      </section>
      <section className="analytics-card">
        <div className="analytics-card-heading">
          <div>
            <span className="analytics-eyebrow">
              03 / Departures from the reference
            </span>
            <h3>How unusual was the month?</h3>
          </div>
          <label>
            Measure{" "}
            <select
              className="field"
              value={metric}
              onChange={(e) => setMetric(e.target.value as typeof metric)}
            >
              {Object.entries(metrics).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {isFailure(anomalies) ? (
          <p className="analytics-notice">{reason(anomalies.reason)}</p>
        ) : (
          <ScientificChart
            title={metrics[metric]}
            description="Values come directly from Python. Partial months and insufficient references remain unavailable. A modeled anomaly describes an estimate, not observed truth."
            unit={
              metric === "percent" || metric === "percentile"
                ? "%"
                : metric === "absolute"
                  ? unit
                  : "dimensionless"
            }
            bars={metric !== "percentile"}
            series={[
              {
                label: metrics[metric],
                points: anomalies.months
                  .filter((r) => r.date >= from && r.date <= to)
                  .map((r) => ({
                    label: r.date,
                    value: r[metric],
                    note: [
                      r.source,
                      r.null_reasons?.[metric],
                      `${r.reference.n_years} past years: ${r.reference.years_used.join(", ")}`,
                    ]
                      .filter(Boolean)
                      .map(reason)
                      .join(" · "),
                  })),
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}

function Metrics({
  metrics,
  label,
}: {
  metrics?: Partial<Record<Model, Metric>>;
  label: string;
}) {
  return (
    <div className="analytics-table-scroll">
      <table>
        <caption>{label}</caption>
        <thead>
          <tr>
            <th>Model</th>
            <th>Cases</th>
            <th>Origins</th>
            <th>MAE</th>
            <th>RMSE</th>
            <th>Mean bias</th>
            <th>95% coverage</th>
            <th>Interval cases</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => {
            const m = metrics?.[model];
            return (
              <tr key={model}>
                <th>{modelName(model)}</th>
                <td>{numeric(m?.n)}</td>
                <td>{numeric(m?.origins)}</td>
                <td>{numeric(m?.mae)}</td>
                <td>{numeric(m?.rmse)}</td>
                <td>{numeric(m?.mean_bias)}</td>
                <td>
                  {m?.coverage95 == null
                    ? "Unavailable"
                    : new Intl.NumberFormat("en", {
                        style: "percent",
                        maximumFractionDigits: 1,
                      }).format(m.coverage95)}
                </td>
                <td>{numeric(m?.interval_n)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Forecast({ bundle }: { bundle: Bundle }) {
  const forecast = bundle.sections.forecast.data,
    history = bundle.sections.history.data,
    weather = bundle.sections.fire_weather.data;
  if (isFailure(forecast))
    return (
      <p className="analytics-notice">
        Forecast unavailable: {reason(forecast.reason)}
      </p>
    );
  const f: ForecastData = forecast;
  const rows = isFailure(history)
    ? []
    : history.monthly.filter((r) => r.date <= f.forecast_origin).slice(-24);
  const predictions = f.predictions;
  const historical = historicalSeries(rows).map((s) => ({
    ...s,
    points: [
      ...s.points,
      ...predictions.map((p) => ({ label: p.date, value: null })),
    ],
  }));
  const future: PlotSeries = {
    label: "Experimental forecast",
    kind: "forecast",
    points: [
      ...rows.map((r) => ({ label: r.date, value: null })),
      ...predictions.map((p) => ({
        label: p.date,
        value: p.value,
        lower: p.lower,
        upper: p.upper,
        note: p.reason
          ? reason(p.reason)
          : `${p.horizon}-month horizon · ${p.interval_kind} interval · ${p.interval_method}`,
      })),
    ],
  };
  return (
    <div className="analytics-stack">
      <section className="analytics-card">
        <div className="analytics-card-heading">
          <div>
            <span className="analytics-eyebrow">01 / Outlook</span>
            <h3>What can the record support?</h3>
          </div>
          <span
            className={`analytics-badge ${f.forecast_status === "experimental" ? "analytics-experimental" : ""}`}
          >
            {reason(f.forecast_status)}
          </span>
        </div>
        {f.forecast_status !== "experimental" && (
          <div className="analytics-notice">
            <strong>No current numeric forecast</strong>
            <p>
              {reason(f.reason)}. The latest eligible observation is{" "}
              {f.last_complete_observation_used ?? "unavailable"}; the requested
              origin is {f.forecast_origin}. Historical validation does not
              establish current forecast availability.
            </p>
          </div>
        )}
        <dl className="analytics-metadata">
          <div>
            <dt>
              {f.forecast_status === "experimental"
                ? "Forecast model"
                : "Backtest recommendation"}
            </dt>
            <dd>{modelName(f.model)}</dd>
          </div>
          <div>
            <dt>Forecast origin</dt>
            <dd>{f.forecast_origin}</dd>
          </div>
          <div>
            <dt>Eligible training span</dt>
            <dd>
              {f.training_period.start ?? "Unavailable"}–
              {f.training_period.end ?? "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>Eligible training months</dt>
            <dd>{f.training_period.valid_months}</dd>
          </div>
          <div>
            <dt>Forecast horizon</dt>
            <dd>
              {predictions.map((p) => `${p.horizon}: ${p.date}`).join(" · ") ||
                "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>Last eligible observation</dt>
            <dd>{f.last_complete_observation_used ?? "Unavailable"}</dd>
          </div>
        </dl>
        <ScientificChart
          forecastStart={predictions[0]?.date}
          title="Recent history and forecast horizon"
          description="Observed, harmonized and forecast values use distinct styles. Future gaps mean no supported forecast. Forecast intervals, when available, are separate from historical harmonization uncertainty."
          unit={unit}
          series={[...historical, future]}
        />
        <ul className="analytics-limitations">
          {f.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="analytics-card">
        <span className="analytics-eyebrow">
          02 / Evidence before prediction
        </span>
        <h3>Performance on unseen historical months</h3>
        <p>
          Rolling origins, temporal holdout and paired cases, computed offline
          in Python. Selection cutoff:{" "}
          {f.backtesting.selection_cutoff ?? "Unavailable"}. Recommended model:{" "}
          {modelName(f.backtesting.recommended_model)}.{" "}
          {reason(f.backtesting.status)}: {reason(f.backtesting.reason)}.
        </p>
        <Metrics
          metrics={f.backtesting.validation?.metrics}
          label={`Temporal holdout · ${f.backtesting.validation?.paired_cases ?? 0} paired cases · errors in ${unit}`}
        />
        <p className="analytics-footnote">
          MAE and RMSE measure error; mean bias is prediction minus observation.
          Coverage is the fraction inside the stated 95% interval. Baselines
          without intervals have unavailable coverage. Cases and eligible models
          can differ by horizon.
        </p>
        <details>
          <summary>Performance by forecast horizon</summary>
          {Object.entries(f.backtesting.paired_by_horizon ?? {}).map(
            ([horizon, group]) => (
              <Metrics
                key={horizon}
                metrics={group.metrics}
                label={`${horizon}-month horizon · ${group.paired_cases} paired cases`}
              />
            ),
          )}
        </details>
      </section>
      <section className="analytics-card">
        <span className="analytics-eyebrow">03 / Meteorological context</span>
        <h3>Fire Weather Index</h3>
        <p>
          FWI describes meteorological fire danger. Its dimensionless values are
          separate from predicted hot spot counts.
        </p>
        <div className="analytics-notice">
          <strong>
            {isFailure(weather) || weather.status === "unavailable"
              ? "Weather outlook unavailable"
              : "Weather data require a provider-specific display"}
          </strong>
          <p>
            {reason(weather.reason)}. No operational FWI provider is configured
            for this release.
          </p>
        </div>
      </section>
    </div>
  );
}

export function AnalyticsReport({
  area,
  from,
  to,
  period,
  controls,
  children,
}: {
  area: AnalysisArea;
  from: string;
  to: string;
  period: string;
  controls: ReactNode;
  children: ReactNode;
}) {
  const [tab, setTab] = useState("history");
  const id = useId();
  const { loading, result, error, retry } = useAnalytics(area);
  const {
    record,
    recordArea,
    loading: historyLoading,
    error: historyError,
  } = useFireRecord(area);
  const bundle = result?.status === "available" ? result.bundle : undefined;
  const currentRecord = recordArea?.id === area.id ? record : null;
  return (
    <div className="analytics-report">
      <div className="analytics-report-heading">
        <div>
          <span className="analytics-eyebrow">Scientific analytics</span>
          <h2>Understand the past. Assess the outlook.</h2>
          <p>
            {area.name} · Exact selected geometry · {unit}
          </p>
        </div>
        <span className="analytics-badge">
          {bundle ? "Python · preprocessed" : "Regional analysis"}
        </span>
      </div>
      <div
        role="tablist"
        aria-label="Analysis report"
        className="analytics-tabs"
      >
        {["history", "forecast"].map((value, i) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${id}-${value}-tab`}
            aria-controls={`${id}-${value}`}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? "history"
                    : e.key === "End"
                      ? "forecast"
                      : i === 0
                        ? "forecast"
                        : "history";
                setTab(next);
                document.getElementById(`${id}-${next}-tab`)?.focus();
              }
            }}
          >
            {value === "history" ? "History" : "Forecast"}
          </button>
        ))}
      </div>
      {controls}
      <div aria-live="polite" aria-busy={loading}>
        {loading && (
          <p className="analytics-notice" role="status">
            Loading scientific analysis for {area.name}…
          </p>
        )}
        {error && (
          <div className="analytics-notice" role="alert">
            <strong>Scientific analysis could not be loaded</strong>
            <p>{error}</p>
            <button type="button" className="btn btn-quiet" onClick={retry}>
              Retry analysis
            </button>
          </div>
        )}
        {result?.status === "unsupported" && (
          <div className="analytics-notice">
            <strong>This exact geometry needs Python processing</strong>
            <p>
              The calendar, sensor comparisons, downloads and browser history
              remain available. Climatology, anomalies and forecasts require a
              new offline export or an on-demand Python service for this
              polygon. Prepared study regions:{" "}
              {result.regions.map((r) => r.name).join(", ")}. Choose their exact
              preset in the map tools to view prepared results.
            </p>
          </div>
        )}
      </div>
      <div
        role="tabpanel"
        id={`${id}-history`}
        aria-labelledby={`${id}-history-tab`}
        hidden={tab !== "history"}
      >
        <div className="analytics-panel-intro">
          <h3>Historical Fire Activity</h3>
          <p>
            Explore long-term burning patterns, seasonal variability and
            historical anomalies.
          </p>
        </div>
        {bundle ? (
          <History bundle={bundle} from={from} to={to} period={period} />
        ) : (
          !loading &&
          currentRecord && (
            <section className="analytics-card">
              <h3>Browser historical series</h3>
              <ScientificChart
                title="Monthly history for the selected polygon"
                description="Existing browser aggregation; advanced Python statistics are not available for this geometry. Shading is harmonization uncertainty."
                unit={unit}
                series={historicalSeries(
                  currentRecord.months
                    .map((m): MonthlyRow => ({
                      date: `${m.year}-${String(m.month + 1).padStart(2, "0")}`,
                      year: m.year,
                      month: m.month + 1,
                      value: m.value,
                      lower: m.lo,
                      upper: m.hi,
                      complete:
                        !m.partial &&
                        !(
                          m.year === Number(meta.firstDay.slice(0, 4)) &&
                          m.month === Number(meta.firstDay.slice(5, 7)) - 1 &&
                          !meta.firstDay.endsWith("-01")
                        ),
                      source:
                        m.source === "modeled"
                          ? "modeled_viirs"
                          : "observed_modis",
                      flags: [],
                      valid_for_reference: false,
                      uncertainty_method: null,
                    }))
                    .filter((r) => r.date >= from && r.date <= to),
                )}
              />
            </section>
          )
        )}
        <div className="analytics-legacy">
          <h3>Calendar, sensors & downloads</h3>
          <p className="analytics-footnote">
            These existing exploratory views retain their browser reference
            (2003–2025); Python statistics above apply a stricter quality policy
            (2003–2023, excluding documented outages and orbital drift). Their
            reference values can differ.
          </p>
          {currentRecord ? (
            children
          ) : (
            <p role="status">
              {historyLoading
                ? "Loading the selected polygon’s calendar…"
                : (historyError ??
                  "No browser record is available for this polygon.")}
            </p>
          )}
        </div>
      </div>
      <div
        role="tabpanel"
        id={`${id}-forecast`}
        aria-labelledby={`${id}-forecast-tab`}
        hidden={tab !== "forecast"}
      >
        <div className="analytics-panel-intro">
          <h3>Fire Activity Forecast</h3>
          <p>
            Explore experimental forecasts, uncertainty and model performance.
          </p>
        </div>
        {bundle ? (
          <Forecast bundle={bundle} />
        ) : (
          !loading && (
            <div className="analytics-card">
              <h3>Forecast unavailable for this selection</h3>
              <p>
                A forecast must be processed and validated for this exact
                geometry. No other region’s forecast is substituted.
              </p>
            </div>
          )
        )}
      </div>
      {bundle && (
        <details className="analytics-provenance">
          <summary>Methods, provenance & limitations</summary>
          <p>
            Schema {bundle.schema_version} · Region {bundle.region_id} ·
            Generated {bundle.sections.history.generated_at} · Data coverage{" "}
            {bundle.sections.history.period.start}–
            {bundle.sections.history.period.end}. All scientific statistics and
            model validation are produced by the independent Python engine.
          </p>
          {Object.entries(bundle.sections).map(([key, payload]) => (
            <div key={key}>
              <h4>{reason(key)}</h4>
              <p>{payload.limitations.join(" ")}</p>
              <details>
                <summary>Processing metadata</summary>
                <pre>
                  {JSON.stringify(
                    { method: payload.method, source: payload.source },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
