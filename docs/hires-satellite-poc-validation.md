# High-resolution satellite imagery proof of concept

Branch: `feature/hires-satellite-poc`. Local experiment only; no deployment, new dependencies, scientific changes or Git publication.

## Result

EOxCloudless Sentinel-2 2025 materially improves regional/local texture over the current NASA Blue Marble presentation. Mapterhorn terrain is especially effective with the new texture in the Andes and Serra do Mar. In the Pantanal the main improvement is imagery detail; its relatively flat landscape should not acquire exaggerated mountains.

Use **Camera → Satellite source → Sentinel-2 · 2025**. NASA remains the selected source on every new workspace mount; the existing satellite/cartographic preference is retained. The experimental source choice is not persisted. Terrain and projection remain independent.

## Files changed

- Updated: `README.md`, `src/lib/map/basemap.ts`, `src/components/lens/HotspotMap.tsx`, `src/components/lens/map/CameraControls.tsx`, `src/app/workspace.css`, `scripts/qa-terrain-poc.mjs`.
- Added application modules: `src/lib/map/imagery-providers.ts`, `src/lib/map/imagery.ts`, `src/lib/map/imagery.test.ts`, `src/components/lens/map/ImageryControls.tsx`.
- Added QA: `scripts/qa-hires-wmts.mjs`, `scripts/qa-hires-renderer.mjs`, `scripts/qa-hires-app.mjs`.
- Added documentation/evidence: this report and `docs/hires-satellite-poc/` (gallery, screenshots and JSON measurements).

## Architecture and attribution

- `src/lib/map/imagery-providers.ts`: provider IDs, tile URL/order, tile dimensions, zoom range, source credits, reference metadata and theme-specific paint.
- `src/lib/map/imagery.ts`: raster-only lifecycle; `off/loading/active/unavailable`, 25-second initial loading bound, explicit Retry, unique source generations, stale callback rejection and listener/timer disposal.
- `src/lib/map/basemap.ts`: retains the existing insertion point beneath roads, borders and labels, and supports a provider argument. The app initializes a hidden raster anchor; the manager installs only the selected provider.
- `HotspotMap.tsx`: integrates the manager with the existing style lifecycle. Source switching does not call `setStyle`, recreate the engine, move the camera, change the DEM or change scientific layers.
- `ImageryControls.tsx`: source selection, reference year, loading/error feedback and Retry within the existing Camera popover.
- `workspace.css`: responsive control styling and room for persistent credits. A ResizeObserver measures the credit block; EOX credits remain separate from map controls, the assistant, selection card and tour launcher. The compact mobile analysis layout uses a horizontal zoom group.

EOX uses direct browser requests:

```text
https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg
```

Matrix `g`, Web Mercator, JPEG, 256 × 256; configured native requests z0–14. This WMTS template is **z/row/column**, not z/column/row. Higher camera zooms may overzoom the capped source without implying more native detail. EOX opacity remains 1, including at z11.5–14; NASA retains its original z9–11.5 fade. Light EOX uses the delivered colors; dark EOX uses brightness maximum 0.8 and saturation -0.1. NASA theme settings remain unchanged.

The map displays the credit:

> EOxCloudless by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)

with links to EOX and CC BY-NC-SA 4.0, the reference-year explanation and notice that display colors may be adjusted. A dedicated visible EOX credit block accompanies the existing compact MapLibre attribution for other sources. The app explicitly delegates EOX attribution to that block, avoiding duplicate long credits in MapLibre's expanded panel. Standalone renderer consumers retain full source attribution by default. It is not associated with the selected MODIS/VIIRS month. No tile proxy, server-side cache, offline archive or tile redistribution endpoint was added.

Image failure removes only the failed raster and reveals the underlying cartographic style. Existing data and DEM remain available. Retry is explicit; switching provider or toggling the imagery layer also starts a fresh generation. If the external vector style is unavailable, the existing plain-ground fallback remains available.

The terrain module, encoding, native zoom cap, exaggeration, column-height expressions, datasets, calculations and export schemas were not changed. Terrain still suspends columns and retains their saved preference; Lume and RegionFlight still suspend terrain.

## Matched browser evidence

Open the [96-image comparison gallery](hires-satellite-poc/renderer/index.html). [Renderer results](hires-satellite-poc/renderer/results.json) record the requested and actual camera pose, readiness, elevation, network responses and screenshot paths.

Each of the three regions was captured at z8, z10, z12 and z14, with Mercator and globe selected, under these four conditions:

1. NASA / terrain OFF.
2. NASA / terrain ON.
3. Sentinel-2 / terrain OFF.
4. Sentinel-2 / terrain ON.

All captures use a 960 × 640 viewport, pitch 55°, bearing 0°, padding 0 and the exact requested center. After DEM loading the harness reapplies the same numeric pose and verifies center, zoom, pitch and bearing within floating-point tolerance. Terrain necessarily changes the projected landscape and elevation-relative camera position. Globe uses MapLibre's adaptive transition; selecting globe at high zoom does not imply a fully spherical local rendering.

The harness imports the actual installed MapLibre renderer and production basemap, imagery and terrain modules. A bare background isolates raster and terrain differences; it does not substitute fake tiles. NASA z12/z14 images show the bare background because the existing NASA fade is deliberately preserved. See application screenshots for the full vector style, labels and scientific UI.

| Region | Center [longitude, latitude] | Observed result |
| --- | --- | --- |
| Andes / Aconcagua | [-70.01, -32.68] | Rock, snow and valley textures become legible. At z12, the same Sentinel texture with terrain OFF versus ON clearly separates printed shading from actual mountain geometry. Snow and color variation remain visible. |
| Serra do Mar | [-43.04, -22.46] | Forest, rocky outcrops, roads and developed areas become clearer. Terrain gives the ridges depth. Dark shadows, blue-toned rock and mosaic tonal differences remain; 10 m imagery cannot resolve every cliff. |
| Pantanal | [-56.5, -19.0] | Water bodies, vegetation patterns and tracks are much clearer. Terrain adds little dramatic relief, as expected for this landscape. Water appearance represents the mosaic observations, not the selected fire-analysis date. |

Useful individual comparisons:

- Andes z12 [Sentinel flat](hires-satellite-poc/renderer/andes-mercator-z12-eox-sentinel-2025-terrain-off.jpg) / [Sentinel terrain](hires-satellite-poc/renderer/andes-mercator-z12-eox-sentinel-2025-terrain-on.jpg).
- Serra z12 [Sentinel terrain](hires-satellite-poc/renderer/serra-do-mar-mercator-z12-eox-sentinel-2025-terrain-on.jpg).
- Pantanal z12 [Sentinel terrain](hires-satellite-poc/renderer/pantanal-mercator-z12-eox-sentinel-2025-terrain-on.jpg).

This is raster draped over geographic elevation, not photogrammetric buildings or vegetation. Near z14, native resolution, source shadows and texture stretching on steep faces become more apparent. The experiment does not correct DEM accuracy, camera/picking limitations already documented in Phase 2A, mosaic seams or seasonal inconsistencies.

## Network and performance observations

The complete matched run recorded:

| Source | Responses | Unique URLs | Response-body bytes | Mean body size | HTTP statuses |
| --- | ---: | ---: | ---: | ---: | --- |
| EOX | 1,010 | 580 | 16,760,510 | 16,595 B | 1,010 × 200 |
| NASA | 129 | 55 | 1,585,796 | 12,293 B | 129 × 200 |
| Mapterhorn | 454 | 84 | 65,604,228 | 144,503 B | 452 × 200; 2 × 404 |

Observed maximum native requested zooms were EOX 14, NASA 8 and DEM 12. Six EOX requests were aborted during camera/source changes; these were recorded separately from HTTP failures. The two DEM 404s requested `https://tiles.mapterhorn.com/6/18/37.webp` during Andes globe z8 captures, once for each imagery provider. Both cases subsequently reached active terrain readiness; the missing-tile behavior is not an EOX failure or a DEM lifecycle change.

Counts include the sequential comparisons and browser cache reuse. `bytes` are response-body lengths read by Playwright, **not a measurement of uncached wire transfer**, GPU memory or billing. A case label follows the request start, so a boundary request may relate to the previous view. The browser was not forced into an artificial cold cache for every image. Screenshot files total about 8.26 MB.

Elapsed time per case, including settling and screenshot encoding, ranged from 436 to 4,357 ms, median 2,328 ms in this run. Headless installed Chrome used software WebGL (`--enable-unsafe-swiftshader`); this is not a hardware/mobile FPS benchmark. Additional browser suites ran in the same workstation session. Physical Android/iOS hardware, Safari and sustained GPU-memory measurements remain unvalidated.

[Live WMTS verification](hires-satellite-poc/wmts-check.json) separately records capabilities status/hash, product/matrix/URL/license checks and successful real z14 JPEG requests at all three centers, including payload sizes and CORS. The XML advertises HTTP; this implementation uses the working HTTPS endpoint. Shared matrix definitions must not be mistaken for the selected product's useful native zoom range.

## Automated and browser validation

- Full Vitest suite: **43 files, 269 tests passed**. New tests cover provider metadata/order/license, default NASA, EOX opacity, insertion order, source isolation, external attribution delegation, stale loads/errors, timeout, Retry, style replacement and cleanup.
- ESLint, TypeScript `--noEmit`, production build and `git diff --check`: passed.
- Real provider/terrain renderer: **96 matched cases**, both requested projections, all three regions and four zooms; no browser JavaScript exceptions.
- [Real application results](hires-satellite-poc/app/results.json): 1440, 390 and 320 px; real OpenFreeMap style, provider switching, visible credits, responsive menu, terrain, theme/projection changes, unchanged camera center during source switching, hidden/restored imagery, NASA after reload, source-scoped HTTP 503, Retry and delayed-response rejection. Application screenshots also cover scientific analysis and selection-card states.
- [Terrain/application regression](hires-satellite-poc/app-regression/results.json): Sentinel selected; real DEM, retained columns and selections at all three widths, drawing and vertex editing, RegionFlight, all 16 Lume steps with restoration, flight cancellation, terrain failure and stale-load handling. This suite stubs the external vector style only; imagery, DEM and published scientific files are real.
- [Gesture comparison](hires-satellite-poc/gestures/after.json): baseline `5d457c7` versus current controller; mouse drag, wheel, touch, right drag and pinch across four scales. Working manual gestures made zero `map.stop()` calls and passed the existing baseline-responsiveness assertions. Controller source was not changed.
- [Lume regression](hires-satellite-poc/lume/results.json): 16 steps at 1440/1000/390/320, auto-presentation, explicit opt-out, replay, interaction locks, section failure/Retry and restoration.
- [Scientific compatibility](hires-satellite-poc/scientific-regression/results.json): published Paraguay daily data, CSV schema/count comparison against the real source, fitted history calendar, Standard/Cinematic switching, forecast-unavailable behavior, geographic limits and responsive layout. This does not validate a live Python forecasting backend.

Injected HTTP 503 responses and aborted superseded requests are intentional test conditions. Browser-emulated mobile widths and touch input do not establish physical-device performance. Existing Phase 2A terrain picking limitations remain applicable.

## Licensing and suitability

The checked WMTS layer identifies the 2025 mosaic as **CC BY-NC-SA 4.0**. The application uses direct public WMTS access and preserves provider, Copernicus, year and license attribution. These comparison screenshots contain EOX imagery and are supplied under CC BY-NC-SA 4.0 for the EOX-derived visual material; application code and independent scientific records retain their own licenses. Preserve visible credits when sharing screenshots.

Sources checked:

- [EOX WMTS capabilities](https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml).
- [EOxCloudless license summary](https://cloudless.eox.at/documentation/license).
- [EOxCloudless FAQ and public-service conditions](https://cloudless.eox.at/documentation/faq).
- [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

A genuinely non-commercial public scientific/educational deployment is a plausible fit. Open-source code alone does not establish non-commercial eligibility. Commercial sponsors, monetization, client services or future reuse should be reviewed against the actual deployment model and, where unclear, confirmed with EOX. The public endpoint has fair-use restrictions, no guaranteed production quota/SLA and may throttle or block traffic. A commercial license does not automatically authorize commercial production use of the shared public endpoint.

**Recommendation:** suitable as a selectable experimental basemap for eligible non-commercial use, with explicit attribution, reference-date disclosure and the existing fallback. Keep NASA as default until visual review and public-service/licensing eligibility are approved. Do not treat this proof of concept as a production-service guarantee.

## Reproduce

Reuse the existing external Playwright installation; do not add a dependency. Set `PLAYWRIGHT_MODULE` to its absolute `index.mjs` path. `QA_BASE_URL` defaults to `http://localhost:3106` for application scripts; `QA_OUTPUT` overrides evidence directories.

```powershell
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd exec tsc --noEmit
pnpm.cmd build
pnpm.cmd start --port 3106
# In another terminal:
node scripts/qa-hires-wmts.mjs
node scripts/qa-hires-renderer.mjs
node scripts/qa-hires-app.mjs
$env:QA_OUTPUT = 'docs/hires-satellite-poc/app-regression'
$env:QA_IMAGERY_PROVIDER = 'eox-sentinel-2025'
node scripts/qa-terrain-poc.mjs
```

The renderer and WMTS checks intentionally contact the real providers. Run sequentially and avoid repeatedly downloading comparison sets unnecessarily. No credentials are required for these sources.
