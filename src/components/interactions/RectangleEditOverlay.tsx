"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  rectangleCorners,
  RectangleEditor,
  type RectangleHandle,
} from "@/lib/interactions/rectangle-editor";
import type { GeographicPoint } from "@/lib/interactions/navigation";
import "./Interactions.css";

/** The map owner must return null for sky, occluded points, and unsafe inverse projection. */
export type RectangleProjectionAdapter = {
  project: (
    point: GeographicPoint,
  ) => { x: number; y: number; visible?: boolean } | null;
  unproject: (point: { x: number; y: number }) => GeographicPoint | null;
};
export function RectangleEditActions({ editor }: { editor: RectangleEditor }) {
  const state = useSyncExternalStore(
    editor.subscribe,
    editor.snapshot,
    editor.snapshot,
  );
  if (state.phase === "idle") return null;
  return (
    <section
      className={"ff-interaction-card" + " map-surface"}
      aria-label="Rectangle edit confirmation"
    >
      <p className="eyebrow">EDIT RECTANGLE</p>
      <p className={"ff-interaction-muted"}>
        Drag a corner or move the rectangle. Preview only. Confirm the bounds;
        historical analysis remains a separate action.
      </p>
      <p className="num text-xs">
        {state.draft.map((n) => n.toFixed(3)).join(" / ")}
      </p>
      {state.error && <p role="alert">{state.error}</p>}
      <div className={"ff-interaction-actions"}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={state.phase === "dragging" || !!state.error}
          onClick={() => editor.confirm()}
        >
          Confirm rectangle
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => editor.cancel()}
        >
          Cancel edit
        </button>
      </div>
    </section>
  );
}
export function RectangleEditOverlay({
  editor,
  adapter,
  onInteractionLock,
  viewRevision,
}: {
  editor: RectangleEditor;
  adapter: RectangleProjectionAdapter;
  onInteractionLock?: (locked: boolean) => void;
  viewRevision?: number;
}) {
  const state = useSyncExternalStore(
    editor.subscribe,
    editor.snapshot,
    editor.snapshot,
  );
  const root = useRef<HTMLDivElement>(null);
  const lock = useRef(onInteractionLock);
  useEffect(() => {
    lock.current = onInteractionLock;
  }, [onInteractionLock]);
  useEffect(
    () => () => {
      lock.current?.(false);
    },
    [],
  );
  if (state.phase === "idle") return null;
  const corners = rectangleCorners(state.draft);
  const handles: { name: RectangleHandle; point: GeographicPoint }[] = [
    ...Object.entries(corners).map(([name, point]) => ({
      name: name as RectangleHandle,
      point,
    })),
    {
      name: "move",
      point: [
        (state.draft[0] + state.draft[2]) / 2,
        (state.draft[1] + state.draft[3]) / 2,
      ],
    },
  ];
  const geographic = (e: React.PointerEvent) => {
    const box = root.current?.getBoundingClientRect();
    return box
      ? adapter.unproject({ x: e.clientX - box.left, y: e.clientY - box.top })
      : null;
  };
  return (
    <div
      ref={root}
      className={"ff-interaction-edit-overlay"}
      data-view-revision={viewRevision}
      aria-label="Rectangle editing handles"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          editor.cancel();
          onInteractionLock?.(false);
        }
      }}
    >
      {handles.map(({ name, point }) => {
        const pixel = adapter.project(point);
        if (
          !pixel ||
          pixel.visible === false ||
          !Number.isFinite(pixel.x) ||
          !Number.isFinite(pixel.y)
        )
          return null;
        return (
          <button
            key={name}
            type="button"
            className={"ff-interaction-corner"}
            style={{ left: pixel.x, top: pixel.y }}
            aria-label={
              name === "move"
                ? "Move rectangle"
                : "Resize " + name.toUpperCase() + " corner"
            }
            title="Arrow keys: 0.1 degrees, Shift: 0.5 degrees"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const start = geographic(e);
              if (start && editor.begin(name, start)) {
                e.currentTarget.setPointerCapture(e.pointerId);
                onInteractionLock?.(true);
              }
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                editor.update(geographic(e));
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                editor.endDrag();
                onInteractionLock?.(false);
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            onPointerCancel={() => {
              editor.cancel();
              onInteractionLock?.(false);
            }}
            onLostPointerCapture={() => {
              editor.endDrag();
              onInteractionLock?.(false);
            }}
            onKeyDown={(e) => {
              const delta = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, 1],
                ArrowDown: [0, -1],
              }[e.key];
              if (!delta) return;
              e.preventDefault();
              e.stopPropagation();
              const step = e.shiftKey ? 0.5 : 0.1;
              editor.begin(name, point);
              editor.update([
                point[0] + delta[0] * step,
                point[1] + delta[1] * step,
              ]);
              editor.endDrag();
            }}
          >
            {name === "move" ? "+" : <span />}
          </button>
        );
      })}
    </div>
  );
}
