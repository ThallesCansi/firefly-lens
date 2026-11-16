// Main/camera compatibility using real published files, including when Python is
// unconfigured. The separate scientific suite still requires its real backend.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const base = process.env.QA_BASE_URL || "http://localhost:3106";
const output = process.env.QA_OUTPUT || join(tmpdir(), "firefly-camera-main-integration");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-swiftshader"] });
const checks = [], errors = [];
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, reducedMotion: "reduce", acceptDownloads: true });
    await context.addInitScript(() => {
      localStorage.setItem("firefly-lens-tour-auto-disabled-v1", "true");
      localStorage.setItem("firefly-lens-basemap-2", "map");
    });
    await context.route("https://tiles.openfreemap.org/**", (route) => route.fulfill({ json: {
      version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#253a42" } }],
    } }));
    const p = await context.newPage(); p.setDefaultTimeout(45000);
    p.on("pageerror", (error) => errors.push(error.message));
    await p.goto(`${base}/lens?area=country:PRY&period=2003-09-01`);
    const panel = p.locator(".analysis-scroll");
    await panel.locator('[data-tour="analysis-status"][data-tour-ready="true"]').waitFor();
    await p.waitForFunction(() => !document.querySelector(".map-key-status")?.textContent?.includes("Loading"));
    assert.match(await p.locator(".analysis-heading").innerText(), /Paraguay/);
    // Main hides projection/columns controls while the mobile calendar is open.
    assert.equal(await p.locator('button[aria-label="3D columns"]').getAttribute("aria-pressed"), "true");
    if (width === 1440) {
      const disclosure = p.locator(".selection-card-chip");
      if (await disclosure.isVisible() && await disclosure.getAttribute("aria-expanded") === "false") await disclosure.click();
      const download = p.waitForEvent("download");
      await p.getByRole("button", { name: "Download the map cells as CSV", exact: true }).click();
      const csv = readFileSync(await (await download).path(), "utf8").trim().split("\n");
      assert.equal(csv[0], "period,cell_id,longitude,latitude,modis_aqua_raw,viirs_noaa20_raw");
      const manifest = await (await context.request.get(`${base}/data/continental/paraguay/manifest.json`)).json();
      const raw = await (await context.request.get(new URL(manifest.daily["2003"].url, base).href)).body();
      const daily = JSON.parse((raw[0] === 0x1f ? gunzipSync(raw) : raw).toString("utf8"));
      const first = daily.find((row) => row[0] === "2003-09-01");
      assert.equal(csv.slice(1).reduce((sum, row) => sum + Number(row.split(",")[4]), 0), first[1] + first[2]);
    }
    const allMonths = panel.getByRole("button", { name: "All months", exact: true });
    if (await allMonths.isVisible()) await allMonths.click();
    const fit = await panel.evaluate((el) => el.scrollHeight <= el.clientHeight + 2);
    assert.equal(fit, true, "Continental calendar retains its fitted sidebar");
    await p.locator(".camera-trigger").click();
    const profile = p.getByRole("combobox", { name: "Camera profile", exact: true });
    assert.equal(await profile.inputValue(), "cinematic");
    for (const mode of ["standard", "cinematic"]) {
      await profile.selectOption(mode);
      await p.getByRole("button", { name: "Frame selected area", exact: true }).click();
      await p.waitForFunction(() => document.querySelector(".camera-menu [role=status]")?.textContent === "Camera ready");
      assert.match(await p.locator(".analysis-heading").innerText(), /Paraguay/);
    }
    await p.keyboard.press("Escape");
    await panel.getByRole("button", { name: /see full report below/i }).click();
    await p.getByRole("heading", { name: /National fire activity.*Paraguay/ }).waitFor();
    await p.locator(".analysis-report").getByRole("tab", { name: "Forecast", exact: true }).click();
    await p.locator(".analysis-report").getByText("No current numeric forecast", { exact: true }).waitFor();
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.getByRole("button", { name: "Close analysis", exact: true }).click();
    for (const mode of ["2D Map", "3D Globe"]) {
      await p.getByRole("button", { name: mode, exact: true }).click();
      const canvas = await p.locator(".maplibregl-canvas").boundingBox();
      for (let i = 0; i < 3; i++) {
        await p.mouse.move(canvas.x + canvas.width * .5, canvas.y + canvas.height * .5); await p.mouse.down();
        await p.mouse.move(canvas.x + canvas.width * .95, canvas.y + canvas.height * .8, { steps: 12 }); await p.mouse.up();
      }
      await p.waitForTimeout(1200);
      const [lng, lat] = (await p.locator('[data-tour="map-canvas"]').getAttribute("data-camera-center")).split(",").map(Number);
      assert.ok(lng >= -85.001 && lng <= -31.999 && lat >= -58.001 && lat <= 14.001);
    }
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await p.screenshot({ path: join(output, `${width}-continental-camera.png`), animations: "disabled" });
    checks.push({ width, realCountryDailyCsv: width === 1440, fittedCalendar: true, profiles: true, forecastAvailability: true, continentConstraints: true });
    await context.close(); console.log(`Main/camera compatibility: ${width}px passed`);
  }
  assert.deepEqual(errors, []);
  writeFileSync(join(output, "results.json"), JSON.stringify({ checks, errors, scope: "Published real data; no dynamic Python forecast validation" }, null, 2));
} finally { await browser.close(); }
