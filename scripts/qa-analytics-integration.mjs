import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.QA_BASE_URL || "http://localhost:3107";
const out = "docs/phase-6/screenshots";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
await context.route(
  /https:\/\/(basemaps\.cartocdn\.com|tiles\.openfreemap\.org)\/.*/,
  (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#24382e" },
          },
        ],
      },
    }),
);
await context.addInitScript(() => {
  localStorage.setItem("firefly-lens-intro-done", "1");
  localStorage.setItem("firefly-lens-theme", "dark");
});
const page = await context.newPage();
const errors = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
const report = page.locator(".analytics-report");
async function choose(id) {
  if (!(await page.locator(".coordinates-panel select").first().isVisible()))
    await page
      .getByRole("button", { name: "Coordinates", exact: true })
      .click({ noWaitAfter: true });
  await page.locator(".coordinates-panel select").first().selectOption(id);
  await page
    .getByRole("button", { name: "Analyze area", exact: true })
    .click({ noWaitAfter: true });
  await report.waitFor({ timeout: 60000 });
  console.log(`Analyzing ${id}`);
}
try {
  await page.goto(base);
  await page
    .locator('.hotspot-map[data-projection="globe"]')
    .waitFor({ timeout: 30000 });
  await choose("amazon");
  await report
    .getByText("Python · preprocessed", { exact: true })
    .waitFor({ timeout: 60000 });
  await report
    .getByRole("heading", { name: "Monthly activity", exact: true })
    .waitFor();
  await report
    .locator(".analytics-legacy .analysis-content")
    .waitFor({ timeout: 60000 });
  assert.equal(
    await report
      .getByRole("tab", { name: "History", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  const before = await page.locator(".analysis-report").innerText();
  await report
    .getByRole("tab", { name: "Forecast", exact: true })
    .click({ noWaitAfter: true });
  await report
    .getByText("No current numeric forecast", { exact: true })
    .waitFor();
  assert(
    (await report.innerText()).includes("1,463.7"),
    "Amazon SARIMA MAE must match Python, formatted to 2 places",
  );
  assert((await report.innerText()).includes("Weather outlook unavailable"));
  await report.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/forecast-dark.png`, fullPage: true });
  checks.push(
    "Real Amazon history, scientific tabs, SARIMA validation metrics and unavailable current forecast/FWI",
  );
  // Tabs never alter the selected month/day in the map.
  await report
    .getByRole("tab", { name: "History", exact: true })
    .click({ noWaitAfter: true });
  assert.equal(
    (await page.locator(".analysis-report").innerText()).includes(
      "September 2026",
    ),
    before.includes("September 2026"),
  );
  await report.getByLabel(/Resolution/).selectOption("annual");
  await report
    .getByRole("heading", { name: "Annual activity", exact: true })
    .waitFor();
  await report.getByLabel(/Resolution/).selectOption("monthly");
  await report.getByLabel(/Measure/).selectOption("z_score");
  await report.getByRole("heading", { name: "Z-score", exact: true }).waitFor();
  const calendarDay = report.locator(
    '[role="gridcell"][data-date="2026-09-14"]',
  );
  await calendarDay.click({ noWaitAfter: true });
  assert.equal(await calendarDay.getAttribute("aria-selected"), "true");
  await report.getByRole("tab", { name: "Forecast", exact: true }).focus();
  await report
    .getByRole("tab", { name: "Forecast", exact: true })
    .press("Enter");
  await report
    .getByRole("tab", { name: "Forecast", exact: true })
    .press("ArrowLeft");
  assert.equal(
    await report
      .getByRole("tab", { name: "History", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.equal(await calendarDay.getAttribute("aria-selected"), "true");
  await page
    .locator('.history-month[aria-label^="September 2026"]')
    .click({ noWaitAfter: true });
  await page
    .getByRole("heading", { name: "September 2026", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "All months", exact: true })
    .click({ noWaitAfter: true });
  checks.push(
    "Daily selection persists across tabs, keyboard tab navigation works, and side-panel monthly calendar still opens and returns",
  );
  await report.getByLabel("From year").selectOption("2025");
  await report.getByLabel("From month").selectOption("0");
  await report
    .locator(".analytics-chart")
    .first()
    .getByText("View chart data", { exact: true })
    .click({ noWaitAfter: true });
  assert(
    !(await report.locator(".analytics-chart").first().innerText()).includes(
      "2002-07",
    ),
  );
  assert(
    (await report.locator(".analytics-chart").first().innerText()).includes(
      "2026-11",
    ),
  );
  checks.push("Monthly/annual resolution, anomaly measures and period filters");
  await page
    .getByRole("button", { name: "Switch to light theme", exact: true })
    .click({ noWaitAfter: true });
  await report.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/history-light.png`, fullPage: true });
  await report
    .getByRole("tab", { name: "Forecast", exact: true })
    .click({ noWaitAfter: true });
  // Delay an older region response while another selection completes.
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/analytics/pantanal.json", async (route) => {
    await blocked;
    await route.continue();
  });
  await choose("pantanal");
  await report.getByText(/Loading scientific analysis for/).waitFor();
  await choose("caatinga");
  await report
    .getByText("Python · preprocessed", { exact: true })
    .waitFor({ timeout: 60000 });
  assert.equal(
    await report
      .getByRole("tab", { name: "Forecast", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  release();
  await page.waitForTimeout(400);
  assert(
    (await report.locator(".analytics-report-heading").innerText()).includes(
      "Sertão",
    ),
  );
  checks.push(
    "Rapid region changes preserve selected tab and suppress stale scientific responses",
  );
  await page
    .getByRole("button", { name: /2D Map/ })
    .click({ noWaitAfter: true });
  await page.locator('.hotspot-map[data-projection="mercator"]').waitFor();
  await page
    .getByRole("button", { name: /3D Globe/ })
    .click({ noWaitAfter: true });
  await page.locator('.hotspot-map[data-projection="globe"]').waitFor();
  checks.push("Original globe/2D projection controls remain functional");
  // Select a real arbitrary polygon via coordinates, not another preset.
  if (!(await page.getByLabel("West", { exact: true }).isVisible()))
    await page
      .getByRole("button", { name: "Coordinates", exact: true })
      .click({ noWaitAfter: true });
  for (const [name, value] of Object.entries({
    West: "-48.2",
    South: "-16",
    East: "-47.7",
    North: "-15.5",
  }))
    await page.getByLabel(name, { exact: true }).fill(value);
  await page
    .getByRole("button", { name: "Apply coordinates" })
    .click({ noWaitAfter: true });
  await page
    .getByRole("button", { name: "Analyze area", exact: true })
    .click({ noWaitAfter: true });
  await report
    .getByText("This exact geometry needs Python processing", { exact: true })
    .waitFor();
  await report
    .getByRole("heading", {
      name: "Forecast unavailable for this selection",
      exact: true,
    })
    .waitFor();
  await report
    .getByRole("tab", { name: "History", exact: true })
    .click({ noWaitAfter: true });
  await report
    .getByRole("heading", {
      name: "Monthly history for the selected polygon",
      exact: true,
    })
    .waitFor({ timeout: 60000 });
  await report
    .locator(".analytics-legacy .analysis-content")
    .waitFor({ timeout: 60000 });
  assert.equal(
    await report
      .getByRole("button", { name: "Monthly table CSV", exact: true })
      .isEnabled(),
    true,
  );
  checks.push(
    "Arbitrary polygon keeps its own browser history, calendar and exports; advanced statistics and forecast explicitly unsupported",
  );
  // A transport failure is distinct from unsupported geometry, and retry works.
  let failPampa = true;
  await page.route("**/analytics/pampa.json", (route) =>
    failPampa
      ? route.fulfill({ status: 503, body: "unavailable" })
      : route.continue(),
  );
  await choose("pampa");
  await report
    .getByText("Scientific analysis could not be loaded", { exact: true })
    .waitFor();
  failPampa = false;
  await report
    .getByRole("button", { name: "Retry analysis", exact: true })
    .click({ noWaitAfter: true });
  await report
    .getByText("Python · preprocessed", { exact: true })
    .waitFor({ timeout: 60000 });
  checks.push(
    "Processing error is explicit; retry loads the correct regional bundle",
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await report.scrollIntoViewIfNeeded();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `No page overflow at ${width}px`,
    );
    await page.screenshot({
      path: `${out}/history-mobile-${width}.png`,
      fullPage: true,
    });
  }
  checks.push("Light/dark and mobile widths 390px/320px without page overflow");
  assert.deepEqual(errors, [], "No browser runtime errors");
  await writeFile(
    "docs/phase-6/browser-results.json",
    JSON.stringify(
      { generated_at: new Date().toISOString(), checks, errors },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  console.log((await page.locator("body").innerText()).slice(-10000));
  console.log({ errors });
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true });
  throw error;
} finally {
  await browser.close();
}
