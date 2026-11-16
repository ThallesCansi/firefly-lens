/** Static map evidence must show provider credits even when the live UI is compact. */
export async function attributedScreenshot(page, options) {
  const control = page.locator(".maplibregl-ctrl-attrib");
  if (!await control.count()) return page.screenshot(options);
  const expanded = await control.evaluate((el) => el.classList.contains("maplibregl-compact-show"));
  const compact = await control.evaluate((el) => el.classList.contains("maplibregl-compact"));
  if (compact && !expanded) await control.locator("summary").evaluate((el) => el.click());
  try {
    await control.locator(".maplibregl-ctrl-attrib-inner").waitFor({ state: "visible" });
    return await page.screenshot(options);
  } finally {
    if (compact && !expanded) await control.locator("summary").evaluate((el) => el.click());
  }
}
