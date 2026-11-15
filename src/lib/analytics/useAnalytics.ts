"use client";
import { useEffect, useState } from "react";
import type { AnalysisArea } from "../data/types";
import type { Bundle } from "./contracts";
import { geometryKey, loadAnalytics } from "./client";
import { AnalyticsError, loadDynamicAnalytics } from "./dynamic";

export interface AnalyticsState {
  bundle?: Bundle;
  error?: string;
  forecastError?: string;
  forecastLoading: boolean;
  dynamic: boolean;
}

/** Cancellation guards both network requests and responses already being decoded. */
export function observeAnalytics(area: AnalysisArea, emit: (state: AnalyticsState) => void) {
  const controller = new AbortController();
  let live = true;
  const initial: AnalyticsState = { forecastLoading: false, dynamic: true };
  const publish = (state: AnalyticsState) => { if (live) emit(state); };
  async function run() {
    let bundle: Bundle;
    try {
      bundle = await loadDynamicAnalytics(area.geometry, "history", controller.signal);
      if (!live) return;
      publish({ ...initial, bundle, forecastLoading: true });
    } catch (error) {
      if (!live) return;
      // Preserve exact, integrity-checked prepared regions during service outages.
      if (error instanceof AnalyticsError && error.status === 503) {
        try {
          const result = await loadAnalytics(area.geometry);
          publish({ ...initial, dynamic: false,
            bundle: result.status === "available" ? result.bundle : undefined,
            error: result.status === "available" ? undefined : "Dynamic analysis service unavailable. Browser history remains available.",
          });
        } catch {
          publish({ ...initial, error: "Scientific analysis service unavailable. Browser history remains available." });
        }
      } else {
        publish({ ...initial, error: error instanceof Error ? error.message : "Analytics processing error" });
      }
      return;
    }
    try {
      const forecastBundle = await loadDynamicAnalytics(area.geometry, "forecast", controller.signal);
      publish({ ...initial, bundle: forecastBundle });
    } catch (error) {
      publish({ ...initial, bundle,
        forecastError: error instanceof Error ? error.message : "Forecast processing error" });
    }
  }
  void run();
  return () => { live = false; controller.abort(); };
}

export function useAnalytics(area: AnalysisArea) {
  const key = geometryKey(area.geometry);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<(AnalyticsState & { key: string; attempt: number }) | null>(null);
  useEffect(() => observeAnalytics(area, (result) => setState({ ...result, key, attempt })),
    [area, key, attempt]);
  const current = state?.key === key && state.attempt === attempt ? state : undefined;
  return {
    loading: !current, bundle: current?.bundle,
    error: current?.error, forecastError: current?.forecastError,
    forecastLoading: current?.forecastLoading ?? false, dynamic: current?.dynamic ?? true,
    retry: () => setAttempt((n) => n + 1),
  };
}
