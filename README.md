# FireFly Lens

One fire calendar from two satellite sensors.

FireFly Lens is a NASA Space Apps Challenge 2026 project for the challenge *Harmonization of MODIS and VIIRS Hot Spots*. It brings the active-fire detections of both instruments onto one shared grid and shows a year of fire activity as a calendar, with the fire season and the unusual days marked.

> **Status: real data for Brazil.** The map-first interface runs on the real NASA FIRMS records for Brazil, July 2002 to November 2026: MODIS Aqua and VIIRS NOAA-20, harmonized into one series on the MODIS Aqua scale and validated year by year. This project is not endorsed by NASA.

## Why the two records need harmonizing

A hot spot is a pixel that looked hot, not a fire. MODIS reports fire in 1 km pixels; VIIRS in 375 m pixels, and over Brazil it reports about six times as many. Adding the two counts would measure pixel size, not burning, and MODIS Aqua, the longest record, is near its end.

FireFly Lens therefore writes the whole record on the MODIS Aqua scale. In short:

1. Real FIRMS detections for Brazil are filtered (confidence, vegetation fire only) and counted per 0.25° cell, month and day or night, with VIIRS also counted degraded to ~1 km.
2. Over April 2018 to December 2023, when both flew and Aqua kept its orbit, a negative binomial model learns how many MODIS Aqua hot spots each VIIRS count stands for, by biome, month and day or night.
3. Through 2025 the series is MODIS Aqua as observed; from 2026 it is VIIRS converted, with a 95% range.
4. Checked on years left out of the fit: raw VIIRS reads 506% above MODIS Aqua over Brazil; harmonized, the bias is below 1% and the ranking of the worst months matches (Spearman 0.99).
5. In the app, any area (a drawn polygon or a Brazilian state) sums its cells, each weighted by the share of it inside the area; each month is compared with the median of the same month over 2003–2025, and days are scaled into an index from 0 to 100 for the calendar, with the fire season and unusual days marked.

The method, its validation and its limits are on the `/method` page and, in full (in Portuguese), in [`harmonization/docs/METHODOLOGY.md`](harmonization/docs/METHODOLOGY.md).

## What is in the app

| Route | What it shows |
|---|---|
| `/` and `/lens` | Full-viewport map workspace: explore, select an area, then open its historical analysis. |
| `/about` | The original project introduction, sensor comparison, method overview and calendar preview. |
| `/method` | Three linked tabs: Harmonization, Historical Anomalies, and Data & Limitations, with equations and references. |

In the map workspace a user can:

- **Explore first**: pan and zoom, search places or `latitude, longitude`, and toggle MODIS and VIIRS independently. The map shows detections per 0.25° grid cell (MODIS Aqua as rings, VIIRS NOAA-20 as dots), inside Brazil's outline. Search only navigates the camera; it never selects administrative boundaries.
- **Select, then analyze**: draw an area, pick a Brazilian state, type bounds, or choose a study region under Coordinates. Press **Analyze Area** to compute the history. A scrollable right panel opens on desktop, and a bottom sheet opens on mobile. Closing preserves context; editing an area requires pressing Analyze again. Camera movement never recalculates the history.
- **Coordinate views**: choosing a history-grid month updates the map month; selecting a daily calendar cell or sensor-chart day shows that day's detections. The compact map control switches month and year. Detections load only inside the selected area, not globally.

- **Choose an area of interest** in Brazil: five ready-made regions (Southern Amazon, Matopiba, Pantanal, Sertão, Pampa), coordinates typed in decimal degrees, a Brazilian state picked on the map (cut by its IBGE outline), or an area drawn on the map (up to 12° in each direction). A drawn area shows its corners right away: drag a corner on its own, drag the + on an edge to add one, double-click a corner to remove it, or drag the centre to move the whole shape. Edges may not cross.
- **Choose a date range**, by month, from July 2002 to November 2026.
- **Read the history grid**: every month of every year in MODIS-Aqua-equivalent hot spots, with months at least twice their 2003–2025 median ringed, months estimated from VIIRS dotted, and each year's total set against the median year. The headline compares the selected month with its median and rank, with a 95% range when it is estimated.
- **Open any year** as a daily calendar with the typical fire season and unusual days marked, switch between the harmonized series, MODIS Aqua and harmonized VIIRS, and inspect any day in figures per sensor and on the map.
- **Download** detections per grid cell and day (CSV, up to 36 months), the daily harmonized series (CSV), the monthly table with medians, ranks and ranges (CSV), and the history grid (SVG).

## Run it

### Historical Anomaly Radar

Open **Historical Anomaly Radar** in the map toolbar. **Historical Highlights** orders unusual positive monthly activity across the five preset study rectangles; **Explore Period** shows every region for a chosen month, including months excluded from comparison. Opening a card selects its region, sets the month, frames the map and opens the existing analysis.

The radar uses a configurable **2003–2023** same-month reference, excluding the evaluated year, with 2003–2025 available for comparison. This reduces potential influence of the 2024–2025 Aqua drift on the reference; it does not fully correct comparability. Existing global indicators, the historical grid's fixed 2003–2025 medians and the scientific harmonization pipeline are unchanged. A contextual card explains why radar comparisons can differ from the grid below.

Initial filters in `src/lib/anomalies.ts`: at least 15 reference years, ratio ≥ 2, count ≥ 100 MODIS Aqua equivalents, excess ≥ 50 and value ≥ reference P90. These parameters are provisional descriptive filters. The target year and quality-excluded months are absent from the reference. Rank uses all eligible same-calendar-month records in the archive (including modeled values); ties share rank. Results are ordered by relative historical standing, then ratio and excess. This is retrospective analysis, not a probability, prediction or indicator of future fire risk.

Independent quality rules in `src/lib/data/month-quality.ts` exclude July 2002, metadata/coverage partial months, and the full months touched by documented Aqua outages: August/September 2020 and March/April 2022. Excluded months remain available for exploration, without a radar ratio or rank. Zero medians have no defined ratio. Modeled ranges are **nominal 95% predictive intervals**, without a claim of validated coverage for arbitrary study regions. The 2026 source transition and near-real-time inputs remain limitations.

`public/data/brazil/historical-radar.json` is derived locally by the actual `loadArea()` → `buildRecord()` functions, not a second harmonization implementation. The browser fetches only this monthly summary when the radar opens; geographic tiles load for a selected area's detailed analysis. Its schema, coverage, policy and source hashes are recorded. Text fingerprints normalize line endings for Windows/Linux reproducibility.

```bash
pnpm radar:generate  # regenerate the real summary and threshold report after relevant changes
pnpm radar:check     # recompute and reject stale inputs, JSON content or report
```

`dev` and `build` verify freshness before starting. The generated [threshold report](docs/historical-radar-report.md) gives counts for every region, floor diagnostics and the alternative reference-window comparison. Updating input data or scientific/quality/generator modules requires regenerating both artifacts. The main algorithm does not modify `harmonize.ts`, `AnalysisContent.tsx` or the Python pipeline.

Optional browser checks: run the production server on port 3104 and `pnpm radar:qa`. Reuse an existing Playwright installation by setting `PLAYWRIGHT_MODULE` to its absolute `index.mjs` path; `QA_BASE_URL` can override the server URL. The check uses the installed Chrome, keeps screenshots in the system temporary directory and adds no project dependency. See [implementation validation](docs/historical-radar-validation.md).

Requires Node 20.9 or newer and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Other commands:

```bash
pnpm test       # checks the data tiles and the area record against the Python pipeline
pnpm lint
pnpm build && pnpm start
```

`pnpm dev` and `pnpm build` first copy the MapLibre worker into `public/maplibre/` (see [`scripts/copy-maplibre-worker.mjs`](scripts/copy-maplibre-worker.mjs)); the map needs it.

## Themes and scientific documentation

Headers use the original Lume mascot plus the compact wordmark **Lens**; the institutional name remains **FireFly Lens**. The original mascot component is unchanged. The SVG browser icon is rendered directly from that component, with its original geometry and colours.

The header offers **Light**, **Dark** and **System**. The preference is stored locally, applied before the first paint and synchronized with operating-system changes in System mode. Theme changes update CARTO dark/Positron map styles on the existing MapLibre instance, restoring custom layers and sensor visibility without changing the camera, area or analysis period.

The Method page supports keyboard tabs and shareable hashes, such as `/method#seasonal-z-score`. KaTeX renders the equations on the server with accessible MathML. Monthly medians/ranks and the local daily MAD heuristic are documented as implemented. Seasonal z-scores are explained as conceptual extensions, not displayed indicators. The offline Python pipeline is integrated through its exported real-data tiles; Python reference-calendar percentiles are not yet displayed. Contextual explanations cover activity, hot spots, medians, anomalies and FRP.

SVG downloads now include region, period, legend, data source and observed/modeled status, processing description and export timestamp. Scientific values and CSV schemas are unchanged. See [Phase 4 changes, evidence and limitations](docs/phase-4/validation.md).

## Deployment

The site deploys on [Vercel](https://vercel.com) from this repository: every push to `main` goes to production and every pull request gets its own preview URL. No environment variables are needed: the data are static files in `public/data/brazil/` (about 10 MB), fetched by the browser per 4° tile.

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
    data/meta.ts        what the data files hold (public/data/brazil/meta.json)
    data/tiles.ts       reads one 4° data tile (binary, gzip)
    data/area.ts        sums the tiles' cells over an area
    data/source.ts      years, presets and coverage, before any data loads
    harmonize.ts        the area's record: series, index, monthly medians, season
    export.ts           CSV and SVG downloads
    harmonize.test.ts
public/data/brazil/     data tiles, meta.json and Brazil's outline
harmonization/          the Python pipeline that builds them (see below)
scripts/                build helpers
```

## Data

The app reads static files written by [`harmonization/pipeline/09_app_data.py`](harmonization/pipeline/09_app_data.py) into `public/data/brazil/`:

- `t_{tx}_{ty}.bin.gz`: one per 4° × 4° tile, 67 in all. For each 0.25° cell: MODIS Aqua and VIIRS NOAA-20 detections per day (day and night) and VIIRS degraded to ~1 km; the harmonized monthly value from April 2018; and its variance for the modeled months. The layout is documented in [`src/lib/data/tiles.ts`](src/lib/data/tiles.ts).
- `meta.json`: the period, the series rules (observed through 2025, modeled after), the common-error term of the 95% range, biomes and presets.
- `brazil.geojson`: Brazil's outline for the map.

Single detections are not shipped (17 million rows); the finest level in the app is the cell and day. `harmonization/pipeline/export_points.py` exports single detections from the full pipeline output.

Sources:

- [NASA FIRMS](https://www.earthdata.nasa.gov/data/tools/firms), Fire Information for Resource Management System
- MODIS active fire, Collection 6.1, Aqua (1 km): yearly country archives, standard processing, and the area API for 2026
- VIIRS active fire, 375 m, NOAA-20: same sources
- Biomes and the outline of Brazil: IBGE, through [`geobr`](https://github.com/ipeaGIT/geobr)

The map uses [MapLibre GL JS](https://maplibre.org/) with a CARTO basemap built on © OpenStreetMap contributors.

Place search uses [Photon](https://photon.komoot.io/) through `/api/geocode`, with explicit submission, cached results, an eight-second timeout, and a per-process request guard. The public service permits moderate use, may throttle requests, and has no availability guarantee. Set the server-only `PHOTON_URL` to a compatible private Photon `/api/` endpoint for larger deployments. No private key is exposed. See [Phase 3 validation and screenshots](docs/phase-3/validation.md).

## The harmonization pipeline

[`harmonization/`](harmonization/) holds the Python pipeline behind the data: download from FIRMS, filters, grid, models, validation and exports. To rerun it: `cd harmonization && uv sync`, then the numbered scripts; see [`harmonization/README.md`](harmonization/README.md). Its outputs, the method and every column are documented in [`harmonization/docs/`](harmonization/docs/) (in Portuguese).

## Roadmap

- Replace the near-real-time tail of 2026 with standard processing when FIRMS releases it.
- Extend the record back to 2000 with MODIS Terra, and the calibration with Suomi NPP from 2012.
- Correct the observed 2024–2025 MODIS Aqua for its orbital drift, and fill its outages.
- Extend coverage beyond Brazil.

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
