from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import date
import calendar
import math
import statistics as stats
import warnings
import hashlib
import json
from pathlib import Path

from .models import RegionalSeries, QualityPolicy, month_id, month_stamp
from .validation import MODELS, evaluate


def engine_fingerprints():
    return {p.name: hashlib.sha256(p.read_bytes().replace(b"\r\n", b"\n")).hexdigest()
            for p in sorted(Path(__file__).resolve().parent.glob("*.py"))}


@dataclass(frozen=True)
class ForecastConfig:
    horizon: int = 3
    min_train_months: int = 96
    min_season_years: int = 5
    max_origins: int = 48
    stride: int = 1
    min_validation_origins: int = 12
    include_drift: bool = False
    maxiter: int = 60
    candidates: tuple = (((1, 0, 0), (1, 0, 0, 12)), ((0, 1, 1), (0, 1, 1, 12)))

    def __post_init__(self):
        if not 1 <= self.horizon <= 3 or self.min_train_months < 24 or self.min_season_years < 2:
            raise ValueError("Supported horizon 1–3; at least 24 training months and 2 seasonal years")
        if self.max_origins < 4 or self.stride < 1 or self.maxiter < 1 or self.min_validation_origins < 2:
            raise ValueError("Invalid forecasting budget")
        if not 1 <= len(self.candidates) <= 4:
            raise ValueError("Choose 1–4 small SARIMA candidates")
        for order, seasonal in self.candidates:
            if len(order) != 3 or len(seasonal) != 4 or seasonal[3] != 12 or any(type(v) is not int or v < 0 or v > 2 for v in (*order, *seasonal[:3])):
                raise ValueError("Monthly seasonality 12 and orders 0–2 required")


def training_values(series, origin, config):
    policy = QualityPolicy(include_drift=config.include_drift)
    last = date.fromisoformat(origin + "-01")
    cutoff = date(last.year, last.month, calendar.monthrange(last.year, last.month)[1])
    result = []
    for row in series.regular(origin):
        available = not row.available_at or date.fromisoformat(row.available_at) <= cutoff
        result.append((row.date, row.value if available and policy.accepts(row, observed_only=True) else None))
    return result


def seasonal_median(train, targets, min_years=5):
    out = []
    for target in targets:
        values = [value for stamp, value in train if value is not None and stamp[5:] == target[5:]]
        out.append({"value": stats.median(values) if len(values) >= min_years else None,
                    "lower": None, "upper": None, "reason": None if len(values) >= min_years else "insufficient_same_month_history"})
    return out


def seasonal_naive(train, targets):
    mapping = dict(train)
    return [{"value": mapping.get(month_stamp(month_id(target) - 12)), "lower": None, "upper": None,
             "reason": None if mapping.get(month_stamp(month_id(target) - 12)) is not None else "previous_year_same_month_unavailable"} for target in targets]


def sarima(train, horizon, config):
    import numpy as np
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    values = np.array([np.nan if value is None else math.log1p(value) for _, value in train])
    candidates = []
    best = None
    for order, seasonal in config.candidates:
        label = {"order": list(order), "seasonal_order": list(seasonal)}
        try:
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("always")
                fit = SARIMAX(values, order=order, seasonal_order=seasonal,
                              trend="c" if order[1] + seasonal[1] == 0 else "n",
                              enforce_stationarity=True, enforce_invertibility=True).fit(disp=False, maxiter=config.maxiter)
            converged = bool(fit.mle_retvals.get("converged", False))
            candidates.append({**label, "converged": converged, "aic": float(fit.aic) if math.isfinite(fit.aic) else None,
                               "warnings": sorted({type(w.message).__name__ for w in caught})})
            if converged and math.isfinite(fit.aic) and (best is None or fit.aic < best[0]):
                best = (float(fit.aic), fit, label)
        except (ValueError, ArithmeticError, np.linalg.LinAlgError) as exc:
            candidates.append({**label, "converged": False, "error": type(exc).__name__})
    if best is None:
        return [{"value": None, "lower": None, "upper": None, "reason": "sarima_fit_failed"} for _ in range(horizon)], {"candidates": candidates}
    try:
        forecast = best[1].get_forecast(steps=horizon)
        means, bounds = np.asarray(forecast.predicted_mean), np.asarray(forecast.conf_int(alpha=.05))
    except (ValueError, ArithmeticError, np.linalg.LinAlgError) as exc:
        return [{"value": None, "lower": None, "upper": None, "reason": "sarima_prediction_failed"} for _ in range(horizon)], {"candidates": candidates, "error": type(exc).__name__}
    out = []
    for mu, (lo, hi) in zip(means, bounds):
        try:
            value, lower, upper = [max(0., math.expm1(float(x))) for x in (mu, lo, hi)]
            if not all(math.isfinite(x) for x in (value, lower, upper)):
                raise ValueError("nonfinite inverse transform")
            out.append({"value": value, "lower": lower, "upper": upper, "reason": None})
        except (OverflowError, ValueError):
            out.append({"value": None, "lower": None, "upper": None, "reason": "invalid_sarima_prediction"})
    return out, {"parameters": best[2], "aic": best[0], "candidates": candidates,
                 "point_estimate": "median under log-Gaussian assumption, censored at zero; not bias-adjusted mean",
                 "interval_method": "sarima_log_gaussian_95_inverse_expm1_censored_at_zero"}


def predictions(train, targets, config):
    fits = {"seasonal_median": seasonal_median(train, targets, config.min_season_years),
            "seasonal_naive": seasonal_naive(train, targets)}
    fits["sarima"], diagnostic = sarima(train, len(targets), config)
    return fits, diagnostic


def backtest(series: RegionalSeries, config=ForecastConfig(), *, as_of=None):
    as_of = as_of or series.months[-1].date
    rows = series.regular(as_of)
    policy = QualityPolicy(include_drift=config.include_drift)
    indices = [i for i in range(config.min_train_months - 1, len(rows) - config.horizon, config.stride)
               if policy.accepts(rows[i], observed_only=True)]
    indices = indices[-config.max_origins:]
    records, diagnostics, used = [], [], []
    for i in indices:
        origin = rows[i].date
        train = training_values(series, origin, config)
        count = sum(value is not None for _, value in train)
        if count < config.min_train_months or train[-1][1] is None:
            continue
        targets = [rows[i + h].date for h in range(1, config.horizon + 1)]
        fits, diagnostic = predictions(train, targets, config)
        diagnostics.append({"origin": origin, **diagnostic})
        used.append(origin)
        for h, stamp in enumerate(targets, 1):
            truth = rows[i + h]
            if truth.source == "modeled_viirs":
                stratum = "modeled_not_scored"
            elif QualityPolicy(include_drift=True).accepts(truth, observed_only=True):
                stratum = "drift_observed" if "orbital_drift" in truth.flags else "stable_observed"
            else:
                stratum = "excluded_truth"
            actual = truth.value if stratum in ("stable_observed", "drift_observed") else None
            for model in MODELS:
                pred = fits[model][h - 1]
                records.append({"origin": origin, "date": stamp, "horizon": h, "model": model,
                                "prediction": pred["value"], "lower": pred["lower"], "upper": pred["upper"],
                                "actual": actual, "truth_source": truth.source, "truth_flags": list(truth.flags),
                                "stratum": stratum, "prediction_null_reason": pred["reason"],
                                "training_count": count, "training_end": train[-1][0],
                                "interval_method": diagnostic.get("interval_method") if model == "sarima" else None})
    return {"config": asdict(config), "as_of": as_of, "engine_sources": engine_fingerprints(),
            "origins": used, "records": records, "fit_diagnostics": diagnostics,
            "comparison": evaluate(records, used, min_origins=config.min_validation_origins),
            "training_sources": ["observed_modis"], "modeled_truth_scored": False}


def forecast(series: RegionalSeries, config=ForecastConfig(), *, as_of=None, evaluation=None):
    as_of = as_of or series.provenance.get("series_end") or max(r.date for r in series.months if r.complete)
    month_id(as_of)
    if (evaluation is None or evaluation.get("as_of") != as_of
            or evaluation.get("engine_sources") != engine_fingerprints()
            or json.dumps(evaluation.get("config"), sort_keys=True) != json.dumps(asdict(config), sort_keys=True)):
        evaluation = backtest(series, config, as_of=as_of)
    report = evaluation["comparison"]
    chosen = report.get("recommended_model")
    train = training_values(series, as_of, config)
    eligible = [(stamp, value) for stamp, value in train if value is not None]
    last = eligible[-1][0] if eligible else None
    targets = [month_stamp(month_id(as_of) + h) for h in range(1, config.horizon + 1)]
    status, reason = "experimental", None
    metadata = {}
    if last != as_of:
        reason, status = "latest_eligible_observation_does_not_reach_forecast_origin", "unavailable"
    elif len(eligible) < config.min_train_months or chosen is None:
        reason, status = "insufficient_training_or_backtest", "not_validated"
    elif report["status"] != "experimental_backtested":
        reason, status = "insufficient_holdout_evidence", "not_validated"
    values = [{"value": None, "lower": None, "upper": None, "reason": reason} for _ in targets]
    if reason is None:
        if chosen == "sarima":
            values, metadata = sarima(train, len(targets), config)
        elif chosen == "seasonal_naive":
            values = seasonal_naive(train, targets)
        else:
            values = seasonal_median(train, targets, config.min_season_years)
        if any(r["value"] is None for r in values):
            status = "not_validated"
    return {"forecast_status": status, "reason": reason, "model": chosen,
            "forecast_origin": as_of, "last_complete_observation_used": last,
            "training_period": {"start": eligible[0][0] if eligible else None, "end": last, "valid_months": len(eligible)},
            "config": asdict(config), "model_details": metadata,
            "predictions": [{"date": stamp, "horizon": i + 1, **value,
                             "interval_kind": "forecast" if value["lower"] is not None else None,
                             "interval_method": metadata.get("interval_method") if value["lower"] is not None else None}
                            for i, (stamp, value) in enumerate(zip(targets, values))],
            "backtesting": report,
            "limitations": ["Experimental forecasts of regional activity, not independent fires or meteorological danger.",
                            "Modeled harmonized values are never used as training observations or evaluation truth.",
                            "Forecast intervals are distinct from harmonization uncertainty and do not propagate that uncertainty.",
                            "Forecasts are withheld when observations do not reach the requested origin; longer leads are not silently extrapolated."]}
