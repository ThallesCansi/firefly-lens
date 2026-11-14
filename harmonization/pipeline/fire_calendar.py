"""Calendário de queima para um polígono (função de referência para o backend).

    from fire_calendar import calendar_for_polygon
    cal = calendar_for_polygon(polygon_geojson, "2003-01", "2026-10")

Depende de duckdb, pandas, numpy e shapely. Lê output/grid_monthly_total.parquet e
output/harmonization_params.json.

Regras importantes:
- A contagem do polígono em cada mês é a soma das células ponderada pela fração da área
  de cada célula de 0,25° que cai dentro do polígono.
- A mediana histórica de um mês do ano é a MEDIANA DAS SOMAS DO POLÍGONO ao longo dos
  anos-base, e não a soma das medianas das células.
- Em meses modelados, o intervalo de 95% é  total ± 1,96 · sqrt(Σ w² · var + (c · total)²),
  em que c é o erro comum calibrado na validação.
"""

from __future__ import annotations

import json
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
import shapely
from shapely.geometry import shape

OUT = Path(__file__).resolve().parent.parent / "output"
CELL = 0.25


def _geometry(polygon_geojson):
    gj = json.loads(polygon_geojson) if isinstance(polygon_geojson, str) else polygon_geojson
    if gj.get("type") == "FeatureCollection":
        return shapely.union_all([shape(f["geometry"]) for f in gj["features"]])
    return shape(gj["geometry"]) if gj.get("type") == "Feature" else shape(gj)


def _ym(s) -> int:
    y, m = str(s)[:7].split("-")
    return int(y) * 12 + int(m) - 1


def calendar_for_polygon(polygon_geojson, start, end, out_dir: str | Path = OUT, base_years=(2003, 2025)) -> dict:
    """Calendário de focos (escala MODIS-Aqua-equivalente, dia + noite) para um polígono.

    start, end: 'YYYY-MM', intervalo fechado. O "mês atual" é `end`.
    Devolve um dict com: matrix (ano × mês), monthly_median, current, top_months, top_years.
    """
    out_dir = Path(out_dir)
    geom = _geometry(polygon_geojson)
    params = json.loads((out_dir / "harmonization_params.json").read_text())
    c = params["common_error_c"]
    con = duckdb.connect()
    x0, y0, x1, y1 = geom.bounds
    grid = str(out_dir / "grid_monthly_total.parquet")
    cells = con.execute(
        "SELECT DISTINCT cell_id, lat, lon FROM read_parquet(?) WHERE lon BETWEEN ? AND ? AND lat BETWEEN ? AND ?",
        [grid, x0 - CELL / 2, x1 + CELL / 2, y0 - CELL / 2, y1 + CELL / 2]).df()
    if cells.empty:
        raise ValueError("o polígono não toca nenhuma célula da grade")
    # Fração da área de cada célula dentro do polígono. O contorno é simplificado a 0,005°
    # (1/50 da célula) para o cálculo ser rápido; células inteiras dentro ou fora não pagam interseção.
    simp = geom.simplify(0.005, preserve_topology=True) if shapely.get_num_coordinates(geom) > 2000 else geom
    if not simp.is_valid:
        simp = shapely.make_valid(simp)
    shapely.prepare(simp)
    boxes = shapely.box(cells.lon.to_numpy() - CELL / 2, cells.lat.to_numpy() - CELL / 2,
                        cells.lon.to_numpy() + CELL / 2, cells.lat.to_numpy() + CELL / 2)
    inside = shapely.contains(simp, boxes)
    edge = shapely.intersects(simp, boxes) & ~inside
    w = inside.astype(float)
    w[edge] = shapely.area(shapely.intersection(boxes[edge], simp)) / (CELL * CELL)
    cells["w"] = w
    cells = cells[cells.w > 0]
    if cells.empty:
        raise ValueError("o polígono não toca nenhuma célula da grade")
    con.register("w", cells[["cell_id", "w"]])
    m = con.execute("""
        SELECT g.year, g.month, sum(w.w * g.n_harmonized) AS n,
               sum(w.w * w.w * coalesce(g.var_harmonized, 0)) AS var_cells,
               bool_or(g.source_flag = 'modeled_viirs') AS modeled, bool_or(g.is_partial) AS is_partial
        FROM read_parquet(?) g JOIN w USING (cell_id) GROUP BY 1, 2 ORDER BY 1, 2""", [grid]).df()
    sd = np.sqrt(m.var_cells + (c * m.n) ** 2)
    m["lo95"] = np.where(m.modeled, np.clip(m.n - 1.96 * sd, 0, None), np.nan)
    m["hi95"] = np.where(m.modeled, m.n + 1.96 * sd, np.nan)
    m["ym"] = m.year * 12 + m.month - 1
    sel = m[(m.ym >= _ym(start)) & (m.ym <= _ym(end))]
    if sel.empty:
        raise ValueError("período sem dados")

    # mediana histórica: mediana das somas do polígono nos anos-base, por mês do ano
    base = m[(m.year >= base_years[0]) & (m.year <= base_years[1])]
    clim = base.groupby("month").n.agg(median="median", p25=lambda s: s.quantile(0.25), p75=lambda s: s.quantile(0.75), n_years="count")

    cur = sel.iloc[-1]
    hist = base[base.month == cur.month].n.to_numpy()
    med = float(clim.loc[cur.month, "median"])
    current = {
        "year": int(cur.year), "month": int(cur.month), "n": float(cur.n),
        "lo95": None if np.isnan(cur.lo95) else float(cur.lo95), "hi95": None if np.isnan(cur.hi95) else float(cur.hi95),
        "source_flag": "modeled_viirs" if cur.modeled else "observed_modis", "is_partial": bool(cur.is_partial),
        "median": med, "anomaly_pct": None if med == 0 else float(100 * (cur.n / med - 1)),
        "percentile": float(100 * (hist < cur.n).mean() + 50 * (hist == cur.n).mean()),
        "base_years": list(base_years),
    }
    full = sel[~sel.is_partial]
    top_m = full.nlargest(5, "n")[["year", "month", "n"]]
    yr = full.groupby("year").agg(n=("n", "sum"), months=("n", "size"))
    top_y = yr[yr.months == 12].nlargest(5, "n")
    return {
        "matrix": {int(y): {int(r.month): float(r.n) for r in g.itertuples()} for y, g in sel.groupby("year")},
        "matrix_flags": {int(y): {int(r.month): ("partial" if r.is_partial else "modeled" if r.modeled else "observed")
                                  for r in g.itertuples()} for y, g in sel.groupby("year")},
        "monthly_median": {int(k): {"median": float(v["median"]), "p25": float(v["p25"]), "p75": float(v["p75"]),
                                    "n_years": int(v["n_years"])} for k, v in clim.iterrows()},
        "current": current,
        "top_months": [{"year": int(r.year), "month": int(r.month), "n": float(r.n)} for r in top_m.itertuples()],
        "top_years": [{"year": int(y), "n": float(r.n)} for y, r in top_y.iterrows()],
        "n_cells": int(len(cells)), "unit": "focos MODIS-Aqua-equivalentes (dia + noite)",
    }
