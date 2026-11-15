"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lume } from "@/components/firefly/Lume";

/** Where FireFlighter sits in the tour card: an empty, sized placeholder. */
export const PERCH = ".lume-tour-card .lume-tour-mascot";

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * FireFlighter, flying. The tour card moves from one control to the next at
 * once; the firefly does not. It lives above the page and, whenever its perch
 * in the card moves, flies there on a gentle arc, wings beating, facing where
 * it goes. Without motion it simply sits on the perch.
 */
export function TourFirefly({
  mood = "idle",
  from,
  onPosition,
}: {
  mood?: "idle" | "alert";
  /** Screen position to take off from, e.g. where it landed on the previous page. */
  from?: [number, number];
  /** The firefly's current position, for a flight that continues on another page. */
  onPosition?: (at: [number, number]) => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const report = useRef(onPosition);
  useEffect(() => { report.current = onPosition; });
  const start = useRef(from);
  // Driver shows its card in the browser's top layer; the firefly joins it
  // there (no z-index reaches above the top layer), or the page before that.
  const [host] = useState(() => {
    const el = document.createElement("div");
    el.className = "lume-tour-flier-host";
    return el;
  });
  useEffect(() => () => host.remove(), [host]);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    let pos: [number, number] | null = start.current ?? null;
    let facing = 1;
    let flight: { from: [number, number]; begin: number; duration: number; lift: number } | null = null;
    let frame = 0;

    const place = (x: number, y: number, flying: boolean, bank = 0) => {
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${bank}deg) scaleX(${facing})`;
      el.dataset.flying = String(flying);
      el.style.opacity = "1";
      pos = [x, y];
      report.current?.(pos);
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const layer = document.querySelector(".driver-layer") ?? document.body;
      if (host.parentElement !== layer) layer.appendChild(host);
      const perch = document.querySelector<HTMLElement>(PERCH);
      const box = perch?.getBoundingClientRect();
      if (!box || !box.width) {
        if (!pos) el.style.opacity = "0";
        return;
      }
      const target: [number, number] = [box.left, box.top];
      if (!pos || still.matches) return place(target[0], target[1], false);
      const distance = Math.hypot(target[0] - pos[0], target[1] - pos[1]);
      if (!flight && distance > 24) {
        // Longer trips take a little longer, never long enough to wait for.
        flight = { from: pos, begin: now, duration: Math.min(1300, 520 + distance * 0.75), lift: Math.min(140, 40 + distance * 0.22) };
        facing = target[0] >= pos[0] ? 1 : -1;
      }
      if (!flight) return place(target[0], target[1], false);
      const t = Math.min(1, (now - flight.begin) / flight.duration);
      const k = ease(t);
      // A quadratic arc towards wherever the perch is now, lifted in the middle.
      const [x0, y0] = flight.from;
      const cx = (x0 + target[0]) / 2;
      const cy = Math.min(y0, target[1]) - flight.lift;
      const x = (1 - k) ** 2 * x0 + 2 * (1 - k) * k * cx + k * k * target[0];
      const y = (1 - k) ** 2 * y0 + 2 * (1 - k) * k * cy + k * k * target[1] + Math.sin(t * Math.PI * 6) * 3 * (1 - t);
      const bank = Math.sin(t * Math.PI) * 10;
      if (t >= 1) {
        flight = null;
        facing = 1;
        return place(target[0], target[1], false);
      }
      place(x, y, true, bank);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [host]);

  return createPortal(
    <div ref={body} className="lume-tour-flier" aria-hidden="true" data-flying="false">
      <Lume size={72} mood={mood} />
    </div>,
    host,
  );
}
