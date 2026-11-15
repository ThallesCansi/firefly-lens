// Optional browser QA. Reuse Playwright via PLAYWRIGHT_MODULE; no project dependency.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base = process.env.QA_BASE_URL || "http://localhost:3104";
const output = join(tmpdir(), "firefly-radar-qa");
mkdirSync(output, { recursive: true });
const summary = JSON.parse(readFileSync(new URL("../public/data/brazil/historical-radar.json", import.meta.url), "utf8"));
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-swiftshader"] });
const errors = [];
async function setup(width, theme) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, reducedMotion: "reduce", acceptDownloads: true });
  await context.addInitScript((value) => {
    localStorage.setItem("firefly-lens-theme", value);
    localStorage.setItem("firefly-lens-intro-done", "1");
  }, theme);
  // Exercise real WebGL and scientific data without a third-party basemap dependency.
  await context.route("https://basemaps.cartocdn.com/**", (route) => route.fulfill({ json: {
    version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#24382e" } }],
  } }));
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(15000);
  return { context, page };
}
const radarButton = (page) => page.getByRole("button", { name: "Historical Anomaly Radar", exact: true });
async function open(page) {
  await radarButton(page).click();
  await page.locator(".radar-result").first().waitFor();
}
async function period(page, year, month) {
  await page.getByRole("tab", { name: "Explore Period", exact: true }).click();
  await page.getByLabel("Radar year", { exact: true }).selectOption(String(year));
  await page.getByLabel("Radar month", { exact: true }).selectOption(String(month).padStart(2, "0"));
  await page.locator(`.historical-radar [data-radar-result="amazon/${year}-${String(month).padStart(2, "0")}"]`).waitFor();
  assert.equal(await page.locator(".historical-radar .radar-result").count(), 5);
}
async function overflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, label);
  assert.equal(await page.locator(".historical-radar").evaluate((el) => el.scrollWidth > el.clientWidth + 1), false, `${label}: radar overflow`);
}
try {
  const { context, page } = await setup(1440, "light");
  let tileRequests = 0, summaryRequests = 0, hold = true;
  const releases = [];
  page.on("request", (r) => {
    if (/\/data\/brazil\/t_.*\.bin\.gz/.test(r.url())) tileRequests++;
    if (r.url().endsWith("historical-radar.json")) summaryRequests++;
  });
  await context.route("**/data/brazil/t_*.bin.gz", async (route) => {
    if (hold) await new Promise((resolve) => releases.push(resolve));
    await route.continue();
  });
  await page.goto(base);
  await page.locator(".hotspot-map[data-projection]").waitFor();
  await open(page);
  assert.match(await page.locator(".historical-radar").innerText(), /157 historical highlights/);
  await overflow(page, "desktop light");
  await page.screenshot({ path: join(output, "desktop-light.png") });
  await page.getByLabel("Historical reference", { exact: true }).selectOption("2025");
  assert.match(await page.locator(".historical-radar").innerText(), /148 historical highlights/);
  await page.getByLabel("Historical reference", { exact: true }).selectOption("2023");
  for (const [year, month] of [[2002, 7], [2020, 8], [2020, 9], [2022, 3], [2022, 4], [2026, 11]]) {
    await period(page, year, month);
    assert.equal(await page.getByText("Exploration only · excluded from comparisons", { exact: true }).count(), 5);
  }
  await period(page, 2026, 10);
  assert.equal(await page.getByText(/Nominal 95% predictive interval:/).count(), 5);
  assert.equal(tileRequests, 0, "Radar exploration must not fetch geographic data tiles");
  assert.equal(summaryRequests, 1);
  await period(page, 2004, 9);
  await page.locator('[data-radar-result="amazon/2004-09"] button').click();
  await page.getByRole("application", { name: "Map of detections in Southern Amazon", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector(".analysis-content [role=status]")?.textContent?.includes("Reading"));
  // Before the first area's data return, select another region. Late data must
  // not replace the new analysis. The existing export verifies the actual record.
  await open(page);
  await period(page, 2004, 9);
  await page.locator('[data-radar-result="pampa/2004-09"] button').click();
  hold = false;
  for (const release of releases) release();
  await page.getByRole("application", { name: "Map of detections in Pampa", exact: true }).waitFor();
  await page.locator("#history-title").waitFor();
  assert.match(await page.locator("#history-title").innerText(), /September 2004/);
  assert.equal(await page.locator(".radar-context [data-radar-result]").getAttribute("data-radar-result"), "pampa/2004-09");
  assert.equal(await page.getByLabel("Map year", { exact: true }).inputValue(), "2004");
  assert.equal(await page.getByLabel("Map month", { exact: true }).inputValue(), "09");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Monthly table CSV", exact: true }).click();
  const download = await downloading;
  const text = readFileSync(await download.path(), "utf8");
  const csv = text.trim().split(/\r?\n/).map((line) => line.split(","));
  const selected = csv.find((line) => line[0] === "2004" && line[1] === "September");
  const expected = summary.regions.find((r) => r.id === "pampa").months.find((m) => m.year === 2004 && m.month === 8);
  assert.ok(selected, "The exported table must contain September 2004");
  assert.ok(Math.abs(Number(selected[2]) - expected.value) <= 0.05, "Late Amazon data must not replace the Pampa scientific record (CSV rounds to 0.1)");
  await page.getByRole("button", { name: "Close analysis", exact: true }).click();
  // Escape returns focus to the radar trigger, and tab controls support arrows.
  await open(page);
  await page.getByRole("tab", { name: "Historical Highlights", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("tab", { name: "Explore Period", exact: true }).getAttribute("aria-selected"), "true");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Historical Anomaly Radar");
  await context.close();

  // Both themes at narrow widths and /lens route. Changing theme keeps the radar.
  for (const [width, theme] of [[320, "dark"], [390, "light"]]) {
    const { context: mobile, page: p } = await setup(width, theme);
    await p.goto(`${base}/lens`);
    await p.locator(".hotspot-map[data-projection]").waitFor();
    await open(p);
    await overflow(p, `${width}px ${theme}`);
    await p.screenshot({ path: join(output, `mobile-${theme}.png`) });
    await period(p, 2026, 10);
    await overflow(p, `${width}px Explore Period`);
    await p.locator('[data-radar-result="caatinga/2026-10"] button').click();
    await p.getByRole("application", { name: "Map of detections in Sertão", exact: true }).waitFor();
    await p.locator("#history-title").waitFor();
    assert.equal(await p.locator(".radar-context [data-radar-result]").getAttribute("data-radar-result"), "caatinga/2026-10");
    await mobile.close();
  }
  // A transport error has an explicit retry and does not request tiles.
  const { context: failure, page: p } = await setup(1440, "dark");
  let attempts = 0;
  await failure.route("**/historical-radar.json", (route) => ++attempts === 1 ? route.fulfill({ status: 503, body: "offline" }) : route.continue());
  await p.goto(base);
  await radarButton(p).click();
  await p.getByRole("button", { name: "Try again", exact: true }).click();
  await p.locator(".radar-result").first().waitFor();
  assert.equal(attempts, 2);
  await failure.close();
  assert.deepEqual(errors, []);
  console.log(`Radar browser QA passed: real WebGL/map, both routes, both baselines/modes, all six quality exclusions, nominal intervals, zero radar tile requests, request deduplication, retry, keyboard/focus, delayed-response selection race verified by CSV, 320/390px themes. Screenshots: ${output}`);
} finally { await browser.close(); }
