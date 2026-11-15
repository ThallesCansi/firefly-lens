// Actual installed renderer + production terrain/basemap modules. Real DEM and
// NASA requests; no synthetic elevations or application-only test hooks.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const output = process.env.QA_OUTPUT || join(tmpdir(), "firefly-terrain-renderer");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-swiftshader"] });
const network = [], errors = [], cases = [], pending = [];
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 850 }, reducedMotion: "no-preference" });
  await context.route("http://terrain-review.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: '<style>body{margin:0}#map{width:100vw;height:100vh}</style><div id="map"></div>' });
    if (path === "/maplibre.mjs") return route.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/maplibre-gl/dist/maplibre-gl.mjs", "utf8") });
    if (path === "/worker.mjs") return route.fulfill({ contentType: "text/javascript", body: readFileSync("public/maplibre/maplibre-gl-worker.mjs", "utf8") });
    const name = path.slice(1).replace(/\.js$/, "");
    const body = ts.transpileModule(readFileSync(`src/lib/map/${name}.ts`, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    return route.fulfill({ contentType: "text/javascript", body });
  });
  const page = await context.newPage(); page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (!/tiles\.mapterhorn\.com|gibs\.earthdata\.nasa\.gov/.test(r.url())) return;
    pending.push((async () => {
      try { network.push({ url: r.url(), status: r.status(), bytes: (await r.body()).length, cors: r.headers()["access-control-allow-origin"] ?? null }); }
      catch { network.push({ url: r.url(), status: r.status(), cancelled: true }); }
    })());
  });
  await page.goto("http://terrain-review.test/");
  await page.evaluate(async () => {
    const lib = await import("/maplibre.mjs");
    const { withImagery } = await import("/basemap.js");
    const { createTerrain } = await import("/terrain.js");
    lib.setWorkerUrl("http://terrain-review.test/worker.mjs");
    const style = (theme = "light", kind = "satellite") => withImagery({ version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#6c8873" } }] }, theme, kind);
    const map = new lib.Map({ container: "map", style: style(), center: [-70.01, -32.68], zoom: 9.6, pitch: 60, maxPitch: 60, attributionControl: false });
    const manager = createTerrain(map, (phase) => { window.review.phase = phase; });
    window.review = { map, manager, style, phase: "off", terrainEvents: 0 };
    map.on("terrain", () => window.review.terrainEvents++);
    map.on("style.load", () => manager.styleLoaded());
    await new Promise((resolve) => map.on("load", resolve));
  });
  const pose = () => page.evaluate(() => {
    const m = window.review.map, c = m.getCenter();
    return { center: [c.lng, c.lat], zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing(), centerElevation: m.getCenterElevation() };
  });
  const loaded = async () => {
    await page.waitForFunction(() => window.review.phase === "active");
    await page.waitForFunction(() => window.review.map.areTilesLoaded());
    await page.waitForTimeout(250);
  };
  for (const projection of ["mercator", "globe"]) {
    await page.evaluate((projection) => window.review.map.setProjection({ type: projection }), projection);
    for (const [name, center, zoom] of [["andes", [-70.01, -32.68], 9.6], ["serra-do-mar", [-43.04, -22.46], 10], ["pantanal", [-56.5, -19], 9.4]]) {
      await page.evaluate(({ center, zoom }) => { const { map, manager } = window.review; manager.setEnabled(false); map.jumpTo({ center, zoom, pitch: 60, bearing: 0, padding: 0 }); }, { center, zoom });
      await page.waitForFunction(() => window.review.map.areTilesLoaded());
      const before = await pose();
      const flat = await page.evaluate((center) => { const p = window.review.map.project(center); return [p.x, p.y]; }, center);
      await page.screenshot({ path: join(output, `${name}-${projection}-off.png`) });
      await page.evaluate(() => window.review.manager.setEnabled(true)); await loaded();
      const after = await pose();
      const geometry = await page.evaluate((center) => {
        const m = window.review.map;
        const samples = [[0, 0], [-.04, 0], [.04, 0], [0, -.04], [0, .04]].map(([dx, dy]) => {
          const lngLat = [center[0] + dx, center[1] + dy], p = m.project(lngLat), back = m.unproject(p);
          return { lngLat, elevation: m.queryTerrainElevation(lngLat), pixel: [p.x, p.y], roundtripDegrees: Math.hypot(back.lng - lngLat[0], back.lat - lngLat[1]) };
        });
        return { terrain: m.getTerrain(), samples, centerPixel: samples[0].pixel, events: window.review.terrainEvents };
      }, center);
      assert.equal(geometry.terrain.exaggeration, 1);
      assert.ok(geometry.samples.every((p) => Number.isFinite(p.elevation) && p.elevation >= 0));
      if (name === "andes") assert.ok(Math.max(...geometry.samples.map((p) => p.elevation)) > 3000, "Real decoded mountain elevation");
      assert.equal(after.pitch, before.pitch); assert.equal(after.bearing, before.bearing);
      await page.screenshot({ path: join(output, `${name}-${projection}-on.png`) });
      cases.push({ name, projection, before, after, flatCenterPixel: flat, ...geometry });
      console.log(`Real terrain: ${name}, ${projection}, center ${geometry.samples[0].elevation.toFixed(1)}m`);
    }
  }
  // Measure cadence during the same native bearing animation, not a claimed
  // device-wide FPS benchmark. Software WebGL timings are kept with evidence.
  const frameTimes = [];
  for (const enabled of [false, true]) {
    await page.evaluate((enabled) => { const r = window.review; r.manager.setEnabled(enabled); r.map.setProjection({ type: "mercator" }); r.map.jumpTo({ center: [-70.01, -32.68], zoom: 9.6, pitch: 60, bearing: 0 }); }, enabled);
    if (enabled) await loaded();
    frameTimes.push(await page.evaluate(async (enabled) => {
      const m = window.review.map, frames = [], renders = []; let last = performance.now(), lastRender = last; const start = last;
      const rendered = () => { const now = performance.now(); renders.push(now - lastRender); lastRender = now; };
      m.on("render", rendered);
      m.easeTo({ bearing: 15, duration: 1200, essential: false });
      await new Promise((resolve) => { const tick = (now) => { frames.push(now - last); last = now; if (now - start < 1500) requestAnimationFrame(tick); else resolve(); }; requestAnimationFrame(tick); });
      m.off("render", rendered);
      const sorted = [...frames].sort((a, b) => a - b);
      const renderSorted = [...renders].sort((a, b) => a - b);
      return { enabled, frameCount: frames.length, medianMs: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.floor(sorted.length * .95)], over50Ms: frames.filter((n) => n > 50).length,
        renderCount: renders.length, renderMedianMs: renderSorted[Math.floor(renderSorted.length * .5)], renderP95Ms: renderSorted[Math.floor(renderSorted.length * .95)] };
    }, enabled));
  }
  // Existing production basemap transformation, theme/style restoration and
  // active globe transition, while reusing the same terrain manager.
  for (const [theme, kind] of [["dark", "map"], ["light", "satellite"]]) {
    await page.evaluate(({ theme, kind }) => { const r = window.review; r.manager.styleLoading(); r.map.setStyle(r.style(theme, kind), { diff: false }); }, { theme, kind });
    await loaded();
  }
  await page.evaluate(() => { const r = window.review; r.map.setProjection({ type: "globe" }); r.map.flyTo({ center: [-70, -32.7], zoom: 12.2, duration: 1200 }); });
  await page.waitForFunction(() => !window.review.map.isMoving()); await loaded();
  await page.evaluate(() => window.review.manager.dispose());
  await Promise.allSettled(pending);
  assert.deepEqual(errors, []);
  assert.ok(network.some((r) => r.url.includes("mapterhorn") && r.status === 200 && r.bytes > 0));
  writeFileSync(join(output, "results.json"), JSON.stringify({ engine: "6.18.0", cases, frameTimes, network, errors, note: "Chrome headless software WebGL; native terrain module and existing NASA basemap; no GPU/FPS generalization" }, null, 2));
} finally { await browser.close(); }
