"""Verificação da Etapa 1: esquema real e contagens dos arquivos de data/raw.

Uso: uv run python -I pipeline/check_01.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import duckdb
import pandas as pd

from common import load_config, path_of

pd.set_option("display.width", 200, "display.max_rows", 200, "display.max_columns", 30)


def main() -> None:
    cfg = load_config()
    raw = path_of(cfg, "raw")
    con = duckdb.connect()
    groups = {
        "MODIS (arquivo anual)": "modis_[0-9][0-9][0-9][0-9].parquet",
        "VIIRS NOAA-20 (arquivo anual)": "viirs_n20_[0-9][0-9][0-9][0-9].parquet",
        "MODIS 2026 (API)": "modis_2026_api.parquet",
        "VIIRS NOAA-20 2026 (API)": "viirs_n20_2026_api.parquet",
        "VIIRS NOAA-21 2026 (API)": "viirs_n21_2026_api.parquet",
    }
    for title, pattern in groups.items():
        files = sorted(raw.glob(pattern))
        if not files:
            print(f"\n=== {title}: nenhum arquivo ===")
            continue
        src = f"read_parquet('{raw}/{pattern}', filename=true)"
        size = sum(f.stat().st_size for f in files) / 1e6
        print(f"\n=== {title}: {len(files)} arquivo(s), {size:.1f} MB ===")
        schema = con.execute(f"DESCRIBE SELECT * EXCLUDE (filename) FROM {src}").df()
        print("colunas e tipos: " + ", ".join(f"{r.column_name}:{r.column_type}" for r in schema.itertuples()))
        for col in ["satellite", "instrument", "daynight", "type", "version", "processing", "source"]:
            vals = con.execute(f"SELECT {col}::VARCHAR v, count(*) n FROM {src} GROUP BY 1 ORDER BY 2 DESC").df()
            print(f"  {col}: " + ", ".join(f"{r.v}={r.n:,}" for r in vals.itertuples()))
        if "VIIRS" in title:
            vals = con.execute(f"SELECT confidence v, count(*) n FROM {src} GROUP BY 1 ORDER BY 2 DESC").df()
            print("  confidence: " + ", ".join(f"{r.v}={r.n:,}" for r in vals.itertuples()))
        else:
            q = con.execute(f"SELECT min(confidence), max(confidence), "
                            f"sum((confidence < 30)::INT), sum((confidence >= 80)::INT) FROM {src}").fetchone()
            print(f"  confidence: min={q[0]}, max={q[1]}, <30: {q[2]:,}, >=80: {q[3]:,}")
        nulls = con.execute(
            f"SELECT sum((latitude IS NULL OR longitude IS NULL OR acq_date IS NULL)::INT), "
            f"sum((frp IS NULL)::INT), sum((type IS NULL)::INT), "
            f"sum((length(acq_time) <> 4)::INT) FROM {src}").fetchone()
        print(f"  nulos: lat/lon/data={nulls[0]}, frp={nulls[1]}, type={nulls[2]:,} | acq_time fora de HHMM: {nulls[3]}")
        by_year = con.execute(f"""
            SELECT year(acq_date) AS ano, processing, count(*) AS linhas,
                   sum((satellite IN ('Aqua','A'))::INT) AS aqua,
                   sum((satellite IN ('Terra','T'))::INT) AS terra,
                   sum((daynight = 'D')::INT) AS dia, sum((daynight = 'N')::INT) AS noite,
                   min(acq_date) AS primeira_data, max(acq_date) AS ultima_data
            FROM {src} GROUP BY 1, 2 ORDER BY 1, 2""").df()
        if "VIIRS" in title:
            by_year = by_year.drop(columns=["aqua", "terra"])
        print(by_year.to_string(index=False, formatters={c: "{:,}".format for c in ["linhas", "aqua", "terra", "dia", "noite"] if c in by_year}))


if __name__ == "__main__":
    main()
