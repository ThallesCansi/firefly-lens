# Historical Anomaly Radar — implementation validation

Implemented locally on `feature/radar-anomalias`. No push, PR, merge, deployment or Python pipeline changes. Existing `harmonize.ts`, `AnalysisContent.tsx`, science outputs and global indicators are unchanged.

## Delivered behavior

- Historical Highlights and Explore Period; five existing preset rectangles; configurable 2003–2023 reference with 2003–2025 comparison and target-year exclusion.
- Standalone monthly quality policy; incomplete/gap months remain explorable without radar ratios/ranks. July 2002, November 2026, August/September 2020 and March/April 2022 are excluded in this dataset.
- Real monthly summary derived by `loadArea` → `buildRecord`; 1,465 monthly records, 1,435 eligible for comparisons; 143,069 bytes (about 140 KiB). Geographic data for the five regions would otherwise require 27 tiles, approximately 5.21 MiB compressed / 31.02 MiB decoded.
- Every selected card commits a single explicit shape to selection and analysis and a month-only period; the existing frame navigation and stale-response guards handle subsequent map/history loading. An analysis-context card preserves the radar reference without changing the global historical grid.
- Nominal 95% predictive intervals for modeled values; no claim of validated region-specific coverage. No fire forecast or future-risk interpretation.

## Results under initial filters

| Region | Main reference highlights | Observed | Modeled | 2003–2025 comparison |
|---|---:|---:|---:|---:|
| Southern Amazon | 36 | 36 | 0 | 35 |
| Matopiba | 26 | 26 | 0 | 21 |
| Pantanal | 43 | 43 | 0 | 40 |
| Sertão | 24 | 23 | 1 | 20 |
| Pampa | 28 | 28 | 0 | 32 |
| Total | 157 | 156 | 1 | 148 |

See the generated [threshold report](historical-radar-report.md) for ratio-only counts, count/excess-floor diagnostics, exclusions and reproduction instructions. These thresholds remain provisional. The larger Pantanal count and the alternative-window changes need scientific/product review; no threshold was tuned to force a preferred result.

## Automated and visual validation

- `pnpm test`: 92 tests across 14 files, including 16 new tests for radar quality, comparison, all-five-region monthly parity against production calculations, fingerprints, parsing, cache deduplication and retry.
- `pnpm radar:check`: recomputes the real summary and report, verifies deterministic exact content and SHA-256 source fingerprints with line-ending normalization.
- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`: pass. The first sandboxed build could not download the existing Google Fonts; the network-enabled build passed without changing font configuration.
- `pnpm radar:qa`: passed against the production build in installed Chrome using temporary Playwright tooling outside project dependencies. Exercises `/` and `/lens`, both baselines and modes, all six excluded month/year combinations, five modeled intervals, no geographic-tile requests for radar browsing, one shared summary request, transport failure/retry, keyboard tab arrows, Escape/focus restoration, and 320px dark / 390px light layouts with overflow assertions.
- Race test: hold tile responses for Southern Amazon, select Pampa before releasing them, then verify the final map label, period, radar-context card and actual exported September 2004 monthly CSV value against the Pampa summary. The CSV retains its existing 0.1 rounding/schema.
- Visual inspection of desktop light and mobile dark/light screenshots. Screenshots are written under the system temporary directory (`firefly-radar-qa`), not committed. QA runs real MapLibre/WebGL, Brazil outline and scientific tiles with a deterministic blank CARTO style response; external basemap availability was not validated.
- `git diff --check`: clean. Branch and working-tree review confirm no changes to protected science/history files or dependency lockfile.

## Changed and added files

Existing files modified:

- `README.md`
- `package.json`
- `src/app/workspace.css`
- `src/components/lens/LensApp.tsx`
- `src/components/lens/MapControls.tsx`
- `src/components/ui/ScientificInfo.tsx`
- `src/components/method/AnomaliesGuide.tsx`

New files:

- `src/lib/data/month-quality.ts`
- `src/lib/anomalies.ts`
- `src/lib/anomalies.test.ts`
- `src/lib/data/radar.ts`
- `src/lib/data/radar.test.ts`
- `src/lib/useHistoricalRadar.ts`
- `src/components/lens/HistoricalAnomalyRadar.tsx`
- `src/components/lens/AnomalyCard.tsx`
- `scripts/generate-historical-radar.mjs`
- `scripts/qa-historical-radar.mjs`
- `public/data/brazil/historical-radar.json`
- `docs/historical-radar-report.md`
- `docs/historical-radar-validation.md`

## Limits

2003–2023 reduces potential influence of 2024–2025 orbital drift on the reference but does not correct drift in evaluated observations or fully resolve the source transition in 2026. Gap exclusions are conservative whole-month policy; no missing data were repaired. Zero detections alone do not establish missing coverage. References are retrospective and may contain years later than the target. Rank pools include eligible modeled and observed months and differ from reference pools. The existing global grid and daily local MAD flags keep their previous semantics; the radar context explicitly describes this difference. Only positive monthly anomalies and the existing five study rectangles are included. No exhaustive manual regression of every pre-existing drawing, administrative-selection or export path was performed; existing automated regression tests passed.
