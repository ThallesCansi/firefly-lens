"""Verificação da Etapa 4: dimensões, zeros, totais mensais e correlações.

Uso: uv run python -I pipeline/check_04.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import duckdb
import pandas as pd

from common import load_config, path_of

pd.set_option("display.width", 250, "display.max_rows", 300, "display.max_columns", 30)
fmt = "{:,.0f}".format


def main() -> None:
    cfg = load_config()
    interim = path_of(cfg, "interim")
    con = duckdb.connect()
    g = f"'{interim}/grid_counts.parquet'"
    c0, c1 = cfg["periods"]["calibration"]
    cal = f"year BETWEEN {c0} AND {c1} AND n_viirs_1km IS NOT NULL"

    print("=== Dimensões ===")
    print(con.execute(f"DESCRIBE SELECT * FROM {g}").df()[["column_name", "column_type"]].to_string(index=False))
    print(con.execute(f"""SELECT count(*) linhas, count(DISTINCT cell_id) celulas,
        count(DISTINCT (year, month)) meses, min(make_date(year, month, 1)) inicio, max(make_date(year, month, 1)) fim,
        sum(is_partial::INT) linhas_parciais, sum((n_viirs_1km IS NULL)::INT) linhas_sem_viirs FROM {g}""").df().to_string(index=False))
    print("\ncélulas por bioma:")
    print(con.execute(f"SELECT bioma, count(*) celulas FROM '{interim}/grid_cells.parquet' GROUP BY 1 ORDER BY 2 DESC").df().to_string(index=False))

    print(f"\n=== Proporção de zeros (calibração {c0}–{c1}, onde há VIIRS) ===")
    z = con.execute(f"""SELECT daynight, count(*) linhas,
        round(100 * avg((n_modis = 0)::INT), 2) pct_zero_modis,
        round(100 * avg((n_viirs_raw = 0)::INT), 2) pct_zero_viirs,
        round(100 * avg((n_modis = 0 AND n_viirs_raw = 0)::INT), 2) pct_ambos_zero,
        round(100 * avg((n_modis > 0 AND n_viirs_raw = 0)::INT), 3) pct_modis_sem_viirs,
        round(100 * avg((n_modis = 0 AND n_viirs_raw > 0)::INT), 2) pct_viirs_sem_modis,
        sum(n_modis) FILTER (n_viirs_raw = 0) focos_modis_sem_viirs, sum(n_modis) focos_modis
        FROM {g} WHERE {cal} GROUP BY ROLLUP (daynight) ORDER BY 1""").df()
    print(z.to_string(index=False))
    print("série completa, só MODIS:", con.execute(f"SELECT round(100 * avg((n_modis = 0)::INT), 2) FROM {g}").fetchone()[0], "% de zeros")

    print(f"\n=== Totais Brasil × mês, {c0}–{c1} (dia + noite) ===")
    m = con.execute(f"""SELECT year ano, month mes, sum(n_modis) n_modis, sum(n_viirs_raw) n_viirs_raw,
        sum(n_viirs_1km) n_viirs_1km FROM {g} WHERE {cal} GROUP BY 1, 2 ORDER BY 1, 2""").df()
    m["raw/modis"] = (m.n_viirs_raw / m.n_modis).round(2)
    m["1km/modis"] = (m.n_viirs_1km / m.n_modis).round(2)
    m.to_csv(interim / "check04_brazil_monthly.csv", index=False)
    print(m.to_string(index=False, formatters={c: fmt for c in ["n_modis", "n_viirs_raw", "n_viirs_1km"]}))
    y = m.groupby("ano")[["n_modis", "n_viirs_raw", "n_viirs_1km"]].sum()
    y["raw/modis"] = (y.n_viirs_raw / y.n_modis).round(2)
    y["1km/modis"] = (y.n_viirs_1km / y.n_modis).round(2)
    print("\npor ano (2018 a partir de abril):")
    print(y.to_string(formatters={c: fmt for c in ["n_modis", "n_viirs_raw", "n_viirs_1km"]}))

    print("\n=== Razões por bioma e daynight (calibração) ===")
    b = con.execute(f"""SELECT bioma, daynight, sum(n_modis) n_modis, sum(n_viirs_raw) n_viirs_raw, sum(n_viirs_1km) n_viirs_1km,
        round(sum(n_viirs_raw) / sum(n_modis), 2) "raw/modis", round(sum(n_viirs_1km) / sum(n_modis), 2) "1km/modis",
        round(sum(n_viirs_raw) / sum(n_viirs_1km), 2) "raw/1km"
        FROM {g} WHERE {cal} GROUP BY 1, 2 ORDER BY 1, 2""").df()
    print(b.to_string(index=False, formatters={c: fmt for c in ["n_modis", "n_viirs_raw", "n_viirs_1km"]}))

    print("\n=== Correlações (calibração) ===")
    rows = []
    for label, q in [
        ("célula × mês × daynight", f"SELECT n_modis a, n_viirs_raw b, n_viirs_1km c FROM {g} WHERE {cal}"),
        ("idem, só com algum foco", f"SELECT n_modis a, n_viirs_raw b, n_viirs_1km c FROM {g} WHERE {cal} AND (n_modis > 0 OR n_viirs_raw > 0)"),
        ("bioma × mês × daynight", f"SELECT sum(n_modis) a, sum(n_viirs_raw) b, sum(n_viirs_1km) c FROM {g} WHERE {cal} GROUP BY bioma, year, month, daynight"),
        ("Brasil × mês", f"SELECT sum(n_modis) a, sum(n_viirs_raw) b, sum(n_viirs_1km) c FROM {g} WHERE {cal} GROUP BY year, month"),
    ]:
        d = con.execute(q).df()
        rows.append({"escala": label, "n": len(d),
                     "pearson modis~raw": d.a.corr(d.b), "pearson modis~1km": d.a.corr(d.c), "pearson raw~1km": d.b.corr(d.c),
                     "spearman modis~raw": d.a.corr(d.b, method="spearman"), "spearman modis~1km": d.a.corr(d.c, method="spearman"),
                     "pearson log1p modis~1km": pd.Series(__import__("numpy").log1p(d.a)).corr(pd.Series(__import__("numpy").log1p(d.c)))})
    print(pd.DataFrame(rows).round(4).to_string(index=False))


if __name__ == "__main__":
    main()
