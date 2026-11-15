# Phase 6 — Scientific Analytics Integration

Implementation branch: `feature/analytics-ui-integration`. Based on main `1b730a8` (including PR #8), with the independent engine from local branch `feature/scientific-analytics-engine`, commit `02b3300`, merged locally. No push or merge to main is part of this delivery.

## Data path

`analytics/integration/export_site.py` calls the existing Python `from_parquet` adapter with each study preset's **actual polygon**, then calls `analyze(max_origins=48)`. The engine's calculations are unchanged. It validates all five output sections with the original engine schema and writes one bundle per region plus a manifest under `public/analytics/`.

The input is the existing real `grid_monthly_total.parquet`, harmonization parameters and app metadata. The manifest records source/engine fingerprints, generation timestamp, data version, exact geometries and SHA-256 hashes of output bytes. JSON files are static assets suitable for Vercel; there is no Python execution inside a Next.js request.

`src/lib/analytics/client.ts` validates the manifest against the app's data metadata, matches the exact polygon independently of winding/start vertex, checks the bundle's content hash, validates the original JSON Schema and verifies fields needed by the UI. It rejects synthetic outputs, nonfinite numbers, incompatible units, wrong regions and retrospective origins. It never falls back to another region or matches only a bounding box. `useAnalytics` caches requests and suppresses stale results when geometry changes; failed requests can be retried.

TypeScript filters and formats existing outputs and computes SVG pixel coordinates. It does not calculate climatology, anomalies, percentiles, trend, model selection or validation metrics. Existing browser calendar/sensor calculations remain intact.

## What is displayed

- **History:** real monthly observations / harmonized estimates with uncertainty; eligible complete annual totals; fixed monthly climatology (median and p25–p75); selected-year comparison; absolute/percent anomalies, Z-score, robust Z-score and percentile; source/partial/null notes and underlying accessible data tables.
- **Forecast:** recent history and explicitly marked future horizon; availability, model recommendation, origin, eligible training span; paired temporal holdout MAE, RMSE, mean bias, 95% interval coverage, case/origin counts; paired performance by horizon; FWI availability; provenance and limitations.
- **Preserved:** monthly heatmap and daily calendar, sensor comparison, day-to-map selection, existing CSV/SVG/GeoJSON exports, globe/2D and geospatial tools. Tabs do not mutate geometry or selected map period.

All charts above have real data for **Amazon, MATOPIBA, Pantanal, Caatinga and Pampa**, selected through the existing Coordinates study-region presets. These names describe the existing rectangular study extents; they are not whole biome boundaries.

For an arbitrary rectangle, polygon or state, browser history/calendars/sensors/downloads remain available for that exact shape. Advanced Python sections show that a new offline export or on-demand service is needed. A state that overlaps a preset does not inherit its analysis.

## Scientific limits of this snapshot

Input coverage: **2002-07-04 to 2026-11-14**, latest complete month **2026-10**. July 2002 and November 2026 are partial. Observations are MODIS Aqua through 2025; 2026 is harmonized VIIRS, not observed ground truth. Python's default reference excludes partial months, documented outages and orbital drift in 2024–2025. Last eligible training observation: **2023-12**.

**No region has a supported current numeric forecast.** The requested origin is October 2026, beyond the last eligible observed training month. Predictions remain null. Historical backtesting does not override this guard. Model recommendations from the independent engine are:

| Region   | Recommendation  | Holdout cases | SARIMA MAE | Seasonal median MAE | Seasonal naive MAE |
| -------- | --------------- | ------------: | ---------: | ------------------: | -----------------: |
| Amazon   | SARIMA          |            55 |   1,463.70 |            1,792.07 |           2,575.07 |
| MATOPIBA | Seasonal median |            55 |   1,769.09 |            1,114.67 |           1,024.84 |
| Pantanal | Seasonal median |            55 |     767.65 |              759.95 |             928.20 |
| Caatinga | SARIMA          |            55 |     174.19 |              181.20 |             253.82 |
| Pampa    | Seasonal median |            55 |     113.38 |               99.99 |             109.18 |

Errors are Aqua-equivalent hot spots. Recommendations follow the engine's temporal selection policy; the UI does not choose a winner from the displayed holdout table. Forecasts, when supported by future inputs, remain experimental. There is no authenticated operational FWI provider configured. No FWI values or issuance times are fabricated.

The preserved exploratory browser panels use their existing 2003–2025 reference. The new Python reference is 2003–2023 with quality exclusions and, for anomalies, only years before the target. The page labels this distinction; the references should not be interpreted as equivalent.

## Run

From this branch/worktree:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Open the local app, choose Coordinates → a study-region preset → Analyze area, then scroll to the below-map report. `History` and `Forecast` share region and period without resetting the map.

To regenerate after updating the data or engine, install the engine using `analytics/README.md`, activate that Python environment, then run:

```powershell
python analytics/integration/export_site.py
pnpm test
pnpm lint
pnpm build
python -m unittest discover -s analytics/tests -q
python -m unittest discover -s analytics/integration -q
```

Regenerate all five bundles and the manifest together. Do not copy demonstration files from `analytics/examples` into public assets. A new data version intentionally invalidates old exports until regenerated.

Browser QA is reproducible with a locally running production server and Playwright/Chrome:

```powershell
$env:QA_BASE_URL = 'http://localhost:3107'
node scripts/qa-analytics-integration.mjs
```

Set `PLAYWRIGHT_MODULE` to an installed Playwright module if it is outside the repository. The script uses real MapLibre/WebGL, replacing only the external basemap with a deterministic background; map overlays and data requests remain real. Browser results and screenshots are stored in this directory. Production retains the original basemap.

Remaining integrations: authenticated FWI ingestion/display with provider issuance/member/lead metadata; an on-demand Python service or more exact-geometry exports for arbitrary selections; new eligible observed training data before releasing any current forecast. No operational validation claim is made.

## Changed files

| Files                                                                                  | Responsibility                                                                                       |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `analytics/integration/export_site.py`                                                 | Offline adapter/export using the unchanged engine                                                    |
| `analytics/integration/test_site_exports.py`                                           | Validate real exported contracts, geometries, fingerprints and current origins                       |
| `public/analytics/{amazon,matopiba,pantanal,caatinga,pampa}.json`, `manifest.json`     | Five real regional bundles and integrity/provenance manifest                                         |
| `src/lib/analytics/{contracts,client,useAnalytics}.ts`                                 | Typed contracts, schema/integrity checks, exact-geometry lookup, cache and stale-response protection |
| `src/components/lens/analytics/{AnalyticsReport,ScientificChart}.tsx`, `analytics.css` | History/Forecast panels, accessible plots and isolated theme-aware styling                           |
| `src/components/lens/AnalysisContent.tsx`                                              | Wrap the existing report and share its original date controls                                        |
| `src/components/lens/LensApp.tsx`                                                      | Preserve report tab state between analyzed geometries                                                |
| `client.test.ts`, `ScientificChart.test.tsx`                                           | Adapter/contract, null/partial/source and chart rendering regression tests                           |
| `scripts/qa-analytics-integration.mjs`, this directory                                 | Reproducible browser verification, results and screenshots                                           |

## Verification on 2026-11-15

- `pnpm test`: **97 tests passed**, 14 files.
- `pnpm lint`: passed.
- `pnpm build`: passed with the project's default Next.js/Turbopack production build.
- Python engine suite: **37 tests passed**. Site export integration: **1 test passed** (checks all five real bundles).
- Browser/Chrome: **8 checks passed**, zero page runtime errors. Includes real data/metrics, monthly/daily calendars, period filtering, keyboard tabs, rapid delayed region responses, unsupported shapes, HTTP 503/retry, globe/2D, light/dark and 320/390 px layouts. See `browser-results.json`.
- `git diff 02b3300 -- analytics/src analytics/schemas`: empty. Scientific engine calculations/schema were not changed.

The browser's external basemap is replaced only inside QA; production basemap and map code are unchanged. These checks validate the integration, not operational scientific forecasting skill.
