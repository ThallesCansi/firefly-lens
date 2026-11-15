# Lume Guided Tour — implementation and verification

## Automatic presentation and read-only demonstration — 2026-11-15

Implemented locally on `feature/lume-auto-start`, based on `b3a051a`. The current checkout includes the latest picker, time-lapse, visual, analytics and assistant integrations. No dependencies, scientific calculations, data assets, export formats or original Lume artwork were changed.

### Current behavior and architecture

- Every new workspace document, including a reload, automatically opens the existing Driver welcome. A document-scoped claim prevents repeated launches during rerenders, Strict Mode effect replay and client navigation. Returning through About/Lens in the same document does not launch a second automatic welcome.
- Only the explicit **Don't show again** checkbox writes `firefly-lens-tour-auto-disabled-v1`. Completed, dismissed and partial outcomes still use the separate `firefly-lens-tour-v1` key. Outcomes never suppress the next visit. Unchecking the checkbox during a manual replay enables automatic presentation on the next new document.
- The permanent **Tour with Lume** launcher includes the original animated SVG. The old invitation component was removed. The existing introductory hint is hidden while the tour runs, preventing overlapping welcome panels.
- All sixteen steps are read-only. Driver's global and per-step configuration disables active-element and page interaction, focuses the popover and retains native target waiting. There are no interactive-step flags or map exceptions. Instructional copy explains a demonstration controlled by Next/Back.
- The workspace is `inert`, including highlighted controls. Scoped capture listeners additionally block background pointer, touch, wheel, typing and application shortcuts. The React popover portal remains outside that subtree; its buttons, checkbox, scrolling and Driver keyboard traversal remain accessible. Browser reload shortcuts are preserved. Cleanup immediately removes the gate and restores focus to the launcher.
- React preparation handlers still select the actual Pantanal preset, September 2023, calendars and scientific tabs. Time-lapse playback is suspended while the demonstration runs and returns paused when restoring the workspace. Keep example exits playback. The real Aqua-equivalent value remains **535**, and the checked-in unavailable Forecast state is preserved.
- Browser navigation testing exposed a stale map-controller reference when Next preserves workspace state but tears down map effects. `HotspotMap` now announces `null` when its engine is removed, preventing selection tools from rebinding to a destroyed engine on return.

### Files changed in this update

- `src/components/lens/LensApp.tsx`: automatic start, guarded snapshot, inert workspace, mascot launcher, time-lapse suspension and restoration.
- `src/components/lens/HotspotMap.tsx`: controller teardown notification.
- `src/components/onboarding/AutoStartTour.tsx`: new automatic launch bridge; replaces the removed `TourInvitation.tsx`.
- `src/components/onboarding/LumeTour.tsx` and `.css`: checkbox and Escape behavior within the existing popover.
- `src/lib/onboarding/persistence.ts`: independent opt-out and document-scoped launch claim.
- `src/lib/onboarding/interaction-lock.ts`: new removable interaction gate.
- `src/lib/onboarding/steps.ts` and `driver-adapter.ts`: read-only step copy and Driver configuration.
- `src/app/workspace.css`: inert hit testing and mascot launcher styling.
- `src/lib/onboarding/session.test.ts`, new `driver-adapter.test.ts` and `interaction-lock.test.ts`: preference, lifecycle, Driver and event-boundary checks.
- `scripts/qa-lume-tour.mjs`, `README.md` and this document: reproducible browser checks and usage documentation.

### Verification

- `pnpm.cmd test`: **125 tests passed across 19 files**.
- `pnpm.cmd lint`: passed.
- `pnpm.cmd exec tsc --noEmit`: passed.
- `pnpm.cmd build`: passed; all 13 static pages generated.
- Browser QA uses installed Chrome/Playwright, real MapLibre/WebGL, real scientific tiles and analytics. Only the external OpenFreeMap basemap is replaced with a deterministic blank style; analytics/tile failures are injected exclusively for recovery checks. No production fixtures or datasets are changed.
- All sixteen steps run at 1440, 1000, 390 and 320 px, in both themes and with reduced motion. Checks cover repeated visits/reloads, all three outcomes, explicit opt-out and re-enabling, manual replay after opt-out, client navigation without duplicate welcomes, one popover only, and the recognizable mascot launcher.
- At every step, browser checks attempt background clicks, touch, typing, focus and wheel input, inspect unchanged workspace state and cycle Tab within the popover. Real map drag/zoom/touch handlers receive no events. Conditional calendars, History/Forecast, Back, Retry, Skip section, Keep, Replay, Escape and Pampa restoration are exercised. No automatic download or assistant request occurs; a real CSV download succeeds after exit.
- The full browser suite passed against both the production server and Next development/Strict Mode. It also verifies that an already running time-lapse stops changing the period during the tour and returns paused after restoration. Development QA sets `QA_HIDE_DEVTOOLS=1` to hide only Next's developer portal, whose bottom-left indicator otherwise covers the launcher; production QA uses the normal page without that override.

Evidence and final browser results are retained in `docs/lume-tour/auto-readonly/`. See [welcome](lume-tour/auto-readonly/desktop-welcome.png), [History](lume-tour/auto-readonly/desktop-history.png), [320px dark](lume-tour/auto-readonly/320-dark-sensors.png), [390px light](lume-tour/auto-readonly/390-light-sensors.png), [recovery](lume-tour/auto-readonly/recovery-dark.png) and [production browser results](lume-tour/auto-readonly/results.json).

### Limits

Browser QA uses desktop Chrome with mobile viewport/touch emulation; physical-device and screen-reader testing remains manual. Blocked browser storage cannot retain opt-out across reloads. Forecast availability and extent-based camera restoration retain their existing limitations. Live geocoder, basemap and assistant-model services are outside deterministic QA. Development navigation to About surfaced an existing hydration warning for tiny floating-point differences in the unrelated Harmonize illustration's SVG coordinates; that component was preserved.

## Original implementation record (historical)

The following describes the earlier manual-start implementation and its original verification; the update above supersedes its invitation and interactive-step behavior.

Local branch: `feature/tutorial-lume`. Baseline: `13269c5`. The pre-existing Driver.js 1.14.0 changes to `package.json` and `pnpm-lock.yaml` are retained. No additional dependency, commit, push, merge or deployment is required.

## Architecture and behavior

The tour is a lazily loaded client feature: LensApp exposes typed capture, preparation, retry, restoration and Keep actions; TourSession coordinates cancellable transitions; Driver.js owns the spotlight, target waiting, interaction boundaries, keyboard traversal and popover positioning. React portals render the original Lume and supplemental actions into that same popover. There is no second dialog or bespoke overlay system.

Sixteen short steps cover the eleven requested conceptual chapters: welcome; map; search versus selection; preset choice; Pantanal; sensors; temporal controls; analysis; heatmap; month details; full report; Python History; Forecast; range; exports; completion. Exercises involving geocoding, dragging or downloads are optional. No download or assistant-model request is initiated by the tour.

The exact Pantanal rectangle comes from the existing presets and `rectangleArea`; September 2023 is read by the existing record/analytics functions. Its actual value is **535 MODIS-Aqua-equivalent hot spots**, observed by Aqua. The checked-in forecast status for Pantanal, and currently all five presets, is **unavailable**. The tour shows that real state instead of inventing an experimental result. Forecast uses its latest complete origin, not an outlook issued in September 2023. Unsupported geometries retain the existing unavailable states and browser-history fallback.

First visits receive an invitation inside the existing hint; the full tour requires an explicit click. A separate versioned persistence key records dismissed/completed/partial outcomes. Replay preserves the original saved workspace across attempts. Failed/skipped sections are recorded as partial rather than silently declared complete.

The snapshot includes selected and analyzed areas, period, date range, sensors, analysis/expanded flags, calendar detail, analytics tab, folded map card, search/coordinate/drawing flags, geographic bounds/projection and scroll positions. Driver owns in-tour focus; the workspace owner restores focus and scrolling after the final layout commit. Queued analysis navigation, preparation work and camera restoration have cancellation paths. Assistant mutation handlers reject actions while the tour is active without clearing its conversation.

## Files

Existing UI/documentation integration points:

- `src/components/lens/LensApp.tsx`: shared preset selection, snapshot/restore, typed tour actions, assistant guard and lazy launch/replay.
- `src/components/lens/MapControls.tsx`: optional controlled card expansion and sensor anchor.
- `src/components/lens/TemporalControl.tsx`: temporal anchor.
- `src/components/lens/HotspotMap.tsx`: canvas/control anchors only.
- `src/components/lens/AnalysisContent.tsx`: controlled calendar view, readiness/anchors, coordinated focus and analytics-tab forwarding.
- `src/components/lens/analytics/AnalyticsReport.tsx`: optional controlled tab and geometry-specific readiness/anchors; all calculations and availability rules retained.
- `src/components/interactions/ResizableAnalysisPanel.tsx`: semantic scroll-restoration anchor.
- `src/app/workspace.css`: invitation and replay integration styles.
- `README.md`: operation and verification instructions.

New implementation/test files:

- `src/components/onboarding/LumeTour.tsx`
- `src/components/onboarding/LumeTour.css`
- `src/components/onboarding/TourInvitation.tsx`
- `src/lib/onboarding/steps.ts`
- `src/lib/onboarding/session.ts`
- `src/lib/onboarding/driver-adapter.ts`
- `src/lib/onboarding/persistence.ts`
- `src/lib/onboarding/session.test.ts`
- `scripts/qa-lume-tour.mjs`
- This validation document and the retained QA evidence under `docs/lume-tour/`.

`Lume.tsx`, scientific models/functions, analytics contracts/loaders, data assets, assistant execution code and export schemas are preserved. The only map-engine edits are semantic DOM attributes.

## Verification strategy

Required checks: `pnpm.cmd test`, `pnpm.cmd lint`, `pnpm.cmd exec tsc --noEmit`, and `pnpm.cmd build`.

Focused unit tests cover saved workspace identity, Back preparation, fresh React actions, cancellation/generation ordering, exit during pending preparation, layout-frame cancellation, retry/skip, replay after partial completion, explicit Keep and independent persistence including blocked storage.

The browser script runs against the production build in installed Chrome with the real MapLibre/WebGL engine, Brazil outline, scientific tiles, geometry matching, hash-validated Python bundles and existing CSV export. It supplies a deterministic blank CARTO style to avoid a third-party basemap dependency. It exercises both routes; first visit, Skip and replay; the exact Pantanal/September value; History and unavailable Forecast; a non-default Pampa workspace and an unsupported custom polygon; 1440/1000/390/320px layouts; container-driven card folding; themes; reduced motion; Back through conditional views; native select keys; Escape; focus restoration; cleanup on route exit; explicit Keep; no automatic downloads; one deliberate CSV export; and injected request failures with Retry/Skip section.

The broader scientific and analytics regression tests remain part of the normal suite. Live assistant-model responses, live geocoder/basemap availability and manual screen-reader/device testing are outside this deterministic browser check.

## Recorded verification results

- `pnpm.cmd test`: **109 tests passed across 15 files**, including 12 new onboarding tests.
- `pnpm.cmd lint`: passed without warnings or errors.
- `pnpm.cmd exec tsc --noEmit`: passed.
- `pnpm.cmd build`: passed, including all 11 routes/pages generated by the current application.
- `node scripts/qa-lume-tour.mjs`: passed against the production build. All 16 steps exercised at 1440/1000/390/320px; both routes and themes; real value 535; unavailable Forecast; unsupported polygon and Pampa restoration; native select handling; Tab/Escape/focus; Keep/Replay; no automatic downloads; explicit CSV; Retry after injected analytics failure; partial completion after tile failure; route-exit cleanup; no uncaught page errors.
- `git diff --check`: passed. Protected-source diff checks confirm no modifications to the original Lume, scientific functions/data, analytics loaders/contracts, assistant execution module or export schemas.

Retained evidence: [welcome](lume-tour/desktop-welcome.png), [Python History](lume-tour/desktop-history.png), [320px dark](lume-tour/mobile-dark.png), [390px light](lume-tour/mobile-light.png), [error recovery](lume-tour/recovery-dark.png), and [browser results](lume-tour/results.json).

## Decisions and limits

- A single popover-integrated Lume prioritizes predictable positioning and focus over a separate continuously flying companion, as permitted by the specification. Existing wing/hover/glow animations are reused; reduced motion disables the new entrance and Driver movement.
- Native Driver waits use bounded deadlines, not fixed loading sleeps. Errors appear when required controls/data remain unavailable; retry explicitly remounts existing cache consumers. Navigating normally between steps does not repeatedly refetch analytics.
- The existing map contract exposes bounds and projection, not a complete camera pose. Restoration fits the saved extent after layout changes; exact zoom/bearing/pitch reproduction is not promised.
- Temporary drawing gestures, administrative-tool workflows and internal per-chart choices are not serialized. Geometry, primary view state, scientific tab and workspace settings are restored; the assistant conversation remains mounted.
- All checked-in preset forecasts are unavailable. The available-experimental branch remains the existing analytics implementation; this tour does not manufacture scientific fixtures to make it appear available.
- No new scientific computation, dataset generation, image generation or export-format change was introduced.
