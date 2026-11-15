# Historical Anomaly Radar — initial threshold report

Generated from real exported tiles using loadArea → buildRecord. No Python/model changes.
Data coverage: 2002-07-04 to 2026-11-14; last complete month: 2026-10.
Schema 1; quality policy 1; source fingerprint: 85460ac367cfc0ae3146616b1c7af68ad56cdfc42bb15b06915b78d1deb665c4.

## Initial configurable policy

Main baseline: 2003–2023, excluding the evaluated year. Minimum reference: 15 eligible years.
Ratio ≥ 2; value ≥ 100 Aqua equivalents; excess ≥ 50; value ≥ reference P90.
These are exploratory product filters, not calibrated significance thresholds.

| Region | Months | Eligible | Highlights | Observed | Modeled | Ratio ≥ 2 alone* | Below count floor* | Below excess floor* | Highlights, 2003–2025 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Southern Amazon | 293 | 287 | 36 | 36 | 0 | 49 | 0 | 0 | 35 |
| Matopiba | 293 | 287 | 26 | 26 | 0 | 28 | 0 | 0 | 21 |
| Pantanal | 293 | 287 | 43 | 43 | 0 | 62 | 0 | 0 | 40 |
| Sertão | 293 | 287 | 24 | 23 | 1 | 35 | 7 | 5 | 20 |
| Pampa | 293 | 287 | 28 | 28 | 0 | 40 | 2 | 2 | 32 |

*Among eligible targets with sufficient reference years and defined ratio. The floor diagnostics overlap and must not be added. The P90 condition can remove additional targets; this table makes comparison to ratio-only screening explicit.

## Exclusions and interpretation

- July 2002 starts on July 4. 2026-11 is partial. Both remain available in Explore Period, without a ratio or rank.
- Whole months touched by documented Aqua gaps are excluded from candidates, references and ranks: August/September 2020 and March/April 2022. Documented intervals: 2020-08-16–2020-09-02; 2022-03-31–2022-04-16. Source: harmonization/docs/METHODOLOGY.md, section 5. No gap-filling or inference from zero detections.
- Rank uses all eligible same-calendar-month records across the archive, including the target and modeled months; ties share rank. This pool differs from the baseline. Standing is descriptive, not a probability.
- 2003–2023 reduces potential influence of the 2024–2025 Aqua drift in the reference. It does not fully correct comparability: evaluated 2024–2025 observations still contain drift and 2026 changes to modeled VIIRS. No drift correction was applied.
- Modeled ranges are nominal 95% predictive intervals. Coverage is not validated for arbitrary study regions. VIIRS from August 2026 is near real time, with processing limitations documented by the project.
- Historical comparisons are retrospective and can use years later than the evaluated year. These are positive monthly historical departures, separate from daily local MAD flags; not forecasts or future fire risk.
- Presets are study rectangles, not official biome boundaries. Threshold suitability across these differently sized regions needs review; no thresholds are declared final by this report.

## Reproduction and freshness

Run pnpm radar:generate to regenerate JSON and this report. Run pnpm radar:check to recompute using production functions and compare exact deterministic content of both artifacts. Input hashes include metadata, all 27 required tiles and the science/quality/generator modules; text hashes normalize CRLF to LF. A change to values, source inputs, policy, generator, summary content or report fails verification. dev/build run verification first. No timestamp makes regeneration reproducible.
