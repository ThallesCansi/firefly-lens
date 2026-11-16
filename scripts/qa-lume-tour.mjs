// Reuse installed Playwright/Chrome; no application dependency or live model calls.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base = process.env.QA_BASE_URL || "http://localhost:3106";
const output = process.env.QA_OUTPUT || join(tmpdir(), "firefly-lume-readonly-qa");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-swiftshader"] });
const errors = [];
const optKey = "firefly-lens-tour-auto-disabled-v1";
const chapters = [
  ["welcome"], ["map", "map-controls"], ["search", "search"], ["region", "presets"],
  ["pantanal", "selection"], ["sensors", "sensors"], ["period", "period"], ["analyze", "analyze"],
  ["history", "history"], ["month", "month"], ["report", "report-heading"], ["science", "analytics-history"],
  ["forecast", "analytics-forecast"], ["range", "range"], ["exports", "exports"], ["pages", "site-links"], ["complete"],
];
async function setup(width, theme, motion = "reduce") {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion: motion, hasTouch: true, acceptDownloads: true });
  if (process.env.QA_HIDE_DEVTOOLS === "1") await context.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(style);
    });
  });
  await context.addInitScript((value) => {
    try { localStorage.setItem("firefly-lens-theme",value); localStorage.setItem("firefly-lens-basemap-2","map"); } catch { /* about:blank */ }
  }, theme);
  await context.route("https://tiles.openfreemap.org/**", (route) => route.fulfill({ json: {
    version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#24382e" } }],
  } }));
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => { errors.push(error.message); console.log("Browser error:", error.message); });
  return { context, page };
}
const card = (p) => p.locator(".lume-tour-card:visible");
const checkbox = (p) => card(p).getByRole("checkbox", { name: "Don't show again", exact: true });
const mapYear = (p) => p.locator('[data-tour="period"] [aria-label^="Map year:"]');
const mapMonth = (p) => p.locator('[data-tour="period"] [aria-label^="Map month:"]');
async function at(p, id) {
  await p.locator(`.lume-tour-card[data-tour-step="${id}"]`).waitFor();
  const target = chapters.find((step) => step[0] === id)?.[1];
  if (target) await p.locator(`[data-tour="${target}"].driver-active-element`).waitFor();
  // FireFlighter flies above the page and lands on the card's perch.
  await card(p).locator(".lume-tour-mascot").waitFor();
  assert.equal(await card(p).count(), 1);
  assert.equal(await p.locator(".lume-tour-flier .lume").count(), 1);
  assert.equal(await p.locator("main.lens-workspace:visible").getAttribute("inert"), "");
  assert.equal(await p.locator(".explore-hint:visible, .lume-invitation:visible").count(), 0, "No overlapping welcome");
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${id}: horizontal overflow`);
}
async function next(p, id) {
  if (id === "complete" && await p.locator('.lume-tour-card[data-tour-step="pages"]').count()) return visitPages(p);
  await card(p).locator(".driver-popover-next-btn").click(); await at(p, id);
}
/** From "pages": About's and Method's stops, then back to the Lens for the last step. */
async function visitPages(p) {
  const stops = [["about", 4, 17], ["method", 3, 21]];
  await card(p).locator(".driver-popover-next-btn").click();
  for (const [path, count, first] of stops) {
    await p.waitForURL(`**/${path}`);
    for (let i = 0; i < count; i++) {
      await p.waitForFunction((n) => document.querySelector(".lume-tour-card .driver-popover-progress-text")?.textContent === `${n} of 24`, first + i);
      assert.equal(await p.locator(".lume-tour-flier .lume").count(), 1, `${path}: FireFlighter is flying with the tour`);
      await card(p).locator(".driver-popover-next-btn").click();
    }
  }
  await p.waitForURL("**/lens");
  await at(p, "complete");
  assert.equal(await card(p).locator(".driver-popover-progress-text").textContent(), "24 of 24");
}
async function start(p) {
  await p.locator('[data-tour="replay"]').click();
  const confirm=p.getByRole("button",{name:"Start tour",exact:true});
  if(p.viewportSize().width<=700) await confirm.click();
  await at(p, "welcome");
}
async function exit(p, name = "Skip tour") {
  await card(p).getByRole("button", { name, exact: true }).click();
  await p.waitForFunction(() => document.querySelector("main.lens-workspace")?.getAttribute("data-tour-active") === "false");
  assert.equal(await p.locator("main.lens-workspace:visible").getAttribute("inert"), null);
  assert.equal(await p.locator(".driver-popover, .driver-active-element").count(), 0);
}
async function shot(p, name) { await p.screenshot({ path: join(output, name), animations: "disabled" }); }
async function pick(p, label, value) {
  const trigger=p.getByRole("button", { name: new RegExp(`^${label}:`) });
  if(!await trigger.isVisible()) await p.locator('.map-card-chip').click();
  await trigger.click();
  await p.getByRole("listbox", { name: label, exact: true }).getByRole("option", { name: value, exact: true }).click();
}
async function state(p) {
  return p.evaluate(() => ({
    area: document.querySelector('[data-tour="map-canvas"]')?.getAttribute("aria-label"),
    period: document.querySelector('[data-tour="period"]')?.textContent,
    sensors: [...document.querySelectorAll('[data-tour="sensors"] button')].map((el) => el.getAttribute("aria-pressed")),
    tabs: [...document.querySelectorAll('[data-tour^="tab-"]')].map((el) => el.getAttribute("aria-selected")),
    month: !!document.querySelector('[data-tour="month"]'),
    analysis: document.querySelector(".workspace-body")?.getAttribute("data-analysis"),
    search: document.querySelector('[data-tour="search"] input')?.value,
    preset: document.querySelector('[data-tour="presets"]')?.value,
    coordinates: [...document.querySelectorAll(".coordinates-panel input")].map((el) => el.value),
    range: document.querySelector('[data-tour="range"]')?.textContent,
  }));
}
async function attackWorkspace(p, id) {
  const before = await state(p);
  await p.evaluate(() => {
    const main = document.querySelector('main.lens-workspace[data-tour-active="true"]');
    window.__workspaceHits = 0;
    main.addEventListener("click", () => window.__workspaceHits++, { once: true });
    // Covers every mounted calendar, picker, tab, analyze/export button and input.
    for (const el of main.querySelectorAll("button, input, select, [role=option]")) {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }));
    }
    main.querySelector("input, select, button")?.focus();
  });
  assert.equal(await p.evaluate(() => window.__workspaceHits), 0, `${id}: no workspace handler receives clicks`);
  assert.equal(await p.evaluate(() => document.activeElement?.closest("main.lens-workspace") !== null), false, `${id}: workspace cannot take focus`);
  await p.keyboard.press("/");
  await p.keyboard.press("x");
  if (id === "map") {
    await p.evaluate(() => {
      window.__canvasHits = 0;
      const canvas = document.querySelector('.lens-workspace[data-tour-active="true"] .maplibregl-canvas');
      for (const type of ["pointerdown", "touchstart", "touchmove", "wheel"])
        canvas.addEventListener(type, () => window.__canvasHits++);
    });
    const popup = await card(p).boundingBox();
    const { width } = p.viewportSize();
    const [x, y] = [[width / 2, 180], [width / 2, 700], [30, 450]].find(([x, y]) => !(x >= popup.x && x <= popup.x + popup.width && y >= popup.y && y <= popup.y + popup.height));
    await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 40, y + 30); await p.mouse.up();
    await p.mouse.wheel(0, -300);
    const touch = await p.context().newCDPSession(p);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 30, y: y + 40 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.detach();
    assert.equal(await p.evaluate(() => window.__canvasHits), 0, "Map drag, zoom and touch handlers cannot run");
  }
  // Trusted mouse/touch on the highlighted controls, where not covered by the card.
  const target = chapters.find((c) => c[0] === id)?.[1];
  if (target) {
    const box = await p.locator(`[data-tour="${target}"]`).boundingBox();
    const popup = await card(p).boundingBox();
    if (box && popup) {
      const x = Math.min(1430, box.x + box.width / 2), y = box.y + Math.min(box.height / 2, 25);
      if (y > 0 && y < 990 && !(x >= popup.x && x <= popup.x + popup.width && y >= popup.y && y <= popup.y + popup.height)) {
        await p.mouse.click(x, y);
        await p.touchscreen.tap(x, y);
        await p.mouse.move(x, y); await p.mouse.wheel(0, 200);
      }
    }
  }
  assert.deepEqual(await state(p), before, `${id}: workspace state is unchanged`);
  // Driver's native focus traversal must not get stuck on an inert highlighted input.
  await card(p).locator(".driver-popover-close-btn").focus();
  for (let n = 0; n < 8; n++) {
    await p.keyboard.press("Tab");
    assert.equal(await p.evaluate(() => !!document.activeElement?.closest(".lume-tour-card")), true, `${id}: Tab stays in the guide`);
  }
}
try {
  const { context, page } = await setup(1440, "light");
  let downloads = 0, assistantCalls = 0;
  page.on("download", () => downloads++);
  page.on("request", (request) => { if (request.url().endsWith("/api/assistant")) assistantCalls++; });
  await page.goto(base); await at(page, "welcome");
  assert.equal(await checkbox(page).isChecked(), false);
  await exit(page);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), optKey), null);
  await page.evaluate(() => { window.__firstVisitDocument = "lume"; });
  await page.getByRole("link", { name: "About", exact: true }).click();
  await page.waitForURL("**/about");
  await page.getByRole("link", { name: "Lens", exact: true }).click();
  await page.waitForURL("**/lens");
  await page.locator("main.lens-workspace:visible").waitFor();
  assert.equal(await page.evaluate(() => window.__firstVisitDocument), "lume");
  assert.equal(await card(page).count(), 0, "Client navigation must not duplicate the same visit's automatic welcome");
  await page.reload(); await at(page, "welcome"); // Skip never opts out.
  await card(page).locator(".driver-popover-close-btn").click();
  await page.waitForFunction(() => !document.querySelector("main.lens-workspace").inert);
  await page.reload(); await at(page, "welcome"); // Closing never opts out.
  await shot(page, "desktop-welcome.png");
  for (const [id] of chapters) {
    if (id !== "welcome") await next(page, id);
    await attackWorkspace(page, id);
    console.log(`Desktop read-only: ${id}`);
    if (id === "period") {
      assert.match(await mapYear(page).textContent(), /2023/);
      assert.match(await mapMonth(page).textContent(), /Sep/);
    }
    if (id === "month") {
      assert.match(await page.locator('[data-tour="month"]').innerText(), /356 hot spots/);
      await card(page).locator(".driver-popover-prev-btn").click(); await at(page, "history"); await next(page, "month");
    }
    if (id === "science") {
      assert.equal(await page.locator('[data-tour="tab-history"]').getAttribute("aria-selected"), "true");
      assert.equal(await page.locator('[data-tour="analytics-history"] .analytics-stats strong').first().innerText(), "355.68");
      await shot(page, "desktop-history.png");
    }
    if (id === "forecast") {
      assert.match(await page.locator('[data-tour="analytics-forecast"]').innerText(), /unavailable/i);
      await card(page).locator(".driver-popover-prev-btn").click(); await at(page, "science"); await next(page, "forecast");
    }
  }
  assert.equal(downloads, 0); assert.equal(assistantCalls, 0);
  await exit(page, "Restore previous workspace");
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-tour") === "replay");
  assert.equal(await page.locator('[data-tour="replay"] .lume').count(), 1);
  assert.equal(await page.evaluate(() => localStorage.getItem("firefly-lens-tour-v1")), "completed");
  await page.reload(); await at(page, "welcome"); // Completion never opts out.
  await checkbox(page).check(); await exit(page);
  await page.reload(); await page.locator('[data-tour="replay"]:enabled').waitFor();
  assert.equal(await card(page).count(), 0); assert.equal(await page.locator("main.lens-workspace:visible").getAttribute("inert"), null);
  await start(page); assert.equal(await checkbox(page).isChecked(), true);
  await checkbox(page).uncheck(); await exit(page);
  await page.reload(); await at(page, "welcome");
  await checkbox(page).check(); await exit(page);
  // A client-side navigation shares the document and must not launch again.
  await page.evaluate(() => { window.__sameDocument = "lume"; });
  await page.getByRole("link", { name: "About", exact: true }).click();
  await page.waitForURL("**/about");
  await page.getByRole("link", { name: "Lens", exact: true }).click();
  await page.waitForURL("**/lens");
  await page.locator("main.lens-workspace:visible").waitFor();
  assert.equal(await page.evaluate(() => window.__sameDocument), "lume");
  assert.equal(await card(page).count(), 0);
  // Opt-out doesn't interfere with the launcher or normal controls/exports.
  await page.getByRole("button", { name: "Coordinates", exact: true }).click();
  await page.locator('[data-tour="presets"]').selectOption("pampa");
  await pick(page, "Map month", "Jun"); await pick(page, "Map year", "2021");
  await page.locator('[data-tour="sensors"] button').first().click();
  const analyze = page.getByRole("button", { name: "Analyze area", exact: true });
  if (await analyze.isVisible()) await analyze.click();
  await page.locator('[data-tour="history"][data-tour-ready="true"]').waitFor();
  await page.getByRole("button", { name: /see full report below/i }).click();
  await page.locator('[data-tour="tab-forecast"]').click();
  await start(page); for (const [id] of chapters.slice(1, 6)) await next(page, id); await exit(page);
  assert.match(await page.locator('[data-tour="map-canvas"]').getAttribute("aria-label"), /Pampa/);
  assert.match(await mapYear(page).textContent(), /2021/); assert.match(await mapMonth(page).textContent(), /Jun/);
  assert.equal(await page.locator('[data-tour="sensors"] button').first().getAttribute("aria-pressed"), "false");
  assert.equal(await page.locator('[data-tour="tab-forecast"]').getAttribute("aria-selected"), "true");
  await page.locator('[data-tour="tab-history"]').click();
  await page.getByRole("button", { name: "Monthly table CSV", exact: true }).waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Monthly table CSV", exact: true }).click();
  assert.match(readFileSync(await (await downloadPromise).path(), "utf8"), /year,month,harmonized_hotspots/);
  assert.equal(downloads, 1, "Exports work immediately after the guide exits");
  // A previously running time-lapse must not change the demonstration's period.
  await page.getByRole("button", { name: "Time-lapse", exact: true }).click();
  await page.locator(".playback-play:enabled").waitFor();
  await page.locator(".playback-play").click();
  await page.locator('.playback-bar[data-playing="true"]').waitFor();
  await start(page);
  assert.equal(await page.locator(".playback-bar").count(), 0);
  const pausedPeriod = await mapMonth(page).textContent();
  await page.waitForTimeout(1100); // Deliberately longer than one playback tick.
  assert.equal(await mapMonth(page).textContent(), pausedPeriod);
  await exit(page);
  await page.locator('.playback-bar[data-playing="false"]').waitFor();
  await page.getByRole("button", { name: "Close the time-lapse", exact: true }).click();
  await context.close();

  for (const [width, theme] of [[320, "dark"], [390, "light"], [1000, "dark"]]) {
    const { context: ctx, page: p } = await setup(width, theme);
    await p.goto(`${base}/lens`); await at(p, "welcome");
    for (const [id] of chapters.slice(1)) {
      await next(p, id); await attackWorkspace(p, id);
      if (id === "sensors") await shot(p, `${width}-${theme}-sensors.png`);
    }
    if (width === 390) {
      await exit(p, "Keep example");
      assert.match(await p.locator('[data-tour="map-canvas"]').getAttribute("aria-label"), /Pantanal/);
      assert.match(await mapYear(p).textContent(), /2023/);
      await p.reload(); await at(p, "welcome"); // Keep never opts out either.
    } else { await card(p).getByRole("button", { name: "Replay tour", exact: true }).click(); await at(p, "welcome"); }
    await p.keyboard.press("Escape"); await p.waitForFunction(() => !document.querySelector("main.lens-workspace").inert);
    assert.equal(await card(p).count(), 0);
    console.log(`${width}px ${theme}: all steps and mouse/touch/keyboard lock passed.`);
    await ctx.close();
  }
  const { context: recovery, page: rp } = await setup(1440, "dark", "no-preference");
  let attempts = 0, recoveredRequests = 0, allowRecovery = false;
  // Signals may request the same snapshot before the report does. Keep the
  // outage active until Retry so background prefetch cannot consume the fault.
  const recoveryRoute = (route) => {
    attempts++;
    if (allowRecovery) { recoveredRequests++; return route.continue(); }
    return route.fulfill({ status: 503, body: "offline" });
  };
  await recovery.route("**/analytics/pantanal.json", recoveryRoute);
  // A configured Python service takes priority over the prepared snapshot.
  await recovery.route("**/api/analytics/history", recoveryRoute);
  await rp.goto(base); await at(rp, "welcome");
  for (const [id] of chapters.slice(1, 11)) await next(rp, id);
  await card(rp).locator(".driver-popover-next-btn").click();
  await card(rp).getByRole("button", { name: "Retry section", exact: true }).waitFor();
  await shot(rp, "recovery-dark.png");
  allowRecovery = true;
  await card(rp).getByRole("button", { name: "Retry section", exact: true }).click(); await at(rp, "science");
  assert.ok(attempts >= 2 && recoveredRequests >= 1); await exit(rp); await recovery.close();
  const { context: failed, page: fp } = await setup(390, "dark");
  await failed.route("**/data/brazil/t_*.bin.gz", (route) => route.fulfill({ status: 503, body: "offline" }));
  await fp.goto(base); await at(fp, "welcome");
  for (const [id] of chapters.slice(1, 8)) await next(fp, id);
  await card(fp).locator(".driver-popover-next-btn").click(); await card(fp).getByRole("button", { name: "Skip section", exact: true }).click();
  await at(fp, "complete"); await exit(fp, "Restore previous workspace");
  await fp.reload(); await at(fp, "welcome"); // Partial outcome doesn't opt out.
  await fp.keyboard.press("Escape"); await failed.close();
  assert.deepEqual(errors, []);
  writeFileSync(join(output, "results.json"), JSON.stringify({ status: "passed", steps: 24, layouts: [1440, 1000, 390, 320], errors, pantanalSeptember2023: 355.68, automaticVisits: true, explicitOptOut: true, readOnly: true }, null, 2));
  console.log(`Lume automatic/read-only browser QA passed. Evidence: ${output}`);
} finally { await browser.close(); }
