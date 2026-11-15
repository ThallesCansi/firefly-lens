import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { describeHost, runTool, type AssistantHost } from "./execute";
import { rawPilots, rawPilotArea } from "../data/coverage";
import { rectangleArea } from "../data/types";

const host = (): AssistantHost => ({ area: rawPilotArea(rawPilots[0]), period: "2023-09", sensors: ["MODIS","VIIRS"], analysisOpen: true,
  chooseArea: vi.fn(), clearArea: vi.fn(), navigate: vi.fn(), setPeriod: vi.fn(), setSensors: vi.fn(), openAnalysis: vi.fn() });
afterEach(() => vi.unstubAllGlobals());

it("gives the assistant national harmonization without borrowing Brazilian border cells", async () => {
  const fetcher = vi.fn(async (url: string) => new Response(readFileSync(`public${url}`)));
  vi.stubGlobal("fetch", fetcher);
  const outcome = await runTool(host(),"get_fire_history",{ from_year: 2023, to_year: 2023 });
  expect(outcome.ok).toBe(true);
  const result = JSON.parse(outcome.result);
  expect(result.data_kind).toBe("real_harmonized_data");
  expect(result.scope).toBe("entire_country_only");
  expect(result.current_activity_forecast).toBe("unavailable");
  expect(result.monthly.reduce((sum: number,r: { value: number }) => sum+r.value,0)).toBe(20191);
  expect(fetcher.mock.calls.every(([url]) => url.includes("continental/paraguay"))).toBe(true);
});

it("identifies national calibration in the model context and rejects unsupported periods", async () => {
  const current = host();
  expect(describeHost(current)).toContain("real whole-country harmonization");
  for (const period of ["2026", "2023-09-01"]) expect((await runTool(current,"set_period",{ period })).ok).toBe(false);
  expect(current.setPeriod).not.toHaveBeenCalled();
  expect((await runTool(current,"set_period",{ period: "2022" })).ok).toBe(true);
  expect(current.setPeriod).toHaveBeenCalledWith("2022-09");
});

it("returns unavailable for uncovered global areas instead of manufacturing a zero record", async () => {
  const current = { ...host(), area: rectangleArea([10,10,11,11]) };
  const result = await runTool(current,"get_fire_history",{ from_year: 2023, to_year: 2023 });
  expect(result.ok).toBe(false);
  expect(result.result).toContain("Missing coverage is not zero");
});
