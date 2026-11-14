# FireFly Lens

One fire calendar from two satellite sensors.

FireFly Lens is a NASA Space Apps Challenge 2026 project for the challenge *Harmonization of MODIS and VIIRS Hot Spots*. It brings the active-fire detections of both instruments onto one shared grid and shows a year of fire activity as a calendar, with the fire season and the unusual days marked.

> **Status: stage 3.** The map-first exploration interface and the method are in place for the whole 2001 to 2025 record, running on **simulated detections** shaped like NASA FIRMS records. The method has not yet been checked against real data. This project is not endorsed by NASA.

## Why the two records need harmonizing

A hot spot is a pixel that looked hot, not a fire. MODIS has reported fire since late 2000 in 1 km pixels; VIIRS since 2012 in 375 m pixels. One fire can be a single MODIS detection and nine VIIRS detections, so adding the two counts would measure pixel size, not burning, and the record would jump the day VIIRS starts.

FireFly Lens therefore never adds raw counts. In short:

1. Every detection from both sensors is snapped to a shared 0.05° grid (about 5.5 km), and the lit cells are counted per sensor and day.
2. Over the years both sensors flew, the app learns how many cells VIIRS lights for each cell MODIS lights in the selected area (the calibration factor).
3. Every day is written in VIIRS-equivalent cells: MODIS alone before 2012, scaled by the factor; the mean of both afterwards.
4. That one series is scaled against the area's own busy day (95th percentile), giving an index from 0 to 100 that means the same in 2003 as in 2023.
5. Each month is compared with the median of the same month across all years; the typical fire season and the days that burn far above their neighbours are marked.

The full description, with what is still provisional, is on the `/method` page and in [`src/lib/harmonize.ts`](src/lib/harmonize.ts).

## What is in the app

| Route | What it shows |
|---|---|
| `/` and `/lens` | Full-viewport map workspace: explore, select an area, then open its historical analysis. |
| `/about` | The original project introduction, sensor comparison, method overview and calendar preview. |
| `/method` | The method in order, its limits, and what comes next. |

In the map workspace a user can:

- **Explore first**: pan and zoom globally, search places or `latitude, longitude`, and toggle MODIS and VIIRS independently. Search only navigates the camera; it never selects administrative boundaries.
- **Select, then analyze**: draw a rectangle, type bounds, or choose a study region under Coordinates. Press **Analyze Area** to compute the history. A scrollable right panel opens on desktop, and a bottom sheet opens on mobile. Closing preserves context; editing an area requires pressing Analyze again. Camera movement never recalculates the history.
- **Coordinate views**: choosing a history-grid month updates the map month; selecting a daily calendar cell or sensor-chart day shows that day's detections. The compact map control switches month and year. Detections load only inside the selected area, not globally.

- **Choose an area of interest**: four ready-made regions, coordinates typed in decimal degrees, or a rectangle drawn on the map (up to 12° per side).
- **Choose a date range**, by month, anywhere from 2001 to 2025.
- **Read the history grid**: every month of every year, coloured by harmonized activity, with months at least twice their median ringed and each year's total set against the median year. The headline compares the range's last month with its historical median and rank.
- **Open any year** as a daily calendar with the typical fire season and unusual days marked, switch between harmonized, MODIS-only and VIIRS-only views, and inspect any day on the map and in figures per sensor.
- **Download** the hot spots (CSV, FIRMS columns, up to 36 months), the daily harmonized series (CSV), the monthly table with medians and ranks (CSV), and the history grid (SVG).

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

## Deployment

The site deploys on [Vercel](https://vercel.com) from this repository: every push to `main` goes to production and every pull request gets its own preview URL. No environment variables are needed for the simulated build.

## Project layout

```
src/
  app/                  routes: /, /lens, /method
  components/
    firefly/            Lume, the firefly mascot
    landing/            sections of the landing page
    lens/               history grid, calendar, map, area form, day detail
    ui/                 header, footer, tabs, text transitions
  lib/
    data/types.ts       Hotspot, in the shape of a FIRMS CSV row
    data/source.ts      FireDataSource: the one seam between UI and data
    data/mock.ts        deterministic simulated detections, 2001 to 2025
    harmonize.ts        shared grid, calibration, index, monthly medians, season
    export.ts           CSV and SVG downloads
    harmonize.test.ts
scripts/                build helpers
```

## Data

The simulated source covers 2001 to 2025 for any area. It cuts the world into 4° tiles, each with its own fire season and fire-prone spots; gives each year its own weather; flies each satellite only from its real start date; and lets each sensor "see" the fires differently: MODIS misses small fires, VIIRS reports several pixels for one fire. Records carry the FIRMS fields (`latitude`, `longitude`, `brightness`, `acq_date`, `acq_time`, `satellite`, `instrument`, `confidence`, `frp`, `daynight`).

To connect real data, implement `FireDataSource` in [`src/lib/data/source.ts`](src/lib/data/source.ts). The components do not need to change. Note that the [FIRMS area API](https://firms.modaps.eosdis.nasa.gov/api/area/) returns at most five days per request, so it suits recent days; two decades of history need the FIRMS archive downloads. Keep the API key on the server, behind a route handler.

Sources the project is built for:

- [NASA FIRMS](https://www.earthdata.nasa.gov/data/tools/firms), Fire Information for Resource Management System
- MODIS active fire, Collection 6.1 (Terra and Aqua, 1 km)
- VIIRS active fire, 375 m (Suomi NPP, NOAA-20, NOAA-21)

The map uses [MapLibre GL JS](https://maplibre.org/) with a CARTO basemap built on © OpenStreetMap contributors.

Place search uses [Photon](https://photon.komoot.io/) through `/api/geocode`, with explicit submission, cached results, an eight-second timeout, and a per-process request guard. The public service permits moderate use, may throttle requests, and has no availability guarantee. Set the server-only `PHOTON_URL` to a compatible private Photon `/api/` endpoint for larger deployments. No private key is exposed. See [Phase 3 validation and screenshots](docs/phase-3/validation.md).

## Roadmap

- Load real FIRMS records: archive for the history, area API for the latest days.
- Replay the method on them and tune the cell size, percentile and thresholds.
- Correct for changes in the number of satellites (Aqua in 2002, NOAA-20 later).
- Use overpass times and confidence, and treat cloud cover as missing data.

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
