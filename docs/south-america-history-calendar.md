# South American history, calendar and navigation

This update restores the calendar-first sidebar and extends the other 11 sovereign
South American countries to **July 2002–December 2025**, matching the historical
start of the Brazilian record. Brazil retains its existing data through November
2026. Country scope remains the entire country; this is not a new validation of
subnational calibration.

## Real historical data and scientific continuity

The collection now includes **352 NASA FIRMS country archives**: MODIS 2002–2025
and NOAA-20 2018–2025 for each of eleven countries. The additional 176 MODIS
archives were actually downloaded. Terra is excluded; the established Aqua,
confidence, vegetation-fire and duplicate filters remain in place. Country
membership comes from the FIRMS archive, not from clipping points to a generalized
navigation outline.

Each new national series has **282 months**. Aqua observations supply the record
through 2023; country-converted NOAA-20 supplies 2024–2025. July 2002 is incomplete,
with the project record beginning on July 4. Months before NOAA-20's April 2018
start are not reported as observations of zero from that sensor.

The new older observations **do not enter sensor calibration**. Fitting remains
April 2018–2023, excluding the two documented Aqua outage months, with the same
2018–2021 training / 2022–2023 holdout, shrinkage, gates and bootstrap method.
An integration check compares every country's coefficients and holdout metrics
against the published PR #17 commit; they are unchanged. Paraguay still has
**+1.01% holdout bias, 9.57% WAPE and 0.950 Spearman**.

Climatology now uses eligible observed months in **2003–2023**. Past-only anomaly
references still exclude the target year and future observations. The existing
Python historical trend calculation can now use the longer eligible annual
record. Partial/outage/drift/modelled quality rules and forecast gates are
unchanged. Brazil's original example figures reproduce exactly; its calendar now
also labels the incomplete first month correctly. The method evidence exporter
was rerun to update the code checksum without changing its example numbers or
figures.

## Calendar and reports

Brazil and the other countries use the **same year/month sidebar and daily
calendar components**. The sidebar opens directly on the month grid, with no
line chart before it. The number of visible years adapts to the panel height;
Older/Newer controls reveal years that do not fit. The report button remains in
view without vertical scrolling. A compact daily CSV action is beside it.

Selecting a month opens its days. Country daily raw counts and daily map cells
come from the real country archive. Country-converted daily activity reuses the
Brazilian calendar's existing allocation: distribute the authoritative converted
monthly total by each day's degraded VIIRS count. Daily values sum to the month;
this is not an independently validated daily forecast or local-cell calibration.
Monthly country bounds remain explicitly parameter-only bootstrap ranges.

**See full report below** opens the historical charts and the History/Forecast
tabs. Country reports now also expose their daily calendar, sensor comparison
and downloads. Monthly CSV labels its actual reference years. Day/month maps,
CSV and share links retain the selected country and covered historical date.
Foreign selections are not silently moved into Brazil's former bounding box;
selection/navigation limits are separate from scientific data coverage.

Retrospective forecasts now work for exact published country geometries through
the same Python models and FastAPI endpoint as Brazil. The service validates the
trusted coverage catalog, report SHA-256 and exact geometry before reconstructing
the national series. An internal foreign polygon never receives a whole-country
forecast or Brazilian border-cell substitute. The browser accepts that country's
own published period rather than Brazil's end date. The container includes the
small national reports, without copying native archives or browser map partitions
into the final image.

Current activity forecasts remain withheld: the eligible observation tail ends
in 2023, and converted activity is not relabelled as observed training truth.
Past experiments retain the final-vintage limitation documented in
[continental-harmonization.md](continental-harmonization.md). Retrospective
execution and custom Brazilian polygon statistics require the configured Python
service; prepared country calendars and historical reports are static.

## South American navigation

The camera centre is constrained to **85°W–32°W, 58°S–14°N** in globe and flat
views, including direct gestures and programmatic moves. Zooming and local
exploration remain available. This envelope is a navigation rule, not a claim of
uniform calibrated cell coverage. Outside the footprint of the twelve published
countries, a dark basemap mask indicates the limited geographic scope. It is a
visual dimming layer, not meteorological fog or a modification of numeric data.
The mask is restored after style/theme changes.

The tour launcher is attached to the map's bottom-right area, beside zoom,
instead of fixed at the bottom-left of the page. It stays accessible on mobile
and during time-lapse; the existing automatic welcome, explicit opt-out,
interaction lock and workspace restoration are retained.

## Performance and verification

Published monthly spatial partitions total **6,168,692 bytes** across 27,643
small blocks. Daily maps use one country/month block, at most **72,946 bytes**,
instead of thousands of extra day/tile files: 3,073 blocks total 14,852,278 bytes.
The 264 country/year daily summaries total **556,523 bytes**. Opening a country
loads only its own small summaries, four at a time; a map day loads its month
block. Native archives and yearly processing Parquet remain offline. Tile and
regional caches remain bounded. See [data measurements](south-america-history-data.json)
and [offline export timings](continental-long-record-benchmarks.json).

Vitest now explicitly excludes `.worktrees/`. Earlier local test totals included
duplicate suites from other checkouts and are not a canonical count for this
application. After integrating main's assistant time-lapse update, the current
isolated suite has **212 tests in 38 files**; Python has
**62 unit tests** and **7 real-data integration tests**. These passed, including
unchanged Brazilian evidence, frozen country calibration, daily/monthly
reconciliation, native older-Aqua reconciliation when local archives are present,
exact-country retrospective forecasts and past-only references.

Browser evidence is in [south-america-history-qa](south-america-history-qa).
It covers the old Paraguayan calendar and CSV, a real September 2016 retrospective,
country switching, fitted calendars at 320/390 px, bottom-right controls, large
drag constraints in both projections and theme restoration. Basemap services are
not certified by these local checks. Existing Signals and all 16 guided-tour
steps passed after the layout changes, including mobile, retry and workspace
restoration checks. The Signals console result is saved beside the browser evidence.

## Reproduce

```powershell
analytics/.venv/Scripts/python.exe harmonization/pipeline/collect_continent.py --start 2002 --end 2025
# Repeat raw export for each country before national publication:
analytics/.venv/Scripts/python.exe harmonization/pipeline/continental.py --country PRY --offline
analytics/.venv/Scripts/python.exe harmonization/pipeline/national.py
analytics/.venv/Scripts/python.exe scripts/build-coverage-mask.py
node qa/data-audit/export-method-evidence.mjs
node node_modules/vitest/vitest.mjs run
analytics/.venv/Scripts/python.exe -m unittest discover -s analytics/tests -v
analytics/.venv/Scripts/python.exe -m unittest discover -s analytics/integration -v
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js
node scripts/copy-maplibre-worker.mjs
node node_modules/next/dist/bin/next build
# With Next and Python configured locally and PLAYWRIGHT_MODULE if needed:
node scripts/qa-south-america-history.mjs
node scripts/qa-firefly-signals.mjs
node scripts/qa-lume-tour.mjs
```

The raw export resets its own coverage entry until the national publication is
run again. Publish reports, coverage and partitions together. NASA weather
refresh/expiry remains independent of this historical-data expansion.
