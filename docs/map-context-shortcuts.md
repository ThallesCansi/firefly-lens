# Map context shortcuts

- On viewports up to 700px, the firefly launcher opens a dismissible introduction. Only “Start tour” launches the guided tour. Desktop retains one-click launch.
- The native MapLibre attribution keeps all credits and licence links. Its closed desktop button names the current basemap; mobile retains the information icon. Satellite labels appear only after that imagery is active.
- The “Future areas” notice is hidden for now. Existing South America camera constraints and the cloud overlay remain active.
- The analysis heading links to NASA FIRMS using the analyzed outline, selected day or inclusive month, and selected MODIS Aqua / VIIRS NOAA-20 platforms. Long outlines exceeding 7,000 URL characters use their enclosing extent, explicitly labelled in the link. NASA shows original detections; its availability and processing may differ from Lens.

## FIRMS protocol verification

Verified against the [official viewer](https://firms.modaps.eosdis.nasa.gov/map/) and its public parser on 2026-11-15. The hash uses `m:advanced`, `d:`, `l:` and `i:`. Advanced mode is required to retain individual satellite filters. Geometry is WKT with coordinate spaces encoded as `%20`; FIRMS expects punctuation literally. Both archive (`_sp`) and near-real-time layers are included for each selected platform. A real browser confirmed a September 2003 date range, the drawn polygon and Aqua filters in the official viewer. NOAA-20 availability still follows its mission dates.

## Reproducible UI verification

`scripts/qa-map-context.mjs` checks desktop and mobile at 1440×1000, 1100×900, 390×844 and 320×740 using the real MapLibre engine and published country data. Only the basemap style is substituted to avoid network timing. Checks cover native attribution expansion, mobile tour confirmation, NASA query parameters, calendar fit, and the nonblocking boundary notice in both projections. Set `PLAYWRIGHT_MODULE` to an installed Playwright module and optionally `QA_BASE_URL` (default port 3117).

The existing full tour regression also handles mobile confirmation. Unit tests cover NASA date validation, leap-year months, sensor/platform fidelity, WKT geometry and extent fallback, plus continent boundary detection.
