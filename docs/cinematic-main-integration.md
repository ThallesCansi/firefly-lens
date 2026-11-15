# PR #21: integration with latest main

Integrated `origin/main` at `909a30fc18a0bbcc8a118e233bcea079dc3abc03` into published feature commit `80fd0950a5fcb486e6760321a5acc2a326313d3f` with a merge, without rebasing or replacing either history. Main had advanced again since the request: PR #22 is included alongside PRs #17–20.

## Conflicts and compatibility

Actual merge conflicts occurred in five files:

| File | Resolution |
| --- | --- |
| `README.md` | Retained the camera section and all newer scientific, continental, deployment and FireFlighter documentation. |
| `src/components/lens/HotspotMap.tsx` | Combined camera imports/state with continental center constraints, minimum zoom and coverage mask; retained controlled columns and adopted main's enabled-by-default columns. |
| `src/lib/map/camera.ts` | Retained main's South America HOME framing, plus Cinematic as the shared default profile. |
| `src/lib/map/controller.ts` | Kept coordinated cinematic execution, gesture invalidation, layout locks and complete pose restoration. Main's tilted framing intent is handled by the existing viewport-dependent pitched fit and bounded arrival correction; its separate fixed zoom-offset helper was therefore unnecessary. |
| `scripts/qa-lume-tour.mjs` | Adopted main's recovery injection for both prepared snapshots and a configured Python service, and its optional Analyze action. |

`LensApp.tsx` and `workspace.css` merged automatically. LensApp's controlled column state was adjusted to start enabled, matching main. The mascot's newer helmet, FireFlighter branding, launcher position, municipality selection, assistant time-lapse, national analytics and calendars remain intact. The camera QA explicitly enables columns rather than blindly toggling main's new default off.

Cinematic remains the default, with Standard switching, manual inertia and no `Map.stop()` during native gestures. Profile selection alone does not move the view. Startup retains the updated continental framing without a profile-triggered flight. Columns lean only when an area exists, as on main. Globe/Mercator, regional flights, drawing and tutorial priority retain their existing contracts. No terrain, orbit or free-look was added.

## Validation

- Full unit suite: **247 passed in 41 files**.
- ESLint, explicit `tsc --noEmit`, production build (16 routes), and staged/unstaged `git diff --check`: passed.
- Scientific/data/analytics/export/basemap/column files compare identically to main; no pipeline or source changes were required.
- Cinematic application QA: 1440 light, 390 dark and 320 light; normal/reduced motion, presets, stop/interruption, resize, search, administrative selection, RegionFlight, globe/Mercator columns, drawing/editing, all sixteen tutorial steps and workspace restoration. **409 real NASA tile responses succeeded**, with no uncaught page errors.
- Native gesture comparison: 40 baseline/current traces across four geographic scales and five input types. Manual gestures made no controller `Map.stop()` calls.
- Native profile switching: Cinematic → Standard → Cinematic for both real Pantanal and Sao Paulo extents; actual fly/ease options and final camera attitude verified.
- Native interrupted-flight regression: drag, wheel and touch; no resumed navigation after refit, and drawing/tilt locks retained.
- Complete standalone tutorial QA: sixteen steps at 1440/1000/390/320 px, including read-only interaction locks, Back, Retry, Skip Section, Keep/Restore/Replay, reload, opt-out and CSV export after exit. Real Pantanal September 2023 remains **535**.

The existing `qa-south-america-history.mjs` cannot run its dynamic scientific scenarios here: its prerequisite `/api/analytics/status` returns **503** because no Python analytics service/environment is installed or configured. This is the documented unconfigured-service behavior; neither the endpoint nor the test was weakened. Python model and retrospective forecast execution were not locally validated. GitHub's existing analytics job independently runs Python unit and integration suites.

The separate `qa-camera-main-integration.mjs` verifies the published-data workflow without simulating a backend: Paraguay's real 2003 daily CSV against its own archive, fitted continental calendar, both camera profiles while preserving country selection, national report and forecast availability, constrained manual navigation in both projections, and responsive layout. No scientific requests or results are mocked. Only the external cartographic style is replaced for deterministic browser execution.

Browser evidence is under [cinematic-camera/main-integration](cinematic-camera/main-integration/). Runs use installed Chrome with software WebGL and mobile emulation; physical devices, Safari and screen readers remain unverified.

## Main commits incorporated

All 17 commits reachable from main but absent from `80fd095`, including merge commits:

```text
909a30fc Merge pull request #22: South America history/calendar
83f7cafa Record final regression results after main integration
7f661a6b Merge origin/main into South America history/calendar
2ef84ac0 Restore continental historical calendars and constrain navigation
c12f390b Merge pull request #20: assistant time-lapse
2c0607aa Let FireFlighter play time-lapse over a requested span
4dceb4a6 Merge pull request #19: municipality merge build fix
66e5c3a1 Fix build after municipality and continental merges
24af75a7 Merge pull request #18: FireFlighter and municipalities
eb30857f Merge main into FireFlighter and municipalities
414d9a71 Merge pull request #17: scientific continental expansion
15f7e40d FireFlighter helmet, municipality search and 3D satellite defaults
94c1f058 Record main integration and browser regressions
f19eac1f Stabilize cross-platform SARIMA fixture and integration QA
dd8f96a2 World map under about lens and harmonization explanation
514b7448 Integrate main and preserve national data scope
fb3e4aeb Expand scientific analytics across South America
```
