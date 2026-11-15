"use client";

import { useEffect, useRef } from "react";

/** A small seeded generator, so the sky is the same on every visit and every resize. */
function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TINTS = ["255,255,255", "223,232,255", "205,220,255", "255,244,224", "255,226,196"];

/**
 * Paints the night sky once: scattered stars, a faint band of the Milky Way and
 * a few bright stars with a halo. It redraws only when the map changes size, so
 * the globe turns over a still picture and the page does no work per frame.
 */
function paint(canvas: HTMLCanvasElement) {
  const { clientWidth: w, clientHeight: h } = canvas;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const rnd = random(20260415);
  const tint = () => TINTS[Math.floor(rnd() * TINTS.length)];

  // The Milky Way: a soft diagonal glow, then a dust of faint stars along it.
  const band = (t: number) => ({ x: t * w, y: h * (0.95 - 0.8 * t) });
  for (let i = 0; i < 7; i++) {
    const { x, y } = band(0.08 + i * 0.14);
    const r = Math.max(w, h) * (0.16 + rnd() * 0.08);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const hue = i % 2 ? "120,140,220" : "150,120,200";
    g.addColorStop(0, `rgba(${hue},0.075)`);
    g.addColorStop(1, `rgba(${hue},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const area = w * h;
  const dust = Math.round(area / 2600);
  for (let i = 0; i < dust; i++) {
    const { x, y } = band(rnd());
    // Roughly normal spread across the band.
    const off = (rnd() + rnd() + rnd() - 1.5) * Math.min(w, h) * 0.22;
    ctx.fillStyle = `rgba(${tint()},${0.12 + rnd() * 0.3})`;
    ctx.beginPath();
    ctx.arc(x + off * 0.62, y + off * 0.78, 0.3 + rnd() * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // Field stars: mostly faint, some clearer.
  const field = Math.round(area / 2100);
  for (let i = 0; i < field; i++) {
    const big = rnd() < 0.12;
    ctx.fillStyle = `rgba(${tint()},${big ? 0.6 + rnd() * 0.35 : 0.2 + rnd() * 0.4})`;
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, big ? 0.85 + rnd() * 0.55 : 0.35 + rnd() * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // A handful of bright stars with a halo.
  const bright = Math.max(6, Math.round(area / 90000));
  for (let i = 0; i < bright; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const c = tint();
    const r = 3 + rnd() * 4;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${c},0.9)`);
    g.addColorStop(0.25, `rgba(${c},0.28)`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Stars that twinkle: few, so the effect stays cheap (opacity only). */
const TWINKLE = Array.from({ length: 16 }, (_, i) => {
  const rnd = random(i * 7919 + 13);
  return {
    left: `${(rnd() * 100).toFixed(2)}%`,
    top: `${(rnd() * 100).toFixed(2)}%`,
    size: 1.5 + rnd() * 1.5,
    duration: `${(3 + rnd() * 4).toFixed(2)}s`,
    delay: `${(-rnd() * 7).toFixed(2)}s`,
  };
});

/** The space behind the globe. Decoration only: hidden from assistive technology and the pointer. */
export function Starfield() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let frame = 0;
    const redraw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => paint(el));
    };
    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div className="starfield" aria-hidden="true">
      <canvas ref={canvas} />
      {TWINKLE.map((s, i) => (
        <span
          key={i}
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDuration: s.duration,
            animationDelay: s.delay,
          }}
        />
      ))}
    </div>
  );
}
