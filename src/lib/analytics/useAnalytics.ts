"use client";
import { useEffect, useState } from "react";
import type { AnalysisArea } from "../data/types";
import { geometryKey, loadAnalytics, type AnalyticsResult } from "./client";

export function useAnalytics(area: AnalysisArea) {
  const key = geometryKey(area.geometry);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    attempt: number;
    result?: AnalyticsResult;
    error?: string;
  } | null>(null);
  useEffect(() => {
    let live = true;
    loadAnalytics(area.geometry).then(
      (result) => {
        if (live) setState({ key, attempt, result });
      },
      (error: unknown) => {
        if (live)
          setState({
            key,
            attempt,
            error:
              error instanceof Error
                ? error.message
                : "Analytics processing error",
          });
      },
    );
    return () => {
      live = false;
    };
  }, [area.geometry, key, attempt]);
  const current =
    state?.key === key && state.attempt === attempt ? state : null;
  return {
    loading: !current,
    result: current?.result,
    error: current?.error,
    retry: () => setAttempt((n) => n + 1),
  };
}
