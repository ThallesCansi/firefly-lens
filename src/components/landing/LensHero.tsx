"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Lume } from "@/components/firefly/Lume";
import { WORLD_PATH } from "@/lib/geo/worldOutline";

/** One illustrative grid cell on screen, with the detections each sensor put in it. */
interface Point {
  x: number;
  y: number;
  modis: number;
  viirs: number;
}

/** Where the world tends to burn, as cluster centres: lon, lat, spread in degrees, weight. */
const FIRE_BELTS: [number, number, number, number][] = [
  [-55, -11, 5, 1], // arc of deforestation
  [-46, -8, 3.5, 0.8], // Matopiba
  [-62, -10, 3, 0.8], // Rondônia and Acre
  [-58, -17, 3, 0.7], // Pantanal and eastern Bolivia
  [-60, -25, 3, 0.5], // Chaco
  [-72, 6, 3, 0.45], // Llanos
  [-90, 17, 3, 0.4], // Yucatán and Guatemala
  [-120, 40, 3, 0.25], // US West
  [-3, 10, 4, 0.6], // Sahel
  [9, 9, 4, 0.75], // Nigeria and Cameroon
  [24, 7, 5, 0.9], // Central African belt
  [22, -9, 6, 1], // Angola and Congo basin
  [31, -15, 4, 0.7], // Zambia and Mozambique
  [46, -18, 2, 0.4], // Madagascar
  [79, 22, 4, 0.35], // central India
  [100, 18, 4, 0.6], // mainland Southeast Asia
  [112, -1, 3, 0.5], // Borneo and Sumatra
  [132, -15, 6, 0.6], // northern Australia
  [122, 58, 7, 0.35], // Siberia
];

/** A fixed mock set: the same points on every visit, kept on land. */
function mockDetections(land: Path2D): { lon: number; lat: number; modis: number; viirs: number }[] {
  const probe = document.createElement("canvas").getContext("2d")!;
  const rand = (i: number, k: number) => {
    const v = Math.sin((i + 1) * 91.345 * k) * 43758.5453;
    return v - Math.floor(v);
  };
  const STEP = 1.25; // degrees per grid cell
  const cells = new Map<string, { lon: number; lat: number; modis: number; viirs: number }>();
  let seed = 0;
  for (const [lon0, lat0, spread, weight] of FIRE_BELTS) {
    const n = Math.round(60 * weight);
    for (let i = 0; i < n; i++, seed++) {
      // A rough bell shape: the sum of two uniforms, so belts thin out at the edges.
      const lon = lon0 + (rand(seed, 1) + rand(seed, 2) - 1) * spread * 1.7;
      const lat = lat0 + (rand(seed, 3) + rand(seed, 4) - 1) * spread * 1.3;
      const gx = Math.floor(lon / STEP);
      const gy = Math.floor(lat / STEP);
      const key = `${gx}:${gy}`;
      let cell = cells.get(key);
      if (!cell) {
        // Sit off the cell centre, so the marks read as places, not a lattice.
        const cx = (gx + 0.5 + (rand(gx * 31 + gy, 6) - 0.5) * 0.7) * STEP;
        const cy = (gy + 0.5 + (rand(gy * 17 + gx, 7) - 0.5) * 0.7) * STEP;
        if (!probe.isPointInPath(land, cx + 180, 90 - cy)) continue;
        cell = { lon: cx, lat: cy, modis: 0, viirs: 0 };
        cells.set(key, cell);
      }
      const heat = rand(seed, 5);
      cell.viirs += 1 + Math.round(heat * heat * 5 * weight);
      // MODIS misses the small fires VIIRS catches.
      if (heat > 0.5) cell.modis += 1 + Math.round((heat - 0.5) * 4 * weight);
    }
  }
  return [...cells.values()];
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
 * The first screen is the product in miniature: a field of fireflies, and a
 * lens that uncovers the world map beneath them with what two satellites saw.
 * The marks are a fixed illustrative set placed on the world's fire belts;
 * the counts beside the lens are the detections in the cells inside it.
 */
export function LensHero() {
  const section = useRef<HTMLElement>(null);
  const swarm = useRef<HTMLCanvasElement>(null);
  const embers = useRef<HTMLCanvasElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const modisOut = useRef<HTMLSpanElement>(null);
  const viirsOut = useRef<HTMLSpanElement>(null);
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
    let k = 1; // screen pixels per degree
    let ox = 0; // screen x of longitude −180
    let oy = 0; // screen y of latitude 90
    const land = new Path2D(WORLD_PATH);
    const fires = mockDetections(land);
    const css = getComputedStyle(document.documentElement);
    let ink = "#eef0e6";
    let modisColor = "#3f8fe6";
    let viirsColor = "#d9569a";
    const readColors = () => {
      ink = css.getPropertyValue("--color-ink").trim() || ink;
      modisColor = css.getPropertyValue("--color-modis").trim() || modisColor;
      viirsColor = css.getPropertyValue("--color-viirs").trim() || viirsColor;
    };
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

    /** Every horizontal copy of the world that touches the screen. */
    const copies = () => {
      const span = 360 * k;
      const out: number[] = [];
      for (let x = ox - Math.ceil(ox / span) * span; x < w; x += span) out.push(x);
      return out;
    };

    const drawEmbers = () => {
      ectx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ectx.clearRect(0, 0, w, h);

      // Graticule every 10°, then the land: the world map the lens reveals.
      ectx.strokeStyle = ink;
      ectx.globalAlpha = 0.06;
      ectx.lineWidth = 1;
      ectx.beginPath();
      for (const x0 of copies()) {
        for (let lon = 0; lon < 360; lon += 10) {
          const x = Math.round(x0 + lon * k) + 0.5;
          ectx.moveTo(x, 0);
          ectx.lineTo(x, h);
        }
      }
      for (let lat = 80; lat > -90; lat -= 10) {
        const y = Math.round(oy + (90 - lat) * k) + 0.5;
        ectx.moveTo(0, y);
        ectx.lineTo(w, y);
      }
      ectx.stroke();

      for (const x0 of copies()) {
        ectx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x0, dpr * oy);
        ectx.fillStyle = ink;
        ectx.globalAlpha = 0.07;
        ectx.fill(land);
        ectx.globalAlpha = 0.34;
        ectx.lineWidth = 1 / k;
        ectx.stroke(land);
      }
      ectx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ectx.globalAlpha = 1;

      const topM = Math.max(1, ...points.map((p) => p.modis));
      const topV = Math.max(1, ...points.map((p) => p.viirs));
      for (const p of points) {
        if (p.modis > 0) {
          ectx.beginPath();
          ectx.arc(p.x, p.y, 3 + 7 * Math.sqrt(p.modis / topM), 0, Math.PI * 2);
          ectx.strokeStyle = modisColor;
          ectx.lineWidth = 1.5;
          ectx.stroke();
        }
        if (p.viirs > 0) {
          ectx.beginPath();
          ectx.arc(p.x, p.y, 1.6 + 4 * Math.sqrt(p.viirs / topV), 0, Math.PI * 2);
          ectx.fillStyle = viirsColor;
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

      // Plate carrée, scaled so the lens at rest frames central Brazil.
      readColors();
      k = Math.max(1600, w * 2.2) / 360;
      const rest = home();
      ox = rest.x - (-54 + 180) * k;
      oy = rest.y - (90 - -11) * k;
      points = [];
      for (const x0 of copies()) {
        for (const f of fires) {
          const x = x0 + (f.lon + 180) * k;
          const y = oy + (90 - f.lat) * k;
          if (x > -20 && x < w + 20 && y > -20 && y < h + 20) points.push({ x, y, modis: f.modis, viirs: f.viirs });
        }
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
    // The theme toggle swaps the colour tokens; redraw the map in the new ones.
    const themeWatch = new MutationObserver(() => {
      readColors();
      drawEmbers();
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    if (!still) raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeWatch.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, []);

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
            See when a fire season turns unusual
          </h1>
          <p className="rise mt-5 max-w-[32rem] text-lg text-dim" style={{ ["--i" as string]: 1 }}>
            Pick any patch of Brazil, a farm, a park or a whole biome, and read 24 years of fire as one calendar. Days
            that burn far above their season get a ring, so a brigade, a researcher or a reporter can tell a normal dry
            season from a dangerous one.
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
            The points under the lens are illustrative. The Lens itself runs on NASA FIRMS records.
          </p>
        </div>
      </div>
    </section>
  );
}
