import type { ReactNode } from "react";
import evidence from "../../../public/method/evidence/evidence.json";
import { BiomeScatterChart, BrazilSeriesChart, BrazilZoomChart, ResidualsChart } from "./HarmonizationCharts";

const number = (value: number, digits = 0) =>
  value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const sourceRoot = `https://github.com/ThallesCansi/firefly-lens/blob/${evidence.dataCommit}/`;

function SourceNote() {
  return (
    <p className="evidence-source">
      Fixed data snapshot · {evidence.referenceDate} ·{" "}
      <a href="/method/evidence/evidence.json" download>Download values &amp; source hashes (JSON)</a>
    </p>
  );
}

function ChartFigure({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <figure className="evidence-figure">
      {children}
      <figcaption><strong>{title}</strong><p>{description}</p></figcaption>
    </figure>
  );
}

export function ValidationEvidence() {
  return (
    <>
      <div className="evidence-summary">
        <p className="eyebrow">WHAT THE PUBLISHED RESULTS SHOW</p>
        <h3>Good calibration-period agreement. A changing reference afterward.</h3>
        <p>
          Brazil-wide monthly totals have a reported L2 bias of −0.08% in
          leave-one-year-out evaluation for 2018–2023. Comparisons after 2023
          have larger negative bias against Aqua, whose orbit was drifting.
          These periods answer different questions and should be read separately.
        </p>
      </div>
      <div className="method-table-wrap">
        <table>
          <caption>Published L2 metrics · Brazil × month · against observed Aqua</caption>
          <thead><tr><th scope="col">Evaluation period</th><th scope="col">Months</th><th scope="col">Relative bias</th><th scope="col">MAE log1p</th></tr></thead>
          <tbody>{evidence.metrics.map((row) => (
            <tr key={row.period}>
              <th scope="row">{row.period}{row.period === "2026" && " (Jan–Oct)"}</th>
              <td>{row.months}</td><td className="num">{number(row.bias, 2)}%</td><td className="num">{number(row.maeLog1p, 3)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p>
        Bias is 100 × (sum predicted / sum observed − 1). MAE log1p is the
        mean absolute difference of log(1 + count), <strong>not a percentage
        error</strong>. LOYO leaves each evaluation year out of its model fit;
        August 2020 and April 2022 are excluded from calibration-period metrics.
        The 2018 overlap starts in April. Later comparisons mix model error
        and changes in Aqua’s reference.
      </p>
      <ChartFigure title="From two count scales to a shared monthly scale"
        description="Brazil, 2003–2026, on a logarithmic count axis. Raw NOAA-20 counts are much higher than Aqua; harmonized predictions lie closer. The shaded band is the original predictive simulation interval, before the common-error adjustment used by the app.">
        <BrazilSeriesChart />
      </ChartFigure>
      <details className="evidence-details"><summary>Inspect the overlapping record on a linear axis</summary>
        <ChartFigure title="Aqua and harmonized VIIRS, 2018–2026"
          description="The dashed line marks the end of calibration. These held-out pipeline predictions are distinct from the app’s observed-through-2025 continuous series. The simulation band shown here does not include the app’s common-error coefficient.">
          <BrazilZoomChart />
        </ChartFigure>
      </details>
      <ChartFigure title="Agreement varies across biomes"
        description="Observed versus predicted biome-month totals, with log(count + 1) axes. Blue circles identify calibration-period LOYO evaluations; orange diamonds identify later comparisons. Distance from the diagonal shows disagreement; national agreement does not guarantee local accuracy.">
        <BiomeScatterChart />
      </ChartFigure>
      <ChartFigure title="Where the monthly predictions depart from Aqua"
        description="Brazil-wide residuals are predicted / observed − 1, in percent, for L1 and L2. Negative residuals after 2023 are consistent with a changing Aqua reference, but do not isolate orbital drift from model error. Outage-month residuals are shown here although those months are excluded from calibration metrics.">
        <ResidualsChart />
      </ChartFigure>
      <div className="method-callout">
        <strong>Two distinctions that matter</strong>
        <p>
          Spearman {number(evidence.seasonalSpearman, 3)} compares the
          <strong> 12 mean calendar-month totals</strong> in the LOYO period.
          It measures agreement in the average seasonal cycle, not a ranking
          of every individual year-month event.
        </p>
        <p>
          The area interval adds a common-error coefficient of 0.213. Its
          target coverage is 95%; the methodology reports 94.8% for LOYO
          biome-months and 88.2% for 2024–2026 biome-months. The coefficient was
          tuned on the LOYO residuals themselves: those residuals are not an
          independent test of the adjusted interval. Coverage is not guaranteed
          for every selected area.
        </p>
      </div>
      <p className="evidence-source">
        Charts redraw the values plotted by the pipeline’s validation stage{" "}
        (<a href="/method/evidence/harmonization-charts.json" download>chart values, JSON</a>). Sources:{" "}
        <a href={`${sourceRoot}harmonization/output/validation_metrics.csv`}>metrics</a>,{" "}
        <a href={`${sourceRoot}harmonization/output/validation_rankings.csv`}>rankings</a>,{" "}
        <a href={`${sourceRoot}harmonization/docs/METHODOLOGY.md`}>methodology</a>.
        Tables are published pipeline outputs. Chart values come from the
        validation code rerun with its fixed seed on the published monthly grid;
        the recomputed metrics match the published table. The audit checked file
        consistency and did not validate fire events.
      </p>
    </>
  );
}

export function MonthlyEvidence() {
  const m = evidence.monthly;
  const max = Math.ceil(Math.max(...m.reference.map((r) => r.value)) / 10000) * 10000;
  const y = (value: number) => 215 - (value / max) * 170;
  return (
    <figure className="evidence-example" id="monthly-evidence">
      <figcaption>
        <p className="eyebrow">REAL-DATA EXAMPLE / SAME MONTH, SAME AREA</p>
        <h3>September 2024 in its historical context</h3>
        <p>{evidence.region.name}: 60°W–48°W, 16°S–4°S; {number(evidence.region.cells)} grid cells. All values below are observed Aqua totals.</p>
      </figcaption>
      <div className="evidence-stats">
        <div><span>September 2024</span><strong>{number(m.value)}</strong></div>
        <div><span>September median · 2003–2025</span><strong>{number(m.median)}</strong></div>
        <div><span>Ratio to same-month median</span><strong>{number(m.ratio!, 2)}×</strong></div>
      </div>
      <div className="evidence-chart-scroll" tabIndex={0} role="region" aria-label="September comparison chart; scroll horizontally on small screens">
      <svg viewBox="0 0 720 270" role="img" aria-labelledby="monthly-evidence-title monthly-evidence-desc" className="evidence-chart">
        <title id="monthly-evidence-title">September totals for 23 reference years</title>
        <desc id="monthly-evidence-desc">September 2024 has 44,519 Aqua detections, 2.17 times the 2003–2025 September median of 20,551. Each bar is one September; the dashed line is the median. A table follows.</desc>
        {[0, max / 2, max].map((v) => <g key={v}><line x1="60" x2="704" y1={y(v)} y2={y(v)} className="chart-grid" /><text x="50" y={y(v) + 4} textAnchor="end">{number(v / 1000)}k</text></g>)}
        {m.reference.map((r, i) => <g key={r.year}>
          <rect x={65 + i * 27.5} y={y(r.value)} width="18" height={215 - y(r.value)} rx="2" className={r.year === m.selectedYear ? "chart-selected" : "chart-bar"}>
            <title>{`${r.year}: ${number(r.value)} detections${r.year === m.selectedYear ? " (selected)" : ""}`}</title>
          </rect>
          {(i % 4 === 0 || r.year === 2025) && <text x={74 + i * 27.5} y="238" textAnchor="middle">{r.year}</text>}
        </g>)}
        <line x1="60" x2="704" y1={y(m.median)} y2={y(m.median)} className="chart-reference" />
        <text x="62" y="18">MODIS-Aqua-equivalent hot spots</text>
      </svg>
      </div>
      <p className="chart-scroll-hint">Scroll horizontally to see all 23 years, including the selected 2024 bar.</p>
      <p className="evidence-legend"><span><i className="legend-bar" /> September totals</span><span><i className="legend-selected" /> 2024</span><span><i className="legend-line" /> Same-month median</span></p>
      <p>
        {number(m.ratio!, 2)}× crosses the app’s 2× monthly-ring threshold. The
        median uses the area’s monthly sums, not a sum of cell medians.
        September 2024 is included in the 2003–2025 reference. This comparison
        describes relative detections, not severity or independent fire counts.
      </p>
      <details className="evidence-details"><summary>Read all 23 September totals</summary>
        <div className="method-table-wrap"><table><caption>Observed Aqua detections in the study box</caption><thead><tr><th scope="col">Year</th><th scope="col">September total</th></tr></thead>
          <tbody>{m.reference.map((r) => <tr key={r.year}><th scope="row">{r.year}</th><td>{number(r.value)}</td></tr>)}</tbody>
        </table></div>
      </details>
      <SourceNote />
    </figure>
  );
}

export function DailyEvidence() {
  const d = evidence.daily;
  const max = Math.ceil(Math.max(d.threshold, ...d.days.map((day) => day.index)) * 10) / 10;
  const y = (value: number) => 215 - value / max * 170;
  const conditions = [
    { label: "Activity floor", text: `${number(d.index * 100, 2)} ≥ 22`, met: d.index >= .22 },
    { label: "Twice the local median", text: `${number(d.index * 100, 2)} ≥ ${number(2 * d.median * 100, 2)}`, met: d.index >= 2 * d.median },
    { label: "Above the median + spread margin", text: `${number(d.index * 100, 2)} > ${number((d.median + Math.max(.15, 4 * d.scaledMad)) * 100, 2)}`, met: d.index > d.median + Math.max(.15, 4 * d.scaledMad) },
  ];
  return (
    <figure className="evidence-example" id="daily-evidence">
      <figcaption><p className="eyebrow">REAL-DATA EXAMPLE / LOCAL DAILY RULE</p><h3>Why 23 October 2024 receives a flag</h3>
        <p>The same study box, using the app’s actual daily record. The selected day reports {number(d.value)} Aqua detections. Its 20 neighbouring days form the reference; the selected day is excluded.</p>
      </figcaption>
      <div className="evidence-chart-scroll" tabIndex={0} role="region" aria-label="Daily activity chart; scroll horizontally on small screens">
      <svg viewBox="0 0 720 270" role="img" aria-labelledby="daily-evidence-title daily-evidence-desc" className="evidence-chart">
        <title id="daily-evidence-title">Daily activity around 23 October 2024</title>
        <desc id="daily-evidence-desc">The selected day scores 35.53 on the 0–100 index, above the local spread cutoff of 34.24. The plot shows 13 October to 2 November. The dashed line is the neighbour median. The dotted line is the combined flag cutoff. Values and conditions follow in tables.</desc>
        {[0, max / 2, max].map((v) => <g key={v}><line x1="60" x2="704" y1={y(v)} y2={y(v)} className="chart-grid" /><text x="50" y={y(v) + 4} textAnchor="end">{number(v * 100)}</text></g>)}
        {d.days.map((day, i) => <g key={day.date}>
          <rect x={66 + i * 30} y={y(day.index)} width="20" height={215 - y(day.index)} rx="2" className={day.date === d.selectedDate ? "chart-selected" : "chart-bar"}>
            <title>{`${day.date}: index ${number(day.index * 100, 2)}, ${number(day.value)} detections`}</title>
          </rect>
          {i % 5 === 0 && <text x={76 + i * 30} y="238" textAnchor="middle">{day.date.slice(8)} {day.date.slice(5, 7) === "10" ? "Oct" : "Nov"}</text>}
        </g>)}
        <line x1="60" x2="704" y1={y(d.median)} y2={y(d.median)} className="chart-reference" />
        <line x1="60" x2="704" y1={y(d.threshold)} y2={y(d.threshold)} className="chart-cutoff" />
        <text x="62" y="18">Daily index · plotted range 0–{number(max * 100)} of 100</text>
      </svg>
      </div>
      <p className="chart-scroll-hint">Scroll horizontally to see the selected day and all 20 neighbours.</p>
      <p className="evidence-legend"><span><i className="legend-selected" /> 23 October</span><span><i className="legend-line" /> Neighbour median</span><span><i className="legend-cutoff" /> Combined cutoff</span></p>
      <div className="method-table-wrap"><table className="evidence-conditions"><caption>All three conditions must hold · index displayed on a 0–100 scale</caption><thead><tr><th scope="col">Condition</th><th scope="col">Observed comparison</th><th scope="col">Result</th></tr></thead>
        <tbody>{conditions.map((c) => <tr key={c.label}><th scope="row">{c.label}</th><td className="num">{c.text}</td><td>{c.met ? "Met" : "Not met"}</td></tr>)}</tbody>
      </table></div>
      <p>
        Local median: {number(d.median * 100, 2)}; scaled MAD: {number(d.scaledMad * 100, 2)}.
        The positive-day P95 reference is {number(d.reference)} detections, so
        366 / {number(d.reference)} × 100 = {number(d.index * 100, 2)}.
        This example explains a provisional heuristic; it does not establish a
        false-alarm rate, significance level or independent fire-event validation.
      </p>
      <details className="evidence-details"><summary>Inspect the 21 daily values</summary>
        <div className="method-table-wrap"><table><caption>Selected day and ten days on each side</caption><thead><tr><th scope="col">UTC date</th><th scope="col">Aqua detections</th><th scope="col">Index / 100</th></tr></thead>
          <tbody>{d.days.map((day) => <tr key={day.date}><th scope="row">{day.date}{day.date === d.selectedDate ? " (selected)" : ""}</th><td>{number(day.value)}</td><td>{number(day.index * 100, 2)}</td></tr>)}</tbody>
        </table></div>
      </details>
      <SourceNote />
    </figure>
  );
}

export function QualityEvidence() {
  const statuses = [
    ["Passed", evidence.summary.pass], ["Proven data errors", evidence.summary.error],
    ["Warnings", evidence.summary.warning], ["Not run", evidence.summary.not_run],
    ["Not applicable", evidence.summary.not_applicable],
  ] as const;
  return (
    <>
      <p>
        The independent audit inspected the distributed data at commit{" "}
        <a href={`https://github.com/ThallesCansi/firefly-lens/tree/${evidence.dataCommit}`}>{evidence.dataCommit.slice(0, 7)}</a>,
        using {evidence.referenceDate} as its reference date. This is a fixed
        audit snapshot, not a live coverage monitor or a new model validation.
      </p>
      <dl className="quality-counts">{statuses.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p>
        All 67 data tiles were decoded, with 11,763 grid cells and four
        Parquet tables inspected. Monthly national sums agree between tiles
        and the monthly Parquet across 293 months, within the declared float32
        tolerance. Integrity checks do not authenticate FIRMS provenance or
        validate every scientific claim.
      </p>
      <div className="method-callout"><strong>Read partial months with care</strong><p>
        The last complete month is {evidence.period.seriesEnd}.
        November 2026 ends on day 14; July 2002 begins on day 4.
        Neither is a full month. The audit found that some current interface
        comparisons still place partial totals against full-month medians;
        those comparisons require review and are not evidence of reduced activity.
      </p></div>
      <div className="method-table-wrap"><table><caption>Days with no detections anywhere in Brazil, within each sensor’s declared period</caption><thead><tr><th scope="col">Sensor</th><th scope="col">Days</th><th scope="col">Interpretation</th></tr></thead>
        <tbody>{evidence.gaps.map((gap) => <tr key={gap.sensor}><th scope="row">{gap.sensor}</th><td>{gap.dates.length}</td><td>Investigate observation availability; no confirmed cause assigned.</td></tr>)}</tbody>
      </table></div>
      <details className="evidence-details"><summary>Inspect dates with no detections</summary>
        {evidence.gaps.map((gap) => <div key={gap.sensor} className="quality-dates"><h3>{gap.sensor} · {gap.dates.length} days</h3><p>{gap.dates.join(" · ")}</p></div>)}
      </details>
      <p>
        A day without detections does not prove the absence of fires or an
        acquisition failure. The files do not include acquisition-availability
        or cloud masks. The three checks not run concern acquisition coverage,
        authentication against original sources, and full reproduction of model
        validation. Raw records and held-out prediction/simulation intermediates
        are not included in this checkout.
      </p>
      <p className="evidence-source">
        <a href="https://github.com/ThallesCansi/firefly-lens/blob/45af54534c56a1b7b70e0559f9dde64275dcc777/qa/data-audit/reports/REPORT.md">Read the full data audit</a>{" · "}
        <a href="https://github.com/ThallesCansi/firefly-lens/blob/45af54534c56a1b7b70e0559f9dde64275dcc777/qa/data-audit/DOCUMENTATION_AUDIT.md">Read the documentation audit</a>
      </p>
      <SourceNote />
    </>
  );
}
