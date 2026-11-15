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
- **Ask the assistant** at the bottom of the map, in any language: "Show Santa Catarina in 2006", "Which month burned most in the Pantanal?", "Compare Mato Grosso in 2020 and 2024". It selects states, regions and boxes, moves the map, sets the period and layers, opens the analysis, and answers questions from the area's own record.
- **Download** detections per grid cell and day (CSV, up to 36 months), the daily harmonized series (CSV), the monthly table with medians, ranks and ranges (CSV), and the history grid (SVG).

## Run it

### Tour with Lume

The workspace offers an optional first-visit invitation and a discreet **Tour with Lume** replay button. Nothing starts automatically. The guided tour uses the original animated mascot and Driver.js 1.14.0 to spotlight real controls across the map, monthly side panel and full report below the map.

The demonstration selects the exact Pantanal preset and September 2023, using the existing historical record and geometry-matched Python analytics. History, historical anomalies and experimental Forecast remain distinct; unavailable forecasts are shown as unavailable, including for arbitrary geometries. No forecast is borrowed from another region. Search, map gestures and downloads are optional; the tour never downloads a file automatically or sends a request to the map assistant.

At completion, choose **Keep example**, **Restore previous workspace**, or **Replay tour**. Skip and Escape restore the prior region, period, range, sensors, panel/calendar view and analytics tab. Camera restoration uses the existing bounds/projection contract, rather than promising an identical camera pose. Tour outcomes use `firefly-lens-tour-v1`, independently of the original introductory hint.

Tour transitions prepare application state before highlighting semantic `data-tour` anchors. Driver performs target waiting, spotlight positioning and focus handling; failed sections offer Retry, Skip section and Exit. React/layout commits and cancellation signals handle transitions, without guessed loading delays. Existing scientific functions, data and export schemas remain unchanged. While a tour is active, assistant workspace mutations are paused; its conversation is retained.

Browser QA can reuse an existing Playwright installation without adding it to project dependencies:

```powershell
pnpm.cmd build
pnpm.cmd start --port 3106
# In another terminal, if Playwright is installed outside this project:
$env:PLAYWRIGHT_MODULE = 'C:/path/to/playwright/index.mjs'
node scripts/qa-lume-tour.mjs
```

`QA_BASE_URL` overrides the server URL and `QA_OUTPUT` overrides the evidence directory (the default is the system temporary directory, `firefly-lume-qa`). The script uses installed Chrome. See [implementation and verification notes](docs/lume-tour-validation.md).

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

The map assistant calls Google Gemini through `/api/assistant`, on the Gemini API's free tier. Create a key in [Google AI Studio](https://aistudio.google.com/apikey) and put it in `.env.local` (ignored by git):

```bash
GEMINI_API_KEY=...
# GEMINI_MODEL=gemini-3.6-flash   # optional, the default
```

Without a key the rest of the app works and the assistant says it is not configured. The key never reaches the browser: the route forwards one turn at a time, while the browser keeps the conversation and runs the map actions and record lookups the model asks for. The route allows 20 requests per minute per address. On the free tier Google limits requests per project and per day, and may use what is sent to improve its products; the assistant panel says so.

`pnpm dev` and `pnpm build` first copy the MapLibre worker into `public/maplibre/` (see [`scripts/copy-maplibre-worker.mjs`](scripts/copy-maplibre-worker.mjs)); the map needs it.

## Themes and scientific documentation

Headers use the original Lume mascot plus the compact wordmark **Lens**; the institutional name remains **FireFly Lens**. The original mascot component is unchanged. The SVG browser icon is rendered directly from that component, with its original geometry and colours.

The header offers **Light**, **Dark** and **System**. The preference is stored locally, applied before the first paint and synchronized with operating-system changes in System mode. Theme changes update CARTO dark/Positron map styles on the existing MapLibre instance, restoring custom layers and sensor visibility without changing the camera, area or analysis period.

The Method page supports keyboard tabs and shareable hashes, such as `/method#seasonal-z-score`. KaTeX renders the equations on the server with accessible MathML. Monthly medians/ranks and the local daily MAD heuristic are documented as implemented. Seasonal z-scores are explained as conceptual extensions, not displayed indicators. The offline Python pipeline is integrated through its exported real-data tiles; Python reference-calendar percentiles are not yet displayed. Contextual explanations cover activity, hot spots, medians, anomalies and FRP.

SVG downloads now include region, period, legend, data source and observed/modeled status, processing description and export timestamp. Scientific values and CSV schemas are unchanged. See [Phase 4 changes, evidence and limitations](docs/phase-4/validation.md).

## Deployment

The site deploys on [Vercel](https://vercel.com) from this repository: every push to `main` goes to production and every pull request gets its own preview URL. The only environment variable is `GEMINI_API_KEY`, for the map assistant (set it in the Vercel project settings). The data are static files in `public/data/brazil/` (about 10 MB), fetched by the browser per 4° tile.

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
