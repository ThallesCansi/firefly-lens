import { attributedScreenshot } from "./attributed-screenshot.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base = process.env.QA_BASE_URL || "http://localhost:3106";
const output = process.env.QA_OUTPUT || "docs/sentinel-default";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-swiftshader"] });
const checks = [], errors = [], forbidden = [], network = {}, pending = [];
let current;
const ready = (p, phase = "active") => p.waitForFunction((phase) => document.querySelector(".hotspot-map")?.getAttribute("data-imagery-phase") === phase, phase);
async function menu(p) { if (!await p.locator(".camera-menu").isVisible()) await p.locator(".camera-trigger").click(); }
async function close(p) { if (await p.locator(".camera-menu").isVisible()) await p.keyboard.press("Escape"); }
async function choose(p, id) { await menu(p); await p.getByRole("combobox", { name: "Satellite source", exact: true }).selectOption(id); await ready(p); }
async function setup(width, cartographic = false) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", hasTouch: true });
  await context.addInitScript(({ cartographic }) => {
    localStorage.setItem("firefly-lens-tour-auto-disabled-v1", "true");
    localStorage.setItem("firefly-lens-intro-done", "true");
    localStorage.setItem("firefly-lens-theme", "light");
    localStorage.setItem("firefly-lens-projection", "mercator");
    if (cartographic) localStorage.setItem("firefly-lens-basemap-2", "map");
  }, { cartographic });
  const p = await context.newPage(); p.setDefaultTimeout(45000); current = p;
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("request", (r) => { if (/mapterhorn|terrain|\.webp.*dem/i.test(r.url())) forbidden.push(r.url()); });
  p.on("response", (r) => {
    const host = new URL(r.url()).hostname;
    if (!["tiles.maps.eox.at", "gibs.earthdata.nasa.gov"].includes(host)) return;
    pending.push((async () => {
      const n = network[host] ??= { responses: 0, bytes: 0, statuses: {} };
      n.responses++; n.statuses[r.status()] = (n.statuses[r.status()] || 0) + 1;
      try { n.bytes += (await r.body()).length; } catch { n.cancelled = (n.cancelled || 0) + 1; }
    })());
  });
  return { context, p };
}
async function creditsClear(p) {
  assert.equal(await p.locator(".imagery-credit").count(), 0, "No custom attribution card");
  const credit = p.locator(".maplibregl-ctrl-attrib");
  assert.equal(await credit.evaluate((el) => el.classList.contains("maplibregl-compact-show")), false);
  const box = await credit.boundingBox();
  assert.ok(box.width <= 40 && box.height <= 40, "Closed native attribution occupies only its compact button");
  assert.equal(await p.locator(".workspace-map").evaluate((el) => el.style.getPropertyValue("--imagery-credit-height")), "");
}
async function checkAttribution(p) {
  const credit = p.locator(".maplibregl-ctrl-attrib"), button = credit.locator("summary");
  await button.focus(); await p.keyboard.press("Enter");
  await credit.getByRole("link", { name: "EOxCloudless", exact: true }).waitFor();
  const text = await credit.innerText();
  for (const item of ["EOX IT Services GmbH", "Copernicus Sentinel data 2025", "CC BY-NC-SA 4.0"]) assert.ok(text.includes(item));
  const box = await credit.boundingBox(), map = await p.locator(".hotspot-map").boundingBox();
  assert.ok(box.x >= map.x - 1 && box.x + box.width <= map.x + map.width + 1);
  await button.focus(); await p.keyboard.press("Enter"); await creditsClear(p);
}
try {
  for (const width of [1440, 1000, 390, 320]) {
    const { context, p } = await setup(width);
    await p.goto(`${base}/lens`); await p.locator(".camera-trigger").waitFor(); await ready(p);
    assert.equal(await p.locator(".hotspot-map").getAttribute("data-imagery-provider"), "eox-sentinel-2025");
    await creditsClear(p); await checkAttribution(p); await menu(p);
    assert.equal(await p.locator(".imagery-control").innerText().then((text) => text.includes("CC BY-NC-SA")), false, "Camera menu has no full licensing paragraph");
    assert.equal(await p.getByRole("combobox", { name: "Satellite source", exact: true }).inputValue(), "eox-sentinel-2025");
    const box = await p.locator(".camera-menu").boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= 901);
    await attributedScreenshot(p, { path: join(output, `${width}-source-menu.jpg`), type: "jpeg", quality: 75 });
    await close(p);
    const center = await p.locator('[data-tour="map-canvas"]').getAttribute("data-camera-center");
    await choose(p, "nasa-blue-marble"); await close(p);
    assert.equal(await p.locator('[data-tour="map-canvas"]').getAttribute("data-camera-center"), center);
    await choose(p, "eox-sentinel-2025"); await close(p);
    await p.getByRole("button", { name: "Satellite imagery", exact: true }).click(); await ready(p, "off");
    assert.equal(await p.evaluate(() => localStorage.getItem("firefly-lens-basemap-2")), "map");
    await p.reload(); await p.locator(".camera-trigger").waitFor(); await ready(p, "off");
    await p.getByRole("button", { name: "Satellite imagery", exact: true }).click(); await ready(p);
    if (width === 1440) {
      await p.getByRole("button", { name: "3D Globe", exact: true }).click();
      await p.getByRole("button", { name: "Switch to dark theme", exact: true }).click(); await ready(p);
      await p.waitForFunction(() => document.querySelector(".hotspot-map")?.getAttribute("data-map-theme") === "dark");
      assert.equal(await p.locator(".hotspot-map").getAttribute("data-projection"), "globe");
      await p.getByRole("button", { name: "Switch to light theme", exact: true }).click(); await ready(p);
      await p.waitForFunction(() => document.querySelector(".hotspot-map")?.getAttribute("data-map-theme") === "light");
      await p.getByRole("button", { name: "2D Map", exact: true }).click();
    }
    await p.getByRole("button", { name: "Coordinates", exact: true }).click();
    await p.locator('[data-tour="presets"]').selectOption("pantanal");
    await p.locator('[data-tour="history"][data-tour-ready="true"]').waitFor();
    assert.equal(await p.locator('button[aria-label="3D columns"]').getAttribute("aria-pressed"), "true");
    await creditsClear(p);
    await attributedScreenshot(p, { path: join(output, `${width}-sentinel-analysis.jpg`), type: "jpeg", quality: 75 });
    await p.getByRole("button", { name: "Close analysis", exact: true }).click(); await creditsClear(p);
    await attributedScreenshot(p, { path: join(output, `${width}-sentinel-selection.jpg`), type: "jpeg", quality: 75 });
    if (width === 1440) {
      await p.getByRole("button", { name: "Regions", exact: true }).click();
      await p.getByRole("region", { name: "Regional flight", exact: true }).waitFor();
      await p.getByRole("region", { name: "Regional flight", exact: true }).getByRole("button", { name: "End", exact: true }).click();
    }
    await p.goto(`${base}/method#background-imagery`);
    await p.getByRole("heading", { name: "Background satellite imagery", exact: true }).waitFor();
    assert.equal(await p.getByRole("tab", { name: "Data & Limitations", exact: true }).getAttribute("aria-selected"), "true");
    assert.equal(await p.getByRole("tab").count(), 4);
    const section = p.locator("#background-imagery");
    for (const url of ["https://cloudless.eox.at", "https://eox.at", "https://cloudless.eox.at/documentation/license", "https://creativecommons.org/licenses/by-nc-sa/4.0/"]) assert.equal(await section.locator(`a[href="${url}"]`).isVisible(), true);
    await p.getByRole("region", { name: "Background imagery sources and licensing", exact: true }).waitFor();
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await p.screenshot({ path: join(output, `${width}-method-imagery.jpg`), type: "jpeg", quality: 75 });
    checks.push({ width, sentinelDefault: true, nasaSelectable: true, preferenceRetainedOnReload: true, sourceSwitchPreservesCenter: true, columnsRetained: true, creditsClear: true });
    console.log(`Sentinel application ${width}px passed`); await context.close();
  }
  const { context, p } = await setup(390);
  await context.route("https://tiles.maps.eox.at/**", (route) => route.fulfill({ status: 503, body: "EOX unavailable" }));
  await p.goto(`${base}/lens`); await p.locator(".camera-trigger").waitFor(); await ready(p, "unavailable");
  await menu(p); await p.getByRole("button", { name: "Use NASA Blue Marble", exact: true }).click(); await ready(p);
  await close(p); await attributedScreenshot(p, { path: join(output, "eox-failure-nasa-fallback.jpg"), type: "jpeg", quality: 75 });
  await context.unroute("https://tiles.maps.eox.at/**"); await choose(p, "eox-sentinel-2025");
  await context.route("https://tiles.maps.eox.at/**", (route) => route.fulfill({ status: 503, body: "EOX unavailable" }));
  await choose(p, "nasa-blue-marble"); await menu(p); await p.getByRole("combobox", { name: "Satellite source", exact: true }).selectOption("eox-sentinel-2025"); await ready(p, "unavailable");
  await context.unroute("https://tiles.maps.eox.at/**"); await p.getByRole("button", { name: "Retry imagery", exact: true }).click(); await ready(p);
  checks.push({ eox503Isolated: true, nasaFallback: true, explicitRetry: true }); await context.close();
  assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
} catch (error) {
  if (current && !current.isClosed()) await attributedScreenshot(current, { path: join(output, "failure.jpg"), type: "jpeg", quality: 75 }).catch(() => {});
  throw error;
} finally {
  await Promise.allSettled(pending);
  writeFileSync(join(output, "application-results.json"), JSON.stringify({ checks, errors, forbiddenRequests: forbidden, network }, null, 2));
  await browser.close();
}
