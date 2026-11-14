import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.QA_BASE_URL || "http://localhost:3102";
const screenshots = "docs/map-interactions/integrated";
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
// Keep WebGL/MapLibre real, but make the basemap deterministic and independent of a public CDN.
await context.route("https://basemaps.cartocdn.com/**", (route) =>
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
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let tileRequests = 0;
page.on("request", (r) => {
  if (/\/data\/brazil\/t_.*\.bin\.gz/.test(r.url())) tileRequests++;
});
async function ready(p) {
  await p.goto(base);
  await p
    .locator('.hotspot-map[data-projection="globe"]')
    .waitFor({ timeout: 30000 });
}
async function navigate(p, coords) {
  const search = p.getByRole("combobox", {
    name: "Search a place or latitude, longitude",
  });
  await search.fill(coords);
  await p.locator('[role="option"]').first().waitFor();
  await search.press("ArrowDown");
  await search.press("Enter");
  await p.waitForTimeout(450);
}
async function clickCenter(p, touch = false) {
  const box = await p.locator(".maplibregl-canvas").boundingBox();
  if (touch)
    await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  else await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
try {
  await ready(page);
  await page
    .getByRole("button", { name: "Select Country / State", exact: true })
    .click();
  await clickCenter(page);
  await page.getByRole("heading", { name: "Brazil", exact: true }).waitFor();
  assert.equal(
    tileRequests,
    0,
    "Administrative selection must not query scientific tiles.",
  );
  await page
    .getByRole("button", { name: "Confirm boundary for display" })
    .click();
  await page
    .getByText("Boundary selected and highlighted on the map.")
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Analyze Area", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Edit rectangle", exact: true })
      .isDisabled(),
    true,
  );
  await page.screenshot({ path: screenshots + "/country-globe.png" });
  await page.getByRole("button", { name: "Clear boundary" }).click();
  await navigate(page, "-23.55, -46.63");
  await page
    .getByRole("button", { name: "Select Country / State", exact: true })
    .click();
  await page.getByLabel("Selection level").selectOption("state");
  await clickCenter(page);
  await page.getByRole("heading", { name: /Paulo/ }).waitFor();
  await page
    .getByRole("button", { name: "Confirm boundary for display" })
    .click();
  await page.getByRole("button", { name: /2D Map/ }).click();
  await page.locator('.hotspot-map[data-projection="mercator"]').waitFor();
  await page.getByLabel("Color theme").selectOption("dark");
  await page.waitForTimeout(500);
  await page.screenshot({ path: screenshots + "/state-2d-dark.png" });
  await page.getByRole("button", { name: "Clear boundary" }).click();
  await page.getByLabel("Color theme").selectOption("light");
  await page
    .getByRole("button", { name: "Coordinates and regions", exact: true })
    .click();
  for (const [label, value] of Object.entries({
    West: "-48.2",
    South: "-16",
    East: "-47.7",
    North: "-15.5",
  }))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Apply coordinates" }).click();
  await page
    .getByRole("button", { name: "Analyze Area", exact: true })
    .waitFor();
  const original = await page.locator(".selection-card .num").innerText();
  await page.waitForTimeout(800);
  const beforeEdit = tileRequests;
  await page
    .getByRole("button", { name: "Edit rectangle", exact: true })
    .click();
  const nw = page.getByRole("button", {
    name: "Resize NW corner",
    exact: true,
  });
  await nw.waitFor();
  await nw.focus();
  await nw.press("ArrowLeft");
  assert.equal(
    tileRequests,
    beforeEdit,
    "An edit preview must not query new scientific tiles.",
  );
  await page.getByRole("button", { name: "Cancel edit", exact: true }).click();
  assert.equal(
    await page.locator(".selection-card .num").innerText(),
    original,
  );
  await page
    .getByRole("button", { name: "Edit rectangle", exact: true })
    .click();
  const b = await nw.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x - 35, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: /3D Globe/ }).click();
  await page.locator('.hotspot-map[data-projection="globe"]').waitFor();
  await nw.waitFor();
  await page.screenshot({ path: screenshots + "/rectangle-edit-globe.png" });
  await page
    .getByRole("button", { name: "Confirm rectangle", exact: true })
    .click();
  assert.notEqual(
    await page.locator(".selection-card .num").innerText(),
    original,
  );
  await page.getByRole("button", { name: "Analyze Area", exact: true }).click();
  await page.locator("#history-title").waitFor({ timeout: 45000 });
  const sep = page.getByRole("separator", { name: "Resize analysis panel" });
  await sep.focus();
  await sep.press("Home");
  assert.equal(await sep.getAttribute("aria-valuenow"), "320");
  await sep.press("ArrowLeft");
  assert.equal(await sep.getAttribute("aria-valuenow"), "336");
  await page.getByRole("button", { name: "Reset width" }).click();
  await page.getByRole("button", { name: /^March 2024:/ }).click();
  assert.equal(
    await page.getByLabel("Map month", { exact: true }).inputValue(),
    "03",
  );
  await page.screenshot({ path: screenshots + "/analysis-resizable.png" });
  await page
    .getByRole("button", { name: "Close analysis", exact: true })
    .click();
  assert.equal(await sep.isVisible(), false);
  assert.ok(
    await page
      .getByRole("button", { name: "Analyze Area", exact: true })
      .isVisible(),
  );
  for (const width of [390, 320]) {
    const mobile = await browser.newContext({
      viewport: { width, height: 844 },
      hasTouch: true,
      isMobile: true,
      reducedMotion: "reduce",
    });
    await mobile.route("https://basemaps.cartocdn.com/**", (r) =>
      r.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "bg",
              type: "background",
              paint: { "background-color": "#24382e" },
            },
          ],
        },
      }),
    );
    const p = await mobile.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await ready(p);
    await navigate(p, "-15.8, -47.9");
    await p
      .getByRole("button", { name: "Select Country / State", exact: true })
      .tap();
    // Use the unobscured right edge of the map, outside the floating card.
    const canvas = await p.locator(".maplibregl-canvas").boundingBox();
    await p.touchscreen.tap(
      canvas.x + canvas.width - 6,
      canvas.y + canvas.height / 2,
    );
    await p.getByRole("heading", { name: "Brazil", exact: true }).waitFor();
    await p.getByRole("button", { name: "Confirm boundary for display" }).tap();
    await p
      .getByText("Boundary selected and highlighted on the map.")
      .waitFor();
    const overflow = await p.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    assert.equal(overflow, false);
    await p.screenshot({
      path: screenshots + "/country-mobile-" + width + ".png",
    });
    await p.getByRole("button", { name: "Clear boundary" }).tap();
    await p
      .getByRole("button", { name: "Coordinates and regions", exact: true })
      .tap();
    for (const [label, value] of Object.entries({
      West: "-48.2",
      South: "-16",
      East: "-47.7",
      North: "-15.5",
    }))
      await p.getByLabel(label, { exact: true }).fill(value);
    await p.getByRole("button", { name: "Apply coordinates" }).tap();
    await p.getByRole("button", { name: "Analyze Area", exact: true }).tap();
    await p.locator("#history-title").waitFor({ timeout: 45000 });
    assert.equal(
      await p.getByRole("separator", { name: "Resize analysis panel" }).count(),
      0,
    );
    assert.equal(
      await p.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
      false,
    );
    await p.screenshot({
      path: screenshots + "/analysis-mobile-" + width + ".png",
    });
    await p.getByRole("button", { name: "Close analysis", exact: true }).tap();
    await mobile.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Integrated map tools passed: country/state clicks, no polygon analysis, real projected editing, cancel/confirm, 2D/3D, theme reload, real history, panel, period sync, mobile touch.",
  );
} finally {
  await browser.close();
}
