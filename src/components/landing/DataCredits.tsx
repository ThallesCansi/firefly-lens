const SOURCES = [
  {
    name: "NASA FIRMS",
    detail: "Fire Information for Resource Management System: the service that distributes both active-fire records.",
    href: "https://www.earthdata.nasa.gov/data/tools/firms",
  },
  {
    name: "MODIS active fire, Collection 6.1",
    detail: "1 km detections from the Aqua satellite, 2002 onward: the reference scale of the record.",
    href: "https://www.earthdata.nasa.gov/data/instruments/modis",
  },
  {
    name: "VIIRS active fire, 375 m",
    detail: "375 m detections from NOAA-20, April 2018 onward, converted to the MODIS Aqua scale.",
    href: "https://www.earthdata.nasa.gov/data/instruments/viirs",
  },
];

export function DataCredits() {
  return (
    <section aria-labelledby="data-title" className="border-t border-line py-20 md:py-28">
      <div className="wrap grid gap-10 md:grid-cols-2 md:gap-16">
        <div>
          <h2 id="data-title" className="text-3xl md:text-5xl">
            Built on NASA&rsquo;s open fire records
          </h2>
          <p className="mt-5 max-w-[34rem] text-lg text-dim">
            FireFly Lens answers the 2026 NASA Space Apps challenge on harmonizing MODIS and VIIRS hot spots. It reads
            the real FIRMS records for Brazil, from July 2002 to November 2026: 6 million MODIS Aqua and 10 million
            VIIRS NOAA-20 detections, filtered, counted on a 0.25° grid and joined into one series.
          </p>
        </div>
        <ul className="self-end">
          {SOURCES.map((s) => (
            <li key={s.name} className="border-t border-line py-4 last:border-b">
              <a href={s.href} className="link text-lg" rel="noreferrer">
                {s.name}
              </a>
              <p className="mt-1 text-[0.9375rem] text-dim">{s.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
