// Optional browser QA. Reuse an installed Playwright via PLAYWRIGHT_MODULE.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const base = process.env.PREVIEW_URL || "http://127.0.0.1:3107";
const output = "qa/data-audit/methods-screenshots";
await mkdir(output, { recursive: true });
const errors = [];
try {
  for (const [label, width, theme] of [["desktop", 1440, "light"], ["mobile", 320, "dark"]]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
    await context.addInitScript((value) => localStorage.setItem("firefly-lens-theme", value), theme);
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/method#validation`);
    await page.getByRole("tab", { name: "Harmonization", exact: true }).waitFor();
    await page.getByText("Published L2 metrics", { exact: false }).waitFor();
    assert.ok(await page.evaluate(() => !getComputedStyle(document.body).fontFamily.includes("Times New Roman")), "Expected the app's compiled font styles");
    assert.equal(await page.locator("#validation .evidence-figure").count(), 4);
    // Three always-visible chart figures (one SVG each, the biome figure six) plus the collapsed zoom chart.
    assert.equal(await page.locator("#validation .evidence-figure svg.hchart-svg").count(), 9);
    const response = await page.request.get(`${base}/method/evidence/harmonization-charts.json`);
    assert.equal(response.status(), 200);
    await page.locator("#validation").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${label}-validation.png` });
    const firstTab = page.getByRole("tab", { name: "Harmonization", exact: true });
    await firstTab.focus();
    await firstTab.press("ArrowRight");
    assert.equal(await page.getByRole("tab", { name: "Historical Anomalies" }).getAttribute("aria-selected"), "true");
    await page.goto(`${base}/method#monthly-evidence`);
    await page.locator("#monthly-evidence").scrollIntoViewIfNeeded();
    assert.notEqual(await page.locator("#monthly-evidence .chart-bar").first().evaluate((bar) => getComputedStyle(bar).fill), "rgb(0, 0, 0)", "Expected compiled chart colours");
    await page.getByText("44,519", { exact: true }).first().waitFor();
    await page.locator("#monthly-evidence details summary").click();
    assert.equal(await page.locator("#monthly-evidence tbody tr").count(), 23);
    await page.locator("#monthly-evidence details summary").click();
    await page.locator("#monthly-evidence").screenshot({ path: `${output}/${label}-monthly.png` });
    await page.goto(`${base}/method#daily-evidence`);
    await page.locator("#daily-evidence").scrollIntoViewIfNeeded();
    assert.equal(await page.locator("#daily-evidence table").first().locator("tbody tr").count(), 3);
    await page.locator("#daily-evidence").screenshot({ path: `${output}/${label}-daily.png` });
    await page.goto(`${base}/method#data-quality`);
    await page.locator("#data-quality").scrollIntoViewIfNeeded();
    assert.equal(await page.getByRole("tab", { name: "Data & Limitations" }).getAttribute("aria-selected"), "true");
    await page.locator("#data-quality details summary").click();
    await page.getByText("2002-07-30", { exact: false }).waitFor();
    await page.locator("#data-quality details summary").click();
    await page.locator("#data-quality").screenshot({ path: `${output}/${label}-quality.png` });
    for (const anchor of ["validation", "monthly-evidence", "daily-evidence", "data-quality"]) {
      await page.goto(`${base}/method#${anchor}`);
      await page.locator(`#${anchor}`).waitFor({ state: "visible" });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: page overflow at ${anchor}`);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log("Methods browser QA passed: 1440px light, 320px dark; assets, keyboard tabs, deep links, disclosure tables, overflow and runtime errors.");
} finally {
  await browser.close();
}
