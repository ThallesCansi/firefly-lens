import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base = process.env.QA_BASE_URL || "http://localhost:3106";
const output = process.env.QA_OUTPUT || join(tmpdir(), "firefly-terrain-app");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-swiftshader"] });
const errors = [], checks = [];
let activePage;
async function setup(width, motion = "reduce") {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, reducedMotion: motion });
  await context.addInitScript(() => {
    localStorage.setItem("firefly-lens-tour-auto-disabled-v1", "true");
    localStorage.setItem("firefly-lens-projection", "mercator");
    localStorage.setItem("firefly-lens-theme", "light");
  });
  await context.route("https://tiles.openfreemap.org/**", (route) => route.fulfill({ json: {
    version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#718b73" } }],
  } }));
  const p = await context.newPage(); p.setDefaultTimeout(45000); activePage = p;
  p.on("pageerror", (e) => errors.push(e.message));
  return { context, p };
}
const map = (p) => p.locator(".hotspot-map");
const columns = (p) => p.locator('button[aria-label="3D columns"]');
async function ready(p, phase = "active") { await p.waitForFunction((phase) => document.querySelector(".hotspot-map")?.getAttribute("data-terrain") === phase, phase); }
async function open(p) {
  if (!await p.locator(".camera-menu").isVisible()) await p.locator(".camera-trigger").click();
}
async function close(p) { if (await p.locator(".camera-menu").isVisible()) await p.keyboard.press("Escape"); }
async function toggle(p, on, wait = true) {
  await open(p); const button = p.getByRole("button", { name: /^Terrain 3D/ });
  if (await button.getAttribute("aria-pressed") !== String(on)) await button.click();
  if (wait) await ready(p, on ? "active" : "off");
}
async function state(p) { return p.evaluate(() => ({ area: document.querySelector('[data-tour="map-canvas"]')?.getAttribute("aria-label"),
  period: document.querySelector('[data-tour="period"]')?.textContent,
  sensors: [...document.querySelectorAll('[data-tour="sensors"] button')].map((e) => e.getAttribute("aria-pressed")) })); }
async function navigate(p, coordinates) {
  await close(p); await p.getByRole("button", { name: "Search", exact: true }).click();
  const search = p.getByRole("combobox", { name: "Search a place or latitude, longitude" });
  await search.fill(coordinates); await p.locator('[role="option"]').first().waitFor();
  await search.press("ArrowDown"); await search.press("Enter");
  await p.waitForFunction(() => document.querySelector(".camera-menu [role=status]")?.textContent === "Camera ready");
  await p.getByRole("button", { name: "Navigate", exact: true }).click();
}
try {
  for (const width of [1440, 390, 320]) {
    const { context, p } = await setup(width); let demRequests = 0;
    p.on("request", (r) => { if (r.url().includes("tiles.mapterhorn.com")) demRequests++; });
    await p.goto(`${base}/lens`); await p.locator(".camera-trigger").waitFor();
    assert.equal(await map(p).getAttribute("data-terrain"), "off"); assert.equal(demRequests, 0);
    await p.getByRole("button", { name: "Coordinates", exact: true }).click();
    await p.locator('[data-tour="presets"]').selectOption("pantanal");
    await p.locator('[data-tour="history"][data-tour-ready="true"]').waitFor();
    const saved = await state(p);
    assert.equal(await columns(p).getAttribute("aria-pressed"), "true");
    await toggle(p, true);
    assert.equal(await columns(p).getAttribute("aria-pressed"), "false"); assert.equal(await columns(p).isDisabled(), true);
    assert.deepEqual(await state(p), saved);
    assert.match(await p.locator(".terrain-help").innerText(), /Hotspot markers stay visible/);
    await p.screenshot({ path: join(output, `${width}-terrain-control.png`) });
    // Compact popup remains inside the viewport and clears major panels.
    const popup = await p.locator(".camera-menu").boundingBox();
    assert.ok(popup.x >= 0 && popup.x + popup.width <= width + 1 && popup.y >= 0 && popup.y + popup.height <= 901);
    const collisions = await p.locator(".camera-menu").evaluate((el) => {
      const a = el.getBoundingClientRect();
      return [...document.querySelectorAll(".ff-interaction-panel, .lume-replay, .map-highlights, .map-toolbar")].filter((node) => {
        const b = node.getBoundingClientRect();
        return b.width && b.height && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      }).map((node) => node.className);
    });
    assert.deepEqual(collisions, [], "Terrain menu clears the calendar, guide and map controls");
    await toggle(p, false); assert.equal(await columns(p).getAttribute("aria-pressed"), "true");
    await toggle(p, true); await close(p);
    if (width === 1440) {
      await p.getByRole("button", { name: "Close analysis", exact: true }).click();
      await navigate(p, "-32.68, -70.01"); await ready(p); await p.waitForTimeout(1500);
      await p.screenshot({ path: join(output, "andes-app-on.png") });
      await toggle(p, false); await close(p); await p.screenshot({ path: join(output, "andes-app-off.png") });
      await toggle(p, true); await close(p);
      await p.getByRole("button", { name: "3D Globe", exact: true }).click(); await ready(p);
      await p.getByRole("button", { name: "Switch to dark theme", exact: true }).click(); await ready(p);
      await p.getByRole("button", { name: "Switch to light theme", exact: true }).click(); await ready(p);
      await p.getByRole("button", { name: "Satellite imagery", exact: true }).click(); await ready(p);
      await p.getByRole("button", { name: "Satellite imagery", exact: true }).click(); await ready(p);
      await navigate(p, "-22.46, -43.04"); await ready(p); await p.waitForTimeout(800);
      await p.screenshot({ path: join(output, "serra-app-on.png") });
      // RegionFlight and all 16 tutorial steps suspend, retain and restore terrain.
      await p.getByRole("button", { name: "Regions", exact: true }).click(); await ready(p, "suspended");
      assert.equal(await columns(p).getAttribute("aria-pressed"), "true");
      await p.getByRole("region", { name: "Regional flight", exact: true }).getByRole("button", { name: "End", exact: true }).click(); await ready(p);
      await p.locator('[data-tour="replay"]').click(); await ready(p, "suspended");
      for (const id of ["map", "search", "region", "pantanal", "sensors", "period", "analyze", "history", "month", "report", "science", "forecast", "range", "exports", "complete"]) {
        await p.locator(".lume-tour-card .driver-popover-next-btn").click();
        await p.locator(`.lume-tour-card[data-tour-step="${id}"]`).waitFor();
        assert.equal(await map(p).getAttribute("data-terrain-requested"), "true");
        if (id === "month") assert.match(await p.locator('[data-tour="month"]').innerText(), /535 hot spots/);
      }
      await p.getByRole("button", { name: "Restore previous workspace", exact: true }).click(); await ready(p);
      await close(p);
      await open(p); await p.getByRole("button", { name: "Focus Pantanal", exact: true }).click(); await close(p);
      await p.getByRole("button", { name: "Draw area", exact: true }).click();
      const box = await p.locator(".maplibregl-canvas").boundingBox();
      await p.mouse.move(box.x + box.width * .48, box.y + box.height * .44); await p.mouse.down();
      await p.mouse.move(box.x + box.width * .55, box.y + box.height * .52, { steps: 7 }); await p.mouse.up();
      const corner = p.getByRole("button", { name: /^Corner 2:/ }); await corner.waitFor();
      const label = await corner.getAttribute("aria-label"), handle = await corner.boundingBox();
      await p.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await p.mouse.down();
      await p.mouse.move(handle.x + handle.width / 2 + 10, handle.y + handle.height / 2 + 8, { steps: 5 }); await p.mouse.up();
      assert.notEqual(await corner.getAttribute("aria-label"), label);
      await toggle(p, true); await close(p); await p.screenshot({ path: join(output, "pantanal-markers-and-polygon.png") });
    }
    assert.equal(await map(p).getAttribute("data-terrain-requested"), "true");
    checks.push({ width, defaultOff: true, columnsRestored: true, selectionPreserved: true, realDem: demRequests > 0 });
    console.log(`Terrain app: ${width}px passed`); await context.close();
  }
  const { context: flights, p: cp } = await setup(1440, "no-preference");
  await cp.goto(base); await cp.locator(".camera-trigger").waitFor(); await open(cp);
  await cp.getByRole("button", { name: "Focus Pantanal", exact: true }).click();
  await cp.waitForFunction(() => document.querySelector(".camera-menu [role=status]")?.textContent === "Camera moving. Gestures stop the flight.");
  await toggle(cp, true); await close(cp);
  await open(cp); await cp.getByRole("button", { name: "Focus Brazil", exact: true }).click(); await close(cp);
  const canvas = await cp.locator(".maplibregl-canvas").boundingBox();
  await cp.mouse.move(canvas.width * .6, canvas.height * .5); await cp.mouse.wheel(0, 130);
  await cp.waitForFunction(() => document.querySelector(".camera-menu [role=status]")?.textContent === "Camera ready");
  await cp.waitForTimeout(1200);
  const cameraCanvas = cp.locator('[data-tour="map-canvas"]');
  const settledCenter = await cameraCanvas.getAttribute("data-camera-center"); assert.ok(settledCenter);
  await cp.waitForTimeout(600); assert.equal(await cameraCanvas.getAttribute("data-camera-center"), settledCenter);
  await cp.mouse.move(canvas.width * .6, canvas.height * .5); await cp.mouse.down();
  await cp.mouse.move(canvas.width * .6 + 90, canvas.height * .5 + 20, { steps: 12 }); await cp.mouse.up();
  await cp.waitForTimeout(800); assert.notEqual(await cameraCanvas.getAttribute("data-camera-center"), settledCenter);
  await flights.close();
  const { context: failed, p: fp } = await setup(1440);
  await failed.route("https://tiles.mapterhorn.com/**", (route) => route.fulfill({ status: 503, body: "DEM unavailable" }));
  await fp.goto(base); await fp.locator(".camera-trigger").waitFor();
  await toggle(fp, true, false); await ready(fp, "unavailable");
  assert.equal(await columns(fp).getAttribute("aria-pressed"), "true");
  await fp.screenshot({ path: join(output, "terrain-failure.png") });
  await toggle(fp, false); await failed.close();
  const { context: slow, p: sp } = await setup(390);
  let release; const gate = new Promise((resolve) => { release = resolve; });
  await slow.route("https://tiles.mapterhorn.com/**", async (route) => { await gate; await route.continue().catch(() => {}); });
  await sp.goto(base); await sp.locator(".camera-trigger").waitFor();
  await toggle(sp, true, false); await ready(sp, "loading"); await toggle(sp, false); release();
  await sp.waitForTimeout(1000); await ready(sp, "off"); await slow.close();
  assert.deepEqual(errors, []);
  writeFileSync(join(output, "results.json"), JSON.stringify({ checks, errors, failureFallback: true, staleLoads: true, tutorialSteps: 16, regionFlight: true,
    terrainDrawingAndEditing: true, terrainDuringFlight: true, terrainGestureCancellation: true }, null, 2));
} catch (error) {
  if (activePage && !activePage.isClosed()) { await activePage.screenshot({ path: join(output, "failure.png") }).catch(() => {}); console.log((await activePage.locator("body").innerText()).slice(-1000)); }
  throw error;
} finally { await browser.close(); }
