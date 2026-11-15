"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { compareAnomalies, DEFAULT_RADAR_CONFIG, evaluateRegion, type RadarConfig, type RadarResult } from "@/lib/anomalies";
import { monthStamp } from "@/lib/dates";
import { MONTHS } from "@/lib/format";
import { fireData } from "@/lib/data/source";
import { useHistoricalRadar } from "@/lib/useHistoricalRadar";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { ScientificInfo } from "@/components/ui/ScientificInfo";
import { AnomalyCard } from "./AnomalyCard";

type Mode = "highlights" | "period";
const modes: { value: Mode; label: string }[] = [
  { value: "highlights", label: "Historical Highlights" }, { value: "period", label: "Explore Period" },
];

export default function HistoricalAnomalyRadar({ period, onSelect, onClose }: {
  period: string;
  onSelect: (result: RadarResult, config: RadarConfig) => void;
  onClose: () => void;
}) {
  const { summary, error, retry } = useHistoricalRadar();
  const [mode, setMode] = useState<Mode>("highlights");
  const [selectedPeriod, setSelectedPeriod] = useState(period.slice(0, 7));
  const [baselineEnd, setBaselineEnd] = useState(2023);
  const [limit, setLimit] = useState(12);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); }, []);
  const config = useMemo(() => ({ ...DEFAULT_RADAR_CONFIG, baseline: [2003, baselineEnd] as const }), [baselineEnd]);
  const results = useMemo(() => summary?.regions.flatMap((r) => evaluateRegion(r, config, summary.coverage)) ?? [], [summary, config]);
  const highlights = useMemo(() => results.filter((r) => r.status === "highlight").sort(compareAnomalies), [results]);
  const shown = mode === "highlights" ? highlights.slice(0, limit) : results.filter((r) => monthStamp(r.cell.year, r.cell.month) === selectedPeriod).sort(compareAnomalies);
  const choosePeriod = (year: string, month: string) => {
    const next = `${year}-${month}`;
    setSelectedPeriod(next < fireData.firstMonth ? fireData.firstMonth : next > fireData.lastMonth ? fireData.lastMonth : next);
  };
  return (
    <section className="historical-radar" aria-labelledby="radar-title">
      <div className="radar-heading">
        <div><p className="eyebrow">EXPLORE THE EXCEPTIONS</p><h2 id="radar-title">Historical Anomaly Radar</h2></div>
        <button ref={close} type="button" className="icon-btn" aria-label="Close historical radar" onClick={onClose}>×</button>
      </div>
      <p className="radar-intro">Unusually high monthly activity relative to each study region’s own history. Historical descriptions, not fire forecasts or future risk. <ScientificInfo concept="radar" /></p>
      <SegmentedTabs label="Radar mode" options={modes} value={mode} onChange={setMode} />
      <div className="radar-filters">
        <label>Historical reference<select aria-label="Historical reference" className="field" value={baselineEnd} onChange={(e) => setBaselineEnd(Number(e.target.value))}>
          <option value={2023}>2003–2023 · main reference</option><option value={2025}>2003–2025 · comparison</option>
        </select></label>
        {mode === "period" && <div className="radar-period" role="group" aria-label="Radar period">
          <label>Month<select className="field" aria-label="Radar month" value={selectedPeriod.slice(5, 7)} onChange={(e) => choosePeriod(selectedPeriod.slice(0, 4), e.target.value)}>
            {MONTHS.map((name, i) => { const m = String(i + 1).padStart(2, "0"); const stamp = `${selectedPeriod.slice(0, 4)}-${m}`; return <option key={m} value={m} disabled={stamp < fireData.firstMonth || stamp > fireData.lastMonth}>{name}</option>; })}
          </select></label>
          <label>Year<select className="field num" aria-label="Radar year" value={selectedPeriod.slice(0, 4)} onChange={(e) => choosePeriod(e.target.value, selectedPeriod.slice(5, 7))}>
            {Array.from({ length: fireData.lastYear - fireData.firstYear + 1 }, (_, i) => fireData.lastYear - i).map((y) => <option key={y}>{y}</option>)}
          </select></label>
        </div>}
      </div>
      <details className="radar-method"><summary>Selection criteria and limitations</summary>
        <p>Initial filters: ratio ≥ {config.minRatio}×, count ≥ {config.minCount}, excess ≥ {config.minExcess} Aqua equivalents, and at least the reference P{config.quantile * 100}; ≥ {config.minReferenceYears} reference years. The target year is excluded. These configurable filters are provisional, not statistical significance tests.</p>
        <p>2003–2023 reduces potential influence of the 2024–2025 Aqua drift on the reference; it does not fully correct comparability. Rankings include eligible observed and modeled months across the archive and are ordered by relative historical standing, then ratio and excess.</p>
        <p>July 2002, partial months, August/September 2020 and March/April 2022 are excluded from comparisons. Explore Period retains them. Zero medians have no defined ratio. These are study rectangles, not official biome outlines.</p>
        <p>The historical grid keeps its existing 2003–2025 climatology. Daily local peaks use a separate rule. <Link href="/method#historical-radar">Read the radar method.</Link></p>
      </details>
      {!summary && !error && <p role="status">Reading the monthly historical summary…</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" className="btn btn-quiet" onClick={retry}>Try again</button></div>}
      {summary && <>
        <p className="radar-note" role="status">{mode === "highlights" ? `${highlights.length} historical highlights · showing ${shown.length}` : `${shown.length} study regions · ${selectedPeriod}`} · data through {summary.coverage.lastDay}</p>
        <div className="radar-results">{shown.map((result) => <AnomalyCard key={`${result.region.id}/${monthStamp(result.cell.year, result.cell.month)}`} result={result} config={config} onSelect={(r) => onSelect(r, config)} />)}</div>
        {shown.length === 0 && <p>No historical highlights meet these filters. Choose Explore Period to inspect the available months.</p>}
        {mode === "highlights" && limit < highlights.length && <button className="btn btn-quiet" type="button" onClick={() => setLimit((n) => n + 12)}>Show more highlights</button>}
      </>}
    </section>
  );
}
