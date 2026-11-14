"""Verificação da Etapa 3: tamanho em disco, tempo de consulta e amostra do CSV.

Uso: uv run python -I pipeline/check_03.py
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
from export_points import export_points


def state_geojson(cfg: dict, uf: str) -> dict:
    cache = path_of(cfg, "geo") / f"state_{uf}_2020.parquet"
    if cache.exists():
        g = gpd.read_parquet(cache)
    else:
        import geobr
        g = geobr.read_state(code_state=uf, year=2020, simplified=False)
        g.to_parquet(cache)
    return json.loads(g.to_json())


def main() -> None:
    cfg = load_config()
    pts = path_of(cfg, "points")
    files = sorted(pts.rglob("*.parquet"))
    print(f"partições: {len(files)} | tamanho total: {sum(f.stat().st_size for f in files) / 1e6:.1f} MB")
    con = duckdb.connect()
    n_pts = con.execute(f"SELECT count(*) FROM read_parquet('{pts}/*/*.parquet')").fetchone()[0]
    n_src = con.execute(f"SELECT count(*) FROM read_parquet('{path_of(cfg, 'interim')}/filtered/*.parquet')").fetchone()[0]
    print(f"linhas: {n_pts:,} (filtrado da Etapa 2: {n_src:,}; iguais: {n_pts == n_src})")

    for uf, d0, d1, sensors in [("MT", "2024-01-01", "2024-12-31", None),
                                ("MT", "2024-01-01", "2024-12-31", ["Aqua"]),
                                ("PA", "2019-01-01", "2026-11-14", ["MODIS"]),
                                ("SP", "2026-08-01", "2026-08-31", ["N20", "N21"])]:
        gj = state_geojson(cfg, uf)
        t0 = time.time()
        csv = export_points(gj, d0, d1, sensors)
        dt_s = time.time() - t0
        print(f"{uf} {d0}..{d1} sensores={sensors}: {csv.count(chr(10)) - 1:,} linhas, "
              f"{len(csv) / 1e6:.1f} MB de CSV, {dt_s:.2f}s")
        if uf == "MT" and sensors is None:
            ref = con.execute(f"SELECT count(*) FROM read_parquet('{pts}/year=2024/part.parquet')").fetchone()[0]
            print(f"   (partição de 2024 inteira: {ref:,} linhas)")
            print("\namostra de 10 linhas (MT, 2024):")
            lines = csv.splitlines()
            step = max(1, (len(lines) - 1) // 10)
            print(lines[0])
            for ln in lines[1::step][:10]:
                print(ln)
            print()


if __name__ == "__main__":
    main()
