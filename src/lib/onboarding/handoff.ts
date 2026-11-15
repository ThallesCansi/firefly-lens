import type { WorkspaceSnapshot } from "./session";

/**
 * The tour leaves the Lens to visit About and Method. What it must carry
 * between pages lives here for the tab's session only: the workspace saved
 * before the tour, where the firefly was on screen, and what comes next.
 */
export type HandoffPhase = "about" | "method" | "complete" | "restore";
export interface TourHandoff {
  phase: HandoffPhase;
  saved: WorkspaceSnapshot;
  /** The firefly's last position on screen, so it flies on from there. */
  from?: [number, number];
  at: number;
}

const KEY = "firefly-lens-tour-handoff-v1";
/** A visit left half-way is forgotten after this long. */
const MAX_AGE = 30 * 60 * 1000;

export function writeHandoff(handoff: Omit<TourHandoff, "at">): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...handoff, at: Date.now() }));
  } catch {
    /* Storage blocked: the tour then ends on the page it reached. */
  }
}

export function readHandoff(phases: readonly HandoffPhase[]): TourHandoff | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as TourHandoff | null;
    if (!value || !phases.includes(value.phase) || !value.saved || Date.now() - value.at > MAX_AGE) return null;
    return value;
  } catch {
    return null;
  }
}

export function clearHandoff(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* Nothing to clear. */
  }
}
