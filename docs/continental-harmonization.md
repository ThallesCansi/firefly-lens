# National harmonization, real FWI and retrospective forecasts

Update of 15 November 2026, continuing `feature/scientific-continental-expansion`.
This supersedes the raw-only pilot and unconfigured-weather status in the first
[delivery report](scientific-expansion/README.md). Brazil's scientific algorithms
and published tiles remain unchanged. Integration with the updated main branch
is documented in [the PR validation record](main-integration-qa/README.md).

## Actual coverage

Brazil retains its original spatial/biome calibration and July 2002–November
2026 record. The other **11 sovereign South American countries** now have
separate **whole-country harmonized reports for July 2002–December 2025**:
Paraguay, Argentina, Bolivia, Chile, Colombia, Ecuador, Guyana, Peru, Suriname,
Uruguay and Venezuela. Choose a country under Coordinates or administrative
selection. Monthly and annual views reuse the existing Python report charts.

The new models were evaluated for national totals. They do not validate local
ecosystems, subnational polygons, individual grid cells or post-2023 sensor
transfer. An arbitrary foreign polygon is never assigned the whole country's
statistics. FIRMS country archive membership defines the activity domain; the
generalized Natural Earth outline is used for navigation/identity, not to remove
archive detections along generalized borders. The sensor map remains explicitly
raw. Its counts are never substituted for harmonized activity.

## Method and evaluation

The national method reuses the **existing Level-1 shrinkage estimator**. Its
implementation was extracted unchanged from `07_validate.py` into
`calibration.py`, also imported by the Brazilian validation script. No Brazilian
coefficients are transferred. One country is one calibration stratum; month of
year and day/night remain separate. With A observed Aqua and V degraded NOAA-20:

```
k_d = sum_over_months(A_md) / sum_over_months(V_md)
k_md = (sum(A_md) + 200*k_d) / (sum(V_md) + 200)
A_hat_md = k_md * V_md
```

The sensor/confidence/type and duplicate filters match the established pipeline.
NOAA-20 is degraded by distinct 0.01° subcell × UTC day × day/night, as before.
Standard-processing archives are required for every country/sensor/year;
missing inputs prevent publication rather than being replaced with zero.

**Temporal holdout:** fit 2018–2021, evaluate 2022–2023; exclude August 2020 and
April 2022 Aqua outages. The following gates were set in code before country
results were inspected: at least 20 holdout months; absolute total bias ≤20%;
WAPE ≤40%; Spearman ≥0.8; worst annual absolute bias ≤50%; MAE below raw VIIRS.
WAPE is `sum(abs(predicted-observed))/sum(observed)`. These are project acceptance
criteria, not a universal ecological standard. LOYO over 2018–2023 is an additional
diagnostic, distinct from the temporal holdout. The final fit uses 2018–2023.

All eleven passed these national gates. Aqua is observed through 2023; from 2024
the national record uses converted NOAA-20, avoiding uncorrected drifting Aqua
as nominal observations. This choice differs explicitly from the older Brazilian
observed-through-2025 record and does not silently change it.

| Country | Holdout bias | WAPE | Spearman |
|---|---:|---:|---:|
| Paraguay | +1.01% | 9.57% | 0.950 |
| Uruguay | −0.64% | 18.17% | 0.926 |
| Argentina | −7.04% | 9.84% | 0.987 |
| Bolivia | −7.20% | 9.03% | 0.993 |
| Chile | −14.13% | 21.33% | 0.966 |
| Colombia | −0.26% | 16.76% | 0.968 |
| Ecuador | −0.35% | 34.72% | 0.879 |
| Guyana | −14.73% | 18.11% | 0.979 |
| Peru | +0.86% | 10.56% | 0.987 |
| Suriname | −4.87% | 19.30% | 0.931 |
| Venezuela | −0.81% | 4.70% | 0.993 |

Each evaluation has 23 eligible holdout months. Full precision, coefficients,
thresholds, LOYO and limitations are in each country's `calibration.json` and
[national-harmonization-results.json](national-harmonization-results.json).

Uncertainty bands are the 2.5th/97.5th percentiles of **300 country-year block
bootstrap refits**, seed 42. Whole years are resampled, preserving season/day-night
dependence. Day/night predictions are summed **before** quantiles. These bands
measure parameter variability, exclude residual prediction error and do not
claim calibrated 95% predictive coverage. Ecuador's relatively high holdout
error and the short overlap remain visible; passing gates does not imply equal
performance across countries.

Climatology and past-only anomalies use the existing Python engine, reference
2003–2023 and minimum five eligible years. The historical start and exclusions
remain explicit; some months therefore have insufficient reference history.
Annual totals keep the established complete/eligible-year policy. Country
Signals require real evaluated data, complete targets and sufficient past
reference years. Their interior representative marker denotes the **entire
country**, not a local fire alert. Synthetic data remain disabled/rejected.

## Real meteorological fire danger

An official numeric NASA **GFWED/GEOS-5 experimental forecast** was acquired from
NASA NCCS. Shipped initialization: **2026-11-12 00 UTC**; daily local-noon valid
dates: **2026-11-15, 16 and 17**, leads 3, 4 and 5 days. The native file contains
`GEOS-5_FWI` on a **0.25° latitude × 0.3125° longitude** grid. The importer reads
actual coordinates and values, verifies the native product metadata, subsets
South America without interpolation and records native/normalized SHA-256 hashes.

Native GFWED `time=1`, `calendar=none` has no absolute time origin. The official
README documents its initialization/valid-date product keys. These keys are
decoded and cross-checked, not guessed: the API keeps `valid_date`/`lead_days`
and **null** `valid_at`/`lead_hours`, rather than fabricating a UTC noon valid
instant. `issued_at` denotes the documented GEOS initialization; the exact
publication instant is unavailable. Sidecar metadata preserve that distinction.

The same numerical raster reader calculates ellipsoidal polygon-intersection
weights, mean, maximum, valid-area coverage and class fractions. GWIS classes
are an explicitly chosen reporting convention, **not NASA SVS's class palette**.
No percentile/anomaly climatology is invented. FWI remains weather-driven danger,
not ignition probability, predicted hotspots or complete property risk.

Exact prepared geometries (11 countries and five Brazilian study regions) have
offline Python snapshots at `public/data/weather/snapshots.json`. These work
without Python hosting during an API outage. Custom polygons require FastAPI;
no statistics are recomputed in the browser. Snapshots expire automatically:
the shipped data are unavailable after 17 November unless refreshed. They are
never presented as newly issued data. Copernicus seasonal imports remain optional
and distinct; an authenticated EWDS download has not been verified.

Valid exact snapshots are preferred to avoid unnecessary raster startup. Weather
has an independent bounded worker, so a slow weather import cannot occupy the
History/Forecast worker. A concurrency regression test enforces that separation.

Data/provenance/refresh details and primary references are in
[FIRE_WEATHER_SOURCES.md](../analytics/FIRE_WEATHER_SOURCES.md).

## Activity forecast: actual progress and remaining gate

`POST /api/analytics/retrospective` now runs the **existing** baseline/naive/SARIMA
comparison at a requested historical origin. The Python engine restricts training,
model selection and backtest targets to evidence available by that origin. All
forecast targets must lie within completed history. The client uses a separate
contract and rejects future targets, geometry mismatch or future training.

In Forecast, choose *Historical forecast origin* and *Run retrospective forecast*.
For example, a September 2023 origin generates genuine October–December 2023
predictions and compares them against later eligible MODIS observations. Model
holdout metrics shown alongside the experiment existed by its past origin;
verification observations are not inserted into training. Baselines retain null
intervals. SARIMA remains opt-in for the service, with its existing convergence
and holdout gates. No forecast formula was replaced.

The underlying history is **final-vintage**. Date cutoffs prevent later target
months entering training/selection, but no publication-vintage archive exists to
reconstruct every revision actually available then. This is an explicitly
retrospective experiment, not certification of past real-time operations.

**Current activity forecasts remain withheld.** The Brazilian eligible observation
tail still ends in 2023. Converted VIIRS is not relabeled as observed truth, and
no new method for propagating calibration uncertainty into forecast training has
been validated. The expanded national histories now support past-origin
experiments, but their eligible observation tail still ends in 2023 and their
published activity record ends in 2025. Retrospective numeric forecasts and real
FWI are separate from an unsupported current hotspot-activity forecast.

## Reproduce and deploy

Use the existing analytics environment plus offline collection dependencies:

```powershell
uv pip install --python analytics/.venv --editable 'analytics[api,weather]' requests pyarrow pyyaml python-dotenv
# Real source collection; at most four network workers, member-only HTTP Range:
analytics/.venv/Scripts/python.exe harmonization/pipeline/collect_continent.py --end 2025
# Export raw monthly maps from the downloaded files (repeat per country):
analytics/.venv/Scripts/python.exe harmonization/pipeline/continental.py --country PRY --end 2025 --offline
# Evaluate and publish each country's own calibration; failed gates remain raw:
analytics/.venv/Scripts/python.exe harmonization/pipeline/national.py
# Refresh official numeric weather, then recompute prepared exact geometries:
analytics/.venv/Scripts/python.exe analytics/import_gfwed.py --days 3
analytics/.venv/Scripts/python.exe analytics/export_weather.py
```

Run raw export for all countries **before** national publication: the raw exporter
resets that country's coverage entry to raw until its evaluated national bundle
is published again. Review data and coverage manifests together. The helper
never creates harmonized status when input collection or evaluation fails.

Next/Vercel serves static country reports, map partitions and weather snapshots.
FastAPI supplies custom-polygon weather/history and retrospective experiments.
The Dockerfile includes the normalized weather pair. Configure matching
`ANALYTICS_API_URL` and `ANALYTICS_API_TOKEN` server-side as documented in
[dynamic-polygon-analytics.md](dynamic-polygon-analytics.md). `FIREFLY_FWI_NETCDF`
can override the bundled NASA file for an operator-supplied product. Weather
refresh is an offline operator/CI job; it is not an automatic browser download.
Production hosting/credentials were not changed.

The initial 176 real country archives were obtained successfully. The newer
[long-history update](south-america-history-calendar.md) adds 176 older MODIS
archives and supersedes the original pilot measurements and local test counts
below. Initially exported maps had
10,257 month/spatial blocks totaling **2,980,130 bytes**; private yearly cell
Parquet totals **2,615,157 bytes**. Re-export across eleven countries took about
242 seconds on this Windows machine. The normalized three-date weather file is
239,127 bytes and prepared assessments about 108 kB. Collection/input files stay
outside the browser; tile caches remain bounded. These are local measurements,
not throughput/FPS guarantees. See [expanded benchmarks](continental-expanded-benchmarks.json).

Tests cover temporal calibration isolation, exact national scope/checksums,
all national quality gates, original NASA hashes/date granularity/expiration,
old Brazilian algorithms/snapshots and retrospective evidence isolation.
The initial delivery suites passed: **337 TypeScript tests in 56 files, 60 Python tests and
5 integration tests**. TypeScript, ESLint and the final production build also passed. The Python suite emits
an upstream Starlette/httpx deprecation warning without test failures.

Chrome QA passed the eight flows in [browser-results.json](national-qa/browser-results.json),
including a real retrospective forecast, numeric NASA FWI, Paraguay/Ecuador
country selection and a 320-pixel viewport without page overflow. The expanded
Signals regression also passed real anomalies, tooltips, tour, toggles,
projection/theme changes, partial periods, mobile/touch and unavailable sources.
The basemap is controlled in the scientific browser script; these checks do not
certify availability of external map services in production.

The real irregular-polygon [HTTP benchmark](scientific-proxy-benchmark.json)
returned 293 historical months in 2.465 seconds, 0.148 seconds on repeat, the
correct withheld current forecast in 0.350 seconds and official numeric weather
in 3.556 seconds. A separate real [retrospective result](national-qa/retrospective-result.json)
at September 2023 produced October–December predictions with training ending in
September 2023, using the unchanged seasonal-median model. These are individual
local measurements, not latency guarantees.

```powershell
node node_modules/vitest/vitest.mjs run
analytics/.venv/Scripts/python.exe -m unittest discover -s analytics/tests -v
analytics/.venv/Scripts/python.exe -m unittest discover -s analytics/integration -v
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js
node scripts/copy-maplibre-worker.mjs
node node_modules/next/dist/bin/next build
# With Next and Python configured locally, and PLAYWRIGHT_MODULE if needed:
node scripts/qa-scientific-expansion.mjs
node scripts/qa-firefly-signals.mjs
```

The local binaries avoid the existing pnpm shim/registry-signature problem;
signature verification was not disabled. Screenshots and real retrospective
evidence are in [national-qa](national-qa).
