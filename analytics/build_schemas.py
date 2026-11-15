"""Build the frontend schemas and the package's identical validation resource."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MONTH = {"type": "string", "pattern": r"^[0-9]{4}-(0[1-9]|1[0-2])$"}
NUMBER = {"type": ["number", "null"]}
NONNEG = {"type": ["number", "null"], "minimum": 0}
SOURCE = {"enum": ["observed_modis", "modeled_viirs", "missing", "mixed"]}


def obj(properties, required=None, extra=False):
    return {"type": "object", "properties": properties, "required": required or list(properties), "additionalProperties": extra}


def arr(item):
    return {"type": "array", "items": item}


def build():
    generic = {"type": "object"}
    failure = obj({"status": {"const": "unavailable"}, "reason": {"type": "string"}}, extra=True)
    monthly = obj({"date": MONTH, "value": NONNEG, "source": SOURCE, "complete": {"type": "boolean"},
                   "flags": arr({"type": "string"}), "lower": NONNEG, "upper": NONNEG,
                   "uncertainty_method": {"type": ["string", "null"]}, "available_at": {"type": ["string", "null"], "format": "date"}},
                  required=["date", "value", "source", "complete"], extra=False)
    stats = obj({"month": {"type": "integer", "minimum": 1, "maximum": 12},
                 "n_years": {"type": "integer", "minimum": 0}, "years_used": arr({"type": "integer"}),
                 "status": {"enum": ["available", "insufficient_history"]}, "reason": {"type": ["string", "null"]},
                 **{k: NUMBER for k in ("mean", "median", "std_sample", "p10", "p25", "p75", "p90", "min", "max", "mad")}})
    history = obj({"monthly": arr({**monthly, "additionalProperties": True}),
                   "annual": arr(obj({"year": {"type": "integer"}, "total": NONNEG, "complete": {"type": "boolean"},
                                      "valid_months": {"type": "integer", "minimum": 0, "maximum": 12}, "yoy_percent": NUMBER}, extra=True)),
                   "summary": generic, "policy": generic})
    climatology = obj({"reference": generic, "policy": generic, "quantile_method": {"type": "string"},
                       "months": {**arr(stats), "minItems": 12, "maxItems": 12}})
    anomaly = obj({"date": MONTH, "value": NONNEG, "source": SOURCE, "complete": {"type": "boolean"},
                   "quality_flags": arr({"type": "string"}), "status": {"type": "string"},
                   **{k: NUMBER for k in ("absolute", "percent", "z_score", "robust_z", "percentile")},
                   "null_reasons": generic, "reference": generic})
    anomalies = obj({"policy": generic, "percentile_ties": {"type": "string"}, "classification": {"type": "string"}, "months": arr(anomaly)})
    prediction = obj({"date": MONTH, "horizon": {"type": "integer", "minimum": 1, "maximum": 3},
                      "value": NONNEG, "lower": NONNEG, "upper": NONNEG, "reason": {"type": ["string", "null"]},
                      "interval_kind": {"enum": ["forecast", None]}, "interval_method": {"type": ["string", "null"]}})
    forecast = obj({"forecast_status": {"enum": ["experimental", "not_validated", "unavailable"]},
                    "reason": {"type": ["string", "null"]}, "model": {"enum": ["seasonal_median", "seasonal_naive", "sarima", None]},
                    "forecast_origin": MONTH, "last_complete_observation_used": {"type": ["string", "null"]},
                    "training_period": generic, "config": generic, "model_details": generic,
                    "predictions": {**arr(prediction), "minItems": 1, "maxItems": 3},
                    "backtesting": generic, "limitations": arr({"type": "string"})})
    weather = obj({"status": {"enum": ["available", "unavailable", "synthetic"]}, "reason": {"type": ["string", "null"]},
                   "index": {"const": "FWI"}, "units": {"const": "dimensionless"},
                   "forecasts": arr(obj({"issued_at": {"type": "string", "format": "date-time"},
                                         "valid_at": {"type": ["string","null"], "format": "date-time"}, "lead_hours": {"type": ["number","null"], "minimum": 0},
                                         "member": {"type": "string"}, "value": NONNEG,
                                         "sample_count": {"type": "integer", "minimum": 1}, "valid_samples": {"type": "integer", "minimum": 0},
                                         "null_reason": {"type": ["string", "null"]},
                                         "coverage_fraction": {"type":"number","minimum":0,"maximum":1},
                                         "danger_class": {"enum":["Low","Moderate","High","Very high","Extreme","Very extreme",None]},
                                         "maximum": NONNEG, "percentile": NUMBER, "anomaly": NUMBER,
                                         "valid_date": {"type":"string","format":"date"}, "lead_days":{"type":"integer","minimum":0},
                                         "validity_basis":{"type":"string"},
                                         "distribution": arr(obj({"class":{"type":"string"},"area_fraction":{"type":"number","minimum":0,"maximum":1}}))},
                                         required=["issued_at","valid_at","lead_hours","member","value","sample_count","valid_samples","null_reason"], extra=False))}, extra=True)
    sections = dict(history=history, climatology=climatology, anomalies=anomalies, forecast=forecast, fire_weather=weather)
    result = obj({"schema_version": {"const": "1.0.0"}, "section": {"enum": list(sections)},
                  "region_id": {"type": "string", "minLength": 1}, "period": obj({"start": MONTH, "end": MONTH}),
                  "units": {"enum": ["MODIS-Aqua-equivalent hotspots", "dimensionless"]},
                  "source": obj({"synthetic": {"type": "boolean"}, "provenance": generic}),
                  "data_status": {"enum": ["available", "synthetic", "experimental", "not_validated", "unavailable"]},
                  "generated_at": {"type": "string", "format": "date-time"}, "method": generic, "data": generic,
                  "limitations": arr({"type": "string"}), "geometry": {"type": ["object", "null"]}})
    result.update({"$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://firefly-lens.local/schemas/analytics/result-1.0.0.json",
                   "allOf": [{"if": {"properties": {"section": {"const": name}}}, "then": {"properties": {"data": {"anyOf": [schema, failure]}}}} for name, schema in sections.items()]})
    result["allOf"].append({"if":{"properties":{"section":{"const":"fire_weather"}}},
                           "then":{"properties":{"units":{"const":"dimensionless"}}},
                           "else":{"properties":{"units":{"const":"MODIS-Aqua-equivalent hotspots"}}}})
    input_schema = obj({"region_id": {"type": "string", "minLength": 1}, "units": {"const": "MODIS-Aqua-equivalent hotspots"},
                        "months": {**arr(monthly), "minItems": 1}, "geometry": {"type": ["object", "null"]},
                        "provenance": generic, "synthetic": {"type": "boolean"}, "limitations": arr({"type": "string"})},
                       required=["region_id", "units", "months", "synthetic"])
    input_schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    for name, schema in (("result", result), ("input", input_schema)):
        for directory in (ROOT / "schemas", ROOT / "src/firefly_analytics"):
            directory.mkdir(parents=True, exist_ok=True)
            (directory / f"{name}.schema.json").write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
