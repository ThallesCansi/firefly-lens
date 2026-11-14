import { COVERAGE, MAX_AREA_SIDE, type BBox } from "../data/types";
import { validPoint, type GeographicPoint } from "./navigation";
export type RectangleHandle = "nw" | "ne" | "se" | "sw" | "move";
export type RectangleEditState = {
  original: BBox;
  draft: BBox;
  phase: "editing" | "dragging" | "idle";
  handle: RectangleHandle | null;
  error: string | null;
};
export const MIN_RECTANGLE_SIDE = 0.5;
export function validateRectangle(box: BBox): boolean {
  return (
    box.length === 4 &&
    box.every(Number.isFinite) &&
    box[0] >= COVERAGE[0] &&
    box[2] <= COVERAGE[2] &&
    box[1] >= COVERAGE[1] &&
    box[3] <= COVERAGE[3] &&
    box[2] - box[0] >= MIN_RECTANGLE_SIDE - 1e-9 &&
    box[3] - box[1] >= MIN_RECTANGLE_SIDE - 1e-9 &&
    box[2] - box[0] <= MAX_AREA_SIDE + 1e-9 &&
    box[3] - box[1] <= MAX_AREA_SIDE + 1e-9
  );
}
export function rectangleCorners([w, s, e, n]: BBox): Record<
  Exclude<RectangleHandle, "move">,
  [number, number]
> {
  return { nw: [w, n], ne: [e, n], se: [e, s], sw: [w, s] };
}
const clamp = (x: number, min: number, max: number) =>
  Math.max(min, Math.min(max, x));
function edge(
  value: number,
  anchor: number,
  originalDirection: number,
  min: number,
  max: number,
) {
  const direction =
    value === anchor ? originalDirection : Math.sign(value - anchor);
  const available = direction > 0 ? max - anchor : anchor - min;
  if (available < MIN_RECTANGLE_SIDE)
    return anchor + originalDirection * MIN_RECTANGLE_SIDE;
  return (
    anchor +
    direction *
      clamp(
        Math.abs(value - anchor),
        MIN_RECTANGLE_SIDE,
        Math.min(MAX_AREA_SIDE, available),
      )
  );
}
export function resizeRectangle(
  box: BBox,
  handle: Exclude<RectangleHandle, "move">,
  point: GeographicPoint,
): BBox {
  if (!validateRectangle(box) || !validPoint(point))
    throw new Error("Invalid rectangle edit");
  const corners = rectangleCorners(box),
    opposite = { nw: "se", ne: "sw", se: "nw", sw: "ne" } as const;
  const anchor = corners[opposite[handle]],
    old = corners[handle];
  if (Math.abs(point[0] - old[0]) > 180)
    throw new Error("Antimeridian-crossing edits are not supported.");
  const x = edge(
    point[0],
    anchor[0],
    Math.sign(old[0] - anchor[0]),
    COVERAGE[0],
    COVERAGE[2],
  );
  const y = edge(
    point[1],
    anchor[1],
    Math.sign(old[1] - anchor[1]),
    COVERAGE[1],
    COVERAGE[3],
  );
  return [
    Math.min(anchor[0], x),
    Math.min(anchor[1], y),
    Math.max(anchor[0], x),
    Math.max(anchor[1], y),
  ];
}
export function moveRectangle(
  box: BBox,
  start: GeographicPoint,
  point: GeographicPoint,
): BBox {
  if (!validateRectangle(box) || !validPoint(start) || !validPoint(point))
    throw new Error("Invalid rectangle move");
  if (Math.abs(point[0] - start[0]) > 180)
    throw new Error("Antimeridian-crossing edits are not supported.");
  const dx = clamp(
    point[0] - start[0],
    COVERAGE[0] - box[0],
    COVERAGE[2] - box[2],
  );
  const dy = clamp(
    point[1] - start[1],
    COVERAGE[1] - box[1],
    COVERAGE[3] - box[3],
  );
  return [box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy];
}
export class RectangleEditor {
  private state: RectangleEditState;
  private listeners = new Set<() => void>();
  private drag: { point: GeographicPoint; box: BBox } | null = null;
  constructor(
    box: BBox,
    private callbacks: {
      onPreview?: (box: BBox) => void;
      onConfirm?: (box: BBox) => void;
      onCancel?: (box: BBox) => void;
    } = {},
  ) {
    if (!validateRectangle(box))
      throw new Error(
        "Rectangle must be within Brazil coverage, at least 0.5 degrees and at most " +
          MAX_AREA_SIDE +
          " degrees per side.",
      );
    this.state = {
      original: [...box],
      draft: [...box],
      phase: "editing",
      handle: null,
      error: null,
    };
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(next: RectangleEditState) {
    this.state = next;
    this.listeners.forEach((fn) => fn());
  }
  begin(handle: RectangleHandle, point: GeographicPoint) {
    if (this.state.phase === "idle" || !validPoint(point)) return false;
    this.drag = { point, box: [...this.state.draft] };
    this.emit({ ...this.state, phase: "dragging", handle, error: null });
    return true;
  }
  update(point: GeographicPoint | null) {
    if (!this.drag || !this.state.handle || !point) return false;
    try {
      const box =
        this.state.handle === "move"
          ? moveRectangle(this.drag.box, this.drag.point, point)
          : resizeRectangle(this.drag.box, this.state.handle, point);
      if (!validateRectangle(box))
        throw new Error("Edit exceeds the allowed geographic bounds.");
      this.emit({ ...this.state, draft: box, error: null });
      this.callbacks.onPreview?.([...box]);
      return true;
    } catch (error) {
      this.emit({
        ...this.state,
        error: error instanceof Error ? error.message : "Invalid edit.",
      });
      return false;
    }
  }
  endDrag() {
    this.drag = null;
    if (this.state.phase !== "idle")
      this.emit({ ...this.state, phase: "editing", handle: null });
  }
  confirm() {
    if (
      this.state.phase !== "editing" ||
      this.state.error ||
      !validateRectangle(this.state.draft)
    )
      return false;
    const box = [...this.state.draft] as BBox;
    this.emit({ ...this.state, phase: "idle", handle: null, error: null });
    this.callbacks.onConfirm?.(box);
    return true;
  }
  cancel() {
    this.drag = null;
    const box = [...this.state.original] as BBox;
    this.emit({
      ...this.state,
      draft: box,
      phase: "idle",
      handle: null,
      error: null,
    });
    this.callbacks.onPreview?.([...box]);
    this.callbacks.onCancel?.(box);
  }
}
