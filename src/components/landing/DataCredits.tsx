const SOURCES = [
  {
    name: "NASA FIRMS",
    detail: "Fire Information for Resource Management System: the service that distributes both active-fire records.",
    href: "https://www.earthdata.nasa.gov/data/tools/firms",
  },
  {
    name: "MODIS active fire, Collection 6.1",
    detail: "1 km detections from the Terra and Aqua satellites.",
    href: "https://www.earthdata.nasa.gov/data/instruments/modis",
  },
  {
    name: "VIIRS active fire, 375 m",
    detail: "Detections from the I-bands of Suomi NPP, NOAA-20 and NOAA-21.",
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
            FireFly Lens answers the 2026 NASA Space Apps challenge on harmonizing MODIS and VIIRS hot spots. This build
            runs on simulated detections from 2001 to 2025, with the same fields as a FIRMS download, so real records
            can replace them without changing the interface.
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
