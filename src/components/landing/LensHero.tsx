"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Lume } from "@/components/firefly/Lume";
import { fireData } from "@/lib/data/source";
import { shortDate } from "@/lib/format";
import { useYearData } from "@/lib/useYearData";

/** One 0.25° grid cell on the peak day: MODIS Aqua and VIIRS NOAA-20 detections in it. */
interface Point {
  x: number;
  y: number;
  modis: number;
  viirs: number;
}

interface Fly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  rate: number;
  size: number;
}

/**
 * The first screen is the product in miniature: a dark field, and a lens that
 * shows what two satellites saw underneath it on one day. Each mark is one
 * 0.25° grid cell of real NASA FIRMS detections; the counts beside the lens
 * are the detections in the cells inside it.
 */
export function LensHero() {
  const section = useRef<HTMLElement>(null);
  const swarm = useRef<HTMLCanvasElement>(null);
  const embers = useRef<HTMLCanvasElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const modisOut = useRef<HTMLSpanElement>(null);
  const viirsOut = useRef<HTMLSpanElement>(null);
  const { data } = useYearData("amazon");

  const peak = data?.peak ?? null;

  useEffect(() => {
    const host = section.current;
    const swarmCanvas = swarm.current;
    const emberCanvas = embers.current;
    const ringEl = ring.current;
    if (!host || !swarmCanvas || !emberCanvas || !ringEl) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const sctx = swarmCanvas.getContext("2d")!;
    const ectx = emberCanvas.getContext("2d")!;

    let w = 0;
    let h = 0;
    let radius = 120;
    let points: Point[] = [];
    let flies: Fly[] = [];
    const lens = { x: 0, y: 0 };
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    let raf = 0;

    // One soft point of light, drawn once and stamped for every firefly.
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 64;
    const g = sprite.getContext("2d")!;
    const glow = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, "rgba(255,214,140,1)");
    glow.addColorStop(0.18, "rgba(255,176,32,0.75)");
    glow.addColorStop(1, "rgba(255,176,32,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, 64, 64);

    const home = () => (w < 768 ? { x: w * 0.5, y: h * 0.72 } : { x: w * 0.69, y: h * 0.52 });

    const drawEmbers = () => {
      ectx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ectx.clearRect(0, 0, w, h);
      // The shared grid shows under the lens too.
      ectx.strokeStyle = "rgba(238,240,230,0.09)";
      ectx.lineWidth = 1;
      ectx.beginPath();
      for (let x = 0.5; x < w; x += 44) {
        ectx.moveTo(x, 0);
        ectx.lineTo(x, h);
      }
      for (let y = 0.5; y < h; y += 44) {
        ectx.moveTo(0, y);
        ectx.lineTo(w, y);
      }
      ectx.stroke();
      const topM = Math.max(1, ...points.map((p) => p.modis));
      const topV = Math.max(1, ...points.map((p) => p.viirs));
      for (const p of points) {
        if (p.modis > 0) {
          ectx.beginPath();
          ectx.arc(p.x, p.y, 3 + 9 * Math.sqrt(p.modis / topM), 0, Math.PI * 2);
          ectx.strokeStyle = "#3f8fe6";
          ectx.lineWidth = 1.5;
          ectx.stroke();
        }
        if (p.viirs > 0) {
          ectx.beginPath();
          ectx.arc(p.x, p.y, 1.6 + 5 * Math.sqrt(p.viirs / topV), 0, Math.PI * 2);
          ectx.fillStyle = "#d9569a";
          ectx.fill();
        }
      }
    };

    const layout = () => {
      const box = host.getBoundingClientRect();
      w = box.width;
      h = box.height;
      radius = w < 768 ? 88 : 128;
      for (const c of [swarmCanvas, emberCanvas]) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      host.style.setProperty("--lens-r", `${radius}px`);

      if (data && peak) {
        const [west, south, east, north] = fireData.presets()[0].bbox;
        const day = data.peakCells.map((c) => ({
          u: (c.lon - west) / (east - west),
          v: (north - c.lat) / (north - south),
          modis: c.modis,
          viirs: c.viirs,
        }));
        // Frame the map so the busiest fire front sits where the lens rests.
        const bins = new Map<string, number>();
        let busiest = { u: 0.5, v: 0.5, n: 0 };
        for (const p of day) {
          const key = `${Math.floor(p.u * 8)}:${Math.floor(p.v * 6)}`;
          const n = (bins.get(key) ?? 0) + p.modis + p.viirs;
          bins.set(key, n);
          if (n > busiest.n) busiest = { u: (Math.floor(p.u * 8) + 0.5) / 8, v: (Math.floor(p.v * 6) + 0.5) / 6, n };
        }
        const rest = home();
        const zoom = 1.5;
        points = day
          .map((p) => ({
            x: rest.x + (p.u - busiest.u) * w * zoom,
            y: rest.y + (p.v - busiest.v) * h * zoom,
            modis: p.modis,
            viirs: p.viirs,
          }))
          .filter((p) => p.x > -20 && p.x < w + 20 && p.y > -20 && p.y < h + 20);
      }

      const n = Math.min(70, Math.round((w * h) / 26000));
      flies = Array.from({ length: n }, (_, i) => {
        const r = (k: number) => {
          const v = Math.sin((i + 1) * 12.9898 * k) * 43758.5453;
          return v - Math.floor(v);
        };
        return {
          x: r(1) * w,
          y: r(2) * h,
          vx: (r(3) - 0.5) * 0.3,
          vy: (r(4) - 0.5) * 0.22,
          phase: r(5) * Math.PI * 2,
          rate: 0.5 + r(6) * 0.9,
          size: 5 + r(7) * 9,
        };
      });

      const at = home();
      lens.x = at.x;
      lens.y = at.y;
      drawEmbers();
      place();
      drawSwarm(0);
    };

    const place = () => {
      host.style.setProperty("--lens-x", `${lens.x}px`);
      host.style.setProperty("--lens-y", `${lens.y}px`);
      ringEl.style.transform = `translate3d(${lens.x - radius}px, ${lens.y - radius}px, 0)`;
      let modis = 0;
      let viirs = 0;
      const r2 = radius * radius;
      for (const p of points) {
        const dx = p.x - lens.x;
        const dy = p.y - lens.y;
        if (dx * dx + dy * dy <= r2) {
          modis += p.modis;
          viirs += p.viirs;
        }
      }
      if (modisOut.current) modisOut.current.textContent = String(modis);
      if (viirsOut.current) viirsOut.current.textContent = String(viirs);
    };

    const drawSwarm = (t: number) => {
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sctx.clearRect(0, 0, w, h);
      for (const f of flies) {
        // Fireflies flash, they do not fade evenly: a sharp rise and a slow decay.
        const beat = Math.sin(t * 0.001 * f.rate + f.phase);
        const light = still ? 0.6 : Math.max(0, beat) ** 3;
        sctx.globalAlpha = 0.12 + light * 0.88;
        const s = f.size * (0.7 + light * 0.9);
        sctx.drawImage(sprite, f.x - s, f.y - s, s * 2, s * 2);
      }
      sctx.globalAlpha = 1;
    };

    const tick = (t: number) => {
      frame++;
      for (const f of flies) {
        f.x += f.vx + Math.sin(t * 0.0004 + f.phase) * 0.12;
        f.y += f.vy + Math.cos(t * 0.0005 + f.phase) * 0.1;
        if (f.x < -20) f.x = w + 20;
        if (f.x > w + 20) f.x = -20;
        if (f.y < -20) f.y = h + 20;
        if (f.y > h + 20) f.y = -20;
      }
      drawSwarm(t);

      const base = home();
      const wander = w < 768 ? { x: w * 0.3, y: h * 0.13 } : { x: w * 0.22, y: h * 0.27 };
      const goal = pointer ?? {
        x: base.x + Math.sin(t * 0.00023) * wander.x,
        y: base.y + Math.sin(t * 0.00031 + 1) * wander.y,
      };
      const ease = pointer ? 0.16 : 0.035;
      lens.x += (goal.x - lens.x) * ease;
      lens.y += (goal.y - lens.y) * ease;
      if (frame % 2 === 0) place();
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const box = host.getBoundingClientRect();
      pointer = { x: e.clientX - box.left, y: e.clientY - box.top };
      if (still) {
        lens.x = pointer.x;
        lens.y = pointer.y;
        place();
      }
    };
    const onLeave = () => {
      pointer = null;
    };

    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(host);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    if (!still) raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [data, peak]);

  return (
    <section
      ref={section}
      className="relative isolate flex min-h-[max(100svh,40rem)] flex-col overflow-hidden"
      aria-labelledby="hero-title"
    >
      <canvas ref={swarm} aria-hidden="true" className="absolute inset-0 -z-10 size-full" />
      <canvas
        ref={embers}
        aria-hidden="true"
        className="absolute inset-0 -z-10 size-full bg-canopy"
        style={{
          maskImage: "radial-gradient(circle var(--lens-r) at var(--lens-x) var(--lens-y), #000 99%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(circle var(--lens-r) at var(--lens-x) var(--lens-y), #000 99%, transparent 100%)",
        }}
      />

      {/* The lens: Lume carries it. */}
      <div
        ref={ring}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 -z-10 rounded-full border border-lume/80 will-change-transform"
        style={{ width: "calc(var(--lens-r) * 2)", height: "calc(var(--lens-r) * 2)" }}
      >
        <Lume size={56} className="absolute -right-5 -top-6" />
        <p className="absolute left-1/2 top-full mt-3 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap text-[0.8125rem] text-dim">
          <span className="inline-flex items-center gap-1.5">
            <span className="block size-3 rounded-full border-[1.5px] border-modis" />
            MODIS <span ref={modisOut} className="num text-ink">0</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="block size-1.5 rounded-full bg-viirs" />
            VIIRS <span ref={viirsOut} className="num text-ink">0</span>
          </span>
        </p>
      </div>

      <div className="wrap flex flex-1 flex-col justify-start pb-16 pt-28 md:justify-end md:pb-24">
        <div className="max-w-[35rem]">
          <h1 id="hero-title" className="rise text-[2.5rem] leading-[1.02] md:text-[4.25rem]" style={{ ["--i" as string]: 0 }}>
            One fire calendar from two satellite sensors
          </h1>
          <p className="rise mt-5 max-w-[32rem] text-lg text-dim" style={{ ["--i" as string]: 1 }}>
            MODIS sees fire in 1 km pixels and VIIRS in 375 m pixels, so their counts never match. FireFly Lens converts
            VIIRS to the MODIS scale and shows 24 years of burning in Brazil as one calendar, from real NASA records.
          </p>
          <div className="rise mt-7 flex flex-wrap gap-3" style={{ ["--i" as string]: 2 }}>
            <Link href="/lens" className="btn btn-primary">
              Open the Lens
            </Link>
            <Link href="/method" className="btn btn-quiet bg-night">
              Read the method
            </Link>
          </div>
          <p className="rise mt-8 text-[0.875rem] text-faint" style={{ ["--i" as string]: 3 }}>
            Under the lens: the Southern Amazon{peak ? ` on ${shortDate(peak)}` : ""}, NASA FIRMS detections per 0.25° cell.
          </p>
        </div>
      </div>
    </section>
  );
}
