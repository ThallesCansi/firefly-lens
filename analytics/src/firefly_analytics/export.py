from __future__ import annotations
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
import json
import math
from pathlib import Path

from .models import UNITS


def envelope(section, series, data, method, *, generated_at=None, data_status=None):
    source = {"synthetic": series.synthetic, "provenance": series.provenance}
    if section == "fire_weather":
        source = {"synthetic": series.synthetic or data.get("status") == "synthetic",
                  "provenance": {"kind": "provider_fwi" if data.get("forecasts") else "unconfigured_fwi_provider",
                                 "source_id": data.get("source_id"), "provider": data.get("source"),
                                 "normalized_import": data.get("provenance", {})}}
    result = {"schema_version": "1.0.0", "section": section, "region_id": series.region_id,
            "period": {"start": series.months[0].date, "end": series.months[-1].date},
            "units": "dimensionless" if section == "fire_weather" else UNITS,
            "source": source,
            "data_status": data_status or ("synthetic" if series.synthetic else "available"),
            "generated_at": generated_at or datetime.now(timezone.utc).isoformat(),
            "method": method, "data": data, "limitations": list(series.limitations),
            "geometry": series.geometry}
    assert_finite(result)
    return json.loads(json.dumps(result, allow_nan=False))


def assert_finite(value, path="$"):
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f"Nonfinite JSON number at {path}; use null plus reason")
    if isinstance(value, dict):
        for key, item in value.items():
            assert_finite(item, f"{path}.{key}")
    elif isinstance(value, (list, tuple)):
        for i, item in enumerate(value):
            assert_finite(item, f"{path}[{i}]")


def schema_path():
    return Path(__file__).resolve().parent / "result.schema.json"


def validate(result):
    from jsonschema import Draft202012Validator, FormatChecker
    assert_finite(result)
    schema = json.loads(schema_path().read_text(encoding="utf-8"))
    errors = list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(result))
    if errors:
        def leaves(error):
            return [leaf for child in error.context for leaf in leaves(child)] if error.context else [error]
        error = max((leaf for root in errors for leaf in leaves(root)), key=lambda e: len(e.absolute_path))
        raise ValueError(f"Contract violation at {error.json_path}: {error.message[:400]}")


def write_results(results, directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    for section, result in results.items():
        validate(result)
        (directory / f"{section}.json").write_text(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
