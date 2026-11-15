import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { collection, type ColumnFeature } from "./columns";

/** How long a column takes to reach its new height. Short enough to finish inside a time-lapse step. */
export const COLUMN_MOTION_MS = 420;

/** Fast at first, settling at the end: a column arrives at its height instead of overshooting or stopping dead. */
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

export interface ColumnTransition {
  /** Everything to draw meanwhile: the new columns, plus the ones on their way down to the ground. */
  features: ColumnFeature[];
  /** Height at the start and at the end, per column id. */
  from: Map<number, number>;
  to: Map<number, number>;
  /** False when no column changes height: nothing to animate. */
  moves: boolean;
}

/**
 * Plans the change from the columns on screen to the next ones. A column in
 * both keeps its place and changes height; a new one rises from the ground; one
 * that is gone sinks to the ground before it is removed. Pure.
 */
export function planTransition(
  shown: Map<number, number>,
  drawn: Map<number, ColumnFeature>,
  next: ColumnFeature[],
): ColumnTransition {
  const to = new Map(next.map((f) => [f.id, f.properties.h]));
  const leaving = [...drawn.values()].filter((f) => !to.has(f.id) && (shown.get(f.id) ?? 0) > 0);
  const features = [...next, ...leaving];
  const from = new Map(features.map((f) => [f.id, shown.get(f.id) ?? 0]));
  for (const f of leaving) to.set(f.id, 0);
  const moves = features.some((f) => from.get(f.id) !== to.get(f.id));
  return { features, from, to, moves };
}

/** Height of every column that moves, a share `t` (0 to 1) of the way through the transition. */
export function heightsAt(plan: ColumnTransition, t: number): [number, number][] {
  const k = easeOut(Math.min(1, Math.max(0, t)));
  const out: [number, number][] = [];
  for (const [id, a] of plan.from) {
    const b = plan.to.get(id) ?? 0;
    if (a !== b) out.push([id, a + (b - a) * k]);
  }
  return out;
}

/**
 * Moves the columns of a map from one set of heights to the next. The
 * footprints go to the source once; the heights then change through feature
 * state, frame by frame, without rebuilding the geometry. A new call replaces
 * the transition in flight and starts from the heights on screen.
 */
export function createColumnMotion(getMap: () => MapLibreMap | null, sourceId: string) {
  let shown = new Map<number, number>();
  let drawn = new Map<number, ColumnFeature>();
  let frame = 0;

  const setHeight = (m: MapLibreMap, id: number, h: number) => m.setFeatureState({ source: sourceId, id }, { h });
  const settle = (m: MapLibreMap, source: GeoJSONSource, next: ColumnFeature[]) => {
    source.setData(collection(next));
    const kept = new Set(next.map((f) => f.id));
    for (const id of drawn.keys()) if (!kept.has(id)) m.removeFeatureState({ source: sourceId, id });
    for (const f of next) setHeight(m, f.id, f.properties.h);
    shown = new Map(next.map((f) => [f.id, f.properties.h]));
    drawn = new Map(next.map((f) => [f.id, f]));
  };

  return {
    /** Shows `next`, reaching it over `duration` milliseconds (0 jumps there). */
    show(next: ColumnFeature[], duration: number) {
      cancelAnimationFrame(frame);
      const m = getMap();
      const source = m?.getSource(sourceId) as GeoJSONSource | undefined;
      if (!m || !source) return;
      const plan = planTransition(shown, drawn, next);
      if (duration <= 0 || !plan.moves) return settle(m, source, next);

      // New columns start on the ground before their footprint arrives.
      for (const [id, h] of plan.from) setHeight(m, id, h);
      source.setData(collection(plan.features));
      drawn = new Map(plan.features.map((f) => [f.id, f]));
      shown = new Map(plan.from);
      const start = performance.now();
      const step = (now: number) => {
        // The map may have been removed or restyled between frames.
        if (getMap() !== m || !m.getSource(sourceId)) return;
        const t = (now - start) / duration;
        for (const [id, h] of heightsAt(plan, t)) {
          setHeight(m, id, h);
          shown.set(id, h);
        }
        if (t < 1) frame = requestAnimationFrame(step);
        else settle(m, source, next);
      };
      frame = requestAnimationFrame(step);
    },
    /** The style was replaced: its source is new and the animated heights are gone. */
    reset() {
      cancelAnimationFrame(frame);
      shown = new Map();
      drawn = new Map();
    },
    stop() {
      cancelAnimationFrame(frame);
    },
  };
}

export type ColumnMotion = ReturnType<typeof createColumnMotion>;
