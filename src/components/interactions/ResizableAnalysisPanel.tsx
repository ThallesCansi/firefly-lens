"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { PanelSizeController } from "@/lib/interactions/panel-size";
import "./Interactions.css";

export function ResizableAnalysisPanel({
  children,
  defaultWidth = 600,
  minWidth = 320,
  maxWidth = 960,
  minMapWidth = 320,
  storageKey = "firefly-lens-analysis-width",
  onResize,
}: {
  children: ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  minMapWidth?: number;
  storageKey?: string;
  onResize?: (width: number) => void;
}) {
  const [controller] = useState(
    () =>
      new PanelSizeController({
        defaultWidth,
        minWidth,
        maxWidth,
        minMapWidth,
      }),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
  const element = useRef<HTMLElement>(null),
    id = useId();
  useEffect(() => {
    const parent = element.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(([entry]) =>
      controller.setViewport(entry.contentRect.width),
    );
    observer.observe(parent);
    controller.setViewport(parent.clientWidth);
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null && Number.isFinite(Number(saved)))
        controller.setWidth(Number(saved));
    } catch {}
    return () => observer.disconnect();
  }, [controller, storageKey]);
  useEffect(() => {
    const el = element.current;
    if (!el || !onResize) return;
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => onResize(entry.contentRect.width));
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [onResize]);
  const persist = () => {
    try {
      localStorage.setItem(storageKey, String(controller.snapshot().width));
    } catch {}
  };
  return (
    <aside
      ref={element}
      className={"ff-interaction-panel"}
      data-mobile={state.limits.mobile}
      data-resizing={state.resizing}
      style={{ "--analysis-panel-width": state.width + "px" } as CSSProperties}
      aria-label="Resizable analysis panel"
    >
      {!state.limits.mobile && (
        <div
          className={"ff-interaction-resize-handle"}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize analysis panel"
          aria-controls={id}
          aria-valuemin={Math.round(state.limits.min)}
          aria-valuemax={Math.round(state.limits.max)}
          aria-valuenow={Math.round(state.width)}
          aria-valuetext={Math.round(state.width) + " pixels"}
          tabIndex={0}
          onDoubleClick={() => {
            controller.reset();
            persist();
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            controller.begin(e.clientX);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => controller.update(e.clientX)}
          onPointerUp={(e) => {
            controller.end();
            persist();
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => controller.cancel()}
          onLostPointerCapture={() => controller.cancel()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              controller.cancel();
              return;
            }
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
              return;
            e.preventDefault();
            controller.setWidth(
              e.key === "Home"
                ? state.limits.min
                : e.key === "End"
                  ? state.limits.max
                  : state.width +
                    (e.key === "ArrowLeft" ? 1 : -1) * (e.shiftKey ? 32 : 16),
            );
            persist();
          }}
        >
          <span />
        </div>
      )}
      <div className={"ff-interaction-panel-tools"}>
        <span>Analysis</span>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            controller.reset();
            try {
              localStorage.removeItem(storageKey);
            } catch {}
          }}
        >
          Reset width
        </button>
      </div>
      <div id={id} className={"ff-interaction-panel-content"}>
        {children}
      </div>
    </aside>
  );
}
