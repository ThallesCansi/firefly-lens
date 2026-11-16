# PR #26: integrate current main

Repository: `ThallesCansi/firefly-lens`; published feature: `feature/sentinel-default`.

## Starting state and incoming commits

The working tree was clean at `d6e62f42e3d7b36b1c4fdb36f7e8a2ea9045a62e`. Fetch advanced `origin/main` from `59ff514f` to `263583c10ecd4be21da7585f472d7e93307caa94`:

- `8d3484ff`: responsive map controls, collapsible legend/selection cards and mobile administrative selection.
- `985396ef`: guided-tour QA opens folded date controls before using them.
- `263583c1`: merge PR #25.

GitHub reported PR #26 unmergeable. An actual `git merge --no-commit --no-ff origin/main` reproduced one content conflict, in `src/app/workspace.css`. Both branches appended independent style blocks at the same location. The resolution retains both the imagery-selector styles and main's responsive disclosure rules. There were no README conflicts.

`HotspotMap.tsx` and `CameraControls.tsx` merged automatically. Their result retains imagery selection, collapsed native attribution and its dark-theme colors alongside main's `MapDisclosure`, responsive control sizing and new camera icon. New main functionality was not replaced by the older feature integration.

## Concurrent main update during CI

The first validated merge was committed and pushed as `706d300a31b76ee9baf660e598abddb3b86485d9`. CI run 77 passed all three jobs and the automatic Vercel preview succeeded. While those checks ran, main received PR #27:

- `4724dc8d`: compact cards on every device, with Show analysis outside the fold.
- `b22df736`: merge PR #27, main head `b22df7361fdaeaaa087cbb98d056009aafc07788`.

This second upstream update explains why GitHub briefly reported the first merge as mergeable and then dirty again. A fresh fetch and remote comparison confirmed two new main commits rather than a failed validation.

A second merge incorporates this newer main. Its conflicts were `src/app/workspace.css` and `scripts/qa-camera-main-integration.mjs`. The CSS keeps PR #27's complete compact-card rules plus the feature's imagery/attribution rules; the outdated responsive-card block is not retained. The CSV test keeps the explicit accessible name and opens the disclosure before export. No product behavior or scientific values were changed to accommodate a test.

The complete unit suite, lint, TypeScript, build and affected browser integration suites were repeated for this newer main. The final integration evidence below records the newer main head and browser results; the original first-round evidence is retained separately for traceability.

## Compatibility changes

Only QA interactions needed adaptation beyond the CSS conflict resolution:

- Camera regression opens the date-control chip before selecting a date or starting Regions when the split-view map is narrow.
- Scientific compatibility QA opens the selection disclosure before clicking its CSV export.

These use normal user interactions with main's new UI. No scientific values, datasets, export schemas, camera controller or tutorial implementation were changed to satisfy tests. The camera, column formulas, harmonization, data and dependency manifests match `origin/main` unchanged. No terrain module, DEM source, Orbit control or Mapterhorn request was introduced.

## Validation

- Full Vitest: **43 files / 264 tests passed**.
- ESLint, TypeScript, production build, staged and unstaged `git diff --check`: passed.
- Sentinel integration: 1440/1000/390/320 px; default Sentinel, manual NASA, satellite/cartographic preference, light/dark, globe/Mercator, initial compact attribution, keyboard toggle, columns, selections, RegionFlight, Method references, injected imagery failures, Retry and NASA fallback. Zero forbidden provider requests and browser JavaScript exceptions.
- Attribution: mouse and keyboard expansion in desktop/mobile, initially collapsed in both themes; minimum measured dark contrast **14.25:1**.
- Responsive upstream QA: 1440×1000, 1100×900, 900×800, 760×800, 390×844, 320×740 and 844×420; disclosures, camera sizing and real state picking/confirmation passed.
- Camera regression: desktop/mobile, presets, cancellation, columns, polygon drawing/editing, RegionFlight and full tutorial/workspace restoration passed.
- Native gestures: baseline `5d457c7` and working controller, four scales × five input types; baseline-responsiveness assertions passed and working manual gestures made zero `map.stop()` calls.
- Current complete Lume QA passed, including the About/Method journey, responsive targets, interaction locks, Retry and restoration.
- Scientific compatibility: real published Paraguay CSV checked against its source, history/forecast availability, profiles and continental constraints passed at desktop/mobile widths.

Browser QA used installed Chrome with software WebGL and emulated touch, against the production build. This is not physical-device or Safari validation. No live language-model call or Python forecast service was required. Detailed numerical summaries are in [latest-main integration results](sentinel-default/pr26-latest-main-results.json), with the [first integration results](sentinel-default/pr26-integration-results.json) retained for traceability. Full temporary browser evidence was kept outside the repository.

No PR merge or manual deployment is part of this integration. GitHub Actions and any automatic Vercel preview are checked after the normal feature-branch push; their live status belongs to PR #26.
