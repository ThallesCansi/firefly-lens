"""Normalized provider-index adapter; no FWI approximation or unverified live API."""
from datetime import datetime
import math
from collections import defaultdict

SOURCES = {
    "copernicus_ewds_cems_fire_seasonal": {
        "url": "https://ewds.climate.copernicus.eu/datasets/cems-fire-seasonal?tab=overview",
        "doi": "10.24381/cds.b9c753f1", "licence": "CC-BY (see dataset terms)",
        "native_formats": ["GRIB", "NetCDF"], "access": "registered EWDS account/API credentials and dataset terms; not configured here",
    },
    "synthetic_fixture": {"url": None, "licence": "synthetic test data", "native_formats": ["normalized JSON"]},
}


def utc(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.utcoffset() is None or result.utcoffset().total_seconds() != 0:
        raise ValueError("Weather timestamps must carry UTC timezone")
    return result


def unavailable(reason="no_authenticated_numeric_provider_configured"):
    return {"status": "unavailable", "reason": reason, "index": "FWI", "units": "dimensionless",
            "forecasts": [], "verified_sources": SOURCES,
            "limitations": ["FWI describes meteorological fire danger, not predicted hotspot counts.",
                            "No live data, issuance times or horizons are fabricated; this module does not compute FWI."]}


def query_fire_weather(region_id, geometry=None):
    return {**unavailable(), "region_id": region_id}


def from_records(records, geometry, *, source_id, synthetic=False, provenance=None):
    """Point-sample mean, grouped by original issuance, validity, lead and member.

    Not an area-weighted raster average. Upstream GRIB/NetCDF decoding and valid
    grid cell footprints require a separate provider adapter, not implemented.
    """
    from shapely.geometry import shape, Point
    if source_id not in SOURCES:
        raise ValueError("Unverified source identifier")
    if source_id == "synthetic_fixture" and not synthetic:
        raise ValueError("Synthetic fixtures must be explicitly marked")
    if not synthetic and not provenance:
        raise ValueError("Real normalized imports require provenance")
    geom = shape(geometry.get("geometry", geometry))
    if not geom.is_valid or geom.is_empty or geom.geom_type not in ("Polygon", "MultiPolygon"):
        raise ValueError("Valid polygon required")
    west,south,east,north=geom.bounds
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError("Expected EPSG:4326 polygon")
    groups, seen = defaultdict(list), set()
    for row in records:
        issue, valid = utc(row["issued_at"]), utc(row["valid_at"])
        lead = row["lead_hours"]
        if isinstance(lead, bool) or not isinstance(lead, (int, float)) or not math.isfinite(lead) or lead < 0 or abs((valid - issue).total_seconds() / 3600 - lead) > 1e-9:
            raise ValueError("Lead must match valid_at minus issued_at in hours")
        lat, lon, value = row["latitude"], row["longitude"], row["fwi"]
        if not all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in (lat, lon)) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError("Invalid weather coordinates")
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0):
            raise ValueError("FWI must be nonnegative, finite or null")
        member = str(row.get("member", "deterministic"))
        key = (issue.isoformat(), valid.isoformat(), lead, member)
        identity = (*key, lat, lon)
        if identity in seen:
            raise ValueError("Duplicate weather sample")
        seen.add(identity)
        if geom.covers(Point(lon, lat)):
            groups[key].append(value)
    output = []
    for (issue, valid, lead, member), values in sorted(groups.items()):
        present = [x for x in values if x is not None]
        output.append({"issued_at": issue, "valid_at": valid, "lead_hours": lead, "member": member,
                       "value": sum(present) / len(present) if present else None,
                       "sample_count": len(values), "valid_samples": len(present),
                       "null_reason": None if present else "all_samples_missing"})
    return {"status": "synthetic" if synthetic else ("available" if output else "unavailable"),
            "reason": None if output else "no_samples_in_region", "index": "FWI", "units": "dimensionless",
            "aggregation": "arithmetic mean of supplied point samples within polygon; no raster area weighting",
            "source_id": source_id, "source": SOURCES[source_id], "provenance": provenance or {},
            "forecasts": output, "limitations": ["Original leads, issuance timestamps and ensemble members are preserved.",
                "This normalized import is not a live EWDS integration or an independent validation of provider FWI values.",
                "FWI danger and statistical hotspot-activity forecasts are separate indicators."]}
