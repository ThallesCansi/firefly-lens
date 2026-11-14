/**
 * One burning patch, 5 km across, drawn twice: once on each sensor's pixel
 * grid. The lit pixels are computed from the same fire shape, so the two
 * counts differ for the reason they differ in orbit.
 */

const PATCH = 300;

/** How strongly the fire burns at a point of the unit square. */
function fire(x: number, y: number): number {
  const blob = (cx: number, cy: number, r: number) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));
  return blob(0.36, 0.42, 0.13) + 0.9 * blob(0.56, 0.55, 0.1) + 0.7 * blob(0.7, 0.3, 0.06);
}

function litPixels(cells: number, threshold: number): boolean[] {
  const out: boolean[] = [];
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      // Average the fire over the pixel, the way a sensor integrates its footprint.
      let sum = 0;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) sum += fire((col + (i + 0.5) / 4) / cells, (row + (j + 0.5) / 4) / cells);
      out.push(sum / 16 > threshold);
    }
  }
  return out;
}

const SENSORS = [
  {
    name: "MODIS",
    color: "var(--color-modis)",
    cells: 5,
    lit: litPixels(5, 0.42),
    facts: [
      ["Pixel", "1 km"],
      ["Satellites", "Terra and Aqua"],
      ["Passes", "About 10:30 and 13:30, day and night"],
      ["Record", "Since November 2000"],
    ],
  },
  {
    name: "VIIRS",
    color: "var(--color-viirs)",
    cells: 13,
    lit: litPixels(13, 0.5),
    facts: [
      ["Pixel", "375 m"],
      ["Satellites", "Suomi NPP, NOAA-20 and NOAA-21"],
      ["Passes", "About 13:30 and 01:30"],
      ["Record", "Since January 2012"],
    ],
  },
] as const;

export function TwoSensors() {
  return (
    <section aria-labelledby="sensors-title" className="border-t border-line py-20 md:py-28">
      <div className="wrap">
        <div className="max-w-[44rem]">
          <h2 id="sensors-title" className="text-3xl md:text-5xl">
            Two sensors count the same fire differently
          </h2>
          <p className="mt-5 text-lg text-dim">
            A hot spot is a pixel that looked hot, not a fire. Below, one burning patch 5 km across lands on each
            sensor&rsquo;s grid. Adding the two counts would measure pixel size, not burning.
          </p>
        </div>

        <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-16">
          {SENSORS.map((s) => {
            const size = PATCH / s.cells;
            const lit = s.lit.filter(Boolean).length;
            return (
              <div key={s.name}>
                <svg
                  viewBox={`0 0 ${PATCH} ${PATCH}`}
                  className="w-full max-w-[26rem]"
                  role="img"
                  aria-label={`${s.name} reports ${lit} detections for the patch on a ${s.cells} by ${s.cells} pixel grid.`}
                >
                  {s.lit.map((on, i) => {
                    const col = i % s.cells;
                    const row = Math.floor(i / s.cells);
                    return (
                      <rect
                        key={i}
                        x={col * size + 1}
                        y={row * size + 1}
                        width={size - 2}
                        height={size - 2}
                        rx={s.cells > 8 ? 2 : 4}
                        fill={on ? s.color : "var(--color-bark)"}
                      />
                    );
                  })}
                </svg>
                <h3 className="mt-6 text-2xl">
                  {s.name} reports <span className="num">{lit}</span> detections
                </h3>
                <dl className="mt-4 max-w-[26rem] text-[0.9375rem]">
                  {s.facts.map(([term, value]) => (
                    <div key={term} className="flex gap-4 border-t border-line py-2.5">
                      <dt className="w-24 shrink-0 text-dim">{term}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
