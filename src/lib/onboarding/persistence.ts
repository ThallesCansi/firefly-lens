export const TOUR_KEY = "firefly-lens-tour-v1";
export const TOUR_OPT_OUT_KEY = "firefly-lens-tour-auto-disabled-v1";
const presentedPages = new WeakSet<object>();
export function readTourOptOut(storage?: Pick<Storage, "getItem">): boolean {
  try {
    return (storage ?? (typeof window === "undefined" ? undefined : window.localStorage))?.getItem(TOUR_OPT_OUT_KEY) === "true";
  } catch { return false; }
}
/** Only the explicit checkbox writes this preference; outcomes never do. */
export function saveTourOptOut(disabled: boolean, storage?: Pick<Storage, "setItem" | "removeItem">): void {
  try {
    const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    if (disabled) target?.setItem(TOUR_OPT_OUT_KEY, "true");
    else target?.removeItem(TOUR_OPT_OUT_KEY);
  } catch { /* Storage unavailable: the current tour and manual launcher still work. */ }
}
/** One attempt per document, shared across Strict Mode, remounts and client routes.
 * A real reload creates a new document and rechecks only the opt-out preference.
 */
export function claimAutomaticTour(page: object, storage?: Pick<Storage, "getItem">): boolean {
  if (presentedPages.has(page)) return false;
  presentedPages.add(page);
  return !readTourOptOut(storage);
}
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
