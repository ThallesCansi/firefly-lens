// Optional browser QA; PLAYWRIGHT_MODULE may point to an installed Playwright module URL.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
});
const base = process.env.PREVIEW_URL || "http://localhost:3000";
const output = "docs/phase-4/screenshots";
await mkdir(output, { recursive: true });
const errors = [];
async function checkTextContrast(page) {
  const ratios = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    const luminance = (token) => {
      const raw = css.getPropertyValue(token).trim().replace("#", "");
      const hex = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
      const channels = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    return ["--color-ink", "--color-dim", "--color-faint"].flatMap((text) => ["--color-night", "--color-canopy"].map((background) => {
      const a = luminance(text), b = luminance(background);
      return { text, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    }));
  });
  for (const r of ratios) assert.ok(r.ratio >= 4.5, `${r.text} on ${r.background}: ${r.ratio}`);
}
async function loaded(page) {
  await page.locator(".maplibregl-canvas").waitFor();
  await page
    .getByText("Loading the map…", { exact: true })
    .waitFor({ state: "hidden" });
  await page
    .waitForLoadState("networkidle", { timeout: 15000 })
    .catch(() => {});
}
async function theme(page, value) {
  await page.getByLabel("Color theme", { exact: true }).selectOption(value);
  await page.waitForFunction(
    (next) => document.documentElement.dataset.theme === next,
    value === "system" ? "light" : value,
  );
  await page
    .waitForLoadState("networkidle", { timeout: 15000 })
    .catch(() => {});
  if (await page.locator(".hotspot-map").count()) {
    await page
      .locator(
        `.hotspot-map[data-map-theme="${value === "system" ? "light" : value}"]`,
      )
      .waitFor();
  }
}
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    colorScheme: "light",
  });
  await context.addInitScript(() => {
    if (!localStorage.getItem("firefly-lens-theme"))
      localStorage.setItem("firefly-lens-theme", "dark");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await loaded(page);
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  assert.equal(await page.locator(".brand-signature").innerText(), "Lens");
  assert.match(await page.title(), /FireFly Lens/);
  await checkTextContrast(page);
  await page
    .getByRole("button", { name: "Coordinates and regions", exact: true })
    .click();
  await page.getByLabel("Study region").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Analyze Area", exact: true }).click();
  await page.locator("#history-title").waitFor();
  await page.getByLabel("Map year", { exact: true }).selectOption("2024");
  await page.getByLabel("Map month", { exact: true }).selectOption("03");
  await page.getByRole("checkbox", { name: "VIIRS", exact: true }).uncheck();
  await page.locator(".maplibregl-canvas").evaluate((el) => {
    window.__originalMapCanvas = el;
  });
  const area = await page.locator(".analysis-heading .num").textContent();
  await page.screenshot({ path: `${output}/workspace-dark.png` });
  await theme(page, "light");
  await checkTextContrast(page);
  assert.equal(
    await page
      .locator(".maplibregl-canvas")
      .evaluate((el) => window.__originalMapCanvas === el),
    true,
  );
  assert.equal(
    await page
      .getByRole("checkbox", { name: "VIIRS", exact: true })
      .isChecked(),
    false,
  );
  assert.equal(
    await page.getByLabel("Map year", { exact: true }).inputValue(),
    "2024",
  );
  assert.equal(
    await page.getByLabel("Map month", { exact: true }).inputValue(),
    "03",
  );
  assert.equal(
    await page.locator(".analysis-heading .num").textContent(),
    area,
  );
  await page.screenshot({ path: `${output}/workspace-light.png` });
  await page
    .getByRole("button", { name: "Explain Historical median", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Historical median", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("dialog", { name: "Historical median", exact: true })
      .count(),
    0,
  );
  await page.locator('[data-date="2024-03-15"]').click();
  await page
    .getByRole("button", {
      name: "Explain Fire radiative power (FRP)",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog", { name: "Fire radiative power (FRP)", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Heatmap SVG", exact: true }).click();
  const download = await downloadPromise;
  const svg = await readFile(await download.path(), "utf8");
  assert.match(svg, /Simulated FIRMS-shaped detections/);
  assert.match(svg, /Southern Amazon/);
  assert.match(svg, /Exported /);
  await page.reload();
  await loaded(page);
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  assert.equal(
    await page.getByLabel("Color theme", { exact: true }).inputValue(),
    "light",
  );
  await theme(page, "system");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  await page.goto(`${base}/method#seasonal-z-score`);
  await page
    .getByRole("tab", { name: "Historical Anomalies", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("tab", { name: "Historical Anomalies", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.ok((await page.locator(".katex-mathml math").count()) >= 7);
  await page
    .getByRole("tab", { name: "Historical Anomalies", exact: true })
    .focus();
  await page.keyboard.press("Home");
  assert.equal(
    await page
      .getByRole("tab", { name: "Harmonization", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.screenshot({ path: `${output}/method-light.png`, fullPage: true });
  await theme(page, "dark");
  await page
    .getByRole("tab", { name: "Historical Anomalies", exact: true })
    .click();
  await page.screenshot({
    path: `${output}/method-anomalies-dark.png`,
    fullPage: true,
  });
  await page
    .getByRole("tab", { name: "Historical Anomalies", exact: true })
    .focus();
  await page.keyboard.press("End");
  assert.equal(
    await page
      .getByRole("tab", { name: "Data & Limitations", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.match(page.url(), /#data-limitations$/);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
  });
  const mobile = await mobileContext.newPage();
  mobile.setDefaultTimeout(25000);
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(base);
  await loaded(mobile);
  await theme(mobile, "light");
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await mobile.screenshot({ path: `${output}/mobile-light.png` });
  await mobile
    .getByRole("button", { name: "Coordinates and regions", exact: true })
    .tap();
  await mobile.getByLabel("Study region").selectOption({ index: 1 });
  await mobile.getByRole("button", { name: "Analyze Area", exact: true }).tap();
  await mobile.locator("#history-title").waitFor();
  await mobile
    .getByRole("button", { name: "Explain Historical median", exact: true })
    .tap();
  await mobile
    .getByRole("dialog", { name: "Historical median", exact: true })
    .waitFor();
  await mobile
    .getByRole("button", { name: "Close explanation", exact: true })
    .tap();
  assert.equal(await mobile.locator(".analysis-drawer:visible").count(), 1);
  await mobile.goto(`${base}/method#robust-anomalies`);
  await mobile
    .getByRole("tab", { name: "Historical Anomalies", exact: true })
    .waitFor();
  assert.equal(
    await mobile
      .getByRole("tab", { name: "Historical Anomalies", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await mobile.screenshot({
    path: `${output}/mobile-method.png`,
    fullPage: true,
  });
  await mobile.setViewportSize({ width: 320, height: 740 });
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  const noScript = await browser.newContext({
    javaScriptEnabled: false,
    colorScheme: "dark",
  });
  const staticPage = await noScript.newPage();
  await staticPage.goto(`${base}/method`);
  await staticPage
    .getByRole("heading", { name: "Harmonizing MODIS & VIIRS", exact: true })
    .waitFor();
  await noScript.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: compact original brand; dark/light/system and persistence; same map canvas, area, period and layer state; scientific popovers; SVG provenance; Method keyboard/hash tabs and mathematical rendering; desktop/mobile overflow; server-rendered documentation.",
  );
} finally {
  await browser.close();
}
