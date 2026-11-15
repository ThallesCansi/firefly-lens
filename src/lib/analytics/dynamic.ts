import { meta } from "../data/meta";
import type { PolygonGeometry } from "../data/types";
import { geometryKey, validateBundle } from "./client";
import type { Bundle } from "./contracts";

export const dataVersion = Object.fromEntries([
  "version", "firstDay", "lastDay", "seriesEnd", "partialMonth", "observedUntil",
  "climatologyBase", "cellDeg", "commonErrorC",
].map((key) => [key, meta[key as keyof typeof meta]]));

export class AnalyticsError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function retryDelay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 2000);
    function abort() { clearTimeout(timer); reject(signal.reason); }
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function loadDynamicAnalytics(
  geometry: PolygonGeometry, section: "history" | "forecast", signal: AbortSignal,
): Promise<Bundle> {
  geometryKey(geometry);
  let response: Response;
  for (let attempt = 0; ; attempt++) {
    response = await fetch(`/api/analytics/${section}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ schema_version: "1.0.0", geometry, data_version: dataVersion, horizon: 3 }),
    });
    if (response.status !== 429 || attempt >= 3) break;
    await response.body?.cancel();
    await retryDelay(signal);
  }
  const raw = await response.json();
  if (!response.ok) throw new AnalyticsError(response.status,
    raw?.detail === "region_outside_coverage" ? "Region outside Brazilian data coverage. Move or redraw the polygon."
      : raw?.detail === "analytics_data_version_mismatch" ? "The analysis service and map have different data versions."
      : raw?.detail === "analytics_busy_retry" ? "The analysis service is busy. Please retry."
      : typeof raw?.detail === "string" ? raw.detail : "analytics_processing_error");
  return validateBundle(raw, {
    id: raw.region_id, name: "Selected polygon", geometry,
    url: "", sha256: "", forecast_status: "",
  });
}
