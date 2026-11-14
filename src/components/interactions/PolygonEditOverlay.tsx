"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { PolygonEditor, PolygonHandle, Vertex } from "@/lib/interactions/polygon-editor";
import type { RectangleProjectionAdapter } from "./RectangleEditOverlay";
import "./Interactions.css";

/** The editor's last refusal, for the card that describes the area. */
export function PolygonEditStatus({ editor }: { editor: PolygonEditor }) {
  const state = useSyncExternalStore(editor.subscribe, editor.snapshot, editor.snapshot);
  return state.error ? (
    <p role="alert" className="text-xs text-ember-4">
      {state.error}
    </p>
  ) : (
    <p className="text-xs text-dim">
      Drag a corner to reshape, the + on an edge to add a corner, the centre to move. Double-click a corner to
      remove it.
    </p>
  );
}

/**
 * Handles on every corner of a drawn area, shown as soon as it exists. Each
 * corner moves on its own; the camera is locked only while a handle is held.
 */
export function PolygonEditOverlay({
  editor,
  adapter,
  onInteractionLock,
  viewRevision,
}: {
  editor: PolygonEditor;
  adapter: RectangleProjectionAdapter;
  onInteractionLock?: (locked: boolean) => void;
  viewRevision?: number;
}) {
  const state = useSyncExternalStore(editor.subscribe, editor.snapshot, editor.snapshot);
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

  const geographic = (e: React.PointerEvent): Vertex | null => {
    const box = root.current?.getBoundingClientRect();
    const point = box ? adapter.unproject({ x: e.clientX - box.left, y: e.clientY - box.top }) : null;
    return point ? [point[0], point[1]] : null;
  };
  const place = (point: Vertex) => {
    const pixel = adapter.project(point);
    if (!pixel || pixel.visible === false || !Number.isFinite(pixel.x) || !Number.isFinite(pixel.y)) return null;
    return { left: pixel.x, top: pixel.y };
  };
  const release = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    editor.endDrag();
    lock.current?.(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const drag = {
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) editor.update(geographic(e));
    },
    onPointerUp: release,
    onPointerCancel: () => {
      editor.revert();
      lock.current?.(false);
    },
    onLostPointerCapture: () => {
      editor.endDrag();
      lock.current?.(false);
    },
  };
  const grab = (e: React.PointerEvent<HTMLButtonElement>, start: () => boolean) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (start()) {
      e.currentTarget.setPointerCapture(e.pointerId);
      lock.current?.(true);
    }
  };
  const keys = (handle: PolygonHandle) => (e: React.KeyboardEvent) => {
    if (handle !== "move" && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      editor.remove(handle);
      return;
    }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!delta) return;
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? 0.5 : 0.1;
    editor.nudge(handle, delta[0] * step, delta[1] * step);
  };

  const v = state.vertices;
  const centre: Vertex = [v.reduce((s, p) => s + p[0], 0) / v.length, v.reduce((s, p) => s + p[1], 0) / v.length];
  const dragging = state.phase === "dragging";

  return (
    <div
      ref={root}
      className="ff-interaction-edit-overlay"
      data-view-revision={viewRevision}
      data-dragging={dragging || undefined}
      role="group"
      aria-label="Area corners"
      onKeyDown={(e) => {
        if (e.key === "Escape" && dragging) {
          e.stopPropagation();
          editor.revert();
          lock.current?.(false);
        }
      }}
    >
      {/* Edge handles stay mounted while dragging: the one that added a corner holds the pointer. */}
      {v.map((a, i) => {
          const b = v[(i + 1) % v.length];
          const mid: Vertex = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const at = place(mid);
          return (
            at && (
              <button
                key={`m${i}`}
                type="button"
                className="ff-polygon-mid"
                style={at}
                aria-label={`Add a corner between corners ${i + 1} and ${((i + 1) % v.length) + 1}`}
                tabIndex={-1}
                onPointerDown={(e) => grab(e, () => editor.insert(i, mid))}
                {...drag}
              />
            )
          );
        })}
      {v.map((point, i) => {
        const at = place(point);
        return (
          at && (
            <button
              key={`v${i}`}
              type="button"
              className="ff-interaction-corner ff-polygon-vertex"
              data-active={state.handle === i || undefined}
              style={at}
              aria-label={`Corner ${i + 1}: ${point[1].toFixed(2)}, ${point[0].toFixed(2)}`}
              title="Drag to move · double-click or Delete to remove · arrow keys: 0.1°, Shift: 0.5°"
              onPointerDown={(e) => grab(e, () => editor.begin(i, geographic(e)))}
              onDoubleClick={() => editor.remove(i)}
              onKeyDown={keys(i)}
              {...drag}
            >
              <span />
            </button>
          )
        );
      })}
      {(() => {
        const at = place(centre);
        return (
          at && (
            <button
              type="button"
              className="ff-interaction-corner ff-polygon-move"
              style={at}
              aria-label="Move the area"
              title="Drag to move the area · arrow keys: 0.1°, Shift: 0.5°"
              onPointerDown={(e) => grab(e, () => editor.begin("move", geographic(e)))}
              onKeyDown={keys("move")}
              {...drag}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
              </svg>
            </button>
          )
        );
      })()}
    </div>
  );
}
