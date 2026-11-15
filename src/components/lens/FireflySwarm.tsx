"use client";

import { useEffect, useRef } from "react";
import { Lume } from "@/components/firefly/Lume";

/** How far the flies may stray outside the window, in px (the layer's inset). */
const PAD = 40;
const SIZES = [24, 20, 22];

interface Fly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Where on the window's outline the fly is heading, 0 to 1 clockwise. */
  t: number;
  /** +1 or -1: which way round it drifts. */
  dir: number;
  tx: number;
  ty: number;
  speed: number;
  /** Time (s) at which it gives up on the target and picks another. */
  until: number;
  phase: number;
  facing: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** A point near the window's outline: `t` along it, `out` px outside it. */
function ring(t: number, out: number, w: number, h: number) {
  const iw = w - PAD * 2;
  const ih = h - PAD * 2;
  const p = (((t % 1) + 1) % 1) * 2 * (iw + ih);
  const x0 = PAD - out;
  const y0 = PAD - out;
  const x1 = w - PAD + out;
  const y1 = h - PAD + out;
  if (p < iw) return { x: PAD + p, y: y0 };
  if (p < iw + ih) return { x: x1, y: PAD + p - iw };
  if (p < 2 * iw + ih) return { x: w - PAD - (p - iw - ih), y: y1 };
  return { x: x0, y: h - PAD - (p - 2 * iw - ih) };
}

function retarget(f: Fly, now: number, w: number, h: number) {
  // Now and then a fly hangs in the air for a moment, as fireflies do.
  if (Math.random() < 0.18) {
    f.tx = f.x + rand(-8, 8);
    f.ty = f.y + rand(-8, 8);
    f.speed = rand(14, 24);
    f.until = now + rand(0.5, 1.1);
    return;
  }
  if (Math.random() < 0.22) f.dir = -f.dir;
  f.t += f.dir * rand(0.05, 0.16);
  const p = ring(f.t, rand(-4, 30), w, h);
  f.tx = p.x;
  f.ty = p.y;
  f.speed = rand(60, 130);
  f.until = now + rand(1.2, 2.6);
}

/**
 * Three fireflies that wander around the assistant's window while it thinks:
 * each steers toward a new nearby point on a loose ring round the window,
 * with a sideways flutter, pauses now and then and turns back at random.
 * The window's edges push them away, so they skirt it rather than cross it.
 * The loop runs only while `active`; under reduced motion they sit still.
 */
export function FireflySwarm({ active }: { active: boolean }) {
  const layer = useRef<HTMLDivElement>(null);
  const els = useRef<(HTMLSpanElement | null)[]>([]);
  const swarm = useRef<{ w: number; h: number; flies: Fly[] } | null>(null);

  useEffect(() => {
    const box = layer.current;
    if (!box) return;
    let w = box.clientWidth;
    let h = box.clientHeight;
    const draw = (f: Fly, el: HTMLSpanElement | null, i: number, tilt: number) => {
      if (!el) return;
      const s = SIZES[i];
      el.style.transform = `translate3d(${(f.x - s / 2).toFixed(1)}px, ${(f.y - s / 2).toFixed(1)}px, 0) rotate(${tilt.toFixed(1)}deg) scaleX(${f.facing})`;
    };
    const start = (i: number): Fly => {
      const t = i / SIZES.length + rand(0, 0.12);
      const p = ring(t, rand(6, 20), w, h);
      return { ...p, vx: 0, vy: 0, t, dir: i % 2 ? -1 : 1, tx: p.x, ty: p.y, speed: 0, until: 0, phase: rand(0, 6.28), facing: 1 };
    };
    if (!active) return;
    // The flies keep their place between thinking spells, so a fade never jumps;
    // they are placed afresh only when the window has changed shape meanwhile.
    const placed = swarm.current;
    if (!placed || Math.abs(placed.w - w) > 24 || Math.abs(placed.h - h) > 24) {
      swarm.current = { w, h, flies: SIZES.map((_, i) => start(i)) };
      swarm.current.flies.forEach((f, i) => draw(f, els.current[i], i, 0));
    }
    const flies = swarm.current!.flies;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const resize = new ResizeObserver(() => {
      w = box.clientWidth;
      h = box.clientHeight;
    });
    resize.observe(box);
    let frame = 0;
    let last = performance.now();
    const tick = (ms: number) => {
      const dt = Math.min(0.05, (ms - last) / 1000);
      last = ms;
      const now = ms / 1000;
      flies.forEach((f, i) => {
        const dx = f.tx - f.x;
        const dy = f.ty - f.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 10 || now > f.until) retarget(f, now, w, h);
        // Steer toward the target; the lag gives the curved, unhurried path.
        const k = Math.min(1, dt * 2.6);
        f.vx += ((dx / (dist || 1)) * f.speed - f.vx) * k;
        f.vy += ((dy / (dist || 1)) * f.speed - f.vy) * k;
        // The window pushes back near its edges, so flies skirt it instead of
        // cutting across the text (a straight line between two targets would).
        const edge = Math.min(f.x - PAD, w - PAD - f.x, f.y - PAD, h - PAD - f.y);
        if (edge > -14) {
          const push = (edge + 14) * 25 * dt;
          if (edge === f.x - PAD) f.vx -= push;
          else if (edge === w - PAD - f.x) f.vx += push;
          else if (edge === f.y - PAD) f.vy -= push;
          else f.vy += push;
        }
        // A sideways flutter across the line of flight.
        const v = Math.hypot(f.vx, f.vy) || 1;
        const flutter = Math.sin(now * 5.3 + f.phase) * 26 + Math.sin(now * 2.1 + f.phase * 2) * 14;
        f.x += (f.vx + (-f.vy / v) * flutter) * dt;
        f.y += (f.vy + (f.vx / v) * flutter) * dt;
        // Face the way it flies, never upside down.
        if (Math.abs(f.vx) > 8) f.facing = f.vx < 0 ? -1 : 1;
        const tilt = Math.max(-35, Math.min(35, (Math.atan2(f.vy, Math.abs(f.vx)) * 180) / Math.PI)) * f.facing;
        draw(f, els.current[i], i, tilt);
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
    };
  }, [active]);

  return (
    <div ref={layer} className="assistant-fireflies" aria-hidden="true">
      {SIZES.map((size, i) => (
        <span
          key={i}
          ref={(el) => {
            els.current[i] = el;
          }}
          className="assistant-firefly"
        >
          <Lume size={size} />
        </span>
      ))}
    </div>
  );
}
