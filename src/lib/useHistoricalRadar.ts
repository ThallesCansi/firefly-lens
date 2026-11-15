"use client";

import { useEffect, useState } from "react";
import { loadRadarSummary, type RadarSummary } from "./data/radar";

export function useHistoricalRadar() {
  const [summary, setSummary] = useState<RadarSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    loadRadarSummary().then((data) => {
      if (live) setSummary(data);
    }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : "The radar could not be loaded.");
    });
    return () => { live = false; };
  }, [attempt]);
  return { summary, error, retry: () => { setError(null); setAttempt((n) => n + 1); } };
}
