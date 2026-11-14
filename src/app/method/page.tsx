import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";

export const metadata: Metadata = {
  title: "Method",
  description: "How FireFly Lens brings MODIS and VIIRS hot spots onto one grid, and what is still provisional.",
};

const STEPS = [
  {
    title: "Read both records as they come",
    body: "Each detection keeps the fields of a FIRMS download: position, acquisition date and time, satellite, instrument, confidence, brightness temperature, fire radiative power and a day or night flag. Nothing is dropped or merged at this stage.",
  },
  {
    title: "Snap every detection to a shared grid",
    body: "The grid cell is 0.05 degrees wide, about 5.5 km at the equator and wider than either pixel. A cell is lit for a sensor on a day when that sensor has at least one detection inside it. This removes the effect of pixel size: nine VIIRS pixels and one MODIS pixel over the same fire both light one cell.",
  },
  {
    title: "Scale each sensor against itself",
    body: "For each sensor, the cells lit on a day are divided by that sensor's reference: the 95th percentile of its own burning days in the year. The result is capped at 1. A percentile is used instead of the maximum so one freak day does not flatten the rest of the year.",
  },
  {
    title: "Combine the two scaled values",
    body: "The day's activity is the mean of the MODIS and VIIRS scaled values, from 0 to 1, shown as 0 to 100. Raw counts from the two sensors are never added. The two scaled values are also compared: when they differ widely, the day is labelled as one where the sensors disagree.",
  },
  {
    title: "Mark the season and the unusual days",
    body: "The fire season is the unbroken stretch around the yearly peak where the 15-day average stays above 35% of that peak. A day is unusual when its activity is at least 22, at least double the median of the ten days on each side, and above that median by a margin that widens when those neighbours are themselves erratic.",
  },
];

const LIMITS = [
  "The detections in this build are simulated. The generator gives each region a fire season, cloudy days and three planted bursts, and it lets VIIRS see more and smaller fires than MODIS. It is a test bench for the interface, not evidence about any real place.",
  "The method has not been checked against real FIRMS records. The cell size, the percentile and the thresholds are first choices and will change.",
  "Overpass times are not yet used. MODIS and VIIRS pass at different hours, so a fire that burns for two hours can be seen by one and missed by the other; the agreement label is the only place this shows today.",
  "Confidence is recorded but not used to filter. Low-confidence detections light a cell like any other.",
  "Cloud cover is not modelled as missing data. A cloudy day reads as a quiet day.",
];

export default function MethodPage() {
  return (
    <>
      <SiteHeader current="/method" />
      <main id="main" className="wrap py-14 md:py-20">
        <article className="mx-auto max-w-[38rem]">
          <h1 className="text-4xl md:text-6xl">How the two records become one calendar</h1>
          <p className="mt-6 text-xl text-dim">
            A hot spot is one observation by one sensor, not one fire. FireFly Lens never adds MODIS and VIIRS counts
            together. It asks a question both sensors can answer on equal terms: how much of the shared grid was lit
            today, compared with this sensor&rsquo;s own busy days?
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

          <h2 className="mt-16 text-2xl md:text-3xl">What is still provisional</h2>
          <ul className="mt-6">
            {LIMITS.map((l) => (
              <li key={l} className="border-t border-line py-4 text-dim last:border-b">
                {l}
              </li>
            ))}
          </ul>

          <h2 className="mt-16 text-2xl md:text-3xl">What comes next</h2>
          <p className="mt-4 text-dim">
            The next stage connects the NASA FIRMS area API behind a server route, replays the method on real records
            for the same regions, and tunes the cell size and thresholds against them.
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
