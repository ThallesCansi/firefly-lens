"""Exportação de focos para o aplicativo (função de referência para o backend).

    from export_points import export_points
    csv_text = export_points(polygon_geojson, "2024-01-01", "2024-12-31", ["Aqua", "N20"])

Depende só de duckdb e shapely. Lê apenas as partições de ano necessárias em
output/points/year=YYYY/part.parquet, filtra pela caixa envolvente do polígono no
DuckDB e depois pelo polígono exato no shapely.
"""

from __future__ import annotations

import datetime as dt
import io
import json
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.csv as pacsv
import shapely
from shapely.geometry import shape

POINTS_DIR = Path(__file__).resolve().parent.parent / "output" / "points"
COLUMNS = ["date", "time_utc", "lat", "lon", "sensor", "satellite", "confidence_raw",
           "confidence_class", "daynight", "frp", "bioma", "processing", "year", "month"]
SENSOR_VALUES = {"MODIS", "VIIRS"}            # coluna sensor
SATELLITE_VALUES = {"Aqua", "N20", "N21"}     # coluna satellite


def _geometry(polygon_geojson):
    """Aceita dict ou texto GeoJSON: Geometry, Feature ou FeatureCollection (lon/lat, WGS84)."""
    gj = json.loads(polygon_geojson) if isinstance(polygon_geojson, str) else polygon_geojson
    if gj.get("type") == "FeatureCollection":
        geom = shapely.union_all([shape(f["geometry"]) for f in gj["features"]])
    elif gj.get("type") == "Feature":
        geom = shape(gj["geometry"])
    else:
        geom = shape(gj)
    if geom.is_empty or geom.geom_type not in ("Polygon", "MultiPolygon"):
        raise ValueError("polygon_geojson precisa ser um polígono ou multipolígono não vazio")
    return geom


def export_points(polygon_geojson, date_start, date_end, sensors=None,
                  out_path: str | Path | None = None, points_dir: str | Path = POINTS_DIR):
    """Devolve os focos dentro do polígono e do período como CSV.

    polygon_geojson: dict ou texto GeoJSON (Polygon/MultiPolygon, Feature ou FeatureCollection).
    date_start, date_end: 'YYYY-MM-DD' ou date, intervalo fechado, em UTC.
    sensors: lista com 'MODIS', 'VIIRS' (todos os satélites do sensor) e/ou 'Aqua', 'N20', 'N21'.
             None = todos.
    out_path: se informado, grava o CSV nesse caminho e devolve o número de linhas;
              senão devolve o CSV como texto.
    """
    geom = _geometry(polygon_geojson)
    d0, d1 = dt.date.fromisoformat(str(date_start)), dt.date.fromisoformat(str(date_end))
    if d1 < d0:
        raise ValueError("date_end anterior a date_start")
    points_dir = Path(points_dir)
    files = [str(points_dir / f"year={y}" / "part.parquet") for y in range(d0.year, d1.year + 1)
             if (points_dir / f"year={y}" / "part.parquet").exists()]
    table = pa.table({c: [] for c in COLUMNS})
    if files:
        where, params = ["date BETWEEN ? AND ?", "lon BETWEEN ? AND ?", "lat BETWEEN ? AND ?"], \
            [d0, d1, geom.bounds[0], geom.bounds[2], geom.bounds[1], geom.bounds[3]]
        if sensors:
            unknown = set(sensors) - SENSOR_VALUES - SATELLITE_VALUES
            if unknown:
                raise ValueError(f"sensores desconhecidos: {sorted(unknown)}")
            sens = [s for s in sensors if s in SENSOR_VALUES]
            sats = [s for s in sensors if s in SATELLITE_VALUES]
            where.append("(list_contains(?, sensor) OR list_contains(?, satellite))")
            params += [sens, sats]
        con = duckdb.connect()
        table = con.execute(
            f"SELECT {', '.join(COLUMNS)} FROM read_parquet(?, hive_partitioning = true) "
            f"WHERE {' AND '.join(where)} ORDER BY date, time_utc, satellite, lat, lon",
            [files] + params).to_arrow_table()
        con.close()
        if table.num_rows:
            shapely.prepare(geom)
            inside = shapely.contains_xy(geom, table["lon"].to_numpy(), table["lat"].to_numpy())
            table = table.filter(pa.array(inside))
    if out_path is not None:
        pacsv.write_csv(table, str(out_path))
        return table.num_rows
    buf = io.BytesIO()
    pacsv.write_csv(table, buf)
    return buf.getvalue().decode("utf-8")
