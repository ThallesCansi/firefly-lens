"use client";

import { Lume } from "@/components/firefly/Lume";
import { SoftText } from "@/components/ui/SoftText";
import { SENSORS, SENSOR_NAME } from "@/lib/data/types";
import { LEVEL_NAMES, type DaySummary } from "@/lib/harmonize";
import { count, indexScore, longDate } from "@/lib/format";

export function DayDetail({ day }: { day: DaySummary }) {
  const rows: { label: string; hint?: string; value: (s: DaySummary["sensors"]["MODIS"]) => string }[] = [
    { label: "Detections", hint: "as reported", value: (s) => count(s.detections) },
    { label: "Day / night", value: (s) => `${count(s.day)}/${count(s.night)}` },
    { label: "Grid cells lit", hint: "0.25°", value: (s) => count(s.cells) },
    { label: "On the MODIS Aqua scale", hint: "hot spots", value: (s) => (s.estimate === null ? "–" : count(s.estimate)) },
    { label: "Scaled activity", hint: "0 to 100", value: (s) => indexScore(s.scaled) },
  ];

  const source =
    day.source === "observed"
      ? "Observed by MODIS Aqua."
      : "Estimated from VIIRS NOAA-20 by the harmonization model: the month's estimate, shared out by each day's VIIRS detections.";
  const agreement = !day.bothSensors
    ? "VIIRS NOAA-20 was not flying yet."
    : day.agreement === null
      ? "Neither sensor saw fire."
      : day.agreement > 0.75
        ? "MODIS Aqua and harmonized VIIRS tell the same story."
        : day.agreement > 0.4
          ? "MODIS Aqua and harmonized VIIRS partly disagree."
          : "MODIS Aqua and harmonized VIIRS disagree: read this day with care.";

  return (
    <section aria-labelledby="day-title" className="flex h-full flex-col gap-5 rounded-xl bg-canopy p-5">
      <div>
        <h2 id="day-title" className="text-xl">
          <SoftText value={longDate(day.date)} />
        </h2>
        <p className="mt-3 flex items-baseline gap-3">
          <span className="num text-5xl leading-none text-ink">
            <SoftText value={indexScore(day.index)} />
          </span>
          <span className="text-dim">
            <SoftText value={LEVEL_NAMES[day.level]} /> fire activity · <span className="num">{count(day.value)}</span> hot spots
          </span>
        </p>
        <p className="mt-2 text-[0.9375rem] text-dim">
          {source} Its neighbouring days sit near <span className="num text-ink">{indexScore(day.expected)}</span>. {agreement}
        </p>
      </div>

      {day.anomaly && (
        <p className="flex items-center gap-3 rounded-lg bg-bark p-3 text-[0.9375rem]">
          <Lume size={36} mood="alert" className="shrink-0" />
          <span>
            Unusual burning: this day is far above the three weeks around it.
          </span>
        </p>
      )}

      <table className="w-full text-[0.9375rem]">
        <thead>
          <tr className="text-left text-dim">
            <th scope="col" className="pb-2 font-normal">
              <span className="sr-only">Measure</span>
            </th>
            {SENSORS.map((sensor) => (
              <th key={sensor} scope="col" className="pb-2 text-right font-medium text-ink">
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={sensor === "MODIS" ? "block size-3 rounded-full border-[1.5px] border-modis" : "block size-2 rounded-full bg-viirs"}
                  />
                  {SENSOR_NAME[sensor]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-line">
              <th scope="row" className="py-2 pr-2 text-left font-normal text-dim">
                {row.label}
                {row.hint && <span className="text-faint"> · {row.hint}</span>}
              </th>
              {SENSORS.map((sensor) => (
                <td key={sensor} className="num py-2 text-right text-ink">
                  <SoftText value={sensor === "VIIRS" && !day.bothSensors ? "–" : row.value(day.sensors[sensor])} align="end" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
