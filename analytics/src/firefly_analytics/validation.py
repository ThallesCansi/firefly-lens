"""Matched-case metrics and chronological family selection, with a holdout gate."""
import math
import statistics as stats

MODELS = ("seasonal_median", "seasonal_naive", "sarima")


def metrics(rows):
    rows = [r for r in rows if r.get("actual") is not None and r.get("prediction") is not None]
    if not rows:
        return {"n": 0, "origins": 0, "mae": None, "rmse": None, "mean_bias": None,
                "interval_n": 0, "coverage95": None, "null_reason": "no_scored_forecasts"}
    errors = [r["prediction"] - r["actual"] for r in rows]
    intervals = [r for r in rows if r.get("lower") is not None and r.get("upper") is not None]
    return {"n": len(rows), "origins": len({r["origin"] for r in rows}),
            "mae": stats.mean(abs(e) for e in errors), "rmse": math.sqrt(stats.mean(e * e for e in errors)),
            "mean_bias": stats.mean(errors), "interval_n": len(intervals),
            "coverage95": stats.mean(r["lower"] <= r["actual"] <= r["upper"] for r in intervals) if intervals else None,
            "null_reason": None}


def comparison(rows, min_success=.9):
    expected = {(r["origin"], r["horizon"]) for r in rows if r["actual"] is not None}
    successful = {model: {(r["origin"], r["horizon"]) for r in rows if r["model"] == model and r["actual"] is not None and r["prediction"] is not None} for model in MODELS}
    eligible = [model for model in MODELS if expected and len(successful[model]) / len(expected) >= min_success]
    common = set.intersection(*(successful[model] for model in eligible)) if eligible else set()
    return {"expected_cases": len(expected), "paired_cases": len(common), "eligible_models": eligible,
            "success_fraction": {model: len(successful[model]) / len(expected) if expected else 0 for model in MODELS},
            "metrics": {model: metrics([r for r in rows if r["model"] == model and (r["origin"], r["horizon"]) in common]) for model in eligible}}


def evaluate(records, origins, *, min_origins=12):
    if len(origins) < 4:
        return {"status": "not_validated", "reason": "insufficient_origins", "recommended_model": None}
    split = origins[len(origins) // 2]
    stable = [r for r in records if r["stratum"] == "stable_observed"]
    # Every tuning target is known by the first validation origin, including h>1.
    tuning = [r for r in stable if r["origin"] < split and r["date"] <= split]
    holdout = [r for r in stable if r["origin"] >= split]
    selection = comparison(tuning)
    validation = comparison(holdout)
    ranking = sorted(selection["metrics"], key=lambda model: (selection["metrics"][model]["mae"], MODELS.index(model)))
    candidate = ranking[0] if ranking else None
    chosen = candidate
    gate = "baseline_selected_on_tuning" if chosen else "no_eligible_model"
    if chosen == "sarima":
        val = validation["metrics"]
        baselines = [m for m in ("seasonal_median", "seasonal_naive") if m in val]
        if "sarima" not in val or not baselines or any(val["sarima"]["mae"] >= val[m]["mae"] for m in baselines):
            chosen = next((m for m in ranking if m != "sarima"), None)
            gate = "sarima_not_better_than_baselines_on_holdout_fallback"
        else:
            gate = "sarima_has_lower_paired_holdout_mae_than_both_baselines"
    enough = chosen in validation["metrics"] and validation["metrics"][chosen]["origins"] >= min_origins
    for h in (1, 2, 3):
        if not any(r["horizon"] == h for r in records):
            continue
        enough = enough and metrics([r for r in holdout if r["model"] == chosen and r["horizon"] == h])["origins"] >= min_origins
    by_horizon = {model: {str(h): metrics([r for r in holdout if r["model"] == model and r["horizon"] == h])
                          for h in sorted({r["horizon"] for r in records})} for model in MODELS}
    return {"status": "experimental_backtested" if enough else "not_validated", "reason": gate,
            "selection_cutoff": split, "selection_candidate": candidate, "recommended_model": chosen,
            "selection": selection, "validation": validation, "by_horizon": by_horizon,
            "paired_by_horizon": {str(h): comparison([r for r in holdout if r["horizon"] == h])
                                  for h in sorted({r["horizon"] for r in records})},
            "by_evaluation_year": {year: {model: metrics([r for r in records if r["date"][:4] == year and r["model"] == model]) for model in MODELS}
                                   for year in sorted({r["date"][:4] for r in records})},
            "by_stratum": {stratum: {model: metrics([r for r in records if r["stratum"] == stratum and r["model"] == model]) for model in MODELS}
                            for stratum in ("stable_observed", "drift_observed", "modeled_not_scored", "excluded_truth")},
            "limitations": ["Family selection uses earlier origins; SARIMA has a later holdout gate. A failed gate falls back to a baseline ranked on tuning, not a new validated winner.",
                            "Overlapping horizons are correlated; no significance or causal claim is made.",
                            "At least 90% successful predictions required before matched-case model comparison.",
                            "Historical availability uses final-vintage observations, not a publication-vintage archive."]}
