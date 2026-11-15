import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { History } from "./AnalyticsReport";
import type { Bundle } from "@/lib/analytics/contracts";

it("opens the real full monthly record before summaries, preserving the selected month", () => {
  const bundle: Bundle = JSON.parse(readFileSync("public/analytics/pantanal.json", "utf8"));
  const html = renderToStaticMarkup(createElement(History, {
    bundle, from: "2024-01", to: "2024-12", period: "2024-06",
  }));
  expect(html).toContain("2002-07");
  expect(html).toContain("2026-11");
  expect(html).toContain("unusually high");
  expect(html.indexOf("Historical fire activity, over time")).toBeLessThan(html.indexOf("Same-month anomaly"));
  expect(html).toContain("Seasonal profile · 2024");
  expect(html).toContain("Estimated from VIIRS");
  expect(html).toContain("partial month");
  expect(html).toContain("NASA FIRMS");
});
