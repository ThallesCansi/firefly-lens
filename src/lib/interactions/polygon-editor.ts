import { COVERAGE, MAX_AREA_SIDE } from "../data/types";

/**
 * Editing a drawn area vertex by vertex. Each vertex moves on its own; the
 * shape only has to stay a simple polygon (no crossing edges) inside the
 * covered box and within MAX_AREA_SIDE degrees on each side of its envelope.
 * An edit that breaks a rule is refused and the last valid shape stays.
 */

export type Vertex = [number, number];
/** A vertex index, or "move" for the whole shape. */
export type PolygonHandle = number | "move";
export type PolygonEditState = {
  vertices: Vertex[];
  phase: "editing" | "dragging";
  handle: PolygonHandle | null;
  error: string | null;
};

export const MIN_VERTICES = 3;
export const MAX_VERTICES = 60;
/** Smallest area, in square degrees: under one 0.25° cell the record means little. */
export const MIN_POLYGON_AREA = 0.0625;

/** Signed area by the shoelace formula, in square degrees. */
export function polygonArea(vertices: Vertex[]): number {
  let twice = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return twice / 2;
}

const orient = (a: Vertex, b: Vertex, c: Vertex) => {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(v) < 1e-12 ? 0 : Math.sign(v);
};
const within = (a: Vertex, b: Vertex, p: Vertex) =>
  Math.min(a[0], b[0]) - 1e-12 <= p[0] &&
  p[0] <= Math.max(a[0], b[0]) + 1e-12 &&
  Math.min(a[1], b[1]) - 1e-12 <= p[1] &&
  p[1] <= Math.max(a[1], b[1]) + 1e-12;

/** True when segments ab and cd touch or cross. */
export function segmentsIntersect(a: Vertex, b: Vertex, c: Vertex, d: Vertex): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (
    (o1 === 0 && within(a, b, c)) ||
    (o2 === 0 && within(a, b, d)) ||
    (o3 === 0 && within(c, d, a)) ||
    (o4 === 0 && within(c, d, b))
  );
}

/** True when two edges that are not neighbours meet, or neighbours fold onto each other. */
export function selfIntersects(vertices: Vertex[]): boolean {
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const c = vertices[j];
      const d = vertices[(j + 1) % n];
      const neighbours = j === i + 1 || (i === 0 && j === n - 1);
      if (neighbours) {
        // Neighbours share one vertex; they only fail when they fold back over each other.
        const shared = j === i + 1 ? b : a;
        const p = j === i + 1 ? a : b;
        const q = j === i + 1 ? d : c;
        const dot = (p[0] - shared[0]) * (q[0] - shared[0]) + (p[1] - shared[1]) * (q[1] - shared[1]);
        if (orient(p, shared, q) === 0 && dot > 0) return true;
        continue;
      }
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

/** Why a shape cannot be an area, or null when it can. */
export function polygonProblem(vertices: Vertex[], limitSize = true): string | null {
  if (vertices.length < MIN_VERTICES) return "An area needs at least three corners.";
  if (vertices.length > MAX_VERTICES) return `An area can have at most ${MAX_VERTICES} corners.`;
  if (!vertices.every((v) => Number.isFinite(v[0]) && Number.isFinite(v[1]))) return "Invalid coordinate.";
  const xs = vertices.map((v) => v[0]);
  const ys = vertices.map((v) => v[1]);
  const [w, e, s, n] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (w < COVERAGE[0] - 1e-9 || e > COVERAGE[2] + 1e-9 || s < COVERAGE[1] - 1e-9 || n > COVERAGE[3] + 1e-9)
    return "The area must stay inside Brazil's data coverage.";
  if (limitSize && (e - w > MAX_AREA_SIDE + 1e-9 || n - s > MAX_AREA_SIDE + 1e-9))
    return `The area can span at most ${MAX_AREA_SIDE}° in each direction.`;
  if (selfIntersects(vertices)) return "Edges cannot cross each other.";
  if (Math.abs(polygonArea(vertices)) < MIN_POLYGON_AREA) return "The area is too small: keep it larger than one 0.25° cell.";
  return null;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const copy = (vertices: Vertex[]) => vertices.map((v) => [v[0], v[1]] as Vertex);
const same = (a: Vertex[], b: Vertex[]) =>
  a.length === b.length && a.every((v, i) => v[0] === b[i][0] && v[1] === b[i][1]);

export class PolygonEditor {
  private state: PolygonEditState;
  private listeners = new Set<() => void>();
  /** `vertices`: what the drag moves from; `before`: the shape before the edit began, to tell if it changed. */
  private drag: { start: Vertex; vertices: Vertex[]; before: Vertex[] } | null = null;

  constructor(
    vertices: Vertex[],
    private callbacks: {
      /** Every accepted change while dragging, for drawing the shape live. */
      onPreview?: (vertices: Vertex[]) => void;
      /** The shape after a finished edit (pointer released, key pressed, vertex removed). */
      onCommit?: (vertices: Vertex[]) => void;
      /** A drag ended, changed or not. */
      onEnd?: () => void;
    } = {},
    private limitSize = true,
  ) {
    const problem = polygonProblem(vertices, limitSize);
    if (problem) throw new Error(problem);
    this.state = { vertices: copy(vertices), phase: "editing", handle: null, error: null };
  }

  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(next: PolygonEditState) {
    this.state = next;
    this.listeners.forEach((fn) => fn());
  }

  /** Starts dragging a vertex or the whole shape from a point on the map. */
  begin(handle: PolygonHandle, point: Vertex | null) {
    if (!point || (handle !== "move" && !this.state.vertices[handle])) return false;
    this.drag = { start: point, vertices: copy(this.state.vertices), before: copy(this.state.vertices) };
    this.emit({ ...this.state, phase: "dragging", handle, error: null });
    return true;
  }

  /** Follows the pointer; a refused position keeps the last valid shape. */
  update(point: Vertex | null) {
    const handle = this.state.handle;
    if (!this.drag || handle === null || !point) return false;
    const base = this.drag.vertices;
    let next: Vertex[];
    if (handle === "move") {
      const xs = base.map((v) => v[0]);
      const ys = base.map((v) => v[1]);
      const dx = clamp(point[0] - this.drag.start[0], COVERAGE[0] - Math.min(...xs), COVERAGE[2] - Math.max(...xs));
      const dy = clamp(point[1] - this.drag.start[1], COVERAGE[1] - Math.min(...ys), COVERAGE[3] - Math.max(...ys));
      next = base.map((v) => [v[0] + dx, v[1] + dy]);
    } else {
      next = copy(base);
      next[handle] = [clamp(point[0], COVERAGE[0], COVERAGE[2]), clamp(point[1], COVERAGE[1], COVERAGE[3])];
    }
    const problem = polygonProblem(next, this.limitSize);
    if (problem) {
      this.emit({ ...this.state, error: problem });
      return false;
    }
    this.emit({ ...this.state, vertices: next, error: null });
    this.callbacks.onPreview?.(copy(next));
    return true;
  }

  /** Ends a drag and hands the shape over when it changed. */
  endDrag() {
    if (!this.drag) return;
    const before = this.drag.before;
    this.drag = null;
    this.emit({ ...this.state, phase: "editing", handle: null });
    this.callbacks.onEnd?.();
    if (!same(before, this.state.vertices)) this.callbacks.onCommit?.(copy(this.state.vertices));
  }

  /** Abandons the drag in progress, back to the shape it started from. */
  revert() {
    if (!this.drag) return;
    const before = this.drag.before;
    this.drag = null;
    this.emit({ vertices: before, phase: "editing", handle: null, error: null });
    this.callbacks.onEnd?.();
  }

  /** Moves one vertex, or the shape, by a step in degrees (keyboard editing). */
  nudge(handle: PolygonHandle, dx: number, dy: number) {
    const v = this.state.vertices;
    const from: Vertex = handle === "move" ? [v[0][0], v[0][1]] : v[handle];
    if (!from || !this.begin(handle, from)) return false;
    const moved = this.update([from[0] + dx, from[1] + dy]);
    this.endDrag();
    return moved;
  }

  /** Adds a vertex after `index` at `point` (on an edge) and starts dragging it. */
  insert(index: number, point: Vertex) {
    const next = copy(this.state.vertices);
    next.splice(index + 1, 0, point);
    const problem = polygonProblem(next, this.limitSize);
    if (problem) {
      this.emit({ ...this.state, error: problem });
      return false;
    }
    const before = copy(this.state.vertices);
    this.emit({ ...this.state, vertices: next, error: null });
    if (!this.begin(index + 1, point)) return false;
    // Releasing without moving still keeps the new corner.
    this.drag!.before = before;
    return true;
  }

  /** Removes a vertex, keeping at least three. */
  remove(index: number) {
    const next = copy(this.state.vertices);
    next.splice(index, 1);
    const problem = polygonProblem(next, this.limitSize);
    if (problem) {
      this.emit({ ...this.state, error: problem });
      return false;
    }
    this.emit({ vertices: next, phase: "editing", handle: null, error: null });
    this.callbacks.onPreview?.(copy(next));
    this.callbacks.onCommit?.(copy(next));
    return true;
  }
}
