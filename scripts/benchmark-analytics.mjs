// Real local/deployed Next → Python smoke benchmark; no synthetic observations.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
const base = process.argv[2] || "http://localhost:3118";
const meta = JSON.parse(await readFile("public/data/brazil/meta.json", "utf8"));
const keys = ["version","firstDay","lastDay","seriesEnd","partialMonth","observedUntil","climatologyBase","cellDeg","commonErrorC"];
const geometry = { type: "Polygon", coordinates: [[[-57.47,-18.47],[-56.57,-18.43],[-56.83,-17.67],[-57.47,-18.47]]] };
const body = { schema_version: "1.0.0", geometry, data_version: Object.fromEntries(keys.map((key) => [key,meta[key]])), horizon: 3 };
const measurements = [];
let first;
for (const section of ["history","history","forecast","fire-weather"]) {
  const start = performance.now();
  const response = await fetch(new URL(`/api/analytics/${section}`, base), {
    method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  const result = await response.json();
  assert.equal(response.status,200,JSON.stringify(result));
  assert.equal(result.schema_version,"1.0.0");
  assert.equal(result.geometry.type,"Polygon");
  assert.equal(result.geometry.coordinates.length,1);
  const vertices = (ring) => ring.slice(0,-1).map((point) => JSON.stringify(point)).sort();
  assert.deepEqual(vertices(result.geometry.coordinates[0]),vertices(geometry.coordinates[0]));
  const forecast = result.sections?.forecast.data;
  if (section === "history") {
    const months = result.sections.history.data.monthly;
    assert.equal(months.length,293);
    assert.equal(result.sections.history.source.synthetic,false);
    if (first) assert.deepEqual(months,first); else first = months;
  }
  if (section === "forecast" && forecast.forecast_status !== "experimental") assert.ok(forecast.predictions.every((p) => p.value === null));
  measurements.push({ section, seconds: Math.round((performance.now()-start))/1000, http_status: response.status,
    monthly_rows: result.sections?.history.data.monthly.length ?? null,
    forecast_status: section === "forecast" ? forecast.forecast_status : undefined,
    reason: section === "forecast" ? forecast.reason : section === "fire-weather" ? result.data.reason : undefined,
  });
}
const output = { transport: "Next HTTP proxy → authenticated FastAPI → real Brazilian Parquet", geometry,
  generated_at: new Date().toISOString(), measurements };
await writeFile("docs/scientific-proxy-benchmark.json",JSON.stringify(output,null,2)+"\n");
console.log(JSON.stringify(output,null,2));
