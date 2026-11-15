# Cinematic Globe Navigation v1

Implemented on `feature/cinematic-globe`, from `5d457c7`. Changes remain uncommitted. This is Phase 1 only: no DEM, terrain, provider, dependency, scientific calculation or dataset changes.

The initial gesture-cancellation regression has been reproduced against the baseline and corrected. See [root cause, before/after measurements and revised menu screenshots](camera-regression-validation.md).

## Behavior

The Camera menu offers Earth overview, Focus Brazil, Focus Pantanal, Frame selected area, North up, Top-down, Stop flight, and Standard/Cinematic profiles. Cinematic is the default each fresh workspace mount, shared by React state and the controller. Startup preserves HOME and starts no flight. Changing profile never moves the camera. Presets change presentation only, including globe projection for Earth overview. They leave the region, period, sensor settings and analysis unchanged.

The cinematic profile uses native MapLibre flights for intentional navigation, with bounded durations and native curves. Bounds can arrive with a moderate 35-degree pitch; the existing 52-degree column view remains independent. Explicit pitch/bearing override that choice. Tutorial, layout and restore requests do not inherit cinematic styling. Existing search, administrative selection and RegionFlight use the same controller; RegionFlight still selects its real study rectangles and September 2024 when available.

## Coordination and framing

Navigation is scheduled once per layout frame so region selection and tilt effects combine into one operation. Each new automatic intent invalidates the previous generation before stopping MapLibre. Canvas input listeners and manual movestart invalidate only controller bookkeeping; they never call Map.stop or interfere with native gesture handlers/inertia. A real gesture also discards the retained region frame, so ResizeObserver cannot restart it. Native zoom buttons explicitly cancel controller work first.

Drawing locks and tutorial locks are tracked independently of tilt. Enabling/disabling columns cannot unlock drawing. When cinematic columns are switched off, the prior orientation is restored without undoing the person's new center/zoom. Standard keeps its north-up return behavior.

Framing measures the map's actual container and visible selection, introductory and period cards. Desktop side cards and mobile bottom cards reserve different margins. Tilt adds proportional perspective headroom, not a fixed zoom subtraction. On arrival, 25 geographic samples are checked with MapLibre's public `project` API against the usable viewport. At most one smooth correction, sized from the measured overflow, may settle a pitched request. It carries the same generation and cannot outlive a stop, gesture, newer request, style teardown or tutorial start. There are no idle-driven tours, timers or perpetual camera loops.

Earth overview uses the shorter available viewport dimension to choose a point/zoom camera. It does not pass a world bbox through safeBounds. Brazil uses an enclosing extent of the existing outline, including Atlantic islands. Pantanal and selected-area bounds are reused directly.

## Lume and compatibility

Before Lume starts, the controller stops active work and gives tutorial requests priority. RegionFlight is suspended and the chosen columns are saved. The saved camera contains center, zoom, bearing, pitch, projection and retained padding; padding matters when panels shifted the visual center. Restore uses a zero-duration request that does not inherit the cinematic profile. Bounds-only snapshots remain supported. Keep preserves the demonstrated workspace and ends any suspended regional flight. All sixteen steps and the real Pantanal/September 2023 example are retained.

Existing navigation requests remain valid: the new attitude, source and padding fields are optional. Existing uncontrolled HotspotMap consumers still have local column state; LensApp controls that state to support tour restoration. Camera profiles are not added to scientific share URLs or exports. Theme/data/sensor/month/basemap changes do not request cinematic travel. No original Lume artwork, column geometry/height scale or scientific source was changed.

## Files

- `src/lib/map/camera.ts`: shared Cinematic startup default and profile-specific planning; the standalone planner retains its Standard compatibility default.
- `src/lib/map/camera-presets.ts`: pure presets, angle constraints, responsive padding and sample generation.
- `src/lib/map/controller.ts`: cancellation, coordinated native execution, tilt locks, pose restoration and arrival validation.
- `src/lib/map/map-contract.ts`: optional request metadata and controller presentation methods.
- `src/components/lens/map/CameraControls.tsx`: compact native popover, grouped actions, profile explanation and keyboard/light dismissal.
- `src/lib/map/camera-popover.ts`: free-space placement around critical workspace controls, with viewport/collision tests.
- `src/components/lens/HotspotMap.tsx`: menu integration, actual viewport measurement, controller profile/tutorial state and zoom cancellation.
- `src/components/lens/LensApp.tsx`: capture/suspend/restore camera, columns and regional-flight state around Lume.
- `src/lib/onboarding/session.ts`: optional presentation snapshot fields; existing session lifecycle retained.
- `src/app/workspace.css`: scoped menu styling, including a viewport-anchored mobile popup.
- `src/lib/map/camera-presets.test.ts`, `controller.test.ts`, `src/lib/onboarding/session.test.ts`: new camera regressions and full presentation snapshot fixture.
- `scripts/qa-cinematic-camera.mjs`: real-browser presets, interruption, region selection, columns, drawing and cinematic Lume checks.
- `scripts/qa-lume-tour.mjs`: adapt existing QA to current auto-analysis presets, scoped picker options and concurrent Highlights bundle requests in failure injection.
- `README.md`, this report and screenshots: operation and review evidence.

## Verification

Automated tests: **213 passed across 30 files**. Lint, explicit TypeScript check and production build passed, including all 13 static pages. The scientific/data/analytics/export/column-scale source diff is empty.

The browser checks use installed Chrome with software WebGL in CI-like headless execution, at 1440, 1000, 390 and 320 px across the two scripts. Themes and reduced motion are covered. Scientific files, administrative boundaries and analytics remain real. The external OpenFreeMap style is replaced with a minimal deterministic style; the cinematic script loads real NASA Blue Marble tiles and checks successful responses. Aborted image requests during interrupted flights are expected cancellations, not application exceptions.

The cinematic suite exercises Standard and Cinematic, all presets, rapid requests, Stop, wheel interruption, resize, coordinate search, São Paulo administrative selection, RegionFlight, tilted columns, Mercator columns, drawing and corner editing. It also runs all sixteen Lume steps with the cinematic profile selected, checks the real value 535, and restores the previous workspace, columns and projection.

The separate Lume suite covers all sixteen steps at four widths, read-only mouse/touch/keyboard boundaries, Back through conditional panels, History/Forecast, Keep/Restore/Replay, reload/opt-out behavior, time-lapse suspension, actual CSV download after exit, Retry and Skip Section after injected failures.

Final screenshots: [Earth](cinematic-camera/1440-light-earth-satellite.png), [Brazil](cinematic-camera/1440-light-brazil-satellite.png), [Pantanal](cinematic-camera/1440-light-pantanal-satellite.png), [320px Earth](cinematic-camera/320-light-earth-satellite.png), [390px dark](cinematic-camera/390-dark-earth-satellite.png), [regional flight](cinematic-camera/desktop-regional-flight.png), [Mercator columns](cinematic-camera/desktop-mercator-columns.png), and [polygon edit](cinematic-camera/desktop-polygon-edit.png). Original browser results: [cinematic](cinematic-camera/results.json), [Lume](cinematic-camera/lume-results.json). The latest default-profile run recorded 570 successful NASA tile responses and no uncaught page errors; see the evidence below. The last unit/build run also verifies that Brazil's preset matches the exact shipped outline extent.

## Cinematic default and Standard restoration

The apparent profile leak came from camera attitude: Standard reused the current pitch (and point-navigation bearing), including a previous cinematic arrival. That pitch also affected framing padding. The React label and controller profile could already change, but the subsequent view still looked cinematic. Bounds flights additionally hardcoded their curve in the controller instead of using the planner's profile-specific curve.

Standard now defaults future ordinary user navigation to pitch/bearing zero, preserving explicit attitude and the enabled 52-degree column tilt. It uses the baseline bounds ease (at most 1,200 ms) and point-flight curves, without cinematic arrival parameters. Cinematic bounds use curves 1.8 on globe and 1.5 on Mercator and may arrive at 35 degrees. Changing profile alone deliberately preserves the physical pose, including an ongoing flight; it does not cancel or initiate navigation. Tutorial, restore and layout requests retain their own rules. Menu selection updates the controller synchronously, and controller recreation receives the current React profile.

Browser instrumentation calls the real working controller and native MapLibre 6.18.0, using the shipped Pantanal bounds and Sao Paulo administrative extent. The Cinematic → Standard → Cinematic cycle verifies both destinations in each iteration, including final native camera pose and the actual animation options. From Brazil to Pantanal, Cinematic used flyTo, curve 1.8, pitch 35 and 1,575 ms; Standard used easeTo, pitch/bearing zero, no curve override and 1,200 ms. Profile selection alone made no navigation call or pose change. Tests also cover initial Cinematic state, explicit attitudes, columns, reduced motion and Lume priority.

Current evidence: [native profile calls](cinematic-camera/profiles/profiles.json), [40 baseline/current gesture traces](cinematic-camera/profiles/gestures.json), [application desktop/mobile checks](cinematic-camera/profiles/integration-results.json), [all sixteen Lume steps at four widths](cinematic-camera/profiles/lume-results.json), and [default menu](cinematic-camera/profiles/1440-light-camera-menu.png). Gesture comparisons cover drag, right drag, wheel, touch and pinch at Earth, continent, Brazil and Pantanal scales, with no controller Map.stop calls during manual gestures. Existing cancellation and drawing-lock tests remain passing.

## Limits

- Chrome mobile viewport/touch emulation is covered; physical Android/iOS GPU performance and screen-reader review remain manual.
- No measured FPS or device-wide memory claim is made. Camera planning adds bounded work; native flights can request more tiles while zooming out. NASA latency remains provider-dependent.
- Arrival checks validate the geographic footprint, not every pixel at the top of a tall detection column. One bounded correction avoids an unending reframing loop; extreme geometries may still benefit from Top-down or Standard.
- Blue Marble remains the application's existing static composite, fading into cartography at close zoom. It is not an observation of the selected historical month, and its shading is not terrain geometry.
- No automatic orbit, multi-stage director, terrain or complete undo history was added.
