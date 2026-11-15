import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import evidence from "../../../public/method/evidence/evidence.json";
import charts from "../../../public/method/evidence/harmonization-charts.json";
import { loadArea } from "../../lib/data/area";
import { buildRecord, type FireRecord } from "../../lib/harmonize";
import { rectangleArea, type BBox } from "../../lib/data/types";
import { MonthlyEvidence, DailyEvidence } from "./MethodEvidence";

const root = join(__dirname, "../../..");
let record: FireRecord;
beforeAll(async () => {
  vi.stubGlobal("fetch", async (url: string) => new Response(readFileSync(join(root, "public", url))));
  record = buildRecord(await loadArea(rectangleArea(evidence.region.bbox as BBox)));
});

describe("Methods evidence provenance and calculations", () => {
  it("renders complete SVG titles as text for stable server hydration", () => {
    for (const [component, expected] of [[MonthlyEvidence, "2003: 37,380 detections"], [DailyEvidence, "2024-10-23: index 35.53, 366 detections"]] as const) {
      const html = renderToStaticMarkup(createElement(component));
      expect(html).toContain(`<title>${expected}</title>`);
      expect(html).not.toContain("<title></title>");
    }
  });
  it("keeps every evidence source unchanged", () => {
    for (const source of [...evidence.sources, ...charts.sources]) {
      const raw = readFileSync(join(root, source.path));
      const canonical = /\.(?:ts|csv|json|geojson|py|yaml)$/.test(source.path) ? raw.toString("utf8").replace(/\r\n/g, "\n") : raw;
      expect(createHash("sha256").update(canonical).digest("hex"), source.path).toBe(source.sha256);
    }
  });

  it("charts the same held-out predictions that produced the published national L2 metrics", () => {
    const h = charts.harmonized;
    for (const metric of evidence.metrics) {
      const rows = h.month.map((m, i) => ({ m, i })).filter(({ m, i }) => metric.period.startsWith("LOYO") ? h.loyo[i] : !h.loyo[i] && m.startsWith(metric.period));
      expect(rows, metric.period).toHaveLength(metric.months);
      const sum = (values: number[]) => rows.reduce((total, { i }) => total + values[i], 0);
      // Exported counts are rounded to whole hot spots, so the bias agrees to 0.01 percentage points.
      expect(100 * (sum(h.l2) / sum(h.aqua) - 1), metric.period).toBeCloseTo(metric.bias, 2);
    }
    for (const [i, m] of h.month.entries()) expect(h.lo[i] <= h.hi[i], m).toBe(true);
    expect(charts.biomes.map((b) => b.biome)).toEqual(["Amazon", "Cerrado", "Caatinga", "Atlantic Forest", "Pantanal", "Pampa"]);
    expect(charts.residuals.month).toEqual(expect.arrayContaining(charts.outageMonths));
  });

  it("reproduces the full same-month distribution and median with the application", () => {
    const months = record.months.filter((m) => m.month === 8 && m.year >= 2003 && m.year <= 2025);
    expect(months.map(({ year, value }) => ({ year, value }))).toEqual(evidence.monthly.reference);
    expect(months).toHaveLength(23);
    const selected = months.find((m) => m.year === evidence.monthly.selectedYear)!;
    expect(selected.value).toBe(evidence.monthly.value);
    expect(selected.median).toBe(evidence.monthly.median);
    expect(selected.ratio).toBe(evidence.monthly.ratio);
    expect(selected.source).toBe("observed");
    expect(selected.partial).toBe(false);
  });

  it("reproduces the actual flagged day and all twenty neighbours", () => {
    const at = record.days.findIndex((d) => d.date === evidence.daily.selectedDate);
    const day = record.days[at];
    expect(day.anomaly).toBe(true);
    expect(day.index).toBe(evidence.daily.index);
    expect(day.expected).toBe(evidence.daily.median);
    expect(record.reference).toBe(evidence.daily.reference);
    expect(record.days.slice(at - 10, at + 11).map((d) => ({ date: d.date, index: d.index, value: d.value, flagged: d.anomaly }))).toEqual(evidence.daily.days);
  });

  it("uses published national L2 metrics without interpreting log error as percent", () => {
    const [header, ...rows] = readFileSync(join(root, "harmonization/output/validation_metrics.csv"), "utf8").trim().split(/\r?\n/).map((r) => r.split(","));
    const data = rows.map((row) => Object.fromEntries(header.map((key, i) => [key, row[i]])))
      .filter((row) => row.escala === "Brasil × mês" && row.metodo === "Nível 2")
      .map((row) => ({ period: row.periodo, months: +row.n, bias: +row.vies_rel_pct, maeLog1p: +row.mae_log1p }));
    expect(evidence.metrics).toEqual(data);
  });

  it("ties quality counts and no-detection dates to the audit snapshot", () => {
    const report = JSON.parse(readFileSync(join(root, "qa/data-audit/reports/report.json"), "utf8"));
    expect(evidence.summary).toEqual(report.summary);
    expect(evidence.dataCommit).toBe(report.commit);
    expect(evidence.period).toEqual(report.period);
    for (const gap of evidence.gaps) {
      const id = gap.sensor === "MODIS Aqua" ? "Aqua" : "NOAA20";
      expect(gap.dates).toEqual(report.checks.find((c: { id: string }) => c.id === `coverage.no_detection.${id}`).evidence.days);
    }
  });
});
