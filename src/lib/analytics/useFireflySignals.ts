"use client";

import { useEffect, useMemo, useState } from "react";
import { loadAnalytics, loadAnalyticsRegions } from "./client";
import { fireflySignals, seasonalAnomaly, type SignalRegion } from "./signals";
import { rawPilots, rawPilotArea } from "../data/coverage";
import { loadNationalAnalytics } from "../data/raw-pilot";

export function useFireflySignals(enabled: boolean, period: string) {
  const [catalog, setCatalog] = useState<{ regions: SignalRegion[]; total: number; failed: number } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadAnalyticsRegions().then(async (entries) => {
      const national = rawPilots.filter((entry) => entry.signals_eligible && entry.national_url && entry.representative_point);
      const results = await Promise.allSettled([...entries.map(async (region) => {
        const result = await loadAnalytics(region.geometry);
        if (result.status !== "available") throw new Error("Prepared region unavailable");
        return { region: result.region, bundle: result.bundle };
      }), ...national.map(async (entry) => ({
        region: { id:`country-${entry.country_code}`,name:`${entry.name} · whole country`,geometry:entry.geometry!,url:entry.national_url!,sha256:entry.national_sha256!,forecast_status:"unavailable",representative_point:entry.representative_point },
        bundle:await loadNationalAnalytics(rawPilotArea(entry)),
      }))]);
      if (live) {
        setError(false);
        setCatalog({ regions: results.flatMap((r) => r.status === "fulfilled" ? [r.value] : []),
          total: entries.length+national.length, failed: results.filter((r) => r.status === "rejected").length });
      }
    }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [enabled]);
  const signals = useMemo(() => enabled && catalog ? fireflySignals(catalog.regions, period) : [],
    [enabled, catalog, period]);
  const eligible = catalog?.regions.filter(({ bundle }) => seasonalAnomaly(bundle, period)).length ?? 0;
  const status = !enabled ? "Signals hidden" : error ? "Seasonal signals unavailable" : !catalog ? "Checking seasonal activity…" :
    `${signals.length} ${signals.length === 1 ? "signal" : "signals"} · ${eligible}/${catalog.total} regions assessed${catalog.failed ? ` · ${catalog.failed} failed to load` : ""}`;
  return { signals, status };
}
