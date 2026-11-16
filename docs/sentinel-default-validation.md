# Sentinel-2 default imagery: isolated implementation and validation

## Git safety and scope

The working tree was clean on `feature/sentinel-default`, with HEAD equal to the latest fetched `origin/main`: `59ff514f4129e384b82414e0f7ce55bf8f2cdf80`. The source branch remained at `ab399f570386ddd7c5547c0d8a2d81378cbdac3d` throughout this work. No merge, cherry-pick, branch checkout, commit, push, PR or deployment was performed.

Only the four imagery modules were extracted from the source branch and adapted. Integration files were reviewed against current main and patched selectively. Main's camera icon, improved night lighting, theme-dependent coverage mask, redesigned selection cards, fitted calendars, link preview and newer tutorial remain intact. No experimental integration file or screenshot gallery was copied wholesale.

## Behavior and architecture

- **Default:** `eox-sentinel-2025`, shown as **Sentinel-2 · 2025** in **Camera → Satellite source**. NASA Blue Marble remains selectable.
- **Existing preference:** the unchanged `firefly-lens-basemap-2` key continues to control satellite versus cartographic mode. A stored cartographic choice remains cartographic on reload, without loading the hidden imagery. Choosing a provider explicitly enables satellite mode.
- **Provider state:** local React state only, reset to Sentinel on a fresh workspace load. It is absent from scientific URLs, records, exports and analysis parameters.
- **Raster-only lifecycle:** unique source generations, guarded error/completion callbacks, `off/loading/active/unavailable`, 25-second initial loading bound, explicit Retry and cleanup on style replacement/unmount.
- **EOX failure:** the failed raster is removed, revealing the existing cartographic map. Scientific layers and camera handlers stay available. The menu offers **Retry imagery** and **Use NASA Blue Marble**. NASA fallback is an explicit user action, not an undisclosed automatic provider change. If NASA also fails, cartography remains available.
- **Style restoration:** theme changes use main's existing style lifecycle; the selected provider is restored beneath roads, borders, labels and scientific layers. Source switching itself does not recreate the map, replace its style or initiate navigation.
- **Camera:** center, zoom, pitch, bearing and projection are unchanged by provider switching. The camera controller, gestures and scientific column formulas are byte-for-byte unchanged from main.

The provider configuration contains ID, label, reference metadata, mosaic year, tile URL/order, dimensions, zoom range, attribution and theme-specific paint. EOX uses direct HTTPS WMTS requests:

```text
https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg
```

Matrix `g` is Web Mercator; tiles are 256 px JPEG, native requests capped at z14. The order is **z/row/column**. EOX opacity stays 1 through local zooms and overzoom does not imply additional native resolution. NASA retains maxzoom 8 and its original z9–11.5 fade. Both providers retain main's night presentation: brightness maximum 0.92 and saturation -0.08. This intentionally preserves newer main behavior rather than the older PoC's darker settings.

## No experimental elevation functionality

No elevation module, control, DEM source, rendering policy or camera modification was imported. The implementation does not call `setTerrain`, declare `raster-dem`, request Mapterhorn, or introduce Orbit. The existing globe projection and detection columns remain main's original functionality. Application QA explicitly records zero forbidden provider requests. Installed MapLibre's own capabilities are unchanged; no new engine dependency was installed.

## Attribution and licensing

The custom EOX card, ResizeObserver and attribution-dependent layout offsets have been removed. Full provider attribution is forwarded unchanged to the standard compact MapLibre control. Its native summary is collapsed once at initialization; subsequent mouse, touch and keyboard toggles remain standard. Opened credits are width-bounded to the map and appear above overlapping controls only while expanded. No space is reserved in the workspace.

The Camera menu shows provider labels and a short reference-year note, with a link to `/method#background-imagery`. Method opens the existing Data & Limitations tab at the new background-imagery section next to Data sources. It explains provider alternatives, dates, visual limitations and licensing independently of scientific validation. The existing References component is reused with a separate imagery heading; scientific reference defaults are preserved. No tab or tutorial step was added.

The EOX FAQ explicitly permits on-click credits in compact interfaces and requires visible attribution in screenshots, videos and printed imagery. QA screenshots expand the native control for capture and restore its prior state immediately afterward. The normal interface remains collapsed, verified separately by DOM bounds and keyboard tests. User screenshots must likewise retain the expanded credits; the application cannot intercept operating-system screenshots. There is no basemap-image export in the current app. Scientific CSV and chart SVG exports contain no EOX raster and were left unchanged.

Sources reviewed:

- [EOxCloudless license summary](https://cloudless.eox.at/documentation/license).
- [EOxCloudless FAQ and public-service conditions](https://cloudless.eox.at/documentation/faq).
- [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

The 2025 mosaic requires eligible non-commercial use under CC BY-NC-SA 4.0, or separate commercial arrangements. Open-source application code alone does not establish eligibility. The team must confirm the actual deployment model before production release, including sponsorship/monetization and any ambiguous uses. The shared public endpoint has fair-use restrictions, can throttle/block traffic and has no production uptime guarantee. A commercial data license does not automatically authorize commercial production use of that public endpoint.

No server-side proxy, tile redistribution, scraping, bulk archive or persistent tile cache was introduced. Application code and independent scientific records retain their existing licenses. EOX-derived screenshots in this evidence directory carry CC BY-NC-SA 4.0 obligations; preserve visible credits when sharing them.

## Visual comparison against the source PoC

The isolated renderer compares the working imagery modules with the imagery modules read directly from `feature/hires-satellite-poc`, using the installed MapLibre engine. It never imports the PoC's map integration or elevation modules. Both renderers use center/zoom/pitch/bearing/projection and viewport matched exactly: **960 × 640, z12, pitch 55°, bearing 0°, Mercator**.

| Location | Center [longitude, latitude] | Comparison |
| --- | --- | --- |
| Andes | [-70.01, -32.68] | [New implementation](sentinel-default/andes-production.jpg) / [PoC imagery only](sentinel-default/andes-poc.jpg) |
| Serra do Mar | [-43.04, -22.46] | [New implementation](sentinel-default/serra-do-mar-production.jpg) / [PoC imagery only](sentinel-default/serra-do-mar-poc.jpg) |
| Pantanal | [-56.5, -19.0] | [New implementation](sentinel-default/pantanal-production.jpg) / [PoC imagery only](sentinel-default/pantanal-poc.jpg) |

All three pairs produced **identical screenshot SHA-256 hashes**, not merely matching coordinates. Full camera pose also stayed unchanged through Sentinel → NASA → Sentinel switches in the real renderer. [Recorded poses and hashes](sentinel-default/renderer-comparison.json).

The harness uses a plain background to isolate imagery. Application screenshots use the real vector style, labels, columns and current main UI. This remains raster imagery, not reconstructed buildings or elevation. Existing mosaic shadows, seams, seasonal differences and the approximate 10 m detail limit remain relevant.

## Checks and browser coverage

- Complete unit suite: **43 files, 264 tests passed**. Coverage includes Sentinel default, explicit NASA, unchanged night styling, EOX opacity/WMTS/license/year, raster ordering, source isolation, late callbacks, timeout, Retry, style replacement, disposal and full attribution forwarding.
- ESLint, TypeScript `--noEmit`, production build and `git diff --check`: passed. The build retains main's Open Graph image route and all scientific API routes.
- [Application QA](sentinel-default/application-results.json): real imagery and vector basemap at 1440/1000/390/320 px; default Sentinel, manual NASA, retained cartographic preference on reload, source visibility, light/dark, globe/Mercator, compact keyboard-accessible attribution, fitted Camera menu, scientific columns, open/closed analysis and selection, RegionFlight, injected EOX HTTP 503, explicit NASA fallback and Retry. Zero browser JavaScript exceptions and zero forbidden provider requests. There are no longer attribution-specific offsets for cards, the toolbar, the guide or the assistant.
- Camera QA: geographic presets, responsive framing, reduced motion, flight cancellation, native gestures, scientific columns, polygon drawing and vertex editing, and tutorial camera/workspace restoration. It retains Standard/Cinematic behavior.
- Native gesture comparison: baseline `5d457c7` versus the unchanged working controller across four scales and mouse/touch/wheel/right-drag/pinch. Working manual gestures call `map.stop()` zero times and pass baseline-responsiveness checks.
- Main's complete Lume QA: desktop/mobile, explicit opt-out, read-only locks, Back, Retry, restoration, downloads and the newer About/Method cross-page journey. Current main's full journey is retained, including the newer Pages stop and its 24-position presentation; it was not replaced with the older 16-step definition.
- Scientific compatibility: real Paraguay CSV schema and values compared to published source files, fitted historical calendar, Standard/Cinematic switching, forecast-unavailable behavior and continental camera constraints at all three widths.

The old camera QA contained stale assumptions from earlier main: the CSV button's accessible name, the Pantanal display value of 535, and completing before the newer cross-page tour. Only test expectations were updated: the current prepared series reports 355.68 (displayed as 356), the card CSV has its explicit accessible name, and camera QA traverses About/Method. No scientific function, file or tutorial definition was modified to satisfy a test.

Full auxiliary screenshots were kept outside the repository. Only concise application screenshots, six matched renderer images and [summarized regression results](sentinel-default/regression-results.json) are retained here. Desktop Chrome used headless software WebGL; mobile uses emulated touch viewports. Physical-device performance and Safari remain unvalidated. No live language-model call or configured Python forecasting backend was exercised.

## Changed files

Added application modules:

- `src/lib/map/imagery-providers.ts`
- `src/lib/map/imagery.ts`
- `src/lib/map/imagery.test.ts`
- `src/components/lens/map/ImageryControls.tsx`

Modified integration/documentation:

- `src/lib/map/basemap.ts`, `src/lib/map/basemap.test.ts`
- `src/components/lens/HotspotMap.tsx`
- `src/components/lens/map/CameraControls.tsx`
- `src/app/workspace.css`
- `src/components/landing/DataCredits.tsx`
- `src/components/method/DataGuide.tsx`, `src/components/method/References.tsx`, `src/components/method/MethodTabs.tsx`
- `README.md`

QA/evidence:

- New `scripts/qa-sentinel-app.mjs`, `scripts/qa-sentinel-renderer.mjs`, `scripts/attributed-screenshot.mjs`
- Updated `scripts/qa-cinematic-camera.mjs`, `scripts/qa-camera-main-integration.mjs`
- This report and `docs/sentinel-default/`

## Reproduction and readiness

Use the already-installed external Playwright module via `PLAYWRIGHT_MODULE`; no dependency installation is required. Run `pnpm.cmd test`, `pnpm.cmd lint`, `pnpm.cmd exec tsc --noEmit`, `pnpm.cmd build`, then `pnpm.cmd start --port 3106`. Run `node scripts/qa-sentinel-app.mjs` and `node scripts/qa-sentinel-renderer.mjs` in another terminal. `QA_BASE_URL` and `QA_OUTPUT` override application URL and evidence location.

The feature is isolated and technically ready for local review toward a PR into main. Team licensing/deployment eligibility review remains required before production release. It is not a production deployment or a service-availability guarantee. All changes remain uncommitted.
