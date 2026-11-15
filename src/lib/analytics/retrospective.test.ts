import { readFileSync } from "node:fs";
import { expect,it } from "vitest";
import type { Bundle } from "./contracts";
import { validateRetrospective } from "./retrospective";

it("requires a separate retrospective contract and rejects future targets or future training", () => {
  const bundle: Bundle=JSON.parse(readFileSync("public/analytics/pantanal.json","utf8"));
  expect(() => validateRetrospective(bundle,bundle.geometry as never,"2023-09")).toThrow();
  const original = JSON.parse(readFileSync("analytics/examples/real/forecast_retrospective.json","utf8"));
  const raw=structuredClone(bundle);
  // Keep geometry and provenance from the actual bundle; this test mutates only
  // transport dates to exercise rejection. It never publishes forecasts.
  const forecast=raw.sections.forecast.data;
  if (!("forecast_origin" in forecast)) throw new Error("Expected forecast fixture");
  forecast.forecast_origin="2023-09";
  forecast.training_period.end="2024-01";
  expect(() => validateRetrospective(raw,raw.geometry as never,"2023-09")).toThrow("training");
  forecast.training_period.end="2023-09";
  forecast.last_complete_observation_used="2023-09";
  forecast.predictions[0].date="2027-01";
  expect(() => validateRetrospective(raw,raw.geometry as never,"2023-09")).toThrow("past completed");
  expect(original.section).toBe("forecast");
});
