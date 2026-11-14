"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

export interface TabOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Segmented control with a sliding pill (transitions.dev "Tabs sliding").
 * The pill's position is measured from the active tab; CSS owns the tween.
 */
export function SegmentedTabs<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const first = useRef(true);

  const place = useCallback((animate: boolean) => {
    const tab = bar.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    const p = pill.current;
    if (!tab || !p) return;
    if (!animate) p.style.transition = "none";
    p.style.transform = `translateX(${tab.offsetLeft}px)`;
    p.style.width = `${tab.offsetWidth}px`;
    if (!animate) {
      void p.offsetWidth;
      p.style.transition = "";
    }
  }, []);

  useLayoutEffect(() => {
    place(!first.current);
    first.current = false;
  }, [value, place]);

  useEffect(() => {
    const snap = () => place(false);
    window.addEventListener("resize", snap);
    document.fonts?.ready.then(snap);
    return () => window.removeEventListener("resize", snap);
  }, [place]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const at = options.findIndex((o) => o.value === value);
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = options[(at + step + options.length) % options.length];
    onChange(next.value);
    requestAnimationFrame(() =>
      bar.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(),
    );
  };

  return (
    <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
      <div ref={bar} className="t-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        <span ref={pill} className="t-tabs-pill" aria-hidden="true" />
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="tab"
            className="t-tab"
            aria-selected={o.value === value}
            tabIndex={o.value === value ? 0 : -1}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
