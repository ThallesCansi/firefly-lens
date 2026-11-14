"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A value that cross-blurs to its new text in place (transitions.dev
 * "Text swap soft"). Screen readers get the plain current value.
 */
export function SoftText({ value, align = "start", className = "" }: { value: string; align?: "start" | "end"; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const [initial] = useState(value);
  const shown = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const node = el.current;
    if (!node || shown.current === value) return;
    const prev = shown.current;
    shown.current = value;
    clearTimeout(timer.current);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.textContent = value;
      return;
    }

    const out = document.createElement("span");
    out.className = "t-text-soft-old";
    out.setAttribute("aria-hidden", "true");
    out.textContent = prev;
    const inn = document.createElement("span");
    inn.className = "t-text-soft-new";
    inn.textContent = value;

    const w0 = node.getBoundingClientRect().width;
    node.classList.remove("is-swapping");
    node.replaceChildren(out, inn);
    const w1 = inn.getBoundingClientRect().width;
    node.style.width = `${w0}px`;
    void node.offsetWidth;
    node.classList.add("is-swapping");
    node.style.width = `${w1}px`;

    timer.current = setTimeout(() => {
      node.classList.remove("is-swapping");
      node.style.removeProperty("width");
      node.textContent = value;
    }, 280);
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <span
      ref={el}
      className={`t-text-soft ${className}`}
      style={{ ["--text-soft-align" as string]: align }}
      suppressHydrationWarning
    >
      {initial}
    </span>
  );
}
