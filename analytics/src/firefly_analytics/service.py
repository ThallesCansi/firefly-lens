"""Trusted on-demand adapter. No client series or provenance is accepted."""
from collections import OrderedDict
from dataclasses import asdict
import hashlib
import json
import math
import os
from pathlib import Path
from threading import RLock, BoundedSemaphore

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from shapely import normalize, get_num_coordinates
from shapely.geometry import shape, mapping
from shapely.errors import GEOSException
from typing import Literal

from .data_adapter import from_parquet
from .engine import analyze
from .export import envelope, validate
from .forecasting import ForecastConfig, forecast, engine_fingerprints


class Geometry(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    type: Literal["Polygon", "MultiPolygon"]
    coordinates: list[list[list[float]]] | list[list[list[list[float]]]]


class AnalyticsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    schema_version: Literal["1.0.0"]
    geometry: Geometry
    data_version: dict
    horizon: int = Field(default=3, ge=1, le=3)


META_KEYS = ("version", "firstDay", "lastDay", "seriesEnd", "partialMonth",
             "observedUntil", "climatologyBase", "cellDeg", "commonErrorC")


def create_app(repo=None, *, token=None, enable_sarima=None):
    repo = Path(repo or os.environ.get("FIREFLY_DATA_ROOT", Path(__file__).resolve().parents[3])).resolve()
    token = token if token is not None else os.environ.get("ANALYTICS_API_TOKEN")
    enable_sarima = enable_sarima if enable_sarima is not None else os.environ.get("ANALYTICS_ENABLE_SARIMA") == "1"
    api = FastAPI(title="FireFly regional analytics", version="1.0.0")
    # Bounded, process-local LRU; deploy immutable data per service version.
    cache, lock, work = OrderedDict(), RLock(), BoundedSemaphore(1)
    dataset = None

    def data():
        nonlocal dataset
        with lock:
            if dataset is None:
                try:
                    meta = json.loads((repo / "public/data/brazil/meta.json").read_text(encoding="utf-8"))
                    paths = ("harmonization/output/grid_monthly_total.parquet",
                             "harmonization/output/harmonization_params.json", "public/data/brazil/meta.json")
                    digest = hashlib.sha256()
                    for path in paths:
                        digest.update((repo / path).read_bytes())
                    digest.update(json.dumps(engine_fingerprints(), sort_keys=True).encode())
                    dataset = (meta, digest.hexdigest())
                except (OSError, ValueError):
                    raise HTTPException(503, "analytics_dataset_unavailable")
            return dataset

    def cached(key, operation):
        with lock:
            if key in cache:
                cache.move_to_end(key)
                return cache[key]
        value = operation()
        with lock:
            cache[key] = value
            if len(cache) > 48:
                cache.popitem(last=False)
        return value

    def process(request, section, authorization):
        if token and authorization != f"Bearer {token}":
            raise HTTPException(401, "unauthorized")
        meta, version = data()
        if request.data_version != {key: meta[key] for key in META_KEYS}:
            raise HTTPException(409, "analytics_data_version_mismatch")
        try:
            raw = request.geometry.model_dump()
            if (raw.get("type") not in ("Polygon", "MultiPolygon")
                    or set(raw) != {"type", "coordinates"} or len(json.dumps(raw)) > 500_000):
                raise ValueError()
            polygons = [raw["coordinates"]] if raw["type"] == "Polygon" else raw["coordinates"]
            for polygon in polygons:
                for ring in polygon:
                    if len(ring) < 4 or ring[0] != ring[-1]:
                        raise ValueError()
                    for point in ring:
                        if (len(point) != 2 or any(type(x) not in (int, float) or not math.isfinite(x) for x in point)
                                or abs(point[0]) > 180 or abs(point[1]) > 90):
                            raise ValueError()
            geom = shape(raw)
            if geom.is_empty or not geom.is_valid or get_num_coordinates(geom) > 20000:
                raise ValueError()
            w, s, e, n = geom.bounds
            if not (-180 <= w < e <= 180 and -90 <= s < n <= 90) or e - w > 180:
                raise ValueError()
            geometry = mapping(normalize(geom))
            region = "polygon-" + hashlib.sha256(normalize(geom).wkb).hexdigest()
        except (ValueError, TypeError, KeyError, IndexError, GEOSException):
            raise HTTPException(422, "invalid_polygon")
        base = (region, version)
        config = ForecastConfig(max_origins=32, enable_sarima=enable_sarima)
        config = ForecastConfig(**{**asdict(config), "horizon": request.horizon})
        key = (*base, "history") if section == "history" else (*base, section, json.dumps(asdict(config), sort_keys=True))
        # One bounded worker prevents bursts of SARIMA fits. Cache hits stay fast.
        with lock:
            if key in cache:
                return cache[key]
        if not work.acquire(blocking=False):
            raise HTTPException(429, "analytics_busy_retry", headers={"Retry-After": "2"})
        try:
            def aggregate():
                try:
                    series = from_parquet(repo, region, geometry)
                except ValueError as exc:
                    if "intersect" in str(exc):
                        raise HTTPException(422, "region_outside_coverage")
                    raise
                series.provenance["processing_version"] = version
                series.provenance["last_complete_month"] = meta["seriesEnd"]
                series.limitations.append("Spatial resolution is 0.25 degrees; small polygons are fractional grid estimates, not local fire measurements.")
                return series
            series = cached((*base, "series"), aggregate)
            def history_result():
                sections = analyze(series, run_forecast=False)
                for payload in sections.values():
                    validate(payload)
                return {"schema_version": "1.0.0", "region_id": region,
                        "geometry": geometry, "sections": sections}
            bundle = cached((*base, "history"), history_result)
            if section == "history":
                return bundle
            def forecast_result():
                result = forecast(series, config, as_of=meta["seriesEnd"])
                payload = envelope("forecast", series, result, {"name": "experimental_expanding_origin_comparison", "config": asdict(config)},
                                   data_status=result["forecast_status"])
                validate(payload)
                return {**bundle, "sections": {**bundle["sections"], "forecast": payload}}
            return cached(key, forecast_result)
        except HTTPException:
            raise
        except Exception:
            import logging
            logging.getLogger(__name__).exception("Regional analytics failed")
            raise HTTPException(500, "analytics_processing_error")
        finally:
            work.release()

    @api.get("/health")
    def health():
        _, version = data()
        return {"status": "ok", "processing_version": version}

    @api.post("/analytics/history")
    def history_endpoint(request: AnalyticsRequest, authorization: str | None = Header(default=None)):
        return process(request, "history", authorization)

    @api.post("/analytics/forecast")
    def forecast_endpoint(request: AnalyticsRequest, authorization: str | None = Header(default=None)):
        return process(request, "forecast", authorization)

    return api


app = create_app()
