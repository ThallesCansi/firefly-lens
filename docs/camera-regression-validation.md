# Camera gesture regression — diagnosis and verification

Branch: `feature/cinematic-globe`. Baseline: `5d457c7`. All changes remain uncommitted. No scientific source, data, export, column height scale, provider or terrain changes.

## Exact cause

The first cinematic implementation introduced unconditional calls to a controller `stop()` helper from both capture-phase canvas input listeners and `movestart` events with `originalEvent`. That helper called the public `map.stop()` API even when no automatic camera request was active.

In the installed MapLibre 6.18.0, `Map.stop()` stops both the animation scheduler and the gesture handler manager. The latter resets input handlers, clears inertia and drops queued gesture changes. Calling it from a manual `movestart` cuts off the drag after its first rendered movement. Calling it on each wheel event repeatedly resets native wheel accumulation. Touch, pinch and right-drag suffered the same interference. This was introduced by the feature, not MapLibre defaults or satellite imagery.

The pre-feature controller only cleared its remembered framing on manual `movestart`; it did not stop the map there. The browser reproduction below confirmed the difference before the fix was applied.

## Fix

- Split cancellation bookkeeping (`invalidate`) from deliberate camera stopping (`stop`).
- Pointer/touch/wheel/key input and manual `movestart` invalidate only owned queued work, active generations and remembered framing. They never call `Map.stop`, reset handlers, change sensitivity or disable inertia.
- MapLibre's native input pipeline interrupts its camera animation and continues the user's gesture. A cancelled request cannot later reframe through arrival events or ResizeObserver.
- Deliberate new automatic requests, the explicit Stop action, drawing locks, tutorial priority and teardown still stop camera work when appropriate.
- Idle manual input no longer publishes redundant flight-state changes. Drawing and tilt locks remain independent.
- Preserve native flight curves and durations. Replace two fixed 180ms arrival corrections with at most one 420ms correction sized from the measured projected overflow. No correction runs after user cancellation.

## Genuine browser comparison

`scripts/qa-camera-gestures.mjs` reads baseline controller/camera/projection/column modules directly with `git show 5d457c7:…` and reads the working modules from disk. It transpiles them with the already installed TypeScript and runs both against the same installed MapLibre engine in Chrome. It does not create a worktree, alter Git state or mock gesture handlers.

Both use a 1200 × 900 canvas, globe projection, the same centers/zooms and the initialization gesture settings from HotspotMap. A minimal background isolates navigation from network, data and React layout. Mouse/touch input is delivered through real Playwright/CDP browser input, not dispatched DOM movement events.

The same 180px horizontal/36px vertical drag is tested at Earth zoom 1.7, continental zoom 2.6, Brazil zoom 4.5 and Pantanal zoom 7. Five wheel pulses, single-finger touch, right drag in the column camera and two-finger pinch are also tested at each scale. Results include center displacement, post-release inertia, zoom/bearing changes, public Map.stop counts and native movement-event counts. Source hashes are retained with the measurements.

Center displacement is the Euclidean norm of longitude/latitude change in degrees, for comparing identical traces, not a ground-distance measurement:

| Scale | Baseline `5d457c7` | Regressed v1 | Fixed |
|---|---:|---:|---:|
| Earth | 43.227° | 2.212° | 43.224° |
| Continent | 21.958° | 1.183° | 21.990° |
| Brazil | 5.769° | 0.317° | 5.767° |
| Pantanal | 1.016° | 0.056° | 1.016° |

The broken drag produced only one native movement event; baseline and fixed Earth drags produced 30. Post-release Earth inertia was 0.363° baseline, zero in broken v1, and 0.359° fixed. Five wheel pulses changed Earth zoom by 0.613 baseline, 0.087 broken and 0.613 fixed. Right-drag bearing changed approximately 170° baseline/fixed versus 8° broken. All 20 fixed manual traces recorded **zero public Map.stop calls**. Small inertia differences reflect real input/frame timing; these are comparative traces, not an FPS benchmark.

An additional live-engine test starts a cinematic flight, interrupts it with left drag, wheel or touch, waits for the native gesture/inertia to finish, invokes refit, and verifies the camera does not resume. Those checks passed without any public Map.stop calls during the gesture. It also verifies that a drawing lock remains effective when tilt changes, and manual dragging works after unlock.

Raw evidence: [before](cinematic-camera/regression/before.json), [after](cinematic-camera/regression/after.json), [flight interruption and drawing locks](cinematic-camera/regression/interruptions.json).

## Compact Camera popover

The old fixed vertical list is replaced by a native auto popover with two-column Focus actions, a separate Orientation group, profile selection, Stop and status. A small pure placement function finds free viewport gaps around the trigger while avoiding Highlights, search, coordinate/administrative cards, selection, toolbars, the assistant and analysis panel. When space is limited, the popover scrolls within the free gap rather than covering a control.

The native popover supports outside-click dismissal and normal Tab/Shift+Tab traversal. Escape closes only Camera and returns focus to its trigger; it does not propagate to the workspace's Escape handler or cancel an open search/tool. Tutorial/drawing disabled states are retained. Position is recomputed for viewport/map resize, including the mobile visual viewport.

Profile copy now explains Standard's traditional navigation, Cinematic's effect on future automatic flights, the lack of immediate movement when switching, and unchanged imagery/scientific data.

Screenshots: [desktop Standard](cinematic-camera/regression/1440-light-camera-menu.png), [desktop Cinematic with NASA](cinematic-camera/regression/1440-light-camera-menu-satellite.png), [390px dark](cinematic-camera/regression/390-dark-camera-menu.png), [320px light](cinematic-camera/regression/320-light-camera-menu.png).

## Checks and scope

- **207 tests passed across 30 files**, including new no-stop gesture tests and five popup collision/viewport cases.
- `pnpm.cmd lint`, `pnpm.cmd exec tsc --noEmit`, production build and `git diff --check` passed.
- Full cinematic browser suite: both profiles, main presets, Globe/Mercator, both basemaps, light/dark, desktop/390/320px, real NASA tiles, rapid/interruptible flights, search, São Paulo selection, RegionFlight, columns, polygon editing and all sixteen Lume steps/restoration.
- Popover QA additionally checks control intersections, Tab, Escape, outside click and preserving the open search panel when closing Camera.
- Separate Lume browser suite passed all sixteen steps at 1440/1000/390/320px, with read-only interactions, conditional History/Forecast, Back/Retry/Skip, workspace restoration, time-lapse and CSV checks.
- A protected-source diff against `5d457c7` confirmed no scientific/data/analytics/export/column-scale/provider/dependency edits.

Files updated for this correction: `controller.ts` and its tests; `CameraControls.tsx`; scoped workspace CSS; new `camera-popover.ts` and tests; new browser comparison script; updated cinematic QA; this report and the main camera validation record. Earlier Phase 1 working-tree changes remain intact.

## Remaining limits

Chrome was exercised with software WebGL and mobile/touch emulation. Physical devices, other browser engines and screen-reader review remain manual. Camera arrival validation covers the geographic footprint, not the top of every detection column. NASA tile latency/failures remain independent of native gesture handling. No sensitivity override, Free-look, continuous Orbit or terrain was introduced.
