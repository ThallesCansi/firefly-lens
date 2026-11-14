import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.QA_BASE_URL || "http://localhost:3102";
const screenshots = "docs/map-interactions/screenshots";
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const results = [
  {
    label: "Paris, Ile-de-France, France",
    center: [2.35, 48.85],
    zoom: 10,
    kind: "city",
  },
  {
    label: "Paris, Texas, United States",
    center: [-95.55, 33.66],
    zoom: 10,
    kind: "city",
  },
];
let calls = 0,
  mode = "results";
await page.route("**/api/geocode?*", async (route) => {
  calls++;
  if (mode === "empty") return route.fulfill({ json: [] });
  if (mode === "error")
    return route.fulfill({
      status: 502,
      json: { error: "Geocoding unavailable" },
    });
  if (mode === "slow") {
    await new Promise((r) => setTimeout(r, 1400));
    return route.fulfill({ json: results }).catch(() => {});
  }
  return route.fulfill({ json: results });
});
const search = page.getByRole("combobox", {
  name: "Search a place or latitude, longitude",
});
await page.goto(base + "/interaction-preview");
await search.fill("Paris");
await page.locator('[role="option"]').first().waitFor();
assert.equal(calls, 1);
await search.press("ArrowDown");
await search.press("ArrowDown");
await search.press("ArrowUp");
assert.equal(
  await page.locator('[role="option"]').first().getAttribute("aria-selected"),
  "true",
);
await page.screenshot({
  path: screenshots + "/autocomplete-desktop.png",
  fullPage: true,
});
await search.press("Enter");
assert.equal(await search.inputValue(), results[0].label);
assert.equal(await page.locator('[role="option"]').count(), 0);
await page
  .getByRole("status")
  .filter({ hasText: /Navigation requested|View moved/ })
  .first()
  .waitFor();
await search.fill("90.5, 12");
await page.getByText(/Use latitude/).waitFor();
assert.equal(calls, 1);
await search.fill("-23.55, -46.63");
await page.locator('[role="option"]').first().waitFor();
await search.press("ArrowDown");
await search.press("Enter");
assert.equal(calls, 1);
mode = "empty";
await search.fill("NoSuchPlace");
await page.getByText(/No places found/).waitFor();
mode = "error";
await search.fill("FailurePlace");
await page
  .getByText(/unavailable|failed|Geocoding/i)
  .first()
  .waitFor();
mode = "slow";
await search.fill("SlowPlace");
await page.waitForTimeout(1200);
await search.press("Escape");
await page.waitForTimeout(1600);
assert.equal(await page.locator('[role="option"]').count(), 0);
await page
  .getByRole("button", { name: "Identify region at coordinate" })
  .click();
await page.getByRole("heading", { name: /Paulo/ }).waitFor();
await page
  .getByRole("button", { name: "Confirm boundary for display" })
  .click();
await page.getByText(/No historical analysis was requested/).waitFor();
const output = page.getByLabel("Committed rectangle");
const original = await output.innerText();
await page.getByLabel("Longitude", { exact: true }).fill("-48");
await page.getByLabel("Latitude", { exact: true }).fill("-8");
await page
  .getByRole("button", { name: "Preview corner at coordinate" })
  .click();
assert.equal(await output.innerText(), original);
await page.getByRole("button", { name: "Cancel edit", exact: true }).click();
assert.equal(await output.innerText(), original);
await page.getByRole("button", { name: "Start rectangle edit" }).click();
await page
  .getByRole("button", { name: "Preview corner at coordinate" })
  .click();
await page.getByRole("button", { name: "Confirm rectangle" }).click();
assert.notEqual(await output.innerText(), original);
const separator = page.getByRole("separator", {
  name: "Resize analysis panel",
});
await separator.focus();
await separator.press("Home");
assert.equal(await separator.getAttribute("aria-valuenow"), "320");
await separator.press("ArrowLeft");
assert.equal(await separator.getAttribute("aria-valuenow"), "336");
const box = await separator.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + 80);
await page.mouse.down();
await page.mouse.move(box.x - 100, box.y + 80, { steps: 8 });
await page.mouse.up();
assert.ok(Number(await separator.getAttribute("aria-valuenow")) > 400);
const persisted = await separator.getAttribute("aria-valuenow");
await page.reload();
await separator.waitFor();
await page.waitForTimeout(300);
assert.equal(await separator.getAttribute("aria-valuenow"), persisted);
await page.getByRole("button", { name: "Reset width" }).click();
assert.equal(await separator.getAttribute("aria-valuenow"), "600");
await page.getByLabel("Administrative level").selectOption("country");
await page.getByLabel("Longitude", { exact: true }).fill("-120");
await page.getByLabel("Latitude", { exact: true }).fill("38");
await page
  .getByRole("button", { name: "Identify region at coordinate" })
  .click();
await page.getByText(/No data coverage/).waitFor();
await page.screenshot({
  path: screenshots + "/selection-panel-desktop.png",
  fullPage: true,
});
await page.getByLabel("Color theme", { exact: true }).selectOption("dark");
assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
await page.screenshot({
  path: screenshots + "/selection-panel-dark.png",
  fullPage: true,
});
await page.getByLabel("Color theme", { exact: true }).selectOption("light");
// The live application consumes the same existing search callback without selecting an AOI.
mode = "results";
await page.goto(base + "/");
await search.fill("Paris");
await page.locator('[role="option"]').first().waitFor();
await page.locator('[role="option"]').first().getByRole("button").click();
assert.equal(await page.locator('[role="option"]').count(), 0);
assert.equal(await search.inputValue(), results[0].label);
await page.screenshot({
  path: screenshots + "/main-autocomplete-desktop.png",
  fullPage: true,
});
for (const width of [390, 320]) {
  const mobile = await browser.newContext({
    viewport: { width, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const p = await mobile.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + "/interaction-preview");
  await p.getByRole("button", { name: "Identify region at coordinate" }).tap();
  await p.getByRole("heading", { name: /Paulo/ }).waitFor();
  assert.equal(
    await p.getByRole("separator", { name: "Resize analysis panel" }).count(),
    0,
  );
  const dimensions = await p.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  assert.ok(
    dimensions.scroll <= dimensions.client + 1,
    JSON.stringify(dimensions),
  );
  const panel = await p
    .getByRole("complementary", { name: "Resizable analysis panel" })
    .boundingBox();
  assert.ok(panel.width <= width);
  await p.screenshot({
    path: screenshots + "/selection-mobile-" + width + ".png",
    fullPage: true,
  });
  await mobile.close();
}
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "Browser QA passed: autocomplete/keyboard/mouse/cancel/errors, main callback, administrative data, rectangle confirm/cancel, pointer/keyboard/persistent panel, mobile touch 390/320.",
);
