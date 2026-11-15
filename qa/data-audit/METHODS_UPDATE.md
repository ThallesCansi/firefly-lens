# Data audit and scientific evidence in Methods

The independent audit is now accompanied by evidence in the three existing Methods tabs. The interface connects each scientific claim to the published figures, numeric results or a real-data example, while distinguishing file consistency from independent scientific validation.

## What changed

- **Harmonization:** four original pipeline figures, with a collapsible linear zoom; a national L2 metrics table separating LOYO 2018–2023 and 2024/2025/2026 comparisons; explicit definitions of relative bias and MAE log1p; interpretation of Spearman as the average 12-month seasonal cycle; and the distinction between original simulation bands and the app’s common-error interval.
- **Historical Anomalies:** September/2003–2025 totals in a fixed Southern Amazon study box, with September/2024 selected (44,519 detections versus median 20,551; 2.1663×); and a real daily MAD example, 2024-10-23, showing its twenty neighbours and all three flag conditions. Both examples use the actual `loadArea`/`buildRecord` calculations. Tables provide all plotted values.
- **Data & Limitations:** fixed audit snapshot, five status counts, month completeness, sensor-specific days without detections, disclosure of unexecuted checks, and links to the original audit reports. A zero-detection day is not labelled as absence of fires or a proven acquisition failure.
- **Methods text:** qualifies the NRT fire-type exception, identifies excluded calibration months, removes the unsupported “typical monthly error about 10%” interpretation, distinguishes target 95% from reported 94.8% LOYO coverage, and explains why calibration of the interval on LOYO residuals is not an independent test of the adjusted interval.
- Existing tab structure is preserved; direct links `#monthly-evidence`, `#daily-evidence` and `#data-quality` select and scroll to the corresponding tab. The new examples support keyboard navigation, SVG descriptions, numeric tables and horizontal chart scrolling on narrow screens. The four Stage 7 validation figures are redrawn as native SVG charts with English labels, theme colours, hover/keyboard readouts and the same English captions; their values come from `public/method/evidence/harmonization-charts.json` (see below).

The original audit in `DOCUMENTATION_AUDIT.md` remains a historical review of commit `6ea44c7`; its line references and findings are not silently rewritten. This follow-up was explicitly requested for Methods on the same branch. It extends the original QA-only delivery with changes in `src/components/method/`, `src/app/method/method.css`, and presentation assets under `public/method/evidence/`.

No scientific formulas, model algorithms, datasets under `public/data/`, harmonization outputs, map tools, About components, package manifests, lockfiles or shared configuration were changed. Figures are byte-identical copies of the committed pipeline artifacts. Missing raw/intermediate data still prevent full independent reproduction of model fitting and interval coverage. This update provides evidence and a reproducible presentation package; it does not create the missing validation intermediates.

## Reproduce the presentation evidence

With the project's existing dependencies installed, run from the worktree root:

```powershell
node qa/data-audit/export-method-evidence.mjs
pnpm test
pnpm build
```

The generator checks all 76 source hashes against the saved audit before producing `public/method/evidence/evidence.json`; the hashes of the four original pipeline figures in `harmonization/output/figures/` stay listed as provenance. It permits only LF/CRLF differences introduced by Git for text files; binary inputs must match exactly. Exported evidence source hashes normalize text to LF so the evidence tests also work on Linux. It imports the existing TypeScript application calculations through an isolated loader; it does not rewrite them, rerun the scientific pipeline or invent sample values. It exports source hashes, the fixed data commit, all displayed metrics, the 23 same-month totals and the 21 daily values. The full audit can still be rerun separately using its original Python command.

The chart values come from `cd harmonization && uv run python -I pipeline/export_method_charts.py`. It reads the Stage 7 intermediates when a full pipeline run left them in `data/interim/`; otherwise it rebuilds `grid_counts.parquet` from the committed `output/grid_monthly.parquet` and reruns `07_validate.run_predictions` with the configured seed (about 10 minutes). It refuses to write unless every recomputed metric matches `output/validation_metrics.csv` (relative tolerance 1e-6), then exports exactly the tables that `07_validate.figures()` plots.

If a source file changes, the evidence tests fail until the data are reviewed and the snapshot is deliberately regenerated. This is a fixed example, not a live calculation for the user's current map selection. The original synthetic z-score teaching example remains explicitly marked as fictional and distinct from these real-data examples.

## Validation

- 22 frontend tests: the 16 existing tests and six new evidence/provenance/SSR tests pass. The new tests compare the displayed values against the application's actual calculations, validate published CSV metrics, verify all source hashes and copied figures, tie quality counts to the saved audit, and prevent the SVG-title SSR issue found during browser review.
- Production build and TypeScript are checked with the project's default Turbopack pipeline. Worktree dependencies are installed from the frozen lockfile; no shared dependency inputs are changed.
- Browser QA uses a local production server, an already installed Playwright and Chrome. It checks 1440px/light and 320px/dark, keyboard tab switching, all new deep links, four image endpoints, disclosure tables, chart colours/fonts, page overflow and runtime errors. Screenshots are saved under `methods-screenshots/`.

Optional browser QA:

```powershell
# In one terminal:
pnpm start --hostname 127.0.0.1 --port 3107
# In another, with Playwright installed or PLAYWRIGHT_MODULE set to its module URL:
node qa/data-audit/verify-method-evidence.mjs
```

The initial webpack-only preview did not apply this project's Turbopack Tailwind setup and is not the accepted visual result. A hydration error in composed SVG titles was corrected and covered by regression and browser tests. The final browser run passed against the standard production build, and all eight screenshots were regenerated from it.

| Evidence | Desktop / light | Mobile 320 px / dark |
|---|---|---|
| Published validation | [Desktop](methods-screenshots/desktop-validation.png) | [Mobile](methods-screenshots/mobile-validation.png) |
| Same-month comparison | [Desktop](methods-screenshots/desktop-monthly.png) | [Mobile](methods-screenshots/mobile-monthly.png) |
| Daily MAD example | [Desktop](methods-screenshots/desktop-daily.png) | [Mobile](methods-screenshots/mobile-daily.png) |
| Data quality | [Desktop](methods-screenshots/desktop-quality.png) | [Mobile](methods-screenshots/mobile-quality.png) |

## Review scope

This PR combines the independent audit from commit `45af545` with the requested Methods presentation. The audit's real-data results remain 86 passes, zero proven data errors, three warnings, three checks not run and one not applicable. See `VALIDATION.md` and `reports/` for the original audit details. The work remains on `feature/data-quality-audit`; publication is through this PR for review, without merging into main.
