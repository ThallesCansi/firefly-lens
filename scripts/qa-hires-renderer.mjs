// Matched real-renderer comparisons. Direct provider requests, no tile proxy/cache.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const output = process.env.QA_OUTPUT || "docs/hires-satellite-poc/renderer";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-swiftshader"] });
const network = [], failedRequests = [], errors = [], cases = [], pending = [];
let activeCase = "initialization";
try {
  const context = await browser.newContext({ viewport: { width: 960, height: 640 }, reducedMotion: "reduce" });
  await context.route("http://hires-review.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: '<link rel="stylesheet" href="/maplibre.css"><style>body{margin:0}#map{width:100vw;height:100vh}.maplibregl-ctrl-attrib{max-width:600px}</style><div id="map"></div>' });
    if (path === "/maplibre.css") return route.fulfill({ contentType: "text/css", body: readFileSync("node_modules/maplibre-gl/dist/maplibre-gl.css", "utf8") });
    if (path === "/maplibre.mjs") return route.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/maplibre-gl/dist/maplibre-gl.mjs", "utf8") });
    if (path === "/worker.mjs") return route.fulfill({ contentType: "text/javascript", body: readFileSync("public/maplibre/maplibre-gl-worker.mjs", "utf8") });
    const name = path.slice(1).replace(/\.js$/, "");
    const body = ts.transpileModule(readFileSync(`src/lib/map/${name}.ts`, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from "\.\/(.*?)"/g, 'from "./$1.js"');
    return route.fulfill({ contentType: "text/javascript", body });
  });
  const page = await context.newPage(); page.setDefaultTimeout(60000);
  const tile = (url) => /tiles\.mapterhorn\.com|gibs\.earthdata\.nasa\.gov|tiles\.maps\.eox\.at/.test(url);
  const requests = new Map();
  page.on("request", (r) => { if (tile(r.url())) requests.set(r, { case: activeCase, start: Date.now() }); });
  page.on("requestfailed", (r) => { if (tile(r.url())) failedRequests.push({ url: r.url(), ...requests.get(r), error: r.failure()?.errorText }); });
  page.on("response", (r) => {
    if (!tile(r.url())) return;
    pending.push((async () => {
      const row = { url: r.url(), status: r.status(), ...requests.get(r.request()), cors: r.headers()["access-control-allow-origin"] ?? null };
      try { row.bytes = (await r.body()).length; row.durationMs = Date.now() - row.start; }
      catch { row.cancelled = true; }
      network.push(row);
    })());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://hires-review.test/");
  await page.evaluate(async () => {
    const lib = await import("/maplibre.mjs");
    const { withImagery } = await import("/basemap.js");
    const { createTerrain } = await import("/terrain.js");
    const { createImagery } = await import("/imagery.js");
    lib.setWorkerUrl("http://hires-review.test/worker.mjs");
    const map = new lib.Map({ container: "map", style: withImagery({ version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#6c8873" } }] }, "light", "map"),
      center: [-70.01, -32.68], zoom: 8, pitch: 55, bearing: 0, maxPitch: 60, attributionControl: false });
    map.addControl(new lib.AttributionControl({ compact: false }));
    const review = window.review = { map, terrainPhase: "off", imageryPhase: "off" };
    review.terrain = createTerrain(map, (phase) => review.terrainPhase = phase);
    review.imagery = createImagery(map, (phase) => review.imageryPhase = phase);
    review.imagery.configure("nasa-blue-marble", true, "light");
    map.on("style.load", () => { review.terrain.styleLoaded(); review.imagery.styleLoaded(); });
    await new Promise((resolve) => map.on("load", resolve));
  });
  for (const projection of ["mercator", "globe"]) {
    for (const [place, center] of [["andes", [-70.01, -32.68]], ["serra-do-mar", [-43.04, -22.46]], ["pantanal", [-56.5, -19]]]) {
      for (const zoom of [8, 10, 12, 14]) {
        for (const provider of ["nasa-blue-marble", "eox-sentinel-2025"]) {
          for (const terrain of [false, true]) {
            activeCase = `${place}-${projection}-z${zoom}-${provider}-terrain-${terrain ? "on" : "off"}`;
            const start = Date.now();
            await page.evaluate(({ center, zoom, provider, terrain, projection }) => {
              const r = window.review;
              r.map.setProjection({ type: projection });
              r.terrain.setEnabled(terrain); r.imagery.configure(provider, true, "light");
              r.map.jumpTo({ center, zoom, pitch: 55, bearing: 0, padding: 0 });
            }, { center, zoom, provider, terrain, projection });
            await page.waitForFunction(({ terrain }) => {
              const r = window.review;
              return r.imageryPhase === "active" && r.terrainPhase === (terrain ? "active" : "off") && r.map.areTilesLoaded();
            }, { terrain });
            // Terrain arrival can update elevation-dependent framing. Reapply the
            // identical numeric pose after loading, then record actual parameters.
            await page.evaluate(({ center, zoom }) => window.review.map.jumpTo({ center, zoom, pitch: 55, bearing: 0, padding: 0 }), { center, zoom });
            await page.waitForFunction(() => window.review.map.areTilesLoaded());
            await page.waitForTimeout(250);
            const actual = await page.evaluate(() => {
              const r = window.review, m = r.map, c = m.getCenter();
              return { center: [c.lng, c.lat], zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing(), projection: m.getProjection().type,
                centerElevation: m.getCenterElevation(), terrain: m.getTerrain(), imageryPhase: r.imageryPhase };
            });
            assert.ok(Math.abs(actual.zoom - zoom) < 1e-6);
            assert.ok(actual.center.every((v, i) => Math.abs(v - center[i]) < 1e-6));
            assert.ok(Math.abs(actual.pitch - 55) < 1e-6); assert.ok(Math.abs(actual.bearing) < 1e-6);
            const screenshot = `${activeCase}.jpg`;
            await page.screenshot({ path: join(output, screenshot), type: "jpeg", quality: 80 });
            cases.push({ id: activeCase, place, provider, projection, terrain, requested: { center, zoom, pitch: 55, bearing: 0 }, actual, screenshot, elapsedMs: Date.now() - start });
            console.log(activeCase);
          }
        }
      }
    }
  }
  await Promise.allSettled(pending);
  assert.deepEqual(errors, []);
} finally {
  await Promise.allSettled(pending);
  const totals = Object.fromEntries(["eox", "nasa", "dem"].map((provider) => {
    const rows = network.filter((r) => r.url.includes(provider === "eox" ? "tiles.maps.eox.at" : provider === "nasa" ? "gibs.earthdata.nasa.gov" : "tiles.mapterhorn.com"));
    return [provider, { responses: rows.length, bytes: rows.reduce((sum, r) => sum + (r.bytes || 0), 0), statuses: rows.reduce((out, r) => ({ ...out, [r.status]: (out[r.status] || 0) + 1 }), {}) }];
  }));
  writeFileSync(join(output, "results.json"), JSON.stringify({ viewport: { width: 960, height: 640 }, softwareWebGL: true, cases, totals, network, failedRequests, errors }, null, 2));
  writeFileSync(join(output, "index.html"), `<!doctype html><meta charset="utf-8"><title>Matched satellite / terrain comparisons</title><style>body{font:14px system-ui;background:#172128;color:#fff;margin:20px}section{display:grid;grid-template-columns:1fr 1fr;gap:12px}img{width:100%}figure{margin:0 0 12px}h2{margin-top:40px}a{color:#9ee}</style><h1>FireFly Lens — matched renderer comparisons</h1><p>960 × 640 · pitch 55° · bearing 0° · real provider tiles · reference imagery independent of analysis dates. NASA fades above z9 and is transparent from z11.5. Bare background isolates raster/DEM; use app screenshots for UI validation. EOX imagery: CC BY-NC-SA 4.0; credits are embedded in each image. See results.json for actual poses, network and software-rendering limitations.</p>` +
    [...new Set(cases.map((c) => `${c.place}-${c.projection}-${c.requested.zoom}`))].map((group) => `<h2>${group}</h2><section>` + cases.filter((c) => `${c.place}-${c.projection}-${c.requested.zoom}` === group).map((c) => `<figure><figcaption>${c.provider} / Terrain ${c.terrain ? "ON" : "OFF"}</figcaption><a href="${c.screenshot}"><img loading="lazy" src="${c.screenshot}" alt="${c.id}"></a></figure>`).join("") + "</section>").join(""));
  await browser.close();
}
