import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";

export const metadata: Metadata = {
  title: "Method",
  description: "How FireFly Lens joins two decades of real MODIS and VIIRS hot spots for Brazil into one record, how it was checked, and its limits.",
};

const STEPS = [
  {
    title: "Read the real records",
    body: "MODIS on Aqua, July 2002 to November 2026, and VIIRS on NOAA-20, April 2018 to November 2026, for Brazil, from NASA FIRMS: the yearly country archives in standard processing, then the area API for 2026, near real time for the latest months. Terra, Suomi NPP and NOAA-21 are left out so each sensor is one satellite with one overpass time.",
  },
  {
    title: "Keep vegetation fire only",
    body: "MODIS detections with confidence of at least 30, VIIRS detections of nominal or high confidence, and only the type flagged as presumed vegetation fire (volcanoes, other static sources and offshore detections are dropped). Exact duplicates go, and each detection is placed in one of Brazil's six IBGE biomes.",
  },
  {
    title: "Count on a 0.25° grid",
    body: "Detections are counted per 0.25° cell (about 27 km), month and day or night: 11,763 cells cover Brazil. VIIRS is also counted degraded to about 1 km: the 0.01° subcells it lights on each pass, so several 375 m pixels over one fire count once.",
  },
  {
    title: "Learn how VIIRS relates to MODIS Aqua",
    body: "Over April 2018 to December 2023, when both flew and Aqua kept its orbit, a negative binomial model predicts the MODIS Aqua count of each cell and month from the degraded VIIRS count, by biome, month and day or night. Later years are left out of the fit because Aqua's overpass drifted about two hours later by 2026. A plain scale factor per biome, month and day or night is kept as a baseline.",
  },
  {
    title: "Check it on years it never saw",
    body: "Each year from 2018 to 2023 is predicted by a model fitted without it. Over Brazil, raw VIIRS reads 506% above MODIS Aqua; harmonized, the bias falls below 1% and the typical monthly error is about 10%. The ranking of the worst months matches MODIS (Spearman 0.99). The 95% range of a sum of cells includes an error common to all cells, calibrated so 95% of biome-months fall inside it.",
  },
  {
    title: "Write one series",
    body: "Through 2025 the series is MODIS Aqua as observed. From 2026, as Aqua nears its end, it is VIIRS converted to the Aqua scale, with its 95% range. Areas you draw sum the cells they cover, counting cells cut by the edge by the share inside.",
  },
  {
    title: "Mark the season and the unusual days",
    body: "The model works by month. In the calendar, a modeled month is shared out over its days by each day's VIIRS detections. Each day is scaled against the area's own busy day (95th percentile) into an index from 0 to 100. The fire season is the stretch where the average day stays above 35% of the yearly peak; a day is unusual when it burns far above the ten days on each side. Each month is compared with the median of the same month over 2003 to 2025.",
  },
];

const LIMITS = [
  "Aqua's orbit drifted from 2022 on: by 2026 it passes about two hours later, closer to the afternoon peak of burning, and counts about 15% more than its earlier self in 2024 and 2025. Those two years enter the series as observed, so the step from 2025 to 2026 is partly the drift.",
  "Aqua had outages inside the record: 16 August to 2 September 2020 and 31 March to 16 April 2022 read low.",
  "The 95% range of an area adds a common error tuned on biomes; for very small areas it can be too wide or too narrow. Ranges assume the model is right in its form.",
  "From August or September 2026 the records are near real time: no fire-type flag, and slightly different positions. They will be replaced when standard processing arrives.",
  "The record covers Brazil only, starts in July 2002 and rests on one MODIS and one VIIRS satellite. At night the model is weaker in the Atlantic Forest, the Pampa and the Pantanal.",
  "Each 0.25° cell carries one biome, its majority. The map shows detections per cell, not single fires, and hot spots are detected pixels, not fires.",
];

export default function MethodPage() {
  return (
    <>
      <SiteHeader current="/method" />
      <main id="main" className="wrap py-14 md:py-20">
        <article className="mx-auto max-w-[38rem]">
          <h1 className="text-4xl md:text-6xl">How two records become one calendar</h1>
          <p className="mt-6 text-xl text-dim">
            A hot spot is one observation by one sensor, not one fire. MODIS sees fire in 1 km pixels; VIIRS in 375 m
            pixels, and over Brazil it reports about six times as many. FireFly Lens never adds their counts. It learns
            how VIIRS relates to MODIS Aqua where both flew, and writes the whole record on the MODIS Aqua scale, so it
            can continue after MODIS is switched off.
          </p>

          <h2 className="mt-16 text-2xl md:text-3xl">The method, in order</h2>
          <ol className="mt-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[2.5rem_1fr] gap-x-2 border-t border-line py-6">
                <span className="num pt-1 text-dim" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-xl">{s.title}</h3>
                  <p className="mt-2 text-dim">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <h2 className="mt-16 text-2xl md:text-3xl">Limits</h2>
          <ul className="mt-6">
            {LIMITS.map((l) => (
              <li key={l} className="border-t border-line py-4 text-dim last:border-b">
                {l}
              </li>
            ))}
          </ul>

          <h2 className="mt-16 text-2xl md:text-3xl">Reproduce it</h2>
          <p className="mt-4 text-dim">
            The pipeline, its validation and every column of its outputs are in the <code>harmonization/</code> folder
            of the repository, with the full methodology in Portuguese. It rebuilds everything from NASA FIRMS with one
            free map key.
          </p>
          <Link href="/lens" className="btn btn-primary mt-8">
            Open the Lens
          </Link>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
