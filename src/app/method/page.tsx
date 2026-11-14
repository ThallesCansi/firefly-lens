import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";

export const metadata: Metadata = {
  title: "Method",
  description: "How FireFly Lens joins two decades of MODIS and VIIRS hot spots into one record, and what is still provisional.",
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
    title: "Calibrate MODIS against VIIRS where both flew",
    body: "From 20 January 2012 both sensors observe the same ground. Over those days, the cells VIIRS lit are divided by the cells MODIS lit, for the selected area. The result is the calibration factor: how many cells VIIRS lights for each cell MODIS lights there. It is learned per area, because it depends on how large the local fires are.",
  },
  {
    title: "Write one series in VIIRS-equivalent cells",
    body: "Before 2012 a day's value is its MODIS cells times the factor. From 2012 on it is the mean of the VIIRS cells and the scaled MODIS cells. The series therefore runs from 2001 to today in one unit, and the sensor of origin no longer shows as a step.",
  },
  {
    title: "Scale against the area's own busy day",
    body: "Each day's value is divided by the 95th percentile of the area's burning days over the whole record, and capped at 1. That gives an index from 0 to 100 that means the same in 2003 as in 2023. A percentile is used instead of the maximum so one freak day does not flatten everything else.",
  },
  {
    title: "Compare each month with its own history",
    body: "Daily values are summed by month. Each month is set against the median of the same calendar month across all years, which gives its ratio to the median and its rank. A month at least twice its median is ringed in the history grid.",
  },
  {
    title: "Mark the season and the unusual days",
    body: "The typical fire season is the unbroken stretch of the year where the average day, over all years, stays above 35% of the yearly peak. A day is unusual when its index is at least 22, at least double the median of the ten days on each side, and above that median by a margin that widens when those neighbours are themselves erratic.",
  },
];

const LIMITS = [
  "The detections in this build are simulated, 2001 to 2025. The generator gives each part of the world a fire season, wet and dry years, cloudy days and planted bursts, and it lets VIIRS see more and smaller fires than MODIS. It is a test bench for the method and the interface, not evidence about any real place.",
  "The method has not been checked against real FIRMS records. The cell size, the percentile and the thresholds are first choices and will change.",
  "One factor is used for the whole year. If the mix of small and large fires changes with the season, the factor should change with it.",
  "Changes in the number of satellites are not corrected. Aqua joined Terra in mid-2002 and NOAA-20 joined Suomi NPP later, and each added overpasses; 2001 in particular reads low.",
  "Overpass times are not used. A fire that burns for two hours can be seen by one sensor and missed by the other; the agreement label is the only place this shows today.",
  "Confidence is recorded but not used to filter, and cloud cover is not treated as missing data: a cloudy day reads as a quiet day.",
];

export default function MethodPage() {
  return (
    <>
      <SiteHeader current="/method" />
      <main id="main" className="wrap py-14 md:py-20">
        <article className="mx-auto max-w-[38rem]">
          <h1 className="text-4xl md:text-6xl">How two records become one calendar</h1>
          <p className="mt-6 text-xl text-dim">
            A hot spot is one observation by one sensor, not one fire. MODIS has watched since late 2000 in 1 km pixels;
            VIIRS since 2012 in 375 m pixels. FireFly Lens never adds their counts. It puts both on one grid, learns how
            they relate where they overlap, and writes the whole record in one unit.
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
            Real records. The FIRMS area API returns at most five days per request, which suits recent days but not two
            decades, so the history will come from the FIRMS archive and the latest days from the API. The method will
            then be replayed on real detections and its choices tuned against them.
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
