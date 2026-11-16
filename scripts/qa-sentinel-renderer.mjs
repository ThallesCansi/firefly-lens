// Compare only imagery modules against the PoC; never check out or import its engine integration.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const output = process.env.QA_OUTPUT || "docs/sentinel-default";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-swiftshader"] });
const cases = [], errors = [], forbidden = [];
try {
  for (const revision of ["production", "poc"]) {
    const context = await browser.newContext({ viewport: { width: 960, height: 640 }, reducedMotion: "reduce" });
    await context.route("http://sentinel-review.test/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/") return route.fulfill({ contentType: "text/html", body: '<link rel="stylesheet" href="/maplibre.css"><style>body{margin:0}#map{width:100vw;height:100vh}.maplibregl-ctrl-attrib{max-width:600px}</style><div id="map"></div>' });
      const asset = { "/maplibre.mjs": ["node_modules/maplibre-gl/dist/maplibre-gl.mjs", "text/javascript"], "/maplibre.css": ["node_modules/maplibre-gl/dist/maplibre-gl.css", "text/css"], "/worker.mjs": ["public/maplibre/maplibre-gl-worker.mjs", "text/javascript"] }[path];
      if (asset) return route.fulfill({ contentType: asset[1], body: readFileSync(asset[0], "utf8") });
      const file = `src/lib/map/${path.slice(1).replace(/\.js$/, "")}.ts`;
      const source = revision === "production" ? readFileSync(file, "utf8") : execFileSync("git", ["show", `feature/hires-satellite-poc:${file}`], { encoding: "utf8" });
      return route.fulfill({ contentType: "text/javascript", body: ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/from "\.\/(.*?)"/g, 'from "./$1.js"') });
    });
    const p = await context.newPage(); p.setDefaultTimeout(60000);
    p.on("pageerror", (e) => errors.push(e.message)); p.on("request", (r) => { if (/mapterhorn/i.test(r.url())) forbidden.push(r.url()); });
    await p.goto("http://sentinel-review.test/");
    await p.evaluate(async () => {
      const lib = await import("/maplibre.mjs"), { withImagery } = await import("/basemap.js"), { createImagery } = await import("/imagery.js");
      lib.setWorkerUrl("http://sentinel-review.test/worker.mjs");
      const m = new lib.Map({ container: "map", style: withImagery({ version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#6c8873" } }] }, "light", "map"),
        center: [-70.01, -32.68], zoom: 12, pitch: 55, bearing: 0, attributionControl: false });
      m.addControl(new lib.AttributionControl({ compact: false }));
      window.review = { map: m, phase: "off" };
      const imagery = createImagery(m, (phase) => window.review.phase = phase); window.review.imagery = imagery;
      imagery.configure("eox-sentinel-2025", true, "light"); m.on("style.load", () => imagery.styleLoaded());
      await new Promise((resolve) => m.on("load", resolve));
      m.setProjection({ type: "mercator" });
    });
    for (const [place, center] of [["andes", [-70.01, -32.68]], ["serra-do-mar", [-43.04, -22.46]], ["pantanal", [-56.5, -19]]]) {
      await p.evaluate((center) => window.review.map.jumpTo({ center, zoom: 12, pitch: 55, bearing: 0, padding: 0 }), center);
      await p.waitForFunction(() => window.review.phase === "active" && window.review.map.areTilesLoaded()); await p.waitForTimeout(700);
      const pose = await p.evaluate(() => { const m = window.review.map, c = m.getCenter(); return { center: [c.lng, c.lat], zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing(), projection: m.getProjection().type }; });
      const screenshot = `${place}-${revision}.jpg`;
      const pixels = await p.screenshot({ path: join(output, screenshot), type: "jpeg", quality: 80 });
      cases.push({ revision, place, pose, screenshot, sha256: createHash("sha256").update(pixels).digest("hex") });
      // Exercise the real engine's complete attitude through provider swaps.
      await p.evaluate(() => window.review.imagery.configure("nasa-blue-marble", true, "light"));
      await p.waitForFunction(() => window.review.phase === "active");
      await p.evaluate(() => window.review.imagery.configure("eox-sentinel-2025", true, "light"));
      await p.waitForFunction(() => window.review.phase === "active");
      const after = await p.evaluate(() => { const m = window.review.map, c = m.getCenter(); return { center: [c.lng, c.lat], zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing(), projection: m.getProjection().type }; });
      assert.deepEqual(after, pose);
    }
    await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
  const comparisons = cases.filter((r) => r.revision === "production").map((r) => {
    const old = cases.find((s) => s.revision === "poc" && s.place === r.place); assert.deepEqual(r.pose, old.pose);
    return { place: r.place, identicalScreenshot: r.sha256 === old.sha256, matchedPose: true };
  });
  writeFileSync(join(output, "renderer-comparison.json"), JSON.stringify({ viewport: { width: 960, height: 640 }, sourceBranch: "feature/hires-satellite-poc", cases, comparisons, errors, forbiddenRequests: forbidden }, null, 2));
  console.log(JSON.stringify(comparisons));
} finally { await browser.close(); }
