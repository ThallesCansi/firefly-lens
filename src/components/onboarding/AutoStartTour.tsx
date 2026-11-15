"use client";
import { useEffect } from "react";
import { claimAutomaticTour } from "@/lib/onboarding/persistence";

/** The existing Driver welcome is the only automatic welcome surface. */
export function AutoStartTour({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    // Someone who arrives through a shared link came for that view: the tour
    // waits for a plain visit, and its one automatic start is not spent here.
    const query = new URLSearchParams(window.location.search);
    if (["area", "period", "sensors"].some((key) => query.has(key))) return;
    if (claimAutomaticTour(document)) onStart();
  }, [onStart]);
  return null;
}
