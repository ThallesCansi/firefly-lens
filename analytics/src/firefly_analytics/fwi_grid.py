"""Offline numeric CEMS/NASA NetCDF reader. No WMS pixels or locally computed FWI.

Only regular geographic grids are supported. Unsupported metadata fail closed.
The sidecar records the operator's authenticated download, not a digital signature.
"""
from datetime import datetime, timezone, timedelta, date
from functools import lru_cache
import hashlib
import json
import math
import re
from pathlib import Path

import numpy as np
from shapely.geometry import shape, box
from shapely import segmentize

from .fire_weather import SOURCES, utc, unavailable

CLASSES = ("Low", "Moderate", "High", "Very high", "Extreme", "Very extreme")
THRESHOLDS = (11.2, 21.3, 38.0, 50.0, 70.0)


def classify(value):
    if not math.isfinite(value) or value < 0:
        raise ValueError("Invalid FWI")
    # GWIS says >70 for Very extreme; 70 belongs to Extreme.
    return CLASSES[sum(value >= t for t in THRESHOLDS[:4]) + (value > 70)]


@lru_cache(maxsize=4)
def checked_digest(path, size, modified_ns, expected):
    with open(path, "rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != expected:
        raise ValueError("FWI file checksum mismatch")
    return digest


def axis_edges(values, *, latitude=False):
    values = np.asarray(values, dtype=float)
    if values.ndim != 1 or len(values) < 2 or not np.isfinite(values).all():
        raise ValueError("FWI requires one-dimensional regular grid coordinates")
    differences = np.diff(values)
    if differences[0] <= 0 or not np.allclose(differences, differences[0], atol=1e-7, rtol=0):
        raise ValueError("Reduced, duplicate or irregular grids are unsupported")
    edges = np.r_[values[0] - differences[0] / 2, values + differences[0] / 2]
    if latitude:
        edges = np.clip(edges, -90, 90)
    elif edges[-1] - edges[0] > 360 + 1e-7:
        raise ValueError("Longitude cells overlap after wrapping")
    return edges, float(differences[0])


def area_m2(geometry):
    from pyproj import Geod
    from shapely.geometry.polygon import orient
    geod = Geod(ellps="WGS84")
    if geometry.is_empty:
        return 0.0
    if geometry.geom_type in ("MultiPolygon", "GeometryCollection"):
        return sum(area_m2(g) for g in geometry.geoms)
    if geometry.geom_type != "Polygon":
        return 0.0
    # Densification approximates straight lon/lat edges before ellipsoidal area.
    return abs(geod.geometry_area_perimeter(orient(segmentize(geometry, .1)))[0])


def timestamp(value):
    result = np.asarray(value)
    if result.size != 1 or not np.issubdtype(result.dtype, np.datetime64) or np.isnat(result).any():
        raise ValueError("Original forecast timestamps must be decoded CF dates")
    return utc(np.datetime_as_string(result.reshape(-1)[0], unit="s", timezone="UTC"))


def read_netcdf(path, metadata_path, geometry, *, now=None, window_days=9):
    import xarray as xr
    path, metadata_path = Path(path), Path(metadata_path)
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    source_id = metadata.get("source_id")
    nasa = source_id == "nasa_gfwed_geos5"
    if source_id not in ("copernicus_ewds_cems_fire_seasonal", "nasa_gfwed_geos5") or metadata.get("synthetic") is not False:
        raise ValueError("Only explicitly real supported numeric downloads are accepted")
    if not all(isinstance(metadata.get(k), str) and metadata[k].strip()
               for k in ("sha256", "licence", "retrieved_at", "request_id", "meteorological_source", "system_version")):
        raise ValueError("Missing FWI download provenance")
    utc(metadata["retrieved_at"])
    stat = path.stat()
    digest = checked_digest(str(path.resolve()), stat.st_size, stat.st_mtime_ns, metadata["sha256"])
    geom = shape(geometry.get("geometry", geometry))
    if geom.is_empty or not geom.is_valid or geom.geom_type not in ("Polygon", "MultiPolygon"):
        raise ValueError("Valid FWI polygon required")
    west, south, east, north = geom.bounds
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90) or east - west > 180:
        raise ValueError("FWI polygon must use EPSG:4326 without crossing the antimeridian")
    selected_area = area_m2(geom)
    if not math.isfinite(selected_area) or selected_area <= 0:
        raise ValueError("FWI polygon has no measurable ellipsoidal area")
    now = now or datetime.now(timezone.utc)
    rows = []
    with xr.open_dataset(path, decode_coords="all", decode_timedelta=True) as ds:
        names = metadata.get("variables", {})
        variable = names.get("fwi", "fwi")
        lat, lon = names.get("latitude", "latitude"), names.get("longitude", "longitude")
        issue_name = names.get("issued_at", "forecast_reference_time")
        valid_name = names.get("valid_at", "valid_date" if nasa else "valid_time")
        member_name = names.get("member", "number")
        if any(name not in ds for name in (variable, lat, lon, issue_name, valid_name)):
            raise ValueError("FWI variable or original issuance/validity coordinates missing")
        if ds[lat].dims != (lat,) or ds[lon].dims != (lon,):
            raise ValueError("Only rectilinear FWI grids are supported")
        ds = ds.assign_coords({lon: ((ds[lon] + 180) % 360) - 180}).sortby(lon).sortby(lat)
        lat_edges, dy = axis_edges(ds[lat].values, latitude=True)
        lon_edges, dx = axis_edges(ds[lon].values)
        data = ds[variable]
        if data.attrs.get("units") not in ("1", "dimensionless", "Numeric", "~"):
            raise ValueError("FWI must be dimensionless")
        issued = timestamp(ds[issue_name].values)
        if issued > now:
            raise ValueError("FWI issuance is in the future")
        validity = ds[valid_name]
        if nasa:
            # Native GFWED has calendar='none', time=1, no absolute time origin.
            # Use the provider's documented forecast product key, preserving its
            # DATE granularity instead of inventing a global noon UTC instant.
            dates = []
            for original in metadata.get('source_files', []):
                match = re.fullmatch(r'https://portal\.nccs\.nasa\.gov/datashare/GlobalFWI/v2\.0/fwiCalcs\.GEOS-5/Default/GEOS-5/\d{4}/(\d{10})/FWI\.GEOS-5\.Daily\.Default\.(\d{10})\.(\d{8})\.nc', original.get('url',''))
                if not match or match[1] != match[2] or datetime.strptime(match[1],'%Y%m%d%H').replace(tzinfo=timezone.utc) != issued:
                    raise ValueError('Invalid original NASA forecast product key')
                dates.append(datetime.strptime(match[3],'%Y%m%d').date().isoformat())
            if not dates or sorted(dates) != sorted(str(v) for v in validity.values.reshape(-1)):
                raise ValueError('NASA validity dates differ from documented source product keys')
        if validity.ndim > 1:
            raise ValueError("Select a single forecast issuance offline")
        time_dim = validity.dims[0] if validity.ndim else None
        allowed_dims = {lat, lon, member_name, time_dim}
        if set(data.dims) - allowed_dims:
            raise ValueError("Unsupported FWI dimensions; select one issuance offline")
        yi = np.flatnonzero((lat_edges[:-1] < north) & (lat_edges[1:] > south))
        # Global grids often have a centre at ±180. Split that cell footprint
        # at the dateline instead of discarding its coverage on either side.
        longitude_parts = []
        for left, right in zip(lon_edges[:-1], lon_edges[1:]):
            parts = [(max(-180., left), min(180., right))]
            if left < -180:
                parts.append((left+360, 180.))
            if right > 180:
                parts.append((-180., right-360))
            longitude_parts.append([(a,b) for a,b in parts if a < b])
        xi = [i for i, parts in enumerate(longitude_parts) if any(a < east and b > west for a,b in parts)]
        if len(yi)*len(xi) > 25000:
            raise ValueError("FWI selection exceeds the bounded cell budget")
        weights = np.zeros((len(yi), len(xi)))
        for i, y in enumerate(yi):
            for j, x in enumerate(xi):
                weights[i, j] = sum(area_m2(geom.intersection(box(a, lat_edges[y], b, lat_edges[y+1])))
                                    for a,b in longitude_parts[x])
        if not weights.any():
            return unavailable("no_numeric_grid_coverage")
        members = ds[member_name].values.tolist() if member_name in data.dims else ["deterministic"]
        if len(set(map(str, members))) != len(members):
            raise ValueError("Duplicate ensemble members")
        times = np.asarray(validity.values).reshape(-1)
        if len(np.unique(times)) != len(times):
            raise ValueError("Duplicate FWI validity times")
        for t, value in enumerate(times):
            daily = date.fromisoformat(str(value)) if nasa else None
            valid = None if nasa else timestamp(value)
            lead = (daily - issued.date()).days if nasa else (valid - issued).total_seconds() / 3600
            if lead < 0:
                raise ValueError("FWI validity precedes issuance")
            if not (now.date() <= daily <= now.date()+timedelta(days=window_days) if nasa else now <= valid <= now+timedelta(days=window_days)):
                continue
            for m, member in enumerate(members):
                index = {lat: yi, lon: xi}
                if time_dim:
                    index[time_dim] = t
                if member_name in data.dims:
                    index[member_name] = m
                values = data.isel(index).transpose(lat, lon).values.astype(float)
                mask = np.isfinite(values) & (values >= 0) & (weights > 0)
                valid_area = float(weights[mask].sum())
                coverage = min(1., valid_area / selected_area)
                total = float(np.sum(values[mask] * weights[mask]) / valid_area) if valid_area else None
                distribution = [{"class": category,
                    "area_fraction": float(sum(weights[i, j] for i, j in zip(*np.where(mask))
                        if classify(values[i, j]) == category) / valid_area * coverage) if valid_area else 0.} for category in CLASSES]
                rows.append({"issued_at": issued.isoformat(), "valid_at": valid.isoformat() if valid else None,
                    "lead_hours": None if nasa else lead,
                    **({'valid_date':daily.isoformat(),'lead_days':lead,'validity_basis':'daily local-noon field; no single global UTC validity instant'} if nasa else {}),
                    "member": str(member), "value": total,
                    "sample_count": int((weights > 0).sum()), "valid_samples": int(mask.sum()),
                    "null_reason": None if valid_area else "all_cells_missing",
                    "coverage_fraction": coverage,
                    "danger_class": classify(total) if total is not None else None,
                    "maximum": float(values[mask].max()) if valid_area else None,
                    "distribution": distribution,
                    "percentile": None, "anomaly": None})
    return {"status": "available" if any(r["value"] is not None for r in rows) else "unavailable",
        "reason": None if any(r["value"] is not None for r in rows) else "no_current_valid_numeric_values",
        "index": "FWI", "units": "dimensionless", "source_id": source_id,
        "source": SOURCES[source_id], "product_kind": "experimental_deterministic" if nasa else "delayed_seasonal",
        "resolution_degrees": {"latitude": dy, "longitude": dx},
        "provenance": {**metadata, "sha256": digest}, "forecasts": rows,
        "aggregation": "WGS84 ellipsoidal intersection-area weighted grid mean; edges densified to 0.1 degree",
        "classification": {"source": "https://gwis.jrc.ec.europa.eu/about-gwis/technical-background/fire-danger-forecast",
            "classes": list(CLASSES), "thresholds": list(THRESHOLDS), "very_extreme": ">70"},
        "limitations": ["NASA GFWED/GEOS-5 experimental deterministic forecast; initialization and validity dates decoded from its documented source product keys; publication instant unavailable." if nasa else "Delayed seasonal ensemble, not the operational GWIS deterministic forecast.",
            "Class fractions use the entire selected polygon as denominator; missing area is not low danger.",
            "Class fractions sum to bounded area coverage; ellipsoidal subdivision roundoff above 100% is normalized without changing mean FWI or maximum.",
            "Members and validity times are kept separate. The maximum is a grid-cell value, not a local measurement.",
            "Percentile and anomaly are unavailable: this adapter does not derive a provider climatology.",
            "FWI describes weather-driven fire danger, not ignition probability, fire counts or complete property risk."]}
