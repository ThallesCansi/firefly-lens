"""Preprocess real regions for static/Vercel delivery; never change engine formulas.

From repository root, using the engine's Python environment:
  python analytics/integration/export_site.py
No runtime Python, API backend, synthetic examples or retrospective forecasts
are shipped to the app. Each bundle is validated by the original JSON Schema.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "analytics/src"))

from firefly_analytics.data_adapter import from_parquet
from firefly_analytics.engine import analyze
from firefly_analytics.export import validate, assert_finite
from firefly_analytics.forecasting import ForecastConfig, engine_fingerprints

SECTIONS = ("history", "climatology", "anomalies", "forecast", "fire_weather")


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def export_site(repo=REPO, out=None, *, ids=None, origins=48):
    repo = Path(repo).resolve()
    out = Path(out or repo / "public/analytics").resolve()
    if not out.is_relative_to(repo / "public/analytics"):
        raise ValueError("Output must stay within public/analytics")
    meta = json.loads((repo / "public/data/brazil/meta.json").read_text(encoding="utf-8"))
    selected = [r for r in meta["presets"] if ids is None or r["id"] in ids]
    if not selected or (ids and set(ids) != {r["id"] for r in selected}):
        raise ValueError("Unknown/empty preset selection")
    now = datetime.now(timezone.utc).isoformat()
    entries = []
    out.mkdir(parents=True, exist_ok=True)
    for region in selected:
        geometry = region["geometry"]  # exact preset outline (harmonization/pipeline/presets.geojson)
        print(f"Processing {region['id']}: actual polygon + {origins} backtest origins", flush=True)
        series = from_parquet(repo, region["id"], geometry)
        result = analyze(series, generated_at=now, forecast_config=ForecastConfig(max_origins=origins))
        for section in SECTIONS:
            validate(result[section])
            if result[section]["source"]["synthetic"]:
                raise ValueError("Synthetic results cannot be shipped")
        bundle = {"schema_version": "1.0.0", "region_id": region["id"], "geometry": geometry, "sections": result}
        assert_finite(bundle)
        raw = (json.dumps(bundle, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")
        filename = f"{region['id']}.json"
        (out / filename).write_bytes(raw)
        entry = {"id": region["id"], "name": region["name"], "geometry": geometry,
                 "url": f"/analytics/{filename}", "sha256": sha(raw),
                 "forecast_status": result["forecast"]["data_status"]}
        if region.get("representative_point"):
            entry["representative_point"] = region["representative_point"]
        entries.append(entry)
        print(f"Exported {filename}: history={result['history']['data_status']}, forecast={result['forecast']['data_status']}", flush=True)
    sources = []
    for relative in ("harmonization/output/grid_monthly_total.parquet", "harmonization/output/harmonization_params.json", "public/data/brazil/meta.json"):
        raw = (repo / relative).read_bytes()
        if relative.endswith(".json"):
            raw = raw.replace(b"\r\n", b"\n")
        sources.append({"path": relative, "sha256_lf": sha(raw)})
    manifest = {"schema_version": "1.0.0", "generated_at": now,
                "data_meta": {k: meta[k] for k in ("version", "firstDay", "lastDay", "seriesEnd", "partialMonth", "observedUntil", "climatologyBase", "cellDeg", "commonErrorC")},
                "sources": sources, "engine_sources": engine_fingerprints(), "regions": entries,
                "coverage": "Exact preprocessed geometries only; arbitrary selections require on-demand Python processing"}
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    export_site()
