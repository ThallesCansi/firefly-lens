import argparse
from dataclasses import replace
from datetime import datetime, timezone
import json
from pathlib import Path

from .data_adapter import from_json, from_parquet
from .models import Reference, QualityPolicy
from .forecasting import ForecastConfig, backtest
from .engine import analyze
from .export import write_results, assert_finite


def main():
    ap = argparse.ArgumentParser(description="Independent regional analytics; no frontend or pipeline writes")
    data = ap.add_mutually_exclusive_group(required=True)
    data.add_argument("--series", type=Path)
    data.add_argument("--geometry", type=Path)
    ap.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[3])
    ap.add_argument("--region-id", default="region")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "output")
    ap.add_argument("--reference-start", type=int, default=2003)
    ap.add_argument("--reference-end", type=int, default=2023)
    ap.add_argument("--min-years", type=int, default=5)
    ap.add_argument("--origins", type=int, default=48)
    ap.add_argument("--horizon", type=int, default=3)
    ap.add_argument("--include-drift", action="store_true")
    ap.add_argument("--forecast-origin", help="YYYY-MM; defaults to dataset's last complete month")
    ap.add_argument("--no-forecast", action="store_true")
    ap.add_argument("--sensitivity", action="store_true", help="Also backtest with drift-flagged observations admitted")
    args = ap.parse_args()
    module = Path(__file__).resolve().parents[2]
    out = args.out.resolve()
    if not out.is_relative_to(module) or out == module or out in (module / "src", module / "schemas", module / "tests"):
        ap.error("--out must be a dedicated subdirectory inside analytics (for example output or examples/real)")
    for reserved in ("src", "tests", "schemas", ".venv"):
        if out.is_relative_to(module / reserved):
            ap.error("--out may not overwrite implementation, tests, schema or environment")
    try:
        series = from_json(args.series) if args.series else from_parquet(args.repo, args.region_id, json.loads(args.geometry.read_text(encoding="utf-8")))
        config = ForecastConfig(horizon=args.horizon, max_origins=args.origins, include_drift=args.include_drift)
        origin = args.forecast_origin or series.provenance.get("series_end") or max(r.date for r in series.months if r.complete)
        evaluation = None if args.no_forecast else backtest(series, config, as_of=origin)
        results = analyze(series, reference=Reference(args.reference_start, args.reference_end, args.min_years),
                          policy=QualityPolicy(include_drift=args.include_drift), forecast_config=config,
                          forecast_origin=args.forecast_origin, run_forecast=not args.no_forecast, evaluation=evaluation)
        write_results(results, out)
        # Regional input and per-origin diagnostics belong to ignored output, not large tracked examples.
        (out / "regional_input.json").write_text(json.dumps(series.to_input(), indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
        if evaluation:
            assert_finite(evaluation)
            (out / "backtest.json").write_text(json.dumps(evaluation, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
        if args.sensitivity and not args.no_forecast:
            other = backtest(series, replace(config, include_drift=not config.include_drift), as_of=origin)
            assert_finite(other)
            (out / "backtest_sensitivity.json").write_text(json.dumps(other, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
        print(json.dumps({"region_id": series.region_id, "output": str(out), "sections": {k: v["data_status"] for k, v in results.items()}}))
        return 0
    except (ValueError, OSError) as exc:
        ap.error(str(exc))


if __name__ == "__main__":
    main()
