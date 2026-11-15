"""Read-only regional adapter. Spatial weighting matches fire_calendar.py.

That function does not expose weights or per-month uncertainty, so this adapter
reuses its documented geometry algorithm for a richer monthly contract. Real
integration tests compare both paths, including a nonrectangular polygon.
"""
from __future__ import annotations

from dataclasses import fields
from datetime import date
import hashlib
import json
import math
from pathlib import Path
import subprocess

from .models import Month, RegionalSeries, month_id


def fingerprint(path: Path):
    return {"path": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def from_json(path: str | Path) -> RegionalSeries:
    from jsonschema import Draft202012Validator, FormatChecker
    raw = json.loads(Path(path).read_text(encoding="utf-8"), parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))
    schema = json.loads((Path(__file__).resolve().parent / "input.schema.json").read_text(encoding="utf-8"))
    errors = list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(raw))
    if errors:
        raise ValueError(f"Invalid regional input at {errors[0].json_path}: {errors[0].message[:200]}")
    allowed = {f.name for f in fields(RegionalSeries)}
    if set(raw) - allowed:
        raise ValueError("Unknown regional input fields")
    raw["months"] = [Month(**{**m, "flags": tuple(m.get("flags", ()))}) for m in raw["months"]]
    return RegionalSeries(**raw)


def geometry_weights(con, geometry: dict, cell_deg: float):
    import shapely
    from shapely.geometry import shape

    gj = geometry
    if gj.get("type") == "FeatureCollection":
        geom = shapely.union_all([shape(f["geometry"]) for f in gj["features"]])
    else:
        geom = shape(gj["geometry"] if gj.get("type") == "Feature" else gj)
    if geom.is_empty or geom.geom_type not in ("Polygon", "MultiPolygon"):
        raise ValueError("Nonempty Polygon/MultiPolygon required")
    w, s, e, n = geom.bounds
    if not (-180 <= w < e <= 180 and -90 <= s < n <= 90) or e - w > 180:
        raise ValueError("Expected lon/lat EPSG:4326; antimeridian shapes unsupported")
    cells = con.execute("SELECT DISTINCT cell_id,lat,lon FROM grid WHERE lon BETWEEN ? AND ? AND lat BETWEEN ? AND ?",
                        [w - cell_deg / 2, e + cell_deg / 2, s - cell_deg / 2, n + cell_deg / 2]).df()
    if cells.empty:
        raise ValueError("Region does not intersect the dataset grid")
    simp = geom.simplify(.005, preserve_topology=True) if shapely.get_num_coordinates(geom) > 2000 else geom
    repaired = not simp.is_valid
    if repaired:
        simp = shapely.make_valid(simp)
    shapely.prepare(simp)
    boxes = shapely.box(cells.lon.to_numpy() - cell_deg / 2, cells.lat.to_numpy() - cell_deg / 2,
                        cells.lon.to_numpy() + cell_deg / 2, cells.lat.to_numpy() + cell_deg / 2)
    inside = shapely.contains(simp, boxes)
    edge = shapely.intersects(simp, boxes) & ~inside
    weights = inside.astype(float)
    weights[edge] = shapely.area(shapely.intersection(boxes[edge], simp)) / cell_deg ** 2
    cells["w"] = weights
    cells = cells[cells.w > 0]
    if cells.empty:
        raise ValueError("Region does not intersect any grid cell")
    return cells, repaired


def from_parquet(repo: str | Path, region_id: str, geometry: dict, *, start=None, end=None) -> RegionalSeries:
    import duckdb

    repo = Path(repo).resolve()
    grid = repo / "harmonization/output/grid_monthly_total.parquet"
    params_file = repo / "harmonization/output/harmonization_params.json"
    meta_file = repo / "public/data/brazil/meta.json"
    params = json.loads(params_file.read_text(encoding="utf-8"))
    meta = json.loads(meta_file.read_text(encoding="utf-8"))
    if not math.isfinite(params["common_error_c"]) or params["common_error_c"] < 0:
        raise ValueError("Invalid common-error coefficient")
    with duckdb.connect(":memory:") as con:
        con.read_parquet(str(grid)).create_view("grid")
        required = {"cell_id", "lat", "lon", "year", "month", "n_harmonized", "var_harmonized", "source_flag", "is_partial"}
        cols = {r[0] for r in con.execute("DESCRIBE grid").fetchall()}
        if required - cols:
            raise ValueError(f"Missing Parquet columns: {sorted(required - cols)}")
        weights, repaired = geometry_weights(con, geometry, params["cell_deg"])
        con.register("weights", weights[["cell_id", "w"]])
        rows = con.execute("""
            SELECT year,month,sum(w*n_harmonized),sum(w*w*var_harmonized),
                   list(DISTINCT source_flag),bool_or(is_partial),count(*),count(DISTINCT cell_id),
                   count(*) FILTER (WHERE n_harmonized IS NULL OR NOT isfinite(n_harmonized) OR n_harmonized<0),
                   count(*) FILTER (WHERE source_flag='modeled_viirs' AND (var_harmonized IS NULL OR NOT isfinite(var_harmonized) OR var_harmonized<0))
            FROM grid JOIN weights USING(cell_id) GROUP BY year,month ORDER BY year,month
        """).fetchall()
    result = []
    for y, m, total, variance, sources, partial, count, unique, bad, bad_var in rows:
        stamp = f"{y:04d}-{m:02d}"
        if not month_id(meta["firstDay"][:7]) <= month_id(stamp) <= month_id(meta["lastDay"][:7]):
            raise ValueError("Parquet month falls outside declared data coverage")
        if (start and month_id(stamp) < month_id(start)) or (end and month_id(stamp) > month_id(end)):
            continue
        flags = []
        if count != len(weights) or unique != len(weights):
            flags.append("incomplete_spatial_coverage")
            total = None
        if bad:
            flags.append("invalid_or_missing_values")
            total = None
        if stamp in ("2020-08", "2020-09", "2022-03", "2022-04"):
            flags.append("sensor_outage")
        source = sources[0] if len(sources) == 1 and sources[0] is not None else "mixed"
        expected_source = "observed_modis" if y <= params.get("observed_until", 2025) else "modeled_viirs"
        if source != expected_source:
            raise ValueError("Regional source flags disagree with observed/modeled metadata")
        if y in (2024, 2025) and source == "observed_modis":
            flags.append("orbital_drift")
        if source == "modeled_viirs":
            flags.append("harmonized_estimate_not_observed_truth")
        complete = not partial
        if stamp == meta["firstDay"][:7] and date.fromisoformat(meta["firstDay"]).day != 1:
            complete = False
        if not complete:
            flags.append("partial_month")
        lower = upper = method = None
        if source == "modeled_viirs" and total is not None:
            if bad_var or variance is None:
                flags.append("missing_uncertainty")
            else:
                sd = math.sqrt(variance + (params["common_error_c"] * total) ** 2)
                lower, upper = max(0., total - 1.96 * sd), total + 1.96 * sd
                method = "harmonization_normal_95_sum_w2_variance_plus_common_error"
        result.append(Month(stamp, total, source, complete, tuple(flags), lower, upper, method))
    if not result:
        raise ValueError("Requested period contains no data")
    commit = None
    try:
        revision = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], capture_output=True, text=True)
        if revision.returncode == 0:
            commit = revision.stdout.strip()
    except FileNotFoundError:
        pass  # Minimal service images use file fingerprints, without Git installed.
    return RegionalSeries(region_id, result, geometry=geometry, provenance={
        "kind": "real_harmonized_parquet", "repository_commit": commit,
        "files": [fingerprint(p) for p in (grid, params_file, meta_file)], "grid_cells": len(weights),
        "aggregation": "cell-intersection fraction in square degrees; sum(w*x); uncertainty sum(w^2*variance)+(c*total)^2",
        "geometry_repaired": repaired, "simplification_deg_if_over_2000_vertices": .005,
        "data_reference_date": meta["lastDay"], "series_end": params["series_end"],
    }, limitations=[
        "Hotspots are thermal detections, not independent fires, burned area or severity.",
        "Zero is preserved; acquisition availability/cloud masks are absent, so zeros cannot prove absence of fire.",
        "Aqua drift affects 2024–2025. Modeled VIIRS from 2026 is not independent observed truth.",
        "Known outages flag four calendar months; this is not a complete acquisition-quality mask.",
        "Area fractions use degrees squared, as in the existing pipeline; this is not equal-area aggregation.",
        "Source files are retrospective final-vintage data; historical publication lags are not provided.",
    ])
