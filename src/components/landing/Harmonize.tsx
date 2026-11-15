"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Lume } from "@/components/firefly/Lume";

/** A small, fixed sample: seven fires on a 400 px stage with a 50 px grid. */
const CELL = 50;
const FIRES = [
  { x: 82, y: 96, size: 5, modis: true },
  { x: 138, y: 118, size: 3, modis: true },
  { x: 268, y: 74, size: 2, modis: false },
  { x: 312, y: 176, size: 6, modis: true },
  { x: 196, y: 262, size: 4, modis: true },
  { x: 92, y: 318, size: 2, modis: false },
  { x: 330, y: 322, size: 3, modis: true },
];

const spin = (i: number, k: number) => {
  const v = Math.sin((i + 1) * 78.233 * k) * 43758.5453;
  return v - Math.floor(v);
};

// Rounded so server and browser print the same coordinates (Math.sin may differ in the last digits).
const r2 = (v: number) => Math.round(v * 100) / 100;
const VIIRS = FIRES.flatMap((f, i) =>
  Array.from({ length: f.size }, (_, k) => ({
    x: r2(f.x + (spin(i * 7 + k, 1) - 0.5) * 34),
    y: r2(f.y + (spin(i * 7 + k, 2) - 0.5) * 34),
  })),
);
const MODIS = FIRES.filter((f) => f.modis).map((f, i) => ({ x: r2(f.x + (spin(i, 3) - 0.5) * 16), y: r2(f.y + (spin(i, 4) - 0.5) * 16) }));

const cellsOf = (points: { x: number; y: number }[]) =>
  [...new Set(points.map((p) => `${Math.floor(p.x / CELL)}:${Math.floor(p.y / CELL)}`))].map((key) => {
    const [cx, cy] = key.split(":").map(Number);
    return { cx, cy };
  });
const MODIS_CELLS = cellsOf(MODIS);
const VIIRS_CELLS = cellsOf(VIIRS);

/** Reference busy days for the sample, so the scaled values are plain to follow. */
const MODIS_REF = 10;
const VIIRS_REF = 14;
const MODIS_SCALED = MODIS_CELLS.length / MODIS_REF;
const VIIRS_SCALED = VIIRS_CELLS.length / VIIRS_REF;
const DAY_INDEX = (MODIS_SCALED + VIIRS_SCALED) / 2;

const EMBER = ["var(--color-ember-0)", "var(--color-ember-1)", "var(--color-ember-2)", "var(--color-ember-3)", "var(--color-ember-4)", "var(--color-ember-5)"];
const MONTH = Array.from({ length: 35 }, (_, i) => Math.min(5, Math.floor(spin(i, 5) * 3 + (i > 12 && i < 27 ? 2.4 : 0))));
const TODAY = 17;

const STEPS = [
  {
    title: "Start from what each sensor reported",
    body: `On this day MODIS reported ${MODIS.length} detections and VIIRS ${VIIRS.length} over the same ground. Neither number is wrong, and neither is a count of fires.`,
  },
  {
    title: "Bring VIIRS to a 1 km view",
    body: `Several 375 m VIIRS pixels over one fire would count several times, so VIIRS is counted in cells: a cell is lit or it is not, however many pixels fell inside. In this sketch MODIS lights ${MODIS_CELLS.length} cells, VIIRS ${VIIRS_CELLS.length}. VIIRS still sees more: it catches smaller fires.`,
  },
  {
    title: "Put VIIRS on the MODIS scale",
    body: `A model learned from 2018 to 2023, when both flew over Brazil, turns each VIIRS count into the MODIS Aqua hot spots it stands for, by biome, month and day or night. On one scale the two agree, and the day gets one value: here ${DAY_INDEX.toFixed(2)} of the area's busy day.`,
  },
  {
    title: "Give the day its place in the year",
    body: "The day becomes one light in the calendar. Seen with its neighbours it shows the season building, and a day that burns far above the weeks around it gets a ring.",
  },
];

export function Harmonize() {
  const [step, setStep] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    // On a phone the stage is pinned to the top, so the reading line sits lower.
    const rootMargin = window.matchMedia("(min-width: 48rem)").matches ? "-45% 0px -45% 0px" : "-66% 0px -24% 0px";
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin },
    );
    items.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const show = (on: boolean) => ({ opacity: on ? 1 : 0, transition: "opacity 500ms var(--ease-smooth-out)" });

  return (
    <section aria-labelledby="harmonize-title" className="border-t border-line py-20 md:py-28">
      <div className="wrap">
        <h2 id="harmonize-title" className="max-w-[40rem] text-3xl md:text-5xl">
          Four steps from scattered points to one calendar
        </h2>

        <div className="mt-10 grid gap-8 md:mt-4 md:grid-cols-2 md:gap-16">
          <div className="sticky top-0 z-10 -mx-4 bg-night px-4 py-4 md:top-[12vh] md:mx-0 md:self-start md:px-0 md:py-12">
            <svg
              viewBox="0 0 400 400"
              className="mx-auto w-full max-w-[min(26rem,44svh)] rounded-xl bg-canopy md:max-w-[30rem]"
              role="img"
              aria-label={STEPS[step].title}
            >
              {/* shared grid and lit cells */}
              <g style={show(step === 1)}>
                {Array.from({ length: 9 }, (_, i) => (
                  <g key={i} stroke="var(--color-line)">
                    <line x1={i * CELL} x2={i * CELL} y1={0} y2={400} />
                    <line y1={i * CELL} y2={i * CELL} x1={0} x2={400} />
                  </g>
                ))}
                {VIIRS_CELLS.map((c) => (
                  <rect key={`v${c.cx}:${c.cy}`} x={c.cx * CELL + 3} y={c.cy * CELL + 3} width={CELL - 6} height={CELL - 6} rx={4} fill="var(--color-viirs)" fillOpacity={0.22} />
                ))}
                {MODIS_CELLS.map((c) => (
                  <rect key={`m${c.cx}:${c.cy}`} x={c.cx * CELL + 3} y={c.cy * CELL + 3} width={CELL - 6} height={CELL - 6} rx={4} fill="none" stroke="var(--color-modis)" strokeWidth={1.5} />
                ))}
              </g>

              {/* raw detections */}
              <g style={show(step <= 1)}>
                {MODIS.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={11} fill="none" stroke="var(--color-modis)" strokeWidth={2} />
                ))}
                {VIIRS.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={4} fill="var(--color-viirs)" stroke="var(--color-canopy)" />
                ))}
              </g>

              {/* one day, one value */}
              <g style={show(step === 2)}>
                <circle cx={200} cy={170} r={64} fill="var(--color-ember-3)" />
                <g className="num" fontSize={15} fill="var(--color-dim)">
                  <rect x={70} y={292} width={260 * MODIS_SCALED} height={10} rx={3} fill="var(--color-modis)" />
                  <text x={70} y={284}>
                    MODIS {MODIS_CELLS.length} / {MODIS_REF}
                  </text>
                  <rect x={70} y={348} width={260 * VIIRS_SCALED} height={10} rx={3} fill="var(--color-viirs)" />
                  <text x={70} y={340}>
                    VIIRS {VIIRS_CELLS.length} / {VIIRS_REF}
                  </text>
                </g>
                <text x={200} y={181} textAnchor="middle" className="num" fontSize={34} fill="var(--color-night)">
                  {DAY_INDEX.toFixed(2)}
                </text>
              </g>

              {/* the calendar */}
              <g style={show(step === 3)}>
                {MONTH.map((level, i) => {
                  const cx = 56 + (i % 7) * 48;
                  const cy = 104 + Math.floor(i / 7) * 48;
                  const l = i === TODAY ? 3 : level;
                  return (
                    <g key={i}>
                      <circle cx={cx} cy={cy} r={4 + l * 3.4} fill={EMBER[l]} />
                      {i === TODAY && <rect x={cx - 23} y={cy - 23} width={46} height={46} rx={4} fill="none" stroke="var(--color-ink)" strokeWidth={2} />}
                      {i === 9 && <circle cx={cx} cy={cy} r={21} fill="none" stroke="var(--color-lume)" strokeWidth={2} />}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          <ol className="md:py-[18vh]">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                ref={(el) => {
                  items.current[i] = el;
                }}
                data-step={i}
                className="relative flex min-h-[46svh] flex-col justify-center pl-14 transition-opacity duration-500 md:min-h-[58vh]"
                style={{ opacity: step === i ? 1 : 0.7 }}
              >
                {step === i && (
                  <motion.span layoutId="lume-guide" className="absolute left-0 top-1/2 -mt-6" transition={{ type: "spring", stiffness: 170, damping: 22 }}>
                    <Lume size={44} />
                  </motion.span>
                )}
                <h3 className="text-2xl md:text-3xl">{s.title}</h3>
                <p className="mt-3 max-w-[30rem] text-dim">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
