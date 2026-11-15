import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const output = process.env.QA_OUTPUT || "docs/hires-satellite-poc/app";
const base = process.env.QA_BASE_URL || "http://localhost:3106";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-swiftshader"] });
const checks = [], errors = [], responses = [], pending = [];
let currentPage;
const ready = (p, phase = "active") => p.waitForFunction((phase) => document.querySelector(".hotspot-map")?.getAttribute("data-imagery-phase") === phase, phase);
async function open(p) { if (!await p.locator(".camera-menu").isVisible()) await p.locator(".camera-trigger").click(); }
async function close(p) { if (await p.locator(".camera-menu").isVisible()) await p.keyboard.press("Escape"); }
async function choose(p, value, wait = true) { await open(p); await p.getByRole("combobox", { name: "Satellite source", exact: true }).selectOption(value); if (wait) await ready(p); }
async function setup(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", hasTouch: true });
  await context.addInitScript(() => {
    localStorage.setItem("firefly-lens-tour-auto-disabled-v1", "true");
    localStorage.setItem("firefly-lens-theme", "light");
    localStorage.setItem("firefly-lens-projection", "mercator");
  });
  const p = await context.newPage(); p.setDefaultTimeout(45000); currentPage = p;
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("response", (r) => { if (/tiles\.maps\.eox\.at|gibs\.earthdata\.nasa\.gov|tiles\.mapterhorn\.com/.test(r.url())) pending.push((async () => {
    try { responses.push({ width, url: r.url(), status: r.status(), bytes: (await r.body()).length }); }
    catch { responses.push({ width, url: r.url(), status: r.status(), cancelled: true }); }
  })()); });
  return { context, p };
}
try {
  for (const width of [1440, 390, 320]) {
    const { context, p } = await setup(width);
    await p.goto(`${base}/lens`); await p.locator(".camera-trigger").waitFor(); await ready(p);
    assert.equal(await p.locator(".hotspot-map").getAttribute("data-imagery-provider"), "nasa-blue-marble");
    await choose(p, "eox-sentinel-2025");
    const popup = await p.locator(".camera-menu").boundingBox();
    assert.ok(popup.x >= 0 && popup.x + popup.width <= width + 1 && popup.y >= 0 && popup.y + popup.height <= 901);
    await p.screenshot({ path: join(output, `${width}-source-menu.png`) });
    await close(p);
    const credits = p.locator(".imagery-credit");
    await credits.getByRole("link", { name: "EOxCloudless", exact: true }).waitFor();
    assert.match(await credits.innerText(), /Copernicus Sentinel data 2025/);
    assert.match(await credits.innerText(), /independent of analysis dates/);
    const box = await credits.boundingBox();
    assert.ok(box.width > 0 && box.x >= -1 && box.x + box.width <= width + 1);
    await p.waitForTimeout(100);
    const overlaps = await credits.evaluate((credit) => {
      const a = credit.getBoundingClientRect();
      return [...document.querySelectorAll(".map-view-controls, .map-key, .lume-replay, .map-bottom")].filter((node) => {
        const b = node.getBoundingClientRect();
        return b.width && b.height && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      }).map((node) => node.className);
    });
    assert.deepEqual(overlaps, [], "Visible attribution clears the workspace controls");
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await open(p); await p.getByRole("button", { name: /^Terrain 3D/ }).click();
    await p.waitForFunction(() => document.querySelector(".hotspot-map")?.getAttribute("data-terrain") === "active");
    await close(p);
    if (width === 1440) {
      await p.getByRole("button", { name: "Switch to dark theme", exact: true }).click(); await ready(p);
      await p.waitForFunction(() => document.querySelector(".hotspot-map")?.getAttribute("data-map-theme") === "dark");
      await p.getByRole("button", { name: "3D Globe", exact: true }).click(); await ready(p);
      assert.equal(await p.locator(".hotspot-map").getAttribute("data-projection"), "globe");
      await p.getByRole("button", { name: "Switch to light theme", exact: true }).click(); await ready(p);
      await p.getByRole("button", { name: "2D Map", exact: true }).click();
      await open(p); await p.getByRole("button", { name: "Focus Pantanal", exact: true }).click(); await close(p);
      await p.waitForTimeout(500);
      const before = await p.locator('[data-tour="map-canvas"]').getAttribute("data-camera-center");
      await choose(p, "nasa-blue-marble");
      assert.equal(await p.locator('[data-tour="map-canvas"]').getAttribute("data-camera-center"), before);
      await choose(p, "eox-sentinel-2025"); await close(p);
      await p.getByRole("button", { name: "Satellite imagery", exact: true }).click(); await ready(p, "off");
      await p.getByRole("button", { name: "Satellite imagery", exact: true }).click(); await ready(p);
    }
    await p.screenshot({ path: join(output, `${width}-eox-terrain.png`) });
    await p.getByRole("button", { name: "Coordinates", exact: true }).click();
    await p.locator('[data-tour="presets"]').selectOption("pantanal");
    await p.locator('[data-tour="history"][data-tour-ready="true"]').waitFor();
    await p.waitForTimeout(200);
    const blockedCredits = () => credits.evaluate((credit) => {
      const a = credit.getBoundingClientRect();
      return [...document.querySelectorAll(".map-view-controls, .selection-card, .lume-replay, .map-toolbar")].filter((node) => {
        const b = node.getBoundingClientRect();
        return b.width && b.height && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      }).map((node) => node.className);
    });
    assert.deepEqual(await blockedCredits(), [], "Credits stay visible with the scientific analysis open");
    await p.screenshot({ path: join(output, `${width}-eox-analysis.png`) });
    await p.getByRole("button", { name: "Close analysis", exact: true }).click();
    await p.waitForTimeout(200);
    assert.deepEqual(await blockedCredits(), [], "Credits stay visible beside the selection card");
    await p.screenshot({ path: join(output, `${width}-eox-selection.png`) });
    await p.reload(); await p.locator(".camera-trigger").waitFor(); await ready(p);
    assert.equal(await p.locator(".hotspot-map").getAttribute("data-imagery-provider"), "nasa-blue-marble", "PoC never silently replaces NASA default");
    checks.push({ width, realBasemap: true, defaultNASA: true, eoxReady: true, visibleCredits: true, menuFits: true, terrain: true, reloadNASA: true });
    await context.close(); console.log(`Real application imagery: ${width}px passed`);
  }
  // Source-scoped failure leaves DEM active, then explicit retry recovers.
  const { context: failed, p: fp } = await setup(390);
  await failed.route("https://tiles.maps.eox.at/**", (route) => route.fulfill({ status: 503, body: "Imagery unavailable" }));
  await fp.goto(`${base}/lens`); await fp.locator(".camera-trigger").waitFor(); await ready(fp);
  await open(fp); await fp.getByRole("button", { name: /^Terrain 3D/ }).click();
  await fp.waitForFunction(() => document.querySelector(".hotspot-map")?.getAttribute("data-terrain") === "active");
  await choose(fp, "eox-sentinel-2025", false); await ready(fp, "unavailable");
  assert.equal(await fp.locator(".hotspot-map").getAttribute("data-terrain"), "active");
  await fp.screenshot({ path: join(output, "imagery-failure-dem-active.png") });
  await failed.unroute("https://tiles.maps.eox.at/**");
  await fp.getByRole("button", { name: "Retry imagery", exact: true }).click(); await ready(fp); await failed.close();
  checks.push({ isolatedFailure: true, retry: true });
  const { context: slow, p: sp } = await setup(390);
  let release; const gate = new Promise((resolve) => { release = resolve; });
  await slow.route("https://tiles.maps.eox.at/**", async (route) => { await gate; await route.continue().catch(() => {}); });
  await sp.goto(`${base}/lens`); await sp.locator(".camera-trigger").waitFor(); await ready(sp);
  await choose(sp, "eox-sentinel-2025", false); await ready(sp, "loading");
  await choose(sp, "nasa-blue-marble"); release(); await sp.waitForTimeout(750);
  assert.equal(await sp.locator(".hotspot-map").getAttribute("data-imagery-provider"), "nasa-blue-marble");
  await ready(sp); await slow.close(); checks.push({ rapidSelection: true });
  assert.deepEqual(errors, []);
} catch (error) {
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: join(output, "failure.png") }).catch(() => {});
  throw error;
} finally {
  await Promise.allSettled(pending);
  writeFileSync(join(output, "results.json"), JSON.stringify({ checks, errors, responses }, null, 2));
  await browser.close();
}
