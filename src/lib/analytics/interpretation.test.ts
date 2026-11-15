import { describe, expect, it } from "vitest";
import { describeMonth, describeForecastLimit } from "./interpretation";
import { isFailure, type Bundle } from "./contracts";
import { readFileSync } from "node:fs";

const bundle: Bundle = JSON.parse(readFileSync("public/analytics/pantanal.json", "utf8"));
const history = bundle.sections.history.data;
const anomalies = bundle.sections.anomalies.data;
if (isFailure(history) || isFailure(anomalies)) throw new Error("Expected real historical fixture");
const month = history.monthly.find((r) => r.date === "2024-06")!;
const anomaly = anomalies.months.find((r) => r.date === month.date)!;

describe("supported historical interpretations", () => {
  it("interprets a real high anomaly and identifies estimates", () => {
    expect(describeMonth(month, anomaly)).toContain("unusually high");
    expect(describeMonth({ ...month, source: "modeled_viirs" }, anomaly)).toContain("Estimated");
  });
  it("never calls an incomplete month or an insufficient comparison unusual", () => {
    expect(describeMonth({ ...month, complete: false }, anomaly)).toContain("incomplete");
    expect(describeMonth(month, { ...anomaly, status: "insufficient_history" })).toContain("not enough");
    expect(describeMonth({ ...month, value: null }, anomaly)).toContain("No activity value");
    expect(describeMonth(month, { ...anomaly, percentile: 50, z_score: 0, percent: 0 })).toContain("matched");
  });
  it("explains the actual forecast restriction", () => {
    expect(describeForecastLimit("latest_eligible_observation_does_not_reach_forecast_origin")).toContain("orbital drift");
  });
});
