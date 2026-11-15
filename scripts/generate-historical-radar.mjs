// Derive presentation data from production science modules; never refit/reimplement harmonization.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
// Same isolated loading strategy already used by export-method-evidence.mjs.
require.extensions[".ts"] = (module, filename) => {
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }, fileName: filename,
  });
  module._compile(compiled.outputText, filename);
};
const { loadArea } = require(join(root, "src/lib/data/area.ts"));
const { tilesFor } = require(join(root, "src/lib/data/tiles.ts"));
const { meta } = require(join(root, "src/lib/data/meta.ts"));
const { rectangleArea } = require(join(root, "src/lib/data/types.ts"));
const { buildRecord } = require(join(root, "src/lib/harmonize.ts"));
const { DEFAULT_RADAR_CONFIG, evaluateRegion } = require(join(root, "src/lib/anomalies.ts"));
const { MONTH_QUALITY_VERSION, OBSERVATION_GAPS } = require(join(root, "src/lib/data/month-quality.ts"));
const { RADAR_SCHEMA_VERSION, parseRadarSummary } = require(join(root, "src/lib/data/radar.ts"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const tiles = [...new Set(meta.presets.flatMap((p) => tilesFor(p.bbox).map(([x, y]) => `public/data/brazil/t_${x}_${y}.bin.gz`)))];
const paths = [
  "public/data/brazil/meta.json", "src/lib/data/meta.ts", "src/lib/data/types.ts",
  "src/lib/data/tiles.ts", "src/lib/data/area.ts", "src/lib/geo/clip.ts", "src/lib/dates.ts",
  "src/lib/harmonize.ts", "src/lib/anomalies.ts", "src/lib/data/month-quality.ts",
  "src/lib/data/radar.ts", "scripts/generate-historical-radar.mjs", ...tiles,
].sort();
const inputs = paths.map((path) => {
  const bytes = readFileSync(join(root, path));
  return { path, sha256: hash(/\.(ts|mjs|json)$/.test(path) ? bytes.toString("utf8").replace(/\r\n/g, "\n") : bytes) };
});
const summary = {
  schemaVersion: RADAR_SCHEMA_VERSION, qualityVersion: MONTH_QUALITY_VERSION,
  coverage: {
    firstDay: meta.firstDay, lastDay: meta.lastDay, seriesEnd: meta.seriesEnd,
    partialMonth: meta.partialMonth, observedUntil: meta.observedUntil,
  },
  defaultConfig: DEFAULT_RADAR_CONFIG,
  sourceFingerprint: hash(JSON.stringify(inputs)), inputs,
  intervalDescription: "Nominal 95% predictive interval; coverage is not validated for arbitrary study regions.",
  regions: [],
};
const previousFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url) => new Response(readFileSync(join(root, "public", String(url).replace(/^\/+/, ""))));
  // Sequential regions avoid multiplying the daily-record allocation peak.
  for (const preset of meta.presets) {
    const area = await loadArea(rectangleArea(preset.bbox, preset.name));
    const record = buildRecord(area);
    assert.ok(area.cells > 0);
    const dailySums = new Map();
    for (const day of record.days) dailySums.set(day.date.slice(0, 7), (dailySums.get(day.date.slice(0, 7)) ?? 0) + day.value);
    for (const cell of record.months) {
      const stamp = `${cell.year}-${String(cell.month + 1).padStart(2, "0")}`;
      assert.ok(Math.abs(dailySums.get(stamp) - cell.value) < Math.max(1e-7, cell.value * 1e-10), `${preset.id}/${stamp}: monthly conservation`);
      assert.equal(cell.source, cell.year > meta.observedUntil ? "modeled" : "observed", `${preset.id}/${stamp}: missing source`);
    }
    summary.regions.push({ ...preset, months: record.months.map(({ year, month, value, source, lo, hi, partial }) => ({ year, month, value, source, lo, hi, partial })) });
  }
} finally { globalThis.fetch = previousFetch; }
parseRadarSummary(summary);

const rows = summary.regions.map((region) => {
  const current = evaluateRegion(region, DEFAULT_RADAR_CONFIG, summary.coverage);
  const extended = evaluateRegion(region, { ...DEFAULT_RADAR_CONFIG, baseline: [2003, 2025] }, summary.coverage);
  const highlights = current.filter((r) => r.status === "highlight");
  const ratioOnly = current.filter((r) => r.status !== "excluded" && r.referenceYears.length >= DEFAULT_RADAR_CONFIG.minReferenceYears && r.ratio >= DEFAULT_RADAR_CONFIG.minRatio);
  return { name: region.name, total: current.length, eligible: current.filter((r) => r.status !== "excluded").length,
    highlights: highlights.length, observed: highlights.filter((r) => r.cell.source === "observed").length,
    modeled: highlights.filter((r) => r.cell.source === "modeled").length,
    ratioOnly: ratioOnly.length, small: ratioOnly.filter((r) => r.cell.value < DEFAULT_RADAR_CONFIG.minCount).length,
    excess: ratioOnly.filter((r) => r.excess < DEFAULT_RADAR_CONFIG.minExcess).length,
    extended: extended.filter((r) => r.status === "highlight").length,
  };
});
const report = `# Historical Anomaly Radar — initial threshold report

Generated from real exported tiles using loadArea → buildRecord. No Python/model changes.
Data coverage: ${meta.firstDay} to ${meta.lastDay}; last complete month: ${meta.seriesEnd}.
Schema ${summary.schemaVersion}; quality policy ${summary.qualityVersion}; source fingerprint: ${summary.sourceFingerprint}.

## Initial configurable policy

Main baseline: 2003–2023, excluding the evaluated year. Minimum reference: 15 eligible years.
Ratio ≥ 2; value ≥ 100 Aqua equivalents; excess ≥ 50; value ≥ reference P90.
These are exploratory product filters, not calibrated significance thresholds.

| Region | Months | Eligible | Highlights | Observed | Modeled | Ratio ≥ 2 alone* | Below count floor* | Below excess floor* | Highlights, 2003–2025 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${rows.map((r) => `| ${r.name} | ${r.total} | ${r.eligible} | ${r.highlights} | ${r.observed} | ${r.modeled} | ${r.ratioOnly} | ${r.small} | ${r.excess} | ${r.extended} |`).join("\n")}

*Among eligible targets with sufficient reference years and defined ratio. The floor diagnostics overlap and must not be added. The P90 condition can remove additional targets; this table makes comparison to ratio-only screening explicit.

## Exclusions and interpretation

- July 2002 starts on July 4. ${meta.partialMonth} is partial. Both remain available in Explore Period, without a ratio or rank.
- Whole months touched by documented Aqua gaps are excluded from candidates, references and ranks: August/September 2020 and March/April 2022. Documented intervals: ${OBSERVATION_GAPS.map((g) => `${g.from}–${g.to}`).join("; ")}. Source: harmonization/docs/METHODOLOGY.md, section 5. No gap-filling or inference from zero detections.
- Rank uses all eligible same-calendar-month records across the archive, including the target and modeled months; ties share rank. This pool differs from the baseline. Standing is descriptive, not a probability.
- 2003–2023 reduces potential influence of the 2024–2025 Aqua drift in the reference. It does not fully correct comparability: evaluated 2024–2025 observations still contain drift and 2026 changes to modeled VIIRS. No drift correction was applied.
- Modeled ranges are nominal 95% predictive intervals. Coverage is not validated for arbitrary study regions. VIIRS from August 2026 is near real time, with processing limitations documented by the project.
- Historical comparisons are retrospective and can use years later than the evaluated year. These are positive monthly historical departures, separate from daily local MAD flags; not forecasts or future fire risk.
- Presets are study rectangles, not official biome boundaries. Threshold suitability across these differently sized regions needs review; no thresholds are declared final by this report.

## Reproduction and freshness

Run pnpm radar:generate to regenerate JSON and this report. Run pnpm radar:check to recompute using production functions and compare exact deterministic content of both artifacts. Input hashes include metadata, all ${tiles.length} required tiles and the science/quality/generator modules; text hashes normalize CRLF to LF. A change to values, source inputs, policy, generator, summary content or report fails verification. dev/build run verification first. No timestamp makes regeneration reproducible.
`;
const artifacts = [
  ["public/data/brazil/historical-radar.json", `${JSON.stringify(summary)}\n`],
  ["docs/historical-radar-report.md", report],
];
if (process.argv.includes("--check")) {
  for (const [path, expected] of artifacts) {
    let actual = "";
    try { actual = readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n"); } catch { /* A missing artifact is stale too. */ }
    assert.ok(actual === expected, `Stale ${path}. Run pnpm radar:generate.`);
  }
  console.log("Radar freshness and real-data reproduction passed.");
} else {
  for (const [path, content] of artifacts) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  console.table(rows);
  console.log(`Summary: ${Buffer.byteLength(JSON.stringify(summary))} bytes; ${tiles.length} source tiles. Thresholds remain provisional.`);
}
