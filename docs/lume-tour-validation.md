# Lume Guided Tour — implementation and verification

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
