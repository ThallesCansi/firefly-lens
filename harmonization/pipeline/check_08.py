"""Verificação da Etapa 8: calendar_for_polygon em polígonos de exemplo e lista de arquivos.

Uso: uv run python -I pipeline/check_08.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import json
import time

import duckdb
import geopandas as gpd

from common import load_config, path_of
from fire_calendar import calendar_for_polygon

MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def main() -> None:
    cfg = load_config()
    geo, out = path_of(cfg, "geo"), path_of(cfg, "output")
    end = cfg["periods"]["series_end"]
    polys = {"Mato Grosso": json.loads(gpd.read_parquet(geo / "state_MT_2020.parquet").to_json()),
             "Brasil": json.loads(gpd.read_parquet(geo / "brazil_country_2020.parquet").to_json()),
             "Quadrado de 1° no Pantanal": {"type": "Polygon", "coordinates": [[[-57.5, -18.5], [-56.5, -18.5], [-56.5, -17.5], [-57.5, -17.5], [-57.5, -18.5]]]}}
    for name, gj in polys.items():
        t0 = time.time()
        cal = calendar_for_polygon(gj, "2003-01", end)
        dt = time.time() - t0
        cur = cal["current"]
        print(f"\n=== {name}: {cal['n_cells']} células, {dt:.2f}s ===")
        print(f"mês atual {MES[cur['month'] - 1]}/{cur['year']} ({cur['source_flag']}): {cur['n']:,.0f} focos "
              f"[{cur['lo95']:,.0f} – {cur['hi95']:,.0f}] | mediana {cur['base_years'][0]}–{cur['base_years'][1]}: {cur['median']:,.0f} | "
              f"anomalia {cur['anomaly_pct']:+.1f}% | percentil {cur['percentile']:.0f}")
        print("mediana por mês:", {MES[k - 1]: round(v["median"]) for k, v in cal["monthly_median"].items()})
        print("top 5 meses:", [f"{MES[r['month'] - 1]}/{r['year']}: {r['n']:,.0f}" for r in cal["top_months"]])
        print("top 5 anos:", [f"{r['year']}: {r['n']:,.0f}" for r in cal["top_years"]])
        print("linha de 2026 da matriz:", {MES[k - 1]: round(v) for k, v in cal["matrix"][2026].items()})
    # mediana das somas × soma das medianas (Brasil, mês de setembro)
    con = duckdb.connect()
    a = con.execute(f"SELECT median(s) FROM (SELECT year, sum(n_harmonized) s FROM '{out}/grid_monthly_total.parquet' WHERE month = 9 AND year BETWEEN 2003 AND 2025 GROUP BY 1)").fetchone()[0]
    b = con.execute(f"SELECT sum(median) FROM '{out}/climatology.parquet' WHERE month = 9").fetchone()[0]
    print(f"\nBrasil, setembro: mediana das somas anuais = {a:,.0f} | soma das medianas das células = {b:,.0f} ({100 * (b / a - 1):+.0f}%)")
    print("\n=== Arquivos em output/ ===")
    for f in sorted(out.iterdir()):
        size = sum(x.stat().st_size for x in f.rglob("*") if x.is_file()) if f.is_dir() else f.stat().st_size
        print(f"{f.name + ('/' if f.is_dir() else ''):38s} {size / 1e6:8.2f} MB")


if __name__ == "__main__":
    main()
