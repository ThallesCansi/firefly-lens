// Same real MapLibre engine and input traces, with controller source read directly
// from 5d457c7 or the working tree. No baseline checkout or app test hooks needed.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import ts from "typescript";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const label = process.env.QA_LABEL || "after";
const output = process.env.QA_OUTPUT || join(tmpdir(), "firefly-gesture-comparison");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-swiftshader"] });
const rows = [], interruptions = [], profiles = [], errors = [];
const source = (mode, name) => mode === "baseline" ? execFileSync("git", ["show", `5d457c7:src/lib/map/${name}.ts`], { encoding: "utf8" }) : readFileSync(`src/lib/map/${name}.ts`, "utf8");
try {
  for (const mode of ["interruptions", "profiles"].includes(label) ? ["working"] : ["baseline", "working"]) {
    const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, hasTouch: true, reducedMotion: "no-preference" });
    await context.route("http://camera-review.test/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/") return route.fulfill({ contentType: "text/html", body: '<style>body{margin:0}#map{width:100vw;height:100vh}</style><div id="map"></div>' });
      if (path === "/maplibre.mjs") return route.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/maplibre-gl/dist/maplibre-gl.mjs", "utf8") });
      if (path === "/worker.mjs") return route.fulfill({ contentType: "text/javascript", body: readFileSync("public/maplibre/maplibre-gl-worker.mjs", "utf8") });
      const name = path.split("/").at(-1).replace(/\.js$/, "");
      const body = ts.transpileModule(source(mode, name), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
        .replace(/from "\.\/(.*?)"/g, 'from "./$1.js"');
      return route.fulfill({ contentType: "text/javascript", body });
    });
    const page = await context.newPage(); page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://camera-review.test/");
    await page.evaluate(async (mode) => {
      const maplibregl = await import("/maplibre.mjs");
      const { createController } = await import(`/${mode}/controller.js`);
      maplibregl.setWorkerUrl("http://camera-review.test/worker.mjs");
      const map = new maplibregl.Map({ container: "map", style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#1c3845" } }] },
        center: [-54, -14], zoom: 2.6, dragRotate: false, pitchWithRotate: false, touchPitch: false, attributionControl: false, cooperativeGestures: false, renderWorldCopies: false });
      await new Promise((resolve) => map.on("load", resolve));
      const counts = { stops: 0, starts: 0, moves: 0 };
      const nativeStop = map.stop.bind(map); map.stop = (...args) => { counts.stops++; return nativeStop(...args); };
      const controller = createController(map, maplibregl.Point, "globe", { onProjection() {} }); controller.styleLoaded();
      map.on("movestart", () => counts.starts++); map.on("move", () => counts.moves++);
      const calls = [];
      for (const method of ["flyTo", "easeTo", "jumpTo"]) {
        const native = map[method].bind(map);
        map[method] = (options, ...rest) => { calls.push({ method, ...options }); return native(options, ...rest); };
      }
      window.review = { map, controller, counts, calls };
    }, mode);
    const reset = async (center, zoom, tilted = false) => {
      await page.evaluate(({ center, zoom, tilted }) => {
        const { controller } = window.review; controller.stopNavigation?.(); controller.setTilt(tilted);
        window.review.reset = { center, zoom, tilted };
      }, { center, zoom, tilted });
      await page.waitForTimeout(850);
      await page.evaluate(() => {
        const { map, reset, counts } = window.review;
        map.stop(); map.jumpTo({ center: reset.center, zoom: reset.zoom, pitch: reset.tilted ? 52 : 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
        Object.assign(counts, { stops: 0, starts: 0, moves: 0 });
      });
    };
    const pose = () => page.evaluate(() => {
      const { map, counts } = window.review, c = map.getCenter();
      return { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), ...counts };
    });
    for (const [scale, center, zoom] of ["interruptions", "profiles"].includes(label) ? [] : [["earth", [-54, -14], 1.7], ["continent", [-54, -14], 2.6], ["brazil", [-54, -14], 4.5], ["pantanal", [-56, -18], 7]]) {
      for (const input of ["left", "wheel", "touch", "right", "pinch"]) {
        await reset(center, zoom, input === "right"); const before = await pose();
        if (input === "left" || input === "right") {
          await page.mouse.move(570, 460); await page.mouse.down({ button: input });
          for (let i = 1; i <= 18; i++) { await page.mouse.move(570 + i * 10, 460 + i * 2); await page.waitForTimeout(12); }
          await page.mouse.up({ button: input });
        } else if (input === "wheel") {
          await page.mouse.move(600, 450);
          for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -80); await page.waitForTimeout(45); }
        } else {
          const cdp = await context.newCDPSession(page);
          const points = (i) => input === "touch" ? [{ x: 570 + i * 10, y: 460 + i * 2 }] : [{ x: 560 - i * 3, y: 450 }, { x: 640 + i * 3, y: 450 }];
          await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(0) });
          for (let i = 1; i <= 18; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(i) }); await page.waitForTimeout(12); }
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await cdp.detach();
        }
        const released = await pose(); await page.waitForTimeout(650); const after = await pose();
        const distance = (a, b) => Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]);
        const row = { mode, scale, input, panDegrees: distance(before, after), inertiaDegrees: distance(released, after), zoomDelta: after.zoom - before.zoom,
          bearingDelta: after.bearing - before.bearing, pitchDelta: after.pitch - before.pitch, stops: after.stops, starts: after.starts, moveEvents: after.moves };
        rows.push(row); console.log(JSON.stringify(row));
      }
    }
    if (label === "interruptions") {
      for (const input of ["left", "wheel", "touch"]) {
        await reset([-54, -14], 2.6);
        await page.evaluate(() => {
          const { controller } = window.review; controller.setCameraProfile("cinematic");
          controller.navigate({ id: "interrupt-me", center: [130, 30], zoom: 5 });
        });
        await page.waitForTimeout(180);
        await page.evaluate(() => { window.review.counts.stops = 0; });
        if (input === "wheel") { await page.mouse.move(600, 450); await page.mouse.wheel(0, -120); }
        else if (input === "left") {
          await page.mouse.move(580, 450); await page.mouse.down();
          for (let i = 1; i <= 8; i++) { await page.mouse.move(580 + i * 10, 450); await page.waitForTimeout(15); }
          await page.mouse.up();
        } else {
          const cdp = await context.newCDPSession(page);
          await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 580, y: 450 }] });
          for (let i = 1; i <= 8; i++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 580 + i * 10, y: 450 }] }); await page.waitForTimeout(15); }
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await cdp.detach();
        }
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.waitForFunction(() => window.review.counts.starts >= 2);
        await page.waitForFunction(() => !window.review.map.isMoving());
        const settled = await pose();
        await page.evaluate(() => window.review.controller.refit());
        await page.waitForTimeout(500); const later = await pose();
        console.log(JSON.stringify({ interruption: input, settled, later }));
        assert.equal(later.stops, 0);
        assert.ok(Math.hypot(later.center[0] - settled.center[0], later.center[1] - settled.center[1]) < 1e-7);
        assert.ok(Math.abs(later.zoom - settled.zoom) < 1e-7);
        interruptions.push({ input, passed: true, stopsDuringGesture: later.stops });
      }
      await reset([-56, -18], 5);
      await page.evaluate(() => { window.review.controller.lockCamera(true); window.review.controller.setTilt(true); });
      const locked = await pose();
      await page.mouse.move(580, 450); await page.mouse.down(); await page.mouse.move(720, 460, { steps: 12 }); await page.mouse.up();
      assert.deepEqual((await pose()).center, locked.center);
      await page.evaluate(() => window.review.controller.lockCamera(false));
      await page.mouse.move(580, 450); await page.mouse.down(); await page.mouse.move(720, 460, { steps: 12 }); await page.mouse.up();
      assert.notDeepEqual((await pose()).center, locked.center);
      interruptions.push({ input: "drawing-lock-with-tilt", passed: true });
    }
    if (label === "profiles") {
      const meta = JSON.parse(readFileSync("public/data/brazil/meta.json", "utf8"));
      const states = JSON.parse(readFileSync("public/interaction-boundaries/states.geojson", "utf8"));
      const sp = states.features.find((f) => /Paulo/.test(f.properties.name));
      const extent = [180, 90, -180, -90];
      const scan = (node) => { if (typeof node[0] === "number") { extent[0] = Math.min(extent[0], node[0]); extent[1] = Math.min(extent[1], node[1]); extent[2] = Math.max(extent[2], node[0]); extent[3] = Math.max(extent[3], node[1]); } else node.forEach(scan); };
      scan(sp.geometry.coordinates);
      assert.equal(await page.evaluate(() => window.review.calls.length), 0, "Default initialization does not move the map");
      for (const [iteration, profile] of ["cinematic", "standard", "cinematic"].entries()) {
        const previous = await pose(); const calls = await page.evaluate(() => window.review.calls.length);
        await page.evaluate((profile) => window.review.controller.setCameraProfile(profile), profile);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.evaluate(() => window.review.calls.length), calls, "Profile selection does not navigate");
        assert.deepEqual(await pose(), previous);
        for (const [target, bounds] of [["Pantanal", meta.presets.find((p) => p.id === "pantanal").bbox], ["São Paulo", extent]]) {
          await page.evaluate(() => {
            const { map, controller, calls } = window.review; controller.stopNavigation();
            map.jumpTo({ center: [-54, -14], zoom: 2.6, bearing: 19, pitch: 35, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
            calls.length = 0;
          });
          await page.evaluate((bounds) => window.review.controller.navigate({ id: "profile-comparison", bounds }), bounds);
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await page.waitForFunction(() => !window.review.map.isMoving());
          const invocation = await page.evaluate(() => window.review.calls[0]);
          const result = { iteration, profile, target, invocation, finalPose: await pose() };
          assert.equal(invocation.method, profile === "cinematic" ? "flyTo" : "easeTo");
          assert.equal(invocation.pitch, profile === "cinematic" ? 35 : 0);
          if (profile === "standard") { assert.equal(invocation.bearing, 0); assert.equal(invocation.curve, undefined); assert.ok(invocation.duration <= 1200); }
          else assert.equal(invocation.curve, 1.8);
          profiles.push(result); console.log(JSON.stringify(result));
        }
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  const result = { label, baseline: "5d457c7", engine: JSON.parse(readFileSync("node_modules/maplibre-gl/package.json", "utf8")).version,
    controllerSha256: createHash("sha256").update(source("working", "controller")).digest("hex"), rows, interruptions, profiles, errors };
  writeFileSync(join(output, `${label}.json`), JSON.stringify(result, null, 2));
  if (label === "after") {
    for (const row of rows.filter((r) => r.mode === "working")) {
      const baseline = rows.find((r) => r.mode === "baseline" && r.scale === row.scale && r.input === row.input);
      assert.equal(row.stops, 0, `${row.scale}/${row.input}: manual gestures must not call map.stop()`);
      if (row.input === "left" || row.input === "touch") assert.ok(row.panDegrees >= baseline.panDegrees * 0.85, `${row.scale}/${row.input}: baseline responsiveness`);
      if (row.input === "wheel" || row.input === "pinch") assert.ok(row.zoomDelta >= baseline.zoomDelta * 0.85, `${row.scale}/${row.input}: baseline zoom`);
      if (row.input === "right") assert.ok(Math.abs(row.bearingDelta) >= Math.abs(baseline.bearingDelta) * 0.85, `${row.scale}: baseline orbit`);
    }
  }
} finally { await browser.close(); }
