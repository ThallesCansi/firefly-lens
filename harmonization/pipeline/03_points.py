"""Etapa 3 — Arquivo de focos para o aplicativo.

Junta os arquivos de data/interim/filtered por ano e grava
output/points/year={ano}/part.parquet (partição Hive; a coluna `year` vem do caminho).

Uso: uv run python -I pipeline/03_points.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import shutil

import duckdb

from common import load_config, path_of


def main() -> None:
    cfg = load_config()
    src = path_of(cfg, "interim") / "filtered"
    out = path_of(cfg, "points")
    con = duckdb.connect()
    years = [r[0] for r in con.execute(
        f"SELECT DISTINCT year FROM read_parquet('{src}/*.parquet') ORDER BY 1").fetchall()]
    for old in out.glob("year=*"):
        shutil.rmtree(old)
    total = 0
    for y in years:
        d = out / f"year={y}"
        d.mkdir(parents=True)
        con.execute(f"""
            COPY (SELECT * EXCLUDE (year) FROM read_parquet('{src}/*.parquet') WHERE year = {y}
                  ORDER BY date, time_utc, satellite, lat, lon)
            TO '{d / "part.parquet"}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 200000)""")
        n = con.execute(f"SELECT count(*) FROM '{d / 'part.parquet'}'").fetchone()[0]
        total += n
        print(f"year={y}: {n:,} linhas, {(d / 'part.parquet').stat().st_size / 1e6:.1f} MB", flush=True)
    size = sum(f.stat().st_size for f in out.rglob("*.parquet")) / 1e6
    print(f"total: {total:,} linhas em {len(years)} partições, {size:.1f} MB")


if __name__ == "__main__":
    main()
