import type { AnalysisArea, BBox, Sensor } from "../data/types";
import type { CameraPose, ProjectionMode } from "../map/map-contract";
import { TOUR_STEPS, type TourStepId } from "./steps";

export interface WorkspaceSnapshot {
  area: AnalysisArea | null;
  analyzed: AnalysisArea | null;
  analysis: boolean;
  expanded: boolean;
  drawing: boolean;
  coordinates: boolean;
  searching: boolean;
  period: string;
  from: string;
  to: string;
  sensors: Sensor[];
  monthOpen: boolean;
  cardOpen: boolean;
  analyticsTab: "history" | "forecast";
  bounds?: BBox;
  projection?: ProjectionMode;
  camera?: CameraPose;
  columnsChosen?: boolean;
  flight?: number | null;
  scrollY?: number;
  panelScrollTop?: number;
}
export interface TourWorkspace {
  capture(): WorkspaceSnapshot;
  prepare(id: TourStepId, signal: AbortSignal): Promise<void>;
  retry?(id: TourStepId): void;
  restore(snapshot: WorkspaceSnapshot): void;
  keep(): void;
}
export interface SessionState {
  phase: "idle" | "preparing" | "ready" | "error";
  index: number;
  error: string | null;
  skipped: readonly string[];
}

/** Wait for React/layout commits, not a guessed loading delay. */
export function afterPaint(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
    let frame = 0;
    const abort = () => { cancelAnimationFrame(frame); reject(new DOMException("Cancelled", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) abort(); else resolve();
      });
    });
  });
}

/** Owns cancellable transitions. Driver owns target waiting and interaction gating. */
export class TourSession {
  private state: SessionState = { phase: "idle", index: 0, error: null, skipped: [] };
  private listeners = new Set<() => void>();
  private activation: AbortController | null = null;
  private generation = 0;
  private saved: WorkspaceSnapshot | null = null;
  constructor(private workspace: TourWorkspace) {}
  setWorkspace(workspace: TourWorkspace) { this.workspace = workspace; }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(state: SessionState) { this.state = state; this.listeners.forEach((listener) => listener()); }
  start(index = 0) {
    if (!this.saved) this.saved = this.workspace.capture();
    this.publish({ ...this.state, skipped: [] });
    return this.go(index);
  }
  /** Hands the saved workspace to the next page of the tour; nothing is restored here. */
  detach(): WorkspaceSnapshot | null {
    this.activation?.abort();
    this.generation++;
    const saved = this.saved;
    this.saved = null;
    this.publish({ phase: "idle", index: 0, error: null, skipped: [] });
    return saved;
  }
  async go(index: number) {
    if (!this.saved || index < 0 || index >= TOUR_STEPS.length) return;
    this.activation?.abort();
    const activation = new AbortController();
    this.activation = activation;
    const generation = ++this.generation;
    this.publish({ ...this.state, phase: "preparing", index, error: null });
    try {
      await this.workspace.prepare(TOUR_STEPS[index].id, activation.signal);
      if (!activation.signal.aborted && generation === this.generation)
        this.publish({ ...this.state, phase: "ready", index, error: null });
    } catch (cause) {
      if (!activation.signal.aborted && generation === this.generation)
        this.fail(cause instanceof Error ? cause.message : "This section could not be opened.");
    }
  }
  fail(message: string) { this.publish({ ...this.state, phase: "error", error: message }); }
  retry() { this.workspace.retry?.(TOUR_STEPS[this.state.index].id); return this.go(this.state.index); }
  skipSection() {
    const id = TOUR_STEPS[this.state.index].id;
    this.publish({ ...this.state, skipped: [...new Set([...this.state.skipped, id])] });
    // Skip dependent analysis steps after a record failure, but keep the exit choices.
    const next = ["history", "month", "report", "science", "forecast", "range", "exports"].includes(id)
      ? TOUR_STEPS.length - 1 : this.state.index + 1;
    return this.go(next);
  }
  finish(keep: boolean) {
    this.activation?.abort();
    this.generation++;
    const saved = this.saved;
    this.saved = null;
    if (saved) { if (keep) this.workspace.keep(); else this.workspace.restore(saved); }
    this.publish({ phase: "idle", index: 0, error: null, skipped: [] });
  }
  dispose() { this.finish(false); this.listeners.clear(); }
}
