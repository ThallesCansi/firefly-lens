import type { RadarConfig, RadarResult } from "@/lib/anomalies";
import { QUALITY_REASONS } from "@/lib/data/month-quality";
import { monthStamp } from "@/lib/dates";
import { MONTHS, count } from "@/lib/format";

export function AnomalyCard({ result, config, onSelect }: {
  result: RadarResult;
  config: RadarConfig;
  onSelect?: (result: RadarResult) => void;
}) {
  const { cell, region } = result;
  const period = `${MONTHS[cell.month]} ${cell.year}`;
  const status = {
    highlight: "Historical highlight", ordinary: "No highlight under these filters",
    excluded: "Exploration only · excluded from comparisons", insufficient: "Insufficient historical reference",
    "zero-median": "Historical median is zero · ratio undefined",
  }[result.status];
  return (
    <article className="radar-result" data-highlight={result.status === "highlight"}
      data-radar-result={`${region.id}/${monthStamp(cell.year, cell.month)}`}>
      <div className="radar-result-heading">
        <div><h3>{region.name}</h3><p className="text-dim">{period}</p></div>
        <span className="radar-source">{cell.source === "modeled" ? "Modeled · VIIRS" : "Observed · Aqua"}</span>
      </div>
      <p className="radar-status">{status}</p>
      <dl className="radar-metrics">
        <div><dt>Aqua-equivalent hot spots</dt><dd>{count(cell.value)}</dd></div>
        <div><dt>Same-month median</dt><dd>{result.median === null ? "Unavailable" : count(result.median)}</dd></div>
        <div><dt>Ratio to median</dt><dd>{result.ratio === null ? "Not comparable" : `${result.ratio.toFixed(2)}×`}</dd></div>
        <div><dt>Same-month historical rank</dt><dd>{result.rank === null ? "Excluded" : `${result.rank} of ${result.rankOf}`}</dd></div>
      </dl>
      <p className="radar-note">Reference: {config.baseline.join("–")}, target year excluded · {result.referenceYears.length} eligible years.
        {result.rank !== null && " Rank covers eligible observed and modeled months across the full archive; ties share rank."}</p>
      {cell.source === "modeled" && cell.lo !== null && cell.hi !== null && (
        <p className="radar-note">Nominal 95% predictive interval: <span className="num">{count(cell.lo)}–{count(cell.hi)}</span> Aqua equivalents. Coverage is not validated for arbitrary study regions.</p>
      )}
      {result.qualityReasons.length > 0 && <p className="radar-note">{result.qualityReasons.map((r) => QUALITY_REASONS[r]).join(" · ")}. This month remains available for exploration.</p>}
      {cell.year >= 2024 && cell.year <= 2025 && <p className="radar-note">Aqua orbital drift may affect this observed value. The reference window does not correct it.</p>}
      {cell.source === "modeled" && <p className="radar-note">Source transition: harmonized VIIRS on the nominal Aqua scale; comparability with 2024–2025 observations remains limited.{cell.year === 2026 && cell.month >= 7 && " These VIIRS inputs use near-real-time processing."}</p>}
      {onSelect && <button type="button" className="btn btn-quiet" onClick={() => onSelect(result)}
        aria-label={`Explore ${region.name} ${period}`}>Explore on map <span aria-hidden="true">↗</span></button>}
    </article>
  );
}
