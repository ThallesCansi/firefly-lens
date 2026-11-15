// Run against a local app. PLAYWRIGHT_MODULE may point to an existing Playwright installation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const base = process.env.QA_BASE_URL || "http://localhost:3105";
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(30000);
page.on("pageerror", (error) => errors.push(error.message));
const index = JSON.parse(readFileSync("public/analytics/manifest.json", "utf8"));
const expected = (period) => index.regions.filter((region) => {
  const row = JSON.parse(readFileSync(`public${region.url}`, "utf8"))
    .sections.anomalies.data.months.find((r) => r.date === period);
  return row?.complete && ["available", "partially_available"].includes(row.status) &&
    ((row.percentile !== null && row.percentile >= 90) || (row.z_score !== null && row.z_score >= 2));
}).length;
async function count(n) {
  await page.waitForFunction((n) => document.querySelectorAll(".firefly-signal-marker").length === n, n);
}
async function period(year, month, target = page) {
  await target.getByRole("button", { name: /^Map year:/ }).click();
  await target.getByRole("option", { name: year, exact: true }).click();
  await target.getByRole("button", { name: /^Map month:/ }).click();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  await target.getByRole("option", { name: months[Number(month) - 1], exact: true }).click();
}
try {
  await page.goto(`${base}/lens`);
  const toggle = page.getByRole("switch", { name: "Firefly Signals" });
  assert.equal(await toggle.isChecked(), true);
  await page.waitForFunction(() => document.querySelector("#signal-status")?.textContent.includes("regions assessed"));
  await period("2024", "06");
  await count(expected("2024-06"));
  const pantanal = page.getByRole("button", { name: /^Pantanal: unusually high seasonal/ });
  await pantanal.hover();
  await page.getByRole("tooltip").waitFor();
  assert.match(await page.getByRole("tooltip").innerText(), /June 2024/);
  assert.match(await page.getByRole("tooltip").innerText(), /Percentile 100\.0/);
  await page.keyboard.press("Escape");
  await pantanal.click();
  await page.getByRole("button", { name: "Close analysis", exact: true }).waitFor();
  assert.match(await page.locator(".analysis-heading").innerText(), /Pantanal/);
  await page.getByRole("button", { name: "Close analysis", exact: true }).click();
  // Main's time-lapse and guided tour must remain available beside highlights.
  await page.getByRole("button", { name: "Time-lapse", exact: true }).click();
  await page.getByRole("region", { name: "Time-lapse", exact: true }).waitFor();
  await page.getByRole("button", { name: "Close the time-lapse", exact: true }).click();
  await period("2024", "06");
  await page.getByRole("button", { name: "Tour with FireFlighter", exact: true }).click();
  await page.locator(".lume-tour-card:visible").waitFor();
  await page.getByRole("button", { name: "Skip tour", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#main")?.getAttribute("data-tour-active") === "false");
  await toggle.uncheck();
  await count(0);
  await toggle.check();
  await count(expected("2024-06"));
  for (const mode of ["2D Map", "3D Globe"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await count(expected("2024-06"));
  }
  await page.getByRole("button", { name: /Switch to .* theme/ }).click();
  await count(expected("2024-06"));
  await pantanal.hover();
  await page.getByRole("tooltip").waitFor();
  if (process.env.QA_SCREENSHOT) await page.screenshot({ path: process.env.QA_SCREENSHOT });
  await period("2026", "11");
  await count(0);
  assert.match(await page.locator("#signal-status").innerText(), /0\/5 regions assessed/);
  // Rapid period changes must end with the exact final month's signals.
  await period("2024", "03");
  await period("2024", "06");
  await count(expected("2024-06"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".map-card-chip").click();
  assert.equal(await toggle.isVisible(), true);
  const card = await page.locator(".map-card").boundingBox();
  assert.ok(card.x >= 0 && card.x + card.width <= 390);
  await toggle.uncheck();
  await count(0);
  await toggle.check();
  await count(expected("2024-06"));
  await page.setViewportSize({ width: 320, height: 740 });
  const narrowCard = await page.locator(".map-card").boundingBox();
  assert.ok(narrowCard.x >= 0 && narrowCard.x + narrowCard.width <= 320);
  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  touch.on("pageerror", (error) => errors.push(error.message));
  await touch.goto(`${base}/lens`);
  await touch.getByRole("button", { name: "Close the introduction", exact: true }).tap();
  await touch.locator(".map-card-chip").tap();
  await period("2024", "06", touch);
  await touch.locator(".map-card-chip").tap();
  await touch.getByRole("button", { name: /^Pantanal: unusually high seasonal/ }).tap();
  await touch.getByRole("button", { name: "Close analysis", exact: true }).waitFor();
  assert.match(await touch.getByRole("tooltip").innerText(), /Unusually high seasonal fire activity/);
  await touch.close();
  const unavailable = await browser.newPage();
  await unavailable.route("**/analytics/manifest.json", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await unavailable.goto(`${base}/lens`);
  await unavailable.getByText("Seasonal signals unavailable", { exact: true }).waitFor();
  assert.equal(await unavailable.locator(".firefly-signal-marker").count(), 0);
  await unavailable.close();
  assert.deepEqual(errors, []);
  console.log("Firefly Signals: defaults, real anomalies, tooltips, analysis, toggles, projection, theme, partial months, period changes, mobile/touch, and unavailable data passed.");
} finally {
  await browser.close();
}
