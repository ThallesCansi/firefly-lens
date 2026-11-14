// Optional browser QA: install Playwright locally, or pass its module URL in PLAYWRIGHT_MODULE.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
});
const base = process.env.PREVIEW_URL || "http://localhost:3000";
const directory = "docs/phase-3/screenshots";
await mkdir(directory, { recursive: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (message) => {
  if (message.type() === "warning" && message.text().includes("FireFly"))
    console.log(message.text());
});
async function ready(p) {
  await p.goto(base);
  await p.locator(".maplibregl-canvas").waitFor();
  await p
    .getByText("Loading the map…", { exact: true })
    .waitFor({ state: "hidden" });
  await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
}
try {
  await ready(page);
  console.log("Desktop map ready");
  assert.equal(await page.locator(".analysis-drawer:visible").count(), 0);
  assert.equal(await page.locator("#history-title").count(), 0);
  await page.screenshot({ path: `${directory}/desktop-explore.png` });
  await page
    .getByRole("button", { name: "Select an area", exact: true })
    .click();
  await page.locator(".drawing-hint").waitFor();
  await page.mouse.move(700, 350);
  await page.mouse.down();
  await page.mouse.move(780, 420, { steps: 15 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Analyze Area", exact: true })
    .waitFor();
  console.log("Rectangle selected");
  const selectedArea = await page.locator(".selection-card .num").textContent();
  await page.getByRole("button", { name: "Analyze Area", exact: true }).click();
  await page.locator("#history-title").waitFor();
  console.log("Historical record ready");
  await page.getByRole("button", { name: /^March 2024:/ }).click();
  assert.equal(
    await page.getByLabel("Map year", { exact: true }).inputValue(),
    "2024",
  );
  assert.equal(
    await page.getByLabel("Map month", { exact: true }).inputValue(),
    "03",
  );
  assert.match(
    await page.locator("#history-title").textContent(),
    /March 2024/,
  );
  await page.locator('[data-date="2024-03-15"]').click();
  await page
    .getByRole("button", { name: "Whole month", exact: true })
    .waitFor();
  await page.getByRole("checkbox", { name: "MODIS", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "MODIS", exact: true }).check();
  await page.locator(".analysis-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Daily series CSV", exact: true })
    .click();
  assert.match((await download).suggestedFilename(), /_daily\.csv$/);
  await page.locator(".analysis-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: `${directory}/desktop-analysis.png` });
  await page
    .getByRole("button", { name: "Close analysis", exact: true })
    .click();
  assert.equal(await page.locator(".analysis-drawer:visible").count(), 0);
  await page
    .getByLabel("Search a place or latitude, longitude")
    .fill("-23.55, -46.63");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  assert.equal(
    await page.locator(".selection-card .num").textContent(),
    selectedArea,
  );
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  let queries = 0;
  await page.route("**/api/geocode?*", (route) => {
    queries++;
    return route.fulfill({
      json: [
        { label: "São Paulo, Brazil", center: [-46.63, -23.55], bounds: [-46.9, -23.9, -46.3, -23.3], zoom: 10 },
      ],
    });
  });
  await page
    .getByLabel("Search a place or latitude, longitude")
    .fill("São Paulo");
  assert.equal(queries, 0);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("button", { name: "São Paulo, Brazil", exact: true })
    .click();
  assert.equal(queries, 1);
  assert.equal(
    await page.locator(".selection-card .num").textContent(),
    selectedArea,
  );
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.unroute("**/api/geocode?*");
  await page.route("**/api/geocode?*", (route) => route.fulfill({ json: [] }));
  await page.getByLabel("Search a place or latitude, longitude").fill("No-such-place");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText(/No places found/).waitFor();
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.unroute("**/api/geocode?*");
  await page.route("**/api/geocode?*", (route) => route.fulfill({ status: 502, json: { error: "Unavailable" } }));
  await page.getByLabel("Search a place or latitude, longitude").fill("Unavailable-place");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText(/Search unavailable/).waitFor();
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.getByRole("button", { name: "Analyze Area", exact: true }).click();
  assert.equal(
    await page.getByLabel("Map year", { exact: true }).inputValue(),
    "2024",
  );
  await page
    .getByRole("button", { name: "Close analysis", exact: true })
    .click();
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Draw rectangle", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  mobile.setDefaultTimeout(20000);
  mobile.on("pageerror", (e) => errors.push(e.message));
  await ready(mobile);
  await mobile.screenshot({ path: `${directory}/mobile-explore.png` });
  await mobile
    .getByRole("button", { name: "Coordinates and regions", exact: true })
    .click();
  await mobile.getByLabel("Study region").selectOption({ index: 1 });
  await mobile
    .getByRole("button", { name: "Analyze Area", exact: true })
    .click();
  await mobile.locator("#history-title").waitFor();
  const mapBox = await mobile.locator(".workspace-map").boundingBox();
  const panelBox = await mobile.locator(".analysis-drawer").boundingBox();
  assert.ok(mapBox.height > 200 && panelBox.y >= mapBox.y + mapBox.height - 2);
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.equal(
    await mobile
      .locator(".analysis-scroll")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    true,
  );
  await mobile.screenshot({ path: `${directory}/mobile-analysis.png` });
  await mobile
    .getByRole("button", { name: "Close analysis", exact: true })
    .click();
  await mobile
    .getByRole("button", { name: "Draw rectangle", exact: true })
    .click();
  const cdp = await mobile.context().newCDPSession(mobile);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 200, y: 420 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 260, y: 480 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await mobile
    .getByRole("button", { name: "Analyze Area", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop drawing, analysis, month/day synchronization, layers, CSV, close/reopen, navigation, explicit search, cancel, mobile layout and touch drawing.",
  );
} finally {
  await browser.close();
}
