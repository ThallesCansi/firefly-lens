export const TOUR_KEY = "firefly-lens-tour-v1";
export type TourOutcome = "dismissed" | "completed" | "partial";
export function readTourOutcome(storage?: Pick<Storage, "getItem">): TourOutcome | null {
  try {
    const value = (storage ?? (typeof window === "undefined" ? undefined : window.localStorage))?.getItem(TOUR_KEY);
    return value === "dismissed" || value === "completed" || value === "partial" ? value : null;
  } catch { return null; }
}
export function saveTourOutcome(outcome: TourOutcome, storage?: Pick<Storage, "setItem">) {
  try { (storage ?? (typeof window === "undefined" ? undefined : window.localStorage))?.setItem(TOUR_KEY, outcome); } catch { /* In-memory dismissal still works. */ }
}
