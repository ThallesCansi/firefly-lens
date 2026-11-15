from dataclasses import asdict
from .models import Reference, QualityPolicy
from .history import history
from .climatology import climatology
from .anomalies import anomalies
from .forecasting import ForecastConfig, backtest, forecast
from .fire_weather import query_fire_weather
from .export import envelope


def analyze(series, *, reference=Reference(), policy=QualityPolicy(), forecast_config=ForecastConfig(),
            forecast_origin=None, generated_at=None, run_forecast=True, evaluation=None):
    """Pure orchestration: each section can fail independently; no file writes/API."""
    results = {}
    operations = {
        "history": (lambda: history(series, policy), {"name": "monthly_and_complete_annual_activity", "policy": asdict(policy)}),
        "climatology": (lambda: climatology(series, reference, policy), {"name": "same_calendar_month_statistics", "reference": asdict(reference)}),
        "anomalies": (lambda: anomalies(series, reference, policy), {"name": "past_years_only_leave_target_out_seasonal_anomalies", "reference": asdict(reference)}),
        "forecast": (lambda: forecast(series, forecast_config, as_of=forecast_origin,
                                      evaluation=evaluation), {"name": "experimental_expanding_origin_comparison", "config": asdict(forecast_config)}),
        "fire_weather": (lambda: query_fire_weather(series.region_id, series.geometry), {"name": "provider_fwi_adapter_no_live_provider"}),
    }
    for section, (operation, method) in operations.items():
        try:
            if section == "forecast" and not run_forecast:
                data = {"status": "unavailable", "reason": "forecast_explicitly_disabled"}
            else:
                data = operation()
            status = data.get("forecast_status", data.get("status")) if section in ("forecast", "fire_weather") else None
            results[section] = envelope(section, series, data, method, generated_at=generated_at, data_status=status)
        except (ValueError, RuntimeError, ImportError, ArithmeticError) as exc:
            results[section] = envelope(section, series, {"status": "unavailable", "reason": str(exc), "error_type": type(exc).__name__},
                                        method, generated_at=generated_at, data_status="unavailable")
    return results
