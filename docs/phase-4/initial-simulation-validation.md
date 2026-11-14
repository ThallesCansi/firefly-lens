# Historical record - initial Phase 4 validation

This document and its original screenshots describe the pre-integration simulated-data build. The active source has since changed to real Brazil data. See validation.md for the current integration.

# Phase 4 — Brand, themes and scientific transparency

Work is on `feature/brand-themes-method`, based on the merged Phase 3 `origin/main`. No push, merge or deployment is performed.

## What changed

- Compact headers compose the original Lume with **Lens**. The SVG paths, proportions, original colours, expression and animation remain unchanged; `src/components/firefly/Lume.tsx` is untouched. Theme variables are scoped on `.lume` to preserve its original colours in both themes. Metadata, institutional copy and export branding retain **FireFly Lens**.
- The inspected ICO was the default Next.js mark. `src/app/icon.svg` is a static rendering of the existing Lume component with the original colour values resolved, not a redesigned mascot. The original ICO is retained as a legacy fallback; modern browser metadata supplies the SVG icon.
- Theme preference supports Light, Dark and System, persists in `localStorage`, reacts to operating-system and cross-tab changes, and initializes the root attributes before first paint. Storage failure falls back safely; in that case only the current session can retain an explicit preference.
- Existing CSS tokens remain the integration seam for all components. Light uses green-tinted neutral surfaces, dark text, olive context accents and the existing lime button identity. Sensor hues stay blue/pink; activity remains the original ordered ember palette, with an adjusted zero-activity neutral. Dark retains the existing deep-green palette.
- MapLibre changes CARTO dark/Positron styles on the existing map. Each `style.load` restores area, draft and hot spot sources, scientific layers and sensor visibility, using the latest data and theme colours. Camera, selected area, dates and analysis mode are preserved. Basemap failure uses a themed plain background and an offline notice. First-load camera fitting stays separate from theme changes.
- Scientific explanation buttons use native auto popovers, keyboard/touch activation, outside-click dismissal, Escape and links to the relevant Method section. Escape dismisses the explanation before the surrounding analysis drawer.
- SVG export is a standalone, consistently dark scientific artifact with region, period, colour/ring legend, source/simulation identification, processing description and actual export timestamp. Original cell values, colours and ring conditions are retained. Out-of-range months in boundary years are dimmed. CSV functions and schemas are unchanged.

## Documentation structure

The route `/method` remains a single documentation centre. Accessible tabs support Left/Right/Home/End keys, roving focus, `aria-controls`/`aria-labelledby`, and direct tab/section hashes. Content is server rendered; KaTeX provides visual equations plus MathML without shipping its renderer in the interactive tabs bundle.

| Tab | Scope |
| --- | --- |
| Harmonization | Instrument differences, the implemented pipeline, grid definition, overlap calibration and fallback, daily common series, reference index, provisional validation and instrument references. |
| Historical Anomalies | Same-month medians/ratios/ranks, actual season and local MAD rule, clearly conceptual monthly mean/spread/z-score/percentiles, a fictional example, interpretation and statistical references. |
| Data & Limitations | Actual simulated source versus intended FIRMS inputs, coverage gates, hot spot/event/area/risk distinctions, FRP, missingness, sampling, calibration, provenance and status. |

## Scientific corrections and boundaries

Inspection of `src/lib/harmonize.ts`, `src/lib/data/source.ts`, `src/lib/data/mock.ts` and existing tests found:

- Grid aggregation reduces sensitivity to pixel multiplicity; it does **not** eliminate resolution/detection bias. Earlier prose stated the stronger claim; the documentation now qualifies it.
- Coverage in this source ends in **2025**, rather than “today”. The harmonizer’s VIIRS gate is **20 January 2012**, not all days from the start of 2012.
- The calibration factor is the ratio of overlap sums only when both sums are positive; otherwise the code uses **1**. This fallback is now explicit and is not described as measured agreement.
- The daily reference is `max(1, Q95(positive daily values))`; the daily internal index is capped at 1 and displayed on a 0–100 scale. Calibration and normalizing references use the full record, independent of the displayed range.
- Monthly totals are sums of daily VIIRS-equivalent cells. Medians include all available years including the selected year; ratios are null with a zero median; ranks count strictly greater same-month totals, so ties share rank.
- Monthly colours use a record-wide reference from positive monthly totals, not a same-month anomaly. The twice-median ring is a separate comparison.
- The deployed daily anomaly rule uses neighbours within ±10 days, excluding the target and clipped at record edges, with median and `1.4826 × MAD`. Its thresholds operate on the 0–1 index and are heuristic, not a significance test or seasonal z-score.
- The season estimate folds leap day, smooths a 365-slot mean with a circular 15-day window and follows the contiguous interval around the peak above 35% of peak activity.
- No monthly z-score, seasonal percentile-rank output or external Python integration exists in this checkout. Their documentation does not claim implementation. The fictional five-year example holds out a target year for explanation; it explicitly differs from the frontend’s inclusive baseline.
- FRP is a rate in MW. Per-sensor sums shown in day details are not integrated energy, unique-event intensity or inputs to the harmonized index.

No harmonization, calibration, anomaly, index, source-processing or dataset algorithms changed. No Python files were present or modified. CSV implementations remain byte-for-byte unchanged in the source diff.

## Verified references

- Giglio, L.; Schroeder, W.; Justice, C. O. (2016). *The collection 6 MODIS active fire detection algorithm and fire products*. Remote Sensing of Environment 178, 31–41. [DOI 10.1016/j.rse.2015.12.054](https://doi.org/10.1016/j.rse.2015.12.054), [full article](https://pmc.ncbi.nlm.nih.gov/articles/PMC6110110/).
- Schroeder, W.; Oliva, P.; Giglio, L.; Csiszar, I. A. (2014). *The New VIIRS 375 m active fire detection data product: Algorithm description and initial assessment*. Remote Sensing of Environment 143, 85–96. [DOI 10.1016/j.rse.2013.12.008](https://doi.org/10.1016/j.rse.2013.12.008). Also checked against NASA dataset metadata.
- [NASA FIRMS Active Fire Data](https://firms.modaps.eosdis.nasa.gov/content/active_fire/).
- [NIST/SEMATECH — Measures of Scale](https://www.itl.nist.gov/div898/handbook/eda/section3/eda356.htm).
- [NIST/SEMATECH — Detection of Outliers](https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h.htm).
- [R Core Team — Median Absolute Deviation](https://search.r-project.org/R/refmans/stats/html/mad.html).

Instrument references do not establish validation of this app’s provisional harmonization. No unverified numerical accuracy results are added.

## Components and dependencies

New: `Brand`, `ThemeProvider`, `ThemeSelect`, `ScientificInfo`, the Method tab shell, three Method guides, `Equation`, `MethodSection`, `References`, theme initialization and SVG presentation helpers. KaTeX and its TypeScript declarations are the only added packages. Existing Next.js/React/MapLibre versions remain unchanged.

Updated: root layout/global tokens, both headers, MapLibre style lifecycle, explanatory controls in the existing lens views, Method route, SVG export adapter/caller, README and browser QA scripts. No unrelated source-data refactor is included.

## Validation and evidence

- Vitest: **15 tests passed** — 11 existing scientific/source tests plus theme initialization and SVG preservation/escaping/provenance checks.
- Repository ESLint, TypeScript and production build pass.
- `scripts/verify-brand-themes.mjs`: **passed**. Explicit light/dark choices over system preference, persistence on reload, live System changes, original map canvas identity across styles, retained area/period/sensor choice, text-token contrast of at least 4.5:1 on both base surfaces, scientific popovers including touch, annotated SVG download, tab keyboard/hash navigation, mathematical rendering, 390 px and 320 px mobile width and server-rendered initial documentation.
- The existing map-workspace browser smoke **passed** again, including mouse/touch rectangle selection, month/day coordination, sensor switches, CSV, close/reopen, navigation, search and cancellation. Its screenshot directory is optionally configurable so regression QA does not overwrite Phase 3 evidence.

Screenshots: [dark workspace](screenshots/workspace-dark.png), [light workspace](screenshots/workspace-light.png), [light Method](screenshots/method-light.png), [dark anomalies](screenshots/method-anomalies-dark.png), [mobile workspace](screenshots/mobile-light.png), [mobile Method](screenshots/mobile-method.png).

## Run locally

Node 20.9+ and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm lint
pnpm build
```

Open `http://localhost:3000`, choose a theme in the header, and visit `/method`. On Windows with disabled PowerShell scripts, use `pnpm.cmd`.

Browser checks require an optional Playwright installation and Chrome. With Playwright resolvable, start the app and run `node scripts/verify-brand-themes.mjs` and `node scripts/verify-map-workspace.mjs`. Alternatively set `PLAYWRIGHT_MODULE` to an installed Playwright `index.mjs` file URL. Use `PREVIEW_URL` for a different origin and `SCREENSHOT_DIRECTORY` for Phase 3 regression captures.

## Limits

Real-data validation, Python integration and seasonal z-score/percentile outputs remain future work. Inputs are still simulated and identified as such. No data release/update date is fabricated; SVG records export time separately from provenance. The SVG uses a fixed dark palette for consistent standalone viewing; it does not depend on the current UI theme. Basemaps and place search require a network connection. Google Fonts are fetched by the existing Next font setup at build time. Browser coverage is Chrome with desktop/mobile emulation, not all physical devices or assistive technologies. Native popovers require a modern browser.
