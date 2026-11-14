"""Etapa 4 — Grade de 0,25° e agregação mensal.

Saídas:
  data/interim/grid_cells.parquet   uma linha por célula (cell_id, centro, bioma majoritário)
  data/interim/grid_counts.parquet  célula × ano × mês × daynight, incluindo zeros

Uso: uv run python -I pipeline/04_grid.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import duckdb
import numpy as np
import pandas as pd

from common import load_config, path_of
from geo import assign_biome, load_geo

SAMPLES = 10          # 10 × 10 pontos de amostra por célula para o bioma majoritário
ID_BASE = 1000        # cell_id = iy * ID_BASE + ix


def build_cells(cfg: dict, con) -> pd.DataFrame:
    """Células que tocam o Brasil, com o bioma majoritário por amostragem regular."""
    cell = cfg["grid"]["cell_deg"]
    x0, y0 = cfg["grid"]["origin"]
    country, biomes = load_geo(cfg)
    bx0, by0, bx1, by1 = country.bounds
    ixs = np.arange(int(np.floor((bx0 - x0) / cell)), int(np.floor((bx1 - x0) / cell)) + 1)
    iys = np.arange(int(np.floor((by0 - y0) / cell)), int(np.floor((by1 - y0) / cell)) + 1)
    off = (np.arange(SAMPLES) + 0.5) / SAMPLES * cell
    IX, IY, OX, OY = np.meshgrid(ixs, iys, off, off, indexing="ij")
    lon, lat = (x0 + IX * cell + OX).ravel(), (y0 + IY * cell + OY).ravel()
    inside, bioma, _ = assign_biome(lon, lat, country, biomes)
    s = pd.DataFrame({"ix": IX.ravel()[inside], "iy": IY.ravel()[inside], "bioma": bioma[inside]})
    votes = s.groupby(["ix", "iy", "bioma"]).size().rename("n").reset_index()
    votes = votes.sort_values(["ix", "iy", "n", "bioma"], ascending=[True, True, False, True])
    cells = votes.drop_duplicates(["ix", "iy"])[["ix", "iy", "bioma"]]
    # Células com focos mas sem nenhum ponto de amostra dentro do Brasil (lascas de fronteira/costa):
    # entram na grade com o bioma mais frequente entre os seus focos.
    x0s, y0s, sub = x0, y0, cfg["grid"]["subcell_deg"]
    ratio = round(cell / sub)
    pts = con.execute(f"""
        SELECT floor((lon - {x0s}) / {sub})::INT // {ratio} AS ix,
               floor((lat - {y0s}) / {sub})::INT // {ratio} AS iy, mode(bioma) AS bioma
        FROM read_parquet('{path_of(cfg, "interim")}/filtered/*.parquet')
        WHERE satellite IN ('Aqua', '{cfg["sensors"]["model_viirs"]}') GROUP BY 1, 2""").df()
    extra = pts.merge(cells[["ix", "iy"]], on=["ix", "iy"], how="left", indicator=True)
    extra = extra[extra["_merge"] == "left_only"][["ix", "iy", "bioma"]]
    print(f"células por amostragem: {len(cells):,} | células extras só com focos: {len(extra):,}")
    cells = pd.concat([cells, extra], ignore_index=True)
    cells["cell_id"] = (cells["iy"] * ID_BASE + cells["ix"]).astype("int32")
    cells["lon"] = x0 + (cells["ix"] + 0.5) * cell
    cells["lat"] = y0 + (cells["iy"] + 0.5) * cell
    return cells.sort_values("cell_id")[["cell_id", "ix", "iy", "lat", "lon", "bioma"]].reset_index(drop=True)


def main() -> None:
    cfg = load_config()
    interim = path_of(cfg, "interim")
    con = duckdb.connect()
    cells = build_cells(cfg, con)
    cells.to_parquet(interim / "grid_cells.parquet", index=False)

    x0, y0 = cfg["grid"]["origin"]
    sub = cfg["grid"]["subcell_deg"]
    ratio = round(cfg["grid"]["cell_deg"] / sub)
    viirs = cfg["sensors"]["model_viirs"]
    src = f"read_parquet('{interim}/filtered/*.parquet')"
    first_modis = con.execute(f"SELECT min(date) FROM {src} WHERE satellite = 'Aqua'").fetchone()[0]
    first_viirs = con.execute(f"SELECT min(date) FROM {src} WHERE satellite = '{viirs}'").fetchone()[0]
    last = con.execute(f"SELECT max(date) FROM {src}").fetchone()[0]
    partial = cfg["periods"]["partial_month"]
    print(f"primeiro Aqua: {first_modis} | primeiro {viirs}: {first_viirs} | último dia: {last}")
    con.register("cells_df", cells)
    con.execute(f"""
        COPY (
        WITH p AS (
            SELECT year, month, daynight, satellite, date,
                   floor((lon - {x0}) / {sub})::INT AS sx, floor((lat - {y0}) / {sub})::INT AS sy
            FROM {src} WHERE satellite IN ('Aqua', '{viirs}')
        ), agg AS (
            SELECT (sy // {ratio}) * {ID_BASE} + (sx // {ratio}) AS cell_id, year, month, daynight,
                   count(*) FILTER (satellite = 'Aqua') AS n_modis,
                   count(*) FILTER (satellite = '{viirs}') AS n_viirs_raw,
                   count(DISTINCT (date, sx, sy)) FILTER (satellite = '{viirs}') AS n_viirs_1km
            FROM p GROUP BY ALL
        ), months AS (
            SELECT year(d)::SMALLINT AS year, month(d)::TINYINT AS month
            FROM generate_series(date_trunc('month', DATE '{first_modis}'),
                                 date_trunc('month', DATE '{last}'), INTERVAL 1 MONTH) t(d)
        ), skel AS (
            SELECT c.cell_id, c.bioma, m.year, m.month, dn.daynight
            FROM cells_df c CROSS JOIN months m CROSS JOIN (VALUES ('D'), ('N')) dn(daynight)
        )
        SELECT s.cell_id, s.bioma, s.year, s.month, s.daynight,
               coalesce(a.n_modis, 0)::INTEGER AS n_modis,
               CASE WHEN make_date(s.year, s.month, 1) >= date_trunc('month', DATE '{first_viirs}')
                    THEN coalesce(a.n_viirs_raw, 0)::INTEGER END AS n_viirs_raw,
               CASE WHEN make_date(s.year, s.month, 1) >= date_trunc('month', DATE '{first_viirs}')
                    THEN coalesce(a.n_viirs_1km, 0)::INTEGER END AS n_viirs_1km,
               (strftime(make_date(s.year, s.month, 1), '%Y-%m') = '{partial}') AS is_partial
        FROM skel s LEFT JOIN agg a USING (cell_id, year, month, daynight)
        ORDER BY s.year, s.month, s.daynight, s.cell_id
        ) TO '{interim}/grid_counts.parquet' (FORMAT parquet, COMPRESSION zstd)""")
    n, sm, sv = con.execute(f"SELECT count(*), sum(n_modis), sum(n_viirs_raw) FROM '{interim}/grid_counts.parquet'").fetchone()
    pm, pv = con.execute(f"SELECT count(*) FILTER (satellite = 'Aqua'), count(*) FILTER (satellite = '{viirs}') FROM {src}").fetchone()
    print(f"grid_counts: {n:,} linhas | n_modis {sm:,} (pontos Aqua {pm:,}) | n_viirs_raw {sv:,} (pontos {viirs} {pv:,})")
    if (sm, sv) != (pm, pv):
        raise RuntimeError("a soma da grade não bate com o número de pontos")


if __name__ == "__main__":
    main()
