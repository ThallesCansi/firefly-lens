# Meteorological assessment before History and Forecast

The full report starts with the current meteorological fire danger assessment,
followed by centered History/Forecast tabs. Brazil and the published national
reports share this order; changing tabs does not remove the weather assessment.
The sidebar calendar remains unchanged. Historical date selection does not
change the meaning of the current weather outlook: the UI states this explicitly.

The weather summary shows mean FWI, highest covered grid cell and coverage.
Original issuance/validity/member, spatial class fractions, provenance and
limitations remain accessible through disclosures. NASA GEOS-5 is labelled as an
experimental deterministic research forecast, independently of the activity
forecast. No probabilities, hotspot counts or local predictive skill are inferred.

## Numeric source and updates

The existing NASA importer preserves native values, source URLs and SHA-256,
uses the documented product keys to decode initialization/date, and subsets
South America without interpolation. No global UTC validity hour is fabricated.
The current imported issuance is 12 November 2026, with available valid dates
15–17 November. Those dates are source availability, not invented freshness.

The Render image now includes the weather libraries and the small bundled
NetCDF/sidecar. The authenticated `/analytics/fire-weather` endpoint uses the
existing ellipsoidal intersection weights, coverage accounting, class thresholds
and independent worker. Historical data, calibration and activity forecast gates
are unchanged. The container CI smoke check exercises real numeric weather and
then rechecks History under the same hard 512 MB memory limit.

`weather-refresh.yml` runs at 06:23 and 18:23 UTC or by manual dispatch. It imports
the latest published NASA issuance, validates a current assessment and publishes
one `weather-bundle.json` release asset under `weather-data`. The product includes
the subset bytes and matching source metadata. No code or scientific history is
auto-committed to main; data delivery does not require a new application build.

Render checks the asset at most once per hour during real weather requests. A
request wakes the free service naturally; no keep-alive pinger or paid job is
created. The source URL is supplied by the Docker image and needs no new token.
Downloads are bounded to 2 MB/15 seconds, checksum checked and passed through the
numeric reader before installation. Only two local versions are retained. Failed
updates preserve the previous/bundled product; expired dates remain unavailable.
Local execution does not fetch a remote product unless `FIREFLY_FWI_REFRESH_URL`
is set. An explicit `FIREFLY_FWI_NETCDF` override retains precedence.

Provider delays, GitHub Actions/release availability and Render startup remain
external dependencies. A successful source/transport check does not establish
meteorological skill for an individual ecosystem. Exact static country/preset
snapshots remain an expiry-checked outage fallback; arbitrary polygons use Python.

## Verification and activation

Run Python unit/integration suites, Vitest, TypeScript, ESLint and a production
build. `qa-weather-first.mjs` checks the actual local service and production build,
desktop/mobile placement, centered tabs, real custom-polygon weather, tab changes
and honest unavailable states. CI builds the actual Docker image with weather
dependencies and checks it under 512 MB.

After merging, Render must deploy the new main image. Existing Vercel URL/token
settings remain valid. Dispatch **Refresh official NASA weather** once, inspect
its successful run and the `weather-data` release asset, then verify production
for a custom Brazilian polygon and a country. If Render has automatic deployment
disabled, manually deploy the latest main commit; do not create another service.

Sources: [NASA GFWED](https://data.giss.nasa.gov/impacts/gfwed/),
[official NASA file convention](https://portal.nccs.nasa.gov/datashare/GlobalFWI/v2.0/20181216.README.txt),
[scientific data notes](../analytics/FIRE_WEATHER_SOURCES.md).
