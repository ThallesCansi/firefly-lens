# Main integration validation

Prepared for [PR #17](https://github.com/ThallesCansi/firefly-lens/pull/17),
integrating the scientific expansion with main at
`5d457c7120c377c57359f293805aeacd25eafe92` on 15 November 2026.

The integration preserves the newer automatic tour, map visuals, region flight,
share links and direct CSV downloads. National share links retain the country's
identity and its own monthly coverage. Their CSV exports contain that country's
raw monthly cell totals. Brazilian cell calibration and unusual-cell analysis
are not applied to the newly calibrated countries.

Validation of the integrated application passed **394 TypeScript tests in 65
files, 60 Python unit tests, 5 real-data integration tests, TypeScript, ESLint and
the production build**. Both the frontend and analytics jobs passed on Linux in
[GitHub Actions](https://github.com/ThallesCansi/firefly-lens/actions/runs/43736513857).
The Vercel preview status also reported a successful deployment for that head.

Enabling Python CI exposed a platform-dependent convergence assumption in a
temporal-isolation test. Its software-only fixture now uses seeded stationary
noise rather than perfectly repeating counts. The real SARIMA optimizer still
runs and must produce three numeric forecasts; changing observations after the
origin must leave those predictions unchanged. Production models, convergence
gates and scientific outputs were not modified to satisfy the test.

The nine scientific browser checks in [browser-results.json](browser-results.json)
passed without page errors. They include real retrospective predictions, official
numeric FWI, Paraguay/Ecuador reports, country share-link restoration, CSV totals
reconciled with Paraguay's source manifest and a 320-pixel viewport without page
overflow. Captures are stored alongside this record. Basemaps are controlled in
that script, so these are not availability guarantees for external map services.
The expanded Firefly Signals browser regression also passed.

The complete automatic/read-only Lume regression passed all 16 steps at desktop,
1000-, 390- and 320-pixel layouts, including mouse/touch/keyboard isolation,
explicit opt-out, workspace restoration, downloads and network-failure retry/skip.
See [tour-results.json](tour-results.json). The failure simulation covers both
the configured Python service and prepared snapshots until Retry is selected;
background Signals prefetch cannot consume the injected outage.

Published JSON checksums are protected by LF Git attributes on Windows/Linux.
Python CI fetches the archived engine commits needed to verify existing Brazilian
scientific snapshots. Native downloaded archives and other local worktrees are
excluded from the change. The FWI refresh schedule, scientific forecast gates
and separate Python production-hosting requirements remain as documented in
[continental-harmonization.md](../continental-harmonization.md).
