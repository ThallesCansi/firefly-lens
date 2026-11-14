# FireFly Lens

One fire calendar from two satellite sensors.

FireFly Lens is a NASA Space Apps Challenge 2026 project for the challenge *Harmonization of MODIS and VIIRS Hot Spots*. It brings the active-fire detections of both instruments onto one shared grid and shows a year of fire activity as a calendar, with the fire season and the unusual days marked.

> **Status: stage 1.** The interface and the method are in place, running on **simulated detections** shaped like NASA FIRMS records. The method has not yet been checked against real data. This project is not endorsed by NASA.

## Why the two records need harmonizing

A hot spot is a pixel that looked hot, not a fire. MODIS reports fire in 1 km pixels and VIIRS in 375 m pixels, so one fire can be a single MODIS detection and nine VIIRS detections. Adding the two counts would measure pixel size, not burning.

FireFly Lens therefore never adds raw counts. In short:

1. Every detection from both sensors is snapped to a shared 0.05° grid (about 5.5 km).
2. For each sensor and day, the lit grid cells are counted.
3. Each count is scaled against that sensor's own reference: the 95th percentile of its burning days.
4. The day's activity is the mean of the two scaled values, from 0 to 100.
5. The fire season and the days that burn far above their neighbours are marked.

The full description, with what is still provisional, is on the `/method` page and in [`src/lib/harmonize.ts`](src/lib/harmonize.ts).

## What is in the app

| Route | What it shows |
|---|---|
| `/` | The project: an interactive lens over one day of detections, the two sensors side by side, the method in four steps, and a calendar preview. |
| `/lens` | The tool: a year calendar for four regions, a map of the selected day, the day's figures per sensor, and both sensors' years on one time axis. |
| `/method` | The method in order, its limits, and what comes next. |

## Run it

Requires Node 20.9 or newer and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Other commands:

```bash
pnpm test       # unit tests for the simulated source and the harmonization
pnpm lint
pnpm build && pnpm start
```

`pnpm dev` and `pnpm build` first copy the MapLibre worker into `public/maplibre/` (see [`scripts/copy-maplibre-worker.mjs`](scripts/copy-maplibre-worker.mjs)); the map needs it.

## Project layout

```
src/
  app/                  routes: /, /lens, /method
  components/
    firefly/            Lume, the firefly mascot
    landing/            sections of the landing page
    lens/               calendar, map, day detail, sensor comparison
    ui/                 header, footer, tabs, text transitions
  lib/
    data/types.ts       Hotspot, in the shape of a FIRMS CSV row
    data/source.ts      FireDataSource: the one seam between UI and data
    data/mock.ts        deterministic simulated detections
    harmonize.ts        shared grid, scaling, season and anomaly detection
    harmonize.test.ts
scripts/                build helpers
```

## Data

The simulated source generates fire events per region with a season, cloudy days and three planted bursts of unusual burning, then lets each sensor "see" them differently: MODIS misses small fires, VIIRS reports several pixels for one fire. Records carry the FIRMS fields (`latitude`, `longitude`, `brightness`, `acq_date`, `acq_time`, `satellite`, `instrument`, `confidence`, `frp`, `daynight`).

To connect real data, implement `FireDataSource` in [`src/lib/data/source.ts`](src/lib/data/source.ts) against the [NASA FIRMS API](https://firms.modaps.eosdis.nasa.gov/api/) behind a server route, so the API key stays off the client. The components do not need to change.

Sources the project is built for:

- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/), Fire Information for Resource Management System
- MODIS active fire, Collection 6.1 (Terra and Aqua, 1 km)
- VIIRS active fire, 375 m (Suomi NPP, NOAA-20, NOAA-21)

The map uses [MapLibre GL JS](https://maplibre.org/) with a CARTO basemap built on © OpenStreetMap contributors.

## Roadmap

- Connect the FIRMS area API and replay the method on real records.
- Tune the cell size and thresholds against them.
- Use overpass times and confidence, which are recorded but not yet used.
- Treat cloud cover as missing data instead of a quiet day.

## Built with

Next.js, React, TypeScript, Tailwind CSS, MapLibre GL JS, Motion, d3-scale and Vitest. Typefaces: Funnel Display, Funnel Sans and DM Mono.

The design work used three agent skills, which are not vendored in this repository. [`skills-lock.json`](skills-lock.json) records two of them; to install all three locally:

```bash
npx skills add Leonxlnx/taste-skill
npx skills add Jakubantalik/transitions.dev
npx impeccable install
```

## License

[MIT](LICENSE)
