// Generate presentation evidence from committed inputs and the actual app calculations.
// Run at the repository root: node qa/data-audit/export-method-evidence.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (path) => readFileSync(join(root, path));
const isText = (path) => /\.(?:ts|csv|json|geojson)$/.test(path);
const sourceHash = (path) => hash(isText(path) ? read(path).toString("utf8").replace(/\r\n/g, "\n") : read(path));
const audit = JSON.parse(read("qa/data-audit/reports/report.json"));
for (const file of audit.inventory) {
  const bytes = read(file.path);
  const candidates = [hash(bytes)];
  // Git's Windows autocrlf checkout changes text bytes, never scientific values.
  if (isText(file.path)) {
    const lf = bytes.toString("utf8").replace(/\r\n/g, "\n");
    candidates.push(hash(lf), hash(lf.replace(/\n/g, "\r\n")));
  }
  assert.ok(candidates.includes(file.sha256), `Stale audit: ${file.path}`);
}

// Isolated TS loader: production functions are imported, never reimplemented.
require.extensions[".ts"] = (module, filename) => {
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(compiled.outputText, filename);
};
const { loadArea } = require(join(root, "src/lib/data/area.ts"));
const { buildRecord, median } = require(join(root, "src/lib/harmonize.ts"));
const bbox = [-60, -16, -48, -4];
const previousFetch = globalThis.fetch;
let record;
try {
  globalThis.fetch = async (url) => new Response(read(`public/${String(url).replace(/^\/+/, "")}`));
  record = buildRecord(await loadArea(bbox));
} finally {
  globalThis.fetch = previousFetch;
}
const september = record.months.filter((m) => m.month === 8 && m.year >= 2003 && m.year <= 2025);
const selected = september.find((m) => m.year === 2024);
assert.equal(selected.value, 44519);
assert.equal(selected.median, 20551);
const target = record.days.filter((d) => d.year === 2024 && d.anomaly).sort((a, b) => b.value - a.value)[0];
assert.ok(target, "A real flagged day is required");
const at = record.days.findIndex((d) => d.date === target.date);
const window = record.days.slice(at - 10, at + 11);
const neighbours = window.filter((d) => d.date !== target.date).map((d) => d.index);
const middle = median(neighbours);
const spread = median(neighbours.map((v) => Math.abs(v - middle))) * 1.4826;
assert.equal(target.expected, middle);
const rows = (path) => {
  const [header, ...lines] = read(path).toString("utf8").trim().split(/\r?\n/).map((line) => line.split(","));
  return lines.map((line) => Object.fromEntries(header.map((key, i) => [key, line[i]])));
};
const metricsPath = "harmonization/output/validation_metrics.csv";
const rankingsPath = "harmonization/output/validation_rankings.csv";
const metrics = rows(metricsPath).filter((r) => r.escala === "Brasil × mês" && r.metodo === "Nível 2").map((r) => ({
  period: r.periodo, months: Number(r.n), bias: Number(r.vies_rel_pct), maeLog1p: Number(r.mae_log1p),
}));
const rank = rows(rankingsPath).find((r) => r.bioma === "Brasil" && r.metodo === "Nível 2");
const gaps = audit.checks.filter((c) => c.id.startsWith("coverage.no_detection.")).map((c) => ({
  sensor: c.id.endsWith("Aqua") ? "MODIS Aqua" : "VIIRS NOAA-20",
  dates: c.evidence.days,
}));
const sources = [metricsPath, rankingsPath, "qa/data-audit/reports/report.json", "src/lib/harmonize.ts", "src/lib/data/area.ts"];
const evidence = {
  hashConvention: "SHA-256; text sources normalized to LF, binary files unchanged",
  dataCommit: audit.commit, referenceDate: audit.reference_date, summary: audit.summary,
  period: audit.period, metrics, seasonalSpearman: Number(rank.spearman_meses), gaps,
  region: { name: "Southern Amazon study box", bbox, cells: record.cells },
  monthly: { month: "September", selectedYear: selected.year, value: selected.value, median: selected.median, ratio: selected.ratio,
    reference: september.map((m) => ({ year: m.year, value: m.value })) },
  daily: { selectedDate: target.date, value: target.value, index: target.index, reference: record.reference,
    median: middle, scaledMad: spread, flagged: target.anomaly,
    threshold: Math.max(0.22, middle * 2, middle + Math.max(0.15, 4 * spread)),
    days: window.map((d) => ({ date: d.date, index: d.index, value: d.value, flagged: d.anomaly })) },
  sources: sources.map((path) => ({ path, sha256: sourceHash(path) })),
};
const directory = join(root, "public/method/evidence");
mkdirSync(directory, { recursive: true });
for (const name of ["before_after_brazil.png", "before_after_brazil_zoom.png", "scatter_by_biome.png", "residuals_time.png"]) {
  const source = `harmonization/output/figures/${name}`;
  copyFileSync(join(root, source), join(directory, name));
  evidence.sources.push({ path: source, sha256: hash(read(source)) });
}
writeFileSync(join(directory, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(`Methods evidence exported: ${september.length} reference years, daily example ${target.date}, ${metrics.length} validation periods.`);
