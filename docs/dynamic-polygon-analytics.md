# Dynamic polygon analytics

## Diagnosis before implementation

The starting checkout was `feature/brand-themes-method` (`6ea44c7`). Local and remote branch histories showed that `origin/main` (`13269c5`) already included the map/3D interactions, data audit, scientific engine (`02b3300`), analytics UI (`22daa0d`, `f2324a5`), and Gemini assistant (`fc67afe`). This work starts from that integrated commit on `feature/dynamic-polygon-analytics`; other agents' worktrees are untouched.

The restriction was an integration contract, not a missing forecasting algorithm:

* `src/lib/analytics/client.ts::loadAnalytics` loaded `/analytics/manifest.json` and required an exact `geometryKey` match to one of five prepared rectangles. A custom polygon returned `unsupported` before the Python engine could run.
* `src/components/lens/analytics/AnalyticsReport.tsx` rendered the “This exact geometry needs Python processing” message and a browser-only monthly chart for these selections.
* `analytics/integration/export_site.py::export_site` explicitly iterates `meta.presets`. Its real snapshots contain history, regional climatology, anomalies and region-specific retrospective model evaluation; they are not live requests.
* `analytics/src/firefly_analytics/data_adapter.py::from_parquet` already accepts arbitrary GeoJSON, computes intersection fractions, aggregates monthly totals and variances, checks completeness, and attaches source/quality flags. `history`, `climatology`, `anomalies`, `backtest` and `forecast` already exist in the same package.
* `src/lib/data/area.ts::loadArea` already sums real browser tiles using fractional polygon/cell intersections. `src/lib/harmonize.ts::buildRecord` uses those totals for calendars and browser medians. The browser record is cached by `useFireRecord`; it remains useful and unchanged. It does not provide independently verified provenance or the engine's complete per-month quality contract, so arbitrary client-supplied totals are not accepted as scientific input.
* `harmonization/pipeline/fire_calendar.py::calendar_for_polygon` is the Python reference: sum `w*x` before same-month statistics; modeled uncertainty uses `sum(w*w*variance)+(c*total)^2`. Existing adapter tests compare rectangles and irregular polygons against it. The harmonization pipeline is unchanged.
* The documented deployment is Next.js/Vercel with static tiles, plus Node route handlers for geocoding and the assistant. It has no Python runtime configured. A long-lived Python service is therefore the runtime boundary; no Parquet or Python runtime is added to the Next.js bundle. The monthly Parquet is approximately 9.6 MB in this checkout, rather than the full detection archive.

Real data: Brazil tiles, monthly Parquet, five published analytics bundles, and real retrospective evaluation. `analytics/examples/synthetic/` is test/demo input and is never loaded by the application. `fire_weather` explicitly reports an unconfigured provider; it is not an activity forecast. A current forecast containing null predictions is a deliberate scientific availability result, not a fabricated outlook or UI placeholder.

## Runtime flow and contracts

1. Selection keeps the existing map, geometry, calendars and downloads.
2. Browser posts only `{schema_version: "1.0.0", geometry, data_version, horizon: 3}` to `/api/analytics/history`. It never posts counts, source claims or validation scores.
3. Next proxies to `POST /analytics/history`. FastAPI/Pydantic rejects extra request fields, incompatible data metadata, invalid polygon topology, unsupported coordinates and horizons outside 1–3. All JSON result envelopes retain the engine's existing versioned schemas and are validated by Python and TypeScript.
4. The service reads its own immutable Parquet/parameters/metadata. It normalizes geometry, caches the authoritative aggregate, and calls the existing engine with forecasting disabled. History appears immediately on completion.
5. A separate `/api/analytics/forecast` request reaches `POST /analytics/forecast`, reuses the aggregate/history, and runs the existing expanding-origin comparison. History survives a forecast failure. A forecast loading notice is confined to Forecast.
6. Selection cleanup aborts requests and rejects already-decoded stale results. No response changes the selected region.

The cache is a bounded process-local LRU (48 entries, including intermediate aggregates), keyed by normalized geometry SHA-256, data and processing fingerprints, section, model configuration and horizon. Dataset fingerprints include Parquet, parameters, app metadata and Python engine source. Redeploy/restart on data changes. One computation per process is allowed at once; overloaded work returns HTTP 429 with Retry-After. Cached histories remain accessible during forecasts. Multiple replicas have independent caches; use one worker initially. No persistent or cross-region evaluation cache is trusted. `forecast` additionally binds any explicitly supplied evaluation to a hash of the exact `RegionalSeries`, preventing accidental validation reuse across areas.

HTTP statuses: 401 invalid service credentials; 409 dataset metadata mismatch; 422 invalid/outside polygon or invalid contract; 429 worker busy; 500 processing failure; 503 dataset/service unavailable. The client retries 429 up to three times with cancellable two-second delays. Exact prepared snapshots remain an integrity-checked fallback during 503 outages; custom selections keep their own browser history. No nearby preset is substituted. The archived manifest records its original engine commit; integration tests verify its actual Git source hashes instead of attributing archived validation to the new runtime engine.

## Scientific behavior

History includes monthly values with observation/estimate labels and flags, eligible complete annual totals, monthly reference mean/median/sample standard deviation/percentiles, past-only seasonal anomalies, and z-scores only when the reference is sufficient and dispersion nonzero. Reference years are 2003–2023 under the existing strict quality policy. Annual quality exclusions remain explicit gaps. Engine provenance records geometry, units, source files, processing version and last complete month.

Baseline seasonal median and seasonal naive run by default, with 32 bounded expanding origins, at least 96 eligible training months and 12 holdout origins per horizon. No baseline confidence interval is invented. SARIMA is opt-in through `ANALYTICS_ENABLE_SARIMA=1`, using the existing two small candidates and iteration budget; its own convergence and paired holdout gates still apply. This can be expensive on a cache miss; benchmark and warm the intended service before enabling it behind a 55-second proxy timeout. No claim is made that SARIMA beats the baselines on arbitrary regions.

With this snapshot the last complete month is October 2026, while 2026 values are harmonized estimates. The strict eligible observation tail ends in December 2023 (2024–2025 have orbital drift). Current numeric predictions are therefore withheld by the existing engine: `latest_eligible_observation_does_not_reach_forecast_origin`. Region-specific historical backtests can still be displayed. Supporting future numeric outlooks from a modeled tail would require a separately specified and scientifically validated method; this implementation preserves the existing policy. Software tests and synthetic examples do not validate a live regional prediction.

All selections inherit the 0.25° resolution limit. Fractional cells approximate activity within small polygons; they do not resolve individual local fires. Weights use area in square degrees, matching the original pipeline, rather than equal-area geometry. Zeros do not demonstrate acquisition coverage or absence of fire. Historical data are final-vintage, not a publication-vintage archive.

## Run locally (PowerShell)

```powershell
python -m venv analytics/.venv
analytics/.venv/Scripts/python.exe -m pip install -e 'analytics[api]'
$env:FIREFLY_DATA_ROOT = (Get-Location).Path
$env:ANALYTICS_API_TOKEN = 'local-development-token'
analytics/.venv/Scripts/python.exe -m uvicorn firefly_analytics.service:app --host 127.0.0.1 --port 8000
```

In a second terminal at repository root:

```powershell
$env:ANALYTICS_API_URL = 'http://127.0.0.1:8000'
$env:ANALYTICS_API_TOKEN = 'local-development-token'
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev
```

The same token is server-only on both processes. `FIREFLY_DATA_ROOT` defaults to the repository root for an editable installation. For a wheel/container it must point to a directory containing `harmonization/output/grid_monthly_total.parquet`, `harmonization/output/harmonization_params.json`, and `public/data/brazil/meta.json`. No FIRMS key or re-harmonization is needed.

The request schema is published at `analytics/schemas/request.schema.json` and checked against the Pydantic runtime model in tests. Polygon topology, closed two-dimensional rings, geographic bounds and dataset compatibility receive additional runtime validation.

Checks:

```powershell
analytics/.venv/Scripts/python.exe -m unittest discover -s analytics/tests -v
analytics/.venv/Scripts/python.exe -m unittest discover -s analytics/integration -v
pnpm.cmd test
pnpm.cmd exec tsc --noEmit
pnpm.cmd lint
pnpm.cmd build
```

## Deploy

Keep the existing Next/Vercel deployment. Host FastAPI on a separate Python 3.12+ service/container with the three immutable files above and the installed analytics package. Set `FIREFLY_DATA_ROOT`, a nonempty `ANALYTICS_API_TOKEN`, and optionally `ANALYTICS_ENABLE_SARIMA=1`. Run `python -m uvicorn firefly_analytics.service:app --host 0.0.0.0 --port 8000 --workers 1`. `/health` checks dataset availability and returns the processing fingerprint.

An image recipe is included in `analytics/Dockerfile`; from repository root run `docker build -f analytics/Dockerfile -t firefly-analytics .`. It copies only the package sources and the three required dataset files, excluding local virtual environments, browser tiles and detection archives. Supply the token through the host's environment/secret settings. Container build/publication still requires Docker and a chosen hosting account; neither has been executed here.

Set server-only `ANALYTICS_API_URL` to the service's HTTPS origin and the matching `ANALYTICS_API_TOKEN` in Next/Vercel. Allow at least 60 seconds for the forecast proxy where the hosting plan supports it. Keep the Python origin private or authenticated, with ingress body limits/rate limiting. Browser CORS is unnecessary: only Next calls Python. Deploy the matching metadata/tiles and service dataset together; mismatches fail closed with 409. Start with baselines; SARIMA throughput and timeout behavior need measurement on the selected host. No service has been published, and no push or merge is performed by this change.

## Delivery and verification

Changed files:

* Python runtime: `analytics/src/firefly_analytics/service.py`, `forecasting.py`, `data_adapter.py`, `analytics/pyproject.toml`.
* Next proxies: `src/app/api/analytics/history/route.ts`, `src/app/api/analytics/forecast/route.ts`, `src/lib/analytics/proxy.ts`.
* Client/UI: `src/lib/analytics/dynamic.ts`, `src/lib/analytics/useAnalytics.ts`, `src/components/lens/analytics/AnalyticsReport.tsx`.
* Tests/contracts: `analytics/tests/test_service.py`, `analytics/schemas/request.schema.json`, `src/lib/analytics/dynamic.test.ts`, `src/lib/analytics/proxy.test.ts`, `analytics/integration/test_site_exports.py`.
* Deployment/documentation: `analytics/Dockerfile`, `README.md`, `analytics/README.md`, this document, `eslint.config.mjs`, and the archived engine commit field in `public/analytics/manifest.json`. Existing scientific snapshot values are unchanged. ESLint now ignores other agents' worktrees and Python environments.

Verification completed locally:

| Check | Result |
| --- | --- |
| Python engine and API tests | 45 passed, including actual SARIMA fitting and temporal isolation tests |
| Archived snapshot integration | 1 passed, including original engine source hashes and all five real region bundles |
| TypeScript tests | 301 passed across 46 files |
| TypeScript compiler | Passed standalone and during production build |
| ESLint | Passed |
| Next production build | Passed; both analytics routes emitted as dynamic handlers |
| HTTP smoke test | Next production server → authenticated FastAPI → real Parquet; irregular polygon, History and Forecast both HTTP 200 |

The HTTP test returned 293 regional monthly records. First History request took 22.494 seconds in the local Windows environment, including cold initialization; Forecast with the reused aggregate took 1.051 seconds. These are single-request smoke measurements, not throughput guarantees. Both proxies allow 55 seconds upstream and declare a 60-second hosting duration. The current forecast correctly returned unavailable with the missing eligible-observation-tail reason. No current numeric regional forecast is claimed as validated. Baseline backtests are recomputed for the requested area; actual SARIMA tests verify software behavior on reproducible test series, not live regional predictive skill.

No visual browser automation or Docker image build was performed. The service needs deployment credentials, hosting selection and matching environment variables before arbitrary-region scientific results work in production. Without configuration, browser history and the five exact prepared scientific bundles remain available. The existing chatbot, 3D map, spatial selection code and harmonization algorithms were preserved.
