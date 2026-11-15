import { meta } from "../data/meta";
import type { PolygonGeometry } from "../data/types";
import { geometryKey, validateBundle } from "./client";
import type { Bundle } from "./contracts";
import { dataVersion, retryDelay } from "./dynamic";

export function validateRetrospective(raw: Bundle, geometry: PolygonGeometry, origin: string): Bundle {
  const result = validateBundle(raw, { id: raw.region_id, name: "Retrospective selected polygon", geometry, url: "", sha256: "", forecast_status: "" },
    { start: meta.firstDay.slice(0,7), end: meta.lastDay.slice(0,7), forecastOrigin: origin });
  const forecast = result.sections.forecast.data;
  if ("predictions" in forecast && forecast.predictions.some((p) => p.date > meta.seriesEnd)) throw new Error("Retrospective targets must be past completed months");
  return result;
}

export async function loadRetrospective(geometry: PolygonGeometry, origin: string, signal: AbortSignal): Promise<Bundle> {
  geometryKey(geometry);
  let response: Response;
  for (let attempt=0; ; attempt++) {
    response = await fetch("/api/analytics/retrospective", { method: "POST", headers: { "Content-Type":"application/json" }, signal,
      body: JSON.stringify({ schema_version:"1.0.0", geometry, data_version:dataVersion, horizon:3, forecast_origin:origin }) });
    if (response.status !== 429 || attempt>=3) break;
    await response.body?.cancel(); await retryDelay(signal);
  }
  const raw = await response.json();
  if (!response.ok) throw new Error(typeof raw.detail === "string" ? raw.detail.replaceAll("_"," ") : "Retrospective analysis unavailable");
  return validateRetrospective(raw,geometry,origin);
}
