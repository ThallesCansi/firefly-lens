// Browser QA using an existing Playwright installation; no added project dependency.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base = process.env.QA_BASE_URL || "http://localhost:3106";
const output = process.env.QA_OUTPUT || join(tmpdir(), "firefly-lume-qa");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-swiftshader"] });
const errors = [];
const chapters = [
  ["welcome"], ["map", "map-controls"], ["search", "search"], ["region", "presets"],
  ["pantanal", "selection"], ["sensors", "sensors"], ["period", "period"], ["analyze", "analyze"],
  ["history", "history"], ["month", "month"], ["report", "report-heading"], ["science", "analytics-history"],
  ["forecast", "analytics-forecast"], ["range", "range"], ["exports", "exports"], ["complete"],
];
async function setup(width, theme, reducedMotion = "reduce") {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion, acceptDownloads: true });
  await context.addInitScript((theme) => localStorage.setItem("firefly-lens-theme", theme), theme);
  await context.route("https://basemaps.cartocdn.com/**", (route) => route.fulfill({ json: {
    version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#24382e" } }],
  } }));
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page };
}
const card = (p) => p.locator(".lume-tour-card:visible");
async function at(p, id) {
  await p.locator(`.lume-tour-card[data-tour-step="${id}"]`).waitFor();
  const target = chapters.find((c) => c[0] === id)?.[1];
  if (target) await p.locator(`[data-tour="${target}"].driver-active-element`).waitFor();
  await card(p).locator(".lume").waitFor();
  assert.equal(await card(p).locator(".lume").count(), 1, "One original Lume per popover");
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${id}: page overflow`);
}
async function next(p, id) {
  await card(p).locator(".driver-popover-next-btn").click();
  await at(p, id);
}
async function start(p) {
  await p.locator('[data-tour="replay"]').click();
  await at(p, "welcome");
}
async function screenshot(p, name) {
  await p.screenshot({ path: join(output, name), animations: "disabled" });
}
try {
  const { context, page } = await setup(1440, "light");
  let downloads = 0, assistantCalls = 0;
  page.on("download", () => downloads++);
  page.on("request", (r) => { if (r.url().endsWith("/api/assistant")) assistantCalls++; });
  await page.goto(base);
  await page.locator(".hotspot-map[data-projection]").waitFor();
  await page.locator(".lume-invitation").waitFor();
  assert.equal(await page.locator(".driver-overlay").count(), 0, "Never auto-start");
  await page.getByRole("button", { name: "Skip tour", exact: true }).click();
  await page.reload();
  assert.equal(await page.locator(".lume-invitation").count(), 0);
  assert.equal(await page.locator(".driver-overlay").count(), 0);
  await start(page);
  await screenshot(page, "desktop-welcome.png");
  for (const [id] of chapters.slice(1)) {
    await next(page, id);
    console.log(`Desktop: ${id}`);
    if (id === "pantanal") {
      assert.match(await page.locator('[data-tour="selection"]').innerText(), /Pantanal/);
      await page.getByRole("application", { name: "Map of detections in Pantanal", exact: true }).waitFor();
    }
    if (id === "period") {
      assert.equal(await page.getByLabel("Map month", { exact: true }).inputValue(), "09");
      assert.equal(await page.getByLabel("Map year", { exact: true }).inputValue(), "2023");
      await page.getByLabel("Map month", { exact: true }).focus();
      await page.keyboard.press("ArrowDown");
      assert.equal(await card(page).getAttribute("data-tour-step"), "period", "Select arrows must not advance the tour");
      assert.equal(await card(page).locator(".lume-body").evaluate((el) => getComputedStyle(el).animationName), "none");
    }
    if (id === "month") {
      assert.match(await page.locator('[data-tour="month"]').innerText(), /535 hot spots/);
      await card(page).locator(".driver-popover-prev-btn").click();
      await at(page, "history");
      await next(page, "month");
    }
    if (id === "science") {
      assert.equal(await page.locator('[data-tour="tab-history"]').getAttribute("aria-selected"), "true");
      assert.equal((await page.locator('[data-tour="analytics-history"] .analytics-stats strong').first().innerText()).replaceAll(",", ""), "535");
      await screenshot(page, "desktop-history.png");
    }
    if (id === "forecast") {
      assert.equal(await page.locator('[data-tour="tab-forecast"]').getAttribute("aria-selected"), "true");
      assert.match(await card(page).innerText(), /latest complete origin/);
      // Actual Pantanal output is unavailable, not a fabricated demonstration forecast.
      assert.match(await page.locator('[data-tour="analytics-forecast"]').innerText(), /unavailable/i);
      await card(page).locator(".driver-popover-prev-btn").click();
      await at(page, "science"); await next(page, "forecast");
    }
    if (id === "exports") {
      assert.equal(downloads, 0, "The tour must not download automatically");
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Monthly table CSV", exact: true }).click();
      const downloaded = await downloadPromise;
      const csv = readFileSync(await downloaded.path(), "utf8");
      assert.match(csv, /2023,September,535,observed_modis/);
    }
  }
  assert.equal(assistantCalls, 0);
  await card(page).getByRole("button", { name: "Restore previous workspace", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#main")?.getAttribute("data-tour-active") === "false");
  assert.equal(await page.locator(".driver-popover").count(), 0);
  assert.equal(await page.locator(".driver-active-element").count(), 0);
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-tour") === "replay");
  await page.getByRole("application", { name: "Map of detections in Earth", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("firefly-lens-tour-v1")), "completed");
  console.log("Desktop full flow, exact value, tabs, export and empty-workspace restoration passed.");

  // Restore a genuine non-default workspace, including its open Forecast tab.
  await page.getByRole("button", { name: "Coordinates", exact: true }).click();
  await page.locator('[data-tour="presets"]').selectOption("pampa");
  await page.getByLabel("Map month", { exact: true }).selectOption("06");
  await page.getByLabel("Map year", { exact: true }).selectOption("2021");
  await page.getByRole("button", { name: "MODIS", exact: true }).click();
  await page.getByRole("button", { name: "Analyze area", exact: true }).click();
  await page.locator('[data-tour="history"][data-tour-ready="true"]').waitFor();
  await page.getByRole("button", { name: "Full report below", exact: true }).click();
  await page.locator('[data-tour="tab-forecast"]').click();
  await start(page);
  for (const [id] of chapters.slice(1, 6)) await next(page, id);
  await card(page).getByRole("button", { name: "Skip tour", exact: true }).click();
  await page.getByRole("application", { name: "Map of detections in Pampa", exact: true }).waitFor();
  assert.equal(await page.getByLabel("Map month", { exact: true }).inputValue(), "06");
  assert.equal(await page.getByLabel("Map year", { exact: true }).inputValue(), "2021");
  assert.equal(await page.getByRole("button", { name: "MODIS", exact: true }).getAttribute("aria-pressed"), "false");
  assert.equal(await page.locator('[data-tour="tab-forecast"]').getAttribute("aria-selected"), "true");
  // An arbitrary geometry must retain its genuine unavailable Forecast state.
  await page.getByRole("button", { name: "Coordinates", exact: true }).click();
  for (const [label, value] of [["West", "-60"], ["South", "-20"], ["East", "-50"], ["North", "-10"]])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Apply coordinates", exact: true }).click();
  await page.getByRole("button", { name: "Analyze area", exact: true }).click();
  await page.getByRole("button", { name: "Full report below", exact: true }).click();
  await page.locator('[data-tour="analytics"][data-tour-ready="true"]').waitFor();
  const customId = await page.locator('[data-tour="analytics"]').getAttribute("data-tour-area");
  assert.match(await page.locator('[data-tour="analytics"]').innerText(), /This exact geometry needs Python processing/);
  assert.match(await page.locator('[data-tour="analytics-forecast"]').innerText(), /No other region’s forecast is substituted/);
  await start(page);
  for (const [id] of chapters.slice(1, 5)) await next(page, id);
  await card(page).getByRole("button", { name: "Skip tour", exact: true }).click();
  await page.locator(`[data-tour="analytics"][data-tour-area="${customId}"][data-tour-ready="true"]`).waitFor();
  assert.match(await page.locator('[data-tour="analytics-forecast"]').innerText(), /Forecast unavailable for this selection/);
  await context.close();

  for (const [width, theme] of [[320, "dark"], [390, "light"], [1000, "dark"]]) {
    const { context: ctx, page: p } = await setup(width, theme);
    await p.goto(`${base}/lens`);
    await p.locator(".hotspot-map[data-projection]").waitFor();
    await start(p);
    for (const [id] of chapters.slice(1)) {
      await next(p, id);
      if (id === "sensors") {
        assert.equal(await p.locator(".map-card").getAttribute("data-open"), "true");
        const target = await p.locator('[data-tour="sensors"]').boundingBox();
        const popover = await card(p).boundingBox();
        assert.ok(target && popover);
        const overlap = target.x < popover.x + popover.width && target.x + target.width > popover.x && target.y < popover.y + popover.height && target.y + target.height > popover.y;
        assert.equal(overlap, false, `${width}px: card must not obstruct sensor controls`);
        await screenshot(p, `${width}-${theme}-sensors.png`);
      }
    }
    if (width === 390) {
      await card(p).getByRole("button", { name: "Keep example", exact: true }).click();
      await p.getByRole("application", { name: "Map of detections in Pantanal", exact: true }).waitFor();
      assert.equal(await p.getByLabel("Map year", { exact: true }).inputValue(), "2023");
    } else {
      // Replay stays within the same saved session. Escape restores it.
      await card(p).getByRole("button", { name: "Replay tour", exact: true }).click();
      await at(p, "welcome");
      await p.keyboard.press("Escape");
      await p.waitForFunction(() => document.querySelector("#main")?.getAttribute("data-tour-active") === "false");
      assert.equal(await p.locator(".driver-popover").count(), 0);
    }
    console.log(`${width}px ${theme}: full sequence, reduced motion, ${width === 390 ? "Keep example" : "replay and Escape"} passed.`);
    await ctx.close();
  }
  // Fail a real prepared-analysis request once, then retry using the unchanged loader.
  const { context: recovery, page: rp } = await setup(1440, "dark", "no-preference");
  let attempts = 0;
  await recovery.route("**/analytics/pantanal.json", (route) => ++attempts === 1 ? route.fulfill({ status: 503, body: "offline" }) : route.continue());
  await rp.goto(base); await start(rp);
  for (const [id] of chapters.slice(1, 11)) await next(rp, id);
  await card(rp).locator(".driver-popover-next-btn").click();
  await card(rp).getByRole("button", { name: "Retry section", exact: true }).waitFor();
  await screenshot(rp, "recovery-dark.png");
  await card(rp).getByRole("button", { name: "Retry section", exact: true }).click();
  await at(rp, "science");
  assert.equal(attempts, 2);
  await card(rp).getByRole("button", { name: "Skip tour", exact: true }).click();
  await recovery.close();
  const { context: failed, page: fp } = await setup(390, "dark");
  await failed.route("**/data/brazil/t_*.bin.gz", (route) => route.fulfill({ status: 503, body: "offline" }));
  await fp.goto(base); await start(fp);
  for (const [id] of chapters.slice(1, 8)) await next(fp, id);
  await card(fp).locator(".driver-popover-next-btn").click();
  await card(fp).getByRole("button", { name: "Skip section", exact: true }).click();
  await at(fp, "complete");
  await card(fp).getByRole("button", { name: "Restore previous workspace", exact: true }).click();
  assert.equal(await fp.evaluate(() => localStorage.getItem("firefly-lens-tour-v1")), "partial");
  await failed.close();
  const { context: keyboard, page: kp } = await setup(390, "light");
  await kp.goto(base); await start(kp);
  await kp.keyboard.press("Tab");
  assert.equal(await kp.evaluate(() => !!document.activeElement?.closest(".lume-tour-card")), true);
  for (const [id] of chapters.slice(1, 7)) await next(kp, id);
  await kp.getByLabel("Map year", { exact: true }).focus();
  await kp.keyboard.press("Escape");
  await kp.waitForFunction(() => document.querySelector("#main")?.getAttribute("data-tour-active") === "false");
  assert.equal(await kp.locator(".driver-popover").count(), 0);
  // Leaving the route removes the Driver layer and pending transition work.
  await start(kp); await kp.goto(`${base}/about`);
  assert.equal(await kp.locator(".driver-active-element, .driver-popover").count(), 0);
  await keyboard.close();
  assert.deepEqual(errors, []);
  writeFileSync(join(output, "results.json"), JSON.stringify({ status: "passed", chapters: chapters.length, layouts: [1440, 1000, 390, 320], errors, pantanalSeptember2023: 535 }, null, 2));
  console.log(`Lume browser QA passed. Evidence: ${output}`);
} finally { await browser.close(); }
