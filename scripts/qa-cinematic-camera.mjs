import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base = process.env.QA_BASE_URL || "http://localhost:3106";
const output = process.env.QA_OUTPUT || join(tmpdir(), "firefly-cinematic-qa");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-swiftshader"] });
const errors = [], checks = [], imagery = [];
let activePage;
const menu = (p) => p.locator(".camera-control");
async function open(p) {
  if (!(await menu(p).locator(".camera-menu").isVisible())) await menu(p).locator(".camera-trigger").click();
  await p.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const overlap = await p.evaluate(() => {
    const popup = document.querySelector(".camera-menu:popover-open");
    const a = popup.getBoundingClientRect();
    return [...document.querySelectorAll(".lens-workspace .map-card, .lens-workspace .map-highlights, .lens-workspace .selection-card, .lens-workspace .map-toolbar, .lens-workspace .map-bottom")]
      .filter((el) => getComputedStyle(el).visibility !== "hidden").filter((el) => {
        const b = el.getBoundingClientRect();
        return b.width && b.height && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      }).map((el) => el.className);
  });
  assert.deepEqual(overlap, [], "Camera popover must clear workspace controls");
}
async function settled(p) {
  await p.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await p.waitForFunction(() => document.querySelector(".camera-menu [role=status]")?.textContent === "Camera ready");
}
async function action(p, label) { await open(p); await menu(p).getByRole("button", { name: label, exact: true }).click(); await settled(p); }
async function close(p) { if (await menu(p).locator(".camera-menu").isVisible()) await menu(p).locator(".camera-trigger").click(); }
async function shot(p, file) { await close(p); await p.screenshot({ path: join(output, file), animations: "disabled" }); }
async function state(p) { return p.evaluate(() => ({
  area: document.querySelector('[data-tour="map-canvas"]')?.getAttribute("aria-label"),
  period: document.querySelector('[data-tour="period"]')?.textContent,
  sensors: [...document.querySelectorAll('[data-tour="sensors"] button')].map((e) => e.getAttribute("aria-pressed")),
  analysis: document.querySelector(".workspace-body")?.getAttribute("data-analysis"),
})); }
async function picker(p, label, option) {
  await p.getByRole("button", { name: new RegExp(`^${label}:`) }).click();
  await p.getByRole("listbox", { name: label, exact: true }).getByRole("option", { name: option, exact: true }).click();
}
try {
  for (const [width, theme, motion] of [[1440, "light", "no-preference"], [390, "dark", "reduce"], [320, "light", "reduce"]]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion: motion, hasTouch: true });
    await context.addInitScript((theme) => {
      localStorage.setItem("firefly-lens-tour-auto-disabled-v1", "true");
      localStorage.setItem("firefly-lens-theme", theme);
      localStorage.setItem("firefly-lens-intro-done", "true");
    }, theme);
    // Real WebGL, outlines, data and analytics. Isolate only the external vector basemap.
    await context.route("https://tiles.openfreemap.org/**", (r) => r.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#172a35" } }, { id: "water", type: "background", paint: { "background-color": "rgba(0,0,0,0)" } }] } }));
    const p = await context.newPage(); p.setDefaultTimeout(30000);
    activePage = p;
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("response", (r) => { if (r.url().includes("gibs.earthdata.nasa.gov")) imagery.push({ status: r.status(), url: r.url() }); });
    p.on("requestfailed", (r) => { if (r.url().includes("gibs.earthdata.nasa.gov") && r.failure()?.errorText !== "net::ERR_ABORTED") console.log("NASA request:", r.failure()?.errorText); });
    await p.goto(`${base}/lens`); await menu(p).waitFor();
    await open(p);
    await p.screenshot({ path: join(output, `${width}-${theme}-camera-menu.png`), animations: "disabled" });
    // Native popover supports light dismissal and returns keyboard focus.
    await p.keyboard.press("Escape"); assert.equal(await menu(p).locator(".camera-menu").isVisible(), false);
    await open(p); await p.mouse.click(4, 500);
    assert.equal(await menu(p).locator(".camera-menu").isVisible(), false);
    await open(p); await p.keyboard.press("Tab");
    assert.equal(await p.evaluate(() => !!document.activeElement?.closest(".camera-menu")), true);
    await close(p);
    await p.getByRole("button", { name: "Search", exact: true }).click();
    await open(p); await p.keyboard.press("Escape");
    assert.equal(await p.getByRole("combobox", { name: "Search a place or latitude, longitude" }).isVisible(), true, "Escape closes Camera without cancelling workspace tools");
    await p.getByRole("button", { name: "Navigate", exact: true }).click(); await open(p);
    assert.equal(await p.getByRole("combobox", { name: "Camera profile", exact: true }).inputValue(), "cinematic");
    await p.getByRole("combobox", { name: "Camera profile", exact: true }).selectOption("standard");
    const original = await state(p);
    await action(p, "Focus Brazil"); assert.deepEqual(await state(p), original);
    await open(p); await p.getByRole("combobox", { name: "Camera profile", exact: true }).selectOption("cinematic");
    assert.equal(await menu(p).getByRole("button", { name: "Stop flight", exact: true }).isDisabled(), true);
    for (const [label, file] of [["Earth overview", "earth"], ["Focus Brazil", "brazil"], ["Focus Pantanal", "pantanal"], ["North up", "north"], ["Top-down", "top"]]) {
      await action(p, label); assert.deepEqual(await state(p), original, `${label} is camera-only`);
      console.log(`Camera ${width}: ${label}`);
      if (file !== "north" && file !== "top") await shot(p, `${width}-${theme}-${file}.png`);
    }
    await p.getByRole("button", { name: "2D Map", exact: true }).click();
    await action(p, "Focus Pantanal"); assert.equal(await p.locator(".hotspot-map").getAttribute("data-projection"), "mercator");
    await action(p, "Earth overview"); assert.equal(await p.locator(".hotspot-map").getAttribute("data-projection"), "globe");
    await close(p);
    await p.getByRole("button", { name: "Satellite imagery", exact: true }).click();
    // Allow live NASA tiles to render; optional network diagnostic, never mock scientific data.
    await p.waitForTimeout(2200);
    await action(p, "Earth overview"); await shot(p, `${width}-${theme}-earth-satellite.png`);
    await action(p, "Focus Brazil"); await p.waitForTimeout(800); await shot(p, `${width}-${theme}-brazil-satellite.png`);
    await action(p, "Focus Pantanal"); await p.waitForTimeout(800); await shot(p, `${width}-${theme}-pantanal-satellite.png`);
    await open(p); await p.screenshot({ path: join(output, `${width}-${theme}-camera-menu-satellite.png`), animations: "disabled" });
    await close(p);
    assert.deepEqual(await state(p), original);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    if (width === 1440) {
      await open(p);
      await menu(p).getByRole("button", { name: "Focus Brazil", exact: true }).click();
      await menu(p).getByRole("button", { name: "Focus Pantanal", exact: true }).click();
      await menu(p).getByRole("button", { name: "Stop flight", exact: true }).click(); await settled(p);
      await p.waitForTimeout(450); await settled(p);
      await menu(p).getByRole("button", { name: "Focus Brazil", exact: true }).click();
      await close(p); await p.mouse.move(700, 450); await p.mouse.wheel(0, 150); await settled(p);
      await p.setViewportSize({ width: 1100, height: 800 }); await p.waitForTimeout(200); await settled(p);
      await p.setViewportSize({ width: 1440, height: 1000 });
      await action(p, "Top-down"); await close(p);
      // Search only navigates. A coordinate result needs no geocoder fixture.
      await p.getByRole("button", { name: "Search", exact: true }).click();
      const search = p.getByRole("combobox", { name: "Search a place or latitude, longitude" });
      await search.fill("-23.55, -46.63"); await p.locator('[role="option"]').first().waitFor();
      await search.press("ArrowDown"); await search.press("Enter"); await settled(p);
      assert.deepEqual(await state(p), original);
      await p.getByRole("button", { name: "Navigate", exact: true }).click();
      // Select a state from the real bundled administrative boundaries.
      await p.getByRole("button", { name: "Pick a state", exact: true }).click();
      const canvas = await p.locator(".maplibregl-canvas").boundingBox();
      await p.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      await p.getByRole("heading", { name: /Paulo/ }).waitFor();
      await p.getByRole("button", { name: "Use this state", exact: true }).click(); await settled(p);
      assert.match((await state(p)).area, /Paulo/);
      // RegionFlight retains its real study-region and period semantics.
      await p.getByRole("button", { name: "Regions", exact: true }).click(); await settled(p);
      const flight = p.getByRole("region", { name: "Regional flight", exact: true });
      await flight.getByRole("button", { name: "Next", exact: true }).click(); await settled(p);
      await shot(p, "desktop-regional-flight.png");
      await flight.getByRole("button", { name: "End", exact: true }).click(); await settled(p);
      await p.getByRole("button", { name: "Coordinates", exact: true }).click();
      await p.locator('[data-tour="presets"]').selectOption("pantanal"); await settled(p);
      await picker(p, "Map month", "Sep"); await picker(p, "Map year", "2023");
      const selected = await state(p); await action(p, "Frame selected area"); assert.deepEqual(await state(p), selected); await close(p);
      // Main enables columns by default; prepare the desired state explicitly.
      const columns = p.getByRole("button", { name: "3D columns", exact: true });
      if (await columns.getAttribute("aria-pressed") !== "true") await columns.click();
      await settled(p);
      await p.getByRole("button", { name: "2D Map", exact: true }).click(); await action(p, "Frame selected area");
      await shot(p, "desktop-mercator-columns.png");
      const beforeProjection = await p.locator(".hotspot-map").getAttribute("data-projection");
      const beforeTour = await state(p);
      await p.locator('[data-tour="replay"]').click();
      await p.locator('.lume-tour-card[data-tour-step="welcome"]').waitFor();
      for (const id of ["map", "search", "region", "pantanal", "sensors", "period", "analyze", "history", "month", "report", "science", "forecast", "range", "exports", "complete"]) {
        await p.locator(".lume-tour-card .driver-popover-next-btn").click();
        await p.locator(`.lume-tour-card[data-tour-step="${id}"]`).waitFor();
        if (id === "month") assert.match(await p.locator('[data-tour="month"]').innerText(), /535 hot spots/);
      }
      await p.getByRole("button", { name: "Restore previous workspace", exact: true }).click();
      await p.waitForFunction(() => !document.querySelector("main.lens-workspace").inert); await settled(p);
      assert.deepEqual(await state(p), beforeTour);
      assert.equal(await p.locator(".hotspot-map").getAttribute("data-projection"), beforeProjection);
      assert.equal(await p.getByRole("button", { name: "3D columns", exact: true }).getAttribute("aria-pressed"), "true");
      await p.getByRole("button", { name: "3D columns", exact: true }).click(); await settled(p);
      await action(p, "Top-down"); await close(p);
      // Drawing and vertex editing remain functional after cinematic navigation.
      await p.getByRole("button", { name: "Draw area", exact: true }).click();
      const box = await p.locator(".maplibregl-canvas").boundingBox();
      await p.mouse.move(box.x + box.width * 0.48, box.y + box.height * 0.44); await p.mouse.down();
      await p.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.55, { steps: 6 }); await p.mouse.up();
      const corner = p.getByRole("button", { name: /^Corner 2:/ }); await corner.waitFor();
      const before = await corner.getAttribute("aria-label"); const handle = await corner.boundingBox();
      await p.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await p.mouse.down();
      await p.mouse.move(handle.x + handle.width / 2 + 12, handle.y + handle.height / 2 + 10, { steps: 5 }); await p.mouse.up();
      assert.notEqual(await corner.getAttribute("aria-label"), before);
      await shot(p, "desktop-polygon-edit.png");
    } else {
      await action(p, "Focus Pantanal"); await close(p);
      await p.touchscreen.tap(width / 2, 450); await settled(p);
      await open(p); await menu(p).locator(".camera-trigger").focus(); await p.keyboard.press("Escape");
      assert.equal(await menu(p).locator(".camera-menu").isVisible(), false);
    }
    checks.push({ width, theme, motion, passed: true }); await context.close();
    console.log(`Cinematic QA: ${width}px ${theme} passed`);
  }
  assert.deepEqual(errors, []);
  assert.ok(imagery.some((r) => r.status === 200), "Live NASA imagery was exercised");
  writeFileSync(join(output, "results.json"), JSON.stringify({ checks, errors, nasaTiles: imagery.length, nasaSuccesses: imagery.filter((r) => r.status === 200).length }, null, 2));
  console.log(`Cinematic camera QA passed: ${output}`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: join(output, "issue.png") });
    console.log("QA state:", (await activePage.locator("body").innerText()).slice(-2200));
  }
  throw error;
} finally { await browser.close(); }
