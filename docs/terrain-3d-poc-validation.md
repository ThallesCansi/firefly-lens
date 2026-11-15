# Phase 2A — Real terrain proof of concept

Branch: `feature/terrain-3d-poc`. Baseline: `898a8fb3` (main, including PR #21). The initial tree was clean and the remote main comparison was identical. All implementation and evidence changes remain uncommitted. No new dependencies, engine, orbit controls, scientific data, analytical calculations, export changes or imagery-provider changes.

## Implementation and operation

Open **Camera → Terrain 3D**. It starts OFF on each workspace mount. It uses actual elevation geometry through MapLibre GL JS **6.18.0**, not hillshade. Activation does not request navigation or modify pitch/bearing. Existing cartography and NASA Blue Marble drape over terrain through the native renderer. Blue Marble is still a static August 2004 composite, unrelated to the selected scientific period.

While terrain is loading or active, scientific fill-extrusions are suspended and the existing hotspot markers are used. The original column preference is never written by this policy. On terrain exit or failure, the existing column presentation returns. Tutorial and RegionFlight suspend terrain while retaining its requested state; terrain resumes afterward. The complete sixteen-step scientific demonstration remains unchanged.

The control lives inside the existing Camera popover, with accessible pressed state, descriptive text and polite loading/failure announcements. Narrow viewports use a scrollable gap instead of covering the calendar, map tools or FireFlighter launcher. No Standard/Cinematic selector behavior was changed.

### Files and ownership

| File | Responsibility |
| --- | --- |
| `src/lib/map/terrain.ts` | Provider constants, off/loading/active/unavailable lifecycle, generation-guarded listeners, style restoration, source teardown and presentation policy. |
| `src/components/lens/map/TerrainControls.tsx` | Compact toggle and loading, failure, suspension and column-pause explanation. |
| `src/components/lens/HotspotMap.tsx` | Owns local requested state, connects style lifecycle and presentation to existing layers, and suspends terrain for tutorial/RegionFlight. |
| `src/lib/map/controller.ts` | Optional `preservePose` in `setTilt`, so presentation suspension updates locks without camera navigation. Retains the pre-column attitude across terrain suspension. |
| `src/components/lens/map/CameraControls.tsx` | Adds the terrain slot and recognizes the current analysis panel/launcher as placement obstacles. Profile selector unchanged. |
| `src/lib/map/camera-popover.ts` | Allows a valid narrow side gap after edge clamping instead of falling back to a full-height overlapping menu. |
| `src/app/workspace.css` | Scoped toggle and explanatory-text styles. |
| `src/lib/map/terrain.test.ts`, `controller.test.ts`, `camera-popover.test.ts` | Lifecycle, scientific presentation, camera pose and mobile placement regression checks. |
| `scripts/qa-terrain-renderer.mjs` | Real installed engine plus actual production terrain/basemap modules; real DEM/NASA, paired geometry screenshots, decoded elevations, poses, network and render cadence. |
| `scripts/qa-terrain-poc.mjs` | Actual production application: state preservation, native navigation, overlays, drawing/editing, tutorial, RegionFlight, failures and responsive UI. |

Terrain state stays in the existing mounted map. The tutorial cannot alter the choice because its background is inert. No new tutorial steps or workspace snapshot schema are needed for this local presentation state. It is intentionally not added to scientific share URLs or exports.

### Exact provider configuration

Verified before implementation: TileJSON and an Andes tile returned HTTP 200 and `Access-Control-Allow-Origin: *`. The TileJSON declares XYZ, Terrarium and 512 pixels, but does not declare maxzoom. The global archive is documented as z0–12, so the production configuration supplies the cap explicitly:

```json
{
  "id": "mapterhorn-terrain",
  "source": {
    "type": "raster-dem",
    "tiles": ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
    "encoding": "terrarium",
    "tileSize": 512,
    "minzoom": 0,
    "maxzoom": 12,
    "attribution": "Elevation: © Mapterhorn / source attribution"
  },
  "terrain": { "source": "mapterhorn-terrain", "exaggeration": 1 }
}
```

The displayed attribution links to the provider's source/license list. No API key or local DEM archive is used. The app uses the verified tile template directly, avoiding default encoding/zoom assumptions from TileJSON. Data licenses remain distinct from the service: Mapterhorn's global catalogue identifies Copernicus GLO-30, with its own source attribution and license; the Mapterhorn project's code license is not a universal license for the underlying data.

References: [data access](https://mapterhorn.com/data-access/), [TileJSON](https://tiles.mapterhorn.com/tilejson.json), [attribution](https://mapterhorn.com/attribution/), [source catalogue](https://download.mapterhorn.com/attribution.json), [MapLibre terrain example](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/).

AWS/Mapzen Terrarium remains a possible separately reviewed alternative. There is no automatic provider switching in this proof of concept.

## Lifecycle and failure safety

The manager does not install the source until requested and the style is ready. Installation is idempotent. Individual listeners belong to an installation generation; removing terrain, replacing the style or disposing the manager invalidates old data/error callbacks. A queued failure from an old installation cannot affect a later one.

MapLibre 6.18 sends decoded raster-DEM tile events with a `tile` field, often without `sourceDataType: content`. Readiness therefore accepts those actual tile events and checks source loading; metadata alone does not mark the terrain active. This was verified with real decoded elevation in the browser.

On a source error or initial loading timeout (25 seconds), the manager detaches terrain and removes its source, publishes unavailable, and restores normal scientific presentation. Failures are deferred out of the source-update stack. There is no retry loop; the user can switch off/on to retry. Abort errors and unrelated scientific/basemap errors are ignored by the terrain failure handler.

On normal theme changes, terrain is detached before style replacement and reinstalled on `style.load` only if still requested. Basemap visibility changes and projection changes reuse the same engine. Disabling detaches terrain before source removal and creates no further DEM requests. Callbacks do not navigate the camera. Source teardown may cancel in-flight requests.

## Genuine terrain and projection evidence

The renderer script serves the installed engine and TypeScript-transpiled production modules in a browser harness. It does not mock elevation values, use a second engine or add test-only hooks to the application. The application script separately verifies the actual React workspace.

All pairs below use the same center, zoom, pitch **60°**, bearing **0°**, viewport **1200 × 850**, production Blue Marble transformation and terrain exaggeration **1×**. The ON screenshot is captured after successful DEM decoding. Numeric camera options are not compensated between OFF/ON.

| Location | Center (longitude, latitude) | Zoom | Decoded center elevation | Mercator pair | Globe pair |
| --- | --- | --- | --- | --- | --- |
| Andes near Aconcagua | -70.01, -32.68 | 9.6 | 4,522.2 m | [OFF](terrain-3d-poc/andes-mercator-off.png) · [ON](terrain-3d-poc/andes-mercator-on.png) | [OFF](terrain-3d-poc/andes-globe-off.png) · [ON](terrain-3d-poc/andes-globe-on.png) |
| Serra do Mar | -43.04, -22.46 | 10.0 | 2,094.8 m | [OFF](terrain-3d-poc/serra-do-mar-mercator-off.png) · [ON](terrain-3d-poc/serra-do-mar-mercator-on.png) | [OFF](terrain-3d-poc/serra-do-mar-globe-off.png) · [ON](terrain-3d-poc/serra-do-mar-globe-on.png) |
| Pantanal | -56.5, -19.0 | 9.4 | 105.4 m | [OFF](terrain-3d-poc/pantanal-mercator-off.png) · [ON](terrain-3d-poc/pantanal-mercator-on.png) | [OFF](terrain-3d-poc/pantanal-globe-off.png) · [ON](terrain-3d-poc/pantanal-globe-on.png) |

These are sampled DEM elevations, not surveyed ground truth or a measurement of the Aconcagua summit. Additional Andes samples ranged from approximately 4,123 to 5,914 m. The OFF images remain flat despite their baked shading; the ON images show perspective deformation of real relief.

Both Mercator and globe rendered successfully. The script also tests projection changes with terrain active, dark cartography/light satellite style reloads, and a globe flight through zoom 12.2. The source never requested above z12. No uncaught page errors were recorded.

### Camera findings

Center longitude/latitude, zoom, pitch and bearing were unchanged by activation in all six comparisons, within floating-point noise. The native center-elevation field changed from zero to the decoded height. No compensating navigation was added.

Mercator kept the sampled center at the same screen location. Globe moved the projected center upward by **47.17 px** in the Andes, **26.01 px** in Serra do Mar and **0.83 px** in Pantanal, despite unchanged numeric pose. This native change in apparent framing remains an explicit PoC limitation.

The Andes oblique samples recorded project→unproject discrepancies up to **0.01417° in Mercator** and **0.01465° in globe**. Projection of an occluded point need not invert to that hidden point: unprojection can hit the foreground surface. The precise contribution of occlusion versus renderer limitations has not been isolated here. Other sampled locations had round-trip differences below approximately 3×10^-10 degrees. Phase 2B must classify visible/occluded points and validate mountain picking rather than treating round-trip error alone as a coordinate correction.

## Scientific and interaction findings

Actual application QA confirms:

- OFF by default and zero Mapterhorn requests before activation.
- Selected area, period and sensor state are unchanged by terrain activation.
- Existing columns return after OFF; column preference remains stored separately from effective visibility.
- Real hotspot markers stay visible during terrain, including the existing MODIS rings/VIIRS marks; see [markers and edited polygon](terrain-3d-poc/pantanal-markers-and-polygon.png).
- Geographic coordinate search changes the camera while retaining the selected scientific area. The Andes application image deliberately still shows the prior Pantanal selection; it does not claim spatial scientific calibration for the mountain location.
- Polygon drawing and corner editing work with terrain active in the tested Pantanal scenario. This does not certify high-relief/horizon editing in the Andes.
- Terrain loading can overlap a cinematic flight. Wheel interruption cancels it, the camera does not resume after settling, and subsequent native dragging moves the map.
- RegionFlight temporarily suspends terrain and shows its existing scientific columns; ending it resumes terrain.
- All sixteen tutorial steps run with terrain requested, using the real Pantanal September 2023 count **535**. Restore resumes terrain without losing the request.
- 1440, 390 and 320 px layouts retain accessible controls; the Camera menu avoids the current calendar panel and FireFlighter launcher, scrolling where space is limited.
- Injected DEM HTTP 503 restores normal map/columns and exposes an unavailable state. OFF during delayed tile loading remains OFF after delayed requests are released.

No scientific column/terrain coexistence claim is made. No column base/height formulas, hotspot coordinates or analysis geometries were modified. Native right-drag/tilt is not expanded into a new orbit mode; that remains Phase 2C.

Application screenshots: [Andes ON](terrain-3d-poc/andes-app-on.png), [Andes OFF](terrain-3d-poc/andes-app-off.png), [Serra do Mar](terrain-3d-poc/serra-app-on.png), [desktop control](terrain-3d-poc/1440-terrain-control.png), [390 px](terrain-3d-poc/390-terrain-control.png), [320 px](terrain-3d-poc/320-terrain-control.png), [failure fallback](terrain-3d-poc/terrain-failure.png).

## Network and frame observations

Final native-renderer run, across all six OFF/ON cases, style changes, animations and reactivation:

- **175 DEM responses, all HTTP 200**, with CORS open.
- Highest observed DEM request zoom: **12**.
- DEM response payload sum: **29,533,010 bytes** (~29.53 MB), individual payloads **9,688–269,454 bytes**.
- **59 NASA imagery responses** were observed in the same run.

These counts cover the entire multi-scenario run, not one activation. Body sizes are response payloads collected by Playwright and may include cached responses; they are not a claim about unique transferred network bytes or user-session cost. HTTP errors injected by the separate fallback test are intentionally excluded from this real-provider run.

A matched 1.2-second native bearing animation was observed in a 1.5-second sampling window on the same Andes scene, in headless Chrome with software WebGL:

| Terrain | Render events | Median interval between render events | p95 interval |
| --- | --- | --- | --- |
| OFF | 201 | 6.1 ms | 6.6 ms |
| ON | 225 | 6.1 ms | 6.9 ms |

The harness also records requestAnimationFrame cadence. These are event-interval observations under this environment, not GPU render durations, device-wide FPS or physical mobile benchmarks. More render events can reflect tile/terrain updates rather than superior performance. No hardware performance guarantee is made.

## Automated and browser validation

- **261 unit tests passed across 42 files**.
- Full ESLint, explicit TypeScript no-emit check, production build (16 routes) and `git diff --check` passed.
- New tests cover the DEM configuration and zoom cap, default-off behavior, idempotence, decoded tile readiness, style restoration, stale callbacks, timeout/error fallback, column preferences, pose-preserving suspension, pre-column attitude restoration and narrow popup placement.
- Scientific/data/analytics/export/column-formula/basemap sources compare identically to the baseline, as do dependency files.
- Real-provider native renderer and integrated application scripts passed.
- Existing cinematic application QA passed at 1440 light, 390 dark and 320 light, with globe/Mercator, presets, selection, drawing/editing, RegionFlight, columns and the tutorial.
- Existing standalone Lume QA passed all sixteen steps at 1440/1000/390/320 px, including read-only interaction boundaries, Back, Retry, Skip Section, Keep/Restore/Replay, opt-out/reload and exports after exit.
- Native gesture baseline comparison passed 40 traces (four geographic scales, five input types), with zero public Map.stop calls during manual gestures. Native interrupted-flight/drawing-lock and Standard→Cinematic cycle scripts also passed.

Browser evidence: [renderer and network measurements](terrain-3d-poc/renderer-results.json), [application](terrain-3d-poc/application-results.json), [cinematic](terrain-3d-poc/cinematic-results.json), [tutorial](terrain-3d-poc/lume-results.json), [gestures](terrain-3d-poc/gesture-results.json), [profiles](terrain-3d-poc/profile-results.json), [interruptions](terrain-3d-poc/interruption-results.json).

Reproduce using an existing external Playwright installation, without adding dependencies:

```powershell
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd exec tsc --noEmit
pnpm.cmd build
pnpm.cmd start --port 3106
# Another terminal; PLAYWRIGHT_MODULE points to an existing installation.
node scripts/qa-terrain-renderer.mjs
node scripts/qa-terrain-poc.mjs
```

`QA_OUTPUT` selects the evidence directory; defaults are system temporary directories. `QA_BASE_URL` selects the application server for the integrated script. Real-provider runs need network access to Mapterhorn and NASA. The application browser script replaces only the external cartographic style with a deterministic background; scientific data, DEM and NASA imagery remain real.

## Limitations and Phase 2B recommendation

**GO for Phase 2B correctness work; this PoC is not approval for unrestricted terrain/column coexistence or production-grade mountain picking.**

1. Investigate oblique terrain occlusion, readouts, selection outlines, labels and polygon handles, especially on globe near the horizon. Both projections render, but their camera/elevation behavior is not identical.
2. Resolve or explicitly accept the measured globe screen-framing shift before promising exact terrain pose restoration.
3. Keep scientific columns suspended until large-footprint centroid anchoring and scientific interpretation are validated. Do not alter height scales for appearance.
4. Blue Marble remains low resolution and pre-shaded, with inherited LOD/seam/detail differences visible even OFF; it fades to cartography at close zoom. No extra hillshade or photographic-detail claim was added.
5. Mapterhorn is an external community service without an application-specific SLA. Conservative failure handling can remove terrain after a tile failure; there is no automatic alternate provider or persistent offline cache.
6. Physical mobile GPUs, Safari/Firefox, screen readers, prolonged memory behavior and exact camera restoration after late DEM arrival remain further validation work. Mobile checks here use Chrome viewport/touch emulation.
7. Backend Python forecasts were not added or changed. The browser tests use available published reports; this phase does not constitute a new scientific model validation.

No commit, push, merge, PR or deploy was performed.
