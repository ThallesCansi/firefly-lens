"use client";
import { useEffect } from "react";
import { claimAutomaticTour } from "@/lib/onboarding/persistence";

/** The existing Driver welcome is the only automatic welcome surface. */
export function AutoStartTour({ onStart }: { onStart: () => void }) {
  useEffect(() => { if (claimAutomaticTour(document)) onStart(); }, [onStart]);
  return null;
}
