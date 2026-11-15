import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DangerValues } from "./FireDangerAssessment";
import { DANGER_CLASSES, type DangerData } from "../../../lib/analytics/weather";

it("shows an unavailable FWI without made-up numeric values", () => {
  const html = renderToStaticMarkup(createElement(DangerValues, { data: {
    status: "unavailable", reason: "no_provider", index: "FWI", units: "dimensionless", forecasts: [],
  } }));
  expect(html).toContain("Meteorological fire danger unavailable");
  expect(html).not.toContain("<table");
});

it("shows delayed seasonal provenance, member, original lead, spatial extremes and missing coverage", () => {
  const data: DangerData = { status: "available", reason: null, index: "FWI", units: "dimensionless", forecasts: [{
    issued_at: "2026-11-01T00:00:00Z", valid_at: "2026-11-16T00:00:00Z", lead_hours: 360, member: "2", value: 30,
    maximum: 80, coverage_fraction: .75, danger_class: "High", percentile: null, anomaly: null,
    distribution: DANGER_CLASSES.map((c, i) => ({ class: c, area_fraction: i === 2 ? .75 : 0 })),
  }] };
  const html = renderToStaticMarkup(createElement(DangerValues, { data }));
  for (const label of ["Delayed seasonal forecast", "member 2", "360", "80", "75%", "25%", "Spatial danger distribution"]) expect(html).toContain(label);
});
