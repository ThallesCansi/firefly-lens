"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export interface PickerOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * A compact select: a button that opens a short list which scrolls, rather
 * than the browser's own menu, which for years and months grows into a tall
 * column. Keyboard: arrows, Home/End, Enter or Space to choose, Esc to close.
 */
export function Picker({
  value,
  options,
  onChange,
  label,
  className = "field",
  placement = "down",
  title,
}: {
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  /** Accessible name, e.g. "Map month". */
  label: string;
  /** Classes for the button, so it matches the fields around it. */
  className?: string;
  /** Open above the button when it sits near the bottom of the screen. */
  placement?: "down" | "up";
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(value);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value);
  const optionId = (v: string) => `${id}-${v}`;

  // Close on a press anywhere else.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  // On opening, focus the list with the chosen option in the middle of it.
  useEffect(() => {
    if (!open) return;
    list.current?.focus({ preventScroll: true });
    const el = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && list.current) list.current.scrollTop = el.offsetTop - list.current.clientHeight / 2 + el.offsetHeight / 2;
  }, [open]);

  // Keep the keyboard's option in view.
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);

  const show = () => {
    setActive(value);
    setOpen(true);
  };
  const close = (focus = true) => {
    setOpen(false);
    if (focus) button.current?.focus();
  };
  const choose = (v: string) => {
    if (v !== value) onChange(v);
    close();
  };
  const move = (step: number) => {
    const enabled = options.filter((o) => !o.disabled);
    const at = enabled.findIndex((o) => o.value === active);
    const next = enabled[Math.min(enabled.length - 1, Math.max(0, at + step))];
    if (next) setActive(next.value);
  };

  const onListKey = (e: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      PageDown: () => move(5),
      PageUp: () => move(-5),
      Home: () => move(-options.length),
      End: () => move(options.length),
      Enter: () => choose(active),
      " ": () => choose(active),
      Escape: () => close(),
      Tab: () => close(false),
    };
    const run = keys[e.key];
    if (!run) return;
    if (e.key !== "Tab") e.preventDefault();
    // Esc closes the list only, not the panel around it.
    if (e.key === "Escape") e.stopPropagation();
    run();
  };

  return (
    <div ref={root} className="picker" data-open={open}>
      <button
        ref={button}
        type="button"
        className={`picker-button ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? value}`}
        title={title}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
      >
        <span>{current?.label ?? value}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          ref={list}
          className="picker-list"
          data-placement={placement}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={optionId(active)}
          onKeyDown={onListKey}
        >
          {options.map((o) => (
            <li
              key={o.value}
              id={optionId(o.value)}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              data-active={o.value === active}
              onPointerMove={() => !o.disabled && setActive(o.value)}
              onClick={() => !o.disabled && choose(o.value)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
