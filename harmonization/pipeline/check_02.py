"""Verificação da Etapa 2: funil, biomas, esquema e efeito do filtro `type`.

Uso: uv run python -I pipeline/check_02.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import duckdb
import pandas as pd

from common import load_config, path_of

pd.set_option("display.width", 250, "display.max_rows", 200, "display.max_columns", 30)
fmt = "{:,}".format


def main() -> None:
    cfg = load_config()
    interim, raw = path_of(cfg, "interim"), path_of(cfg, "raw")
    con = duckdb.connect()
    src = f"read_parquet('{interim}/filtered/*.parquet')"

    print("=== Funil por arquivo ===")
    fun = pd.read_csv(interim / "funnel_stage2.csv")
    num = [c for c in fun.columns if c not in ("arquivo", "sensor", "ano")]
    print(fun.drop(columns=["sensor", "ano"]).to_string(index=False, formatters={c: fmt for c in num}))
    tot = fun.assign(grupo=fun["arquivo"].str.replace(r"_\d{4}(_api)?$", r"\1", regex=True)).groupby("grupo")[num].sum()
    print("\n=== Funil por conjunto ===")
    print(tot.to_string(formatters={c: fmt for c in num}))

    print("\n=== Esquema padronizado ===")
    d = con.execute(f"DESCRIBE SELECT * FROM {src}").df()
    print(", ".join(f"{r.column_name}:{r.column_type}" for r in d.itertuples()))
    for col in ["sensor", "satellite", "confidence_class", "daynight", "processing"]:
        v = con.execute(f"SELECT {col} v, count(*) n FROM {src} GROUP BY 1 ORDER BY 2 DESC").df()
        print(f"  {col}: " + ", ".join(f"{r.v}={r.n:,}" for r in v.itertuples()))
    print("  nulos:", con.execute(f"SELECT sum((bioma IS NULL)::INT) bioma, sum((frp IS NULL)::INT) frp, "
                                  f"sum((time_utc IS NULL)::INT) time_utc FROM {src}").df().to_dict("records")[0])

    print("\n=== Focos por bioma e satélite ===")
    b = con.execute(f"PIVOT (SELECT bioma, satellite FROM {src}) ON satellite USING count(*) GROUP BY bioma ORDER BY bioma").df()
    print(b.to_string(index=False, formatters={c: fmt for c in b.columns if c != "bioma"}))

    print("\n=== Hora UTC por satélite e daynight (mediana e p5–p95) ===")
    h = con.execute(f"""
        SELECT satellite, daynight, CASE WHEN year < 2022 THEN 'ate 2021' ELSE '2022+' END AS periodo, count(*) n,
               quantile_cont(time_utc[1:2]::INT + time_utc[4:5]::INT / 60.0, [0.05, 0.5, 0.95]) AS q
        FROM {src} GROUP BY ALL ORDER BY 1, 2, 3 DESC""").df()
    h["q"] = h["q"].apply(lambda q: " / ".join(f"{x:5.2f}" for x in q))
    print(h.to_string(index=False, formatters={"n": fmt}))

    print("\n=== Quanto o filtro type remove, por época (dados SP, após satélite e confiança) ===")
    f = cfg["filters"]
    t = con.execute(f"""
        WITH m AS (SELECT 'MODIS Aqua' s, acq_date d, type FROM read_parquet('{raw}/modis_*.parquet')
                   WHERE satellite = 'Aqua' AND confidence >= {f['modis']['confidence_min']} AND processing = 'SP'),
             v AS (SELECT 'VIIRS N20' s, acq_date d, type FROM read_parquet('{raw}/viirs_n20_*.parquet')
                   WHERE confidence IN ('n', 'h') AND processing = 'SP')
        SELECT s AS sensor, CASE WHEN month(d) BETWEEN 8 AND 11 THEN 'ago-nov' ELSE 'dez-jul' END AS epoca,
               count(*) AS linhas, sum((type <> 0)::INT) AS type_nao_zero,
               round(100.0 * sum((type <> 0)::INT) / count(*), 2) AS pct
        FROM (SELECT * FROM m UNION ALL SELECT * FROM v) WHERE year(d) >= 2018 GROUP BY ALL ORDER BY 1, 2""").df()
    print(t.to_string(index=False, formatters={"linhas": fmt, "type_nao_zero": fmt}))


if __name__ == "__main__":
    main()
