"""Etapa 2 — Filtros e padronização.

Para cada arquivo de data/raw aplica, nesta ordem:
  1. satélite: MODIS só Aqua (VIIRS não tem filtro de satélite);
  2. confiança: MODIS >= confidence_min; VIIRS nominal ou high;
  3. type: mantém type == 0; linhas NRT (type nulo) passam;
  4. duplicatas exatas (lat, lon, data, hora, satélite);
  5. polígono do Brasil e bioma do IBGE.
Grava data/interim/filtered/{arquivo}.parquet no esquema padronizado e o funil
em data/interim/funnel_stage2.csv.

Uso: uv run python -I pipeline/02_filter.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import time

import duckdb
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from common import load_config, path_of
from geo import assign_biome, load_geo


def main() -> None:
    cfg = load_config()
    raw, out_dir = path_of(cfg, "raw"), path_of(cfg, "interim") / "filtered"
    out_dir.mkdir(parents=True, exist_ok=True)
    f = cfg["filters"]
    cc = cfg["confidence_class"]
    viirs_keep = [k for k, v in cc["viirs_codes"].items() if v in f["viirs"]["confidence_keep"]]
    viirs_keep_sql = ", ".join(f"'{k}'" for k in viirs_keep)
    viirs_case = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in cc["viirs_codes"].items())
    type_keep = ", ".join(str(t) for t in f["type_keep"])
    keys = ", ".join(f["dedup_keys"])
    country, biomes = load_geo(cfg)
    con = duckdb.connect()
    funnel = []
    for path in sorted(raw.glob("*.parquet")):
        t0 = time.time()
        is_modis = path.name.startswith("modis")
        if is_modis:
            sat = f"satellite = '{f['modis']['satellite']}'"
            conf = f"confidence >= {f['modis']['confidence_min']}"
            conf50 = f"confidence >= {f['modis']['confidence_min_sensitivity']}"
            cclass = (f"CASE WHEN confidence < {cc['modis_low_below']} THEN 'low' "
                      f"WHEN confidence >= {cc['modis_high_from']} THEN 'high' ELSE 'nominal' END")
        else:
            sat, conf, conf50 = "TRUE", f"confidence IN ({viirs_keep_sql})", "NULL"
            cclass = f"CASE confidence {viirs_case} END"
        typ = f"(type IS NULL OR type IN ({type_keep}))"
        counts = con.execute(f"""
            SELECT count(*), sum(({sat})::INT), sum(({sat} AND {conf})::INT),
                   sum(({sat} AND {conf} AND {typ})::INT),
                   sum(({sat} AND {conf50} AND {typ})::INT)
            FROM '{path}'""").fetchone()
        tbl = con.sql(f"""
            SELECT acq_date AS date,
                   acq_time[1:2] || ':' || acq_time[3:4] AS time_utc,
                   latitude AS lat, longitude AS lon,
                   instrument AS sensor, satellite,
                   confidence::VARCHAR AS confidence_raw,
                   {cclass} AS confidence_class,
                   daynight, frp, processing,
                   year(acq_date)::SMALLINT AS year, month(acq_date)::TINYINT AS month
            FROM '{path}'
            WHERE {sat} AND {conf} AND {typ}
            QUALIFY row_number() OVER (PARTITION BY {keys} ORDER BY frp DESC) = 1
            ORDER BY acq_date, acq_time, latitude, longitude""").to_arrow_table()
        n_dedup = tbl.num_rows
        inside, bioma, orphan = assign_biome(tbl["lon"].to_numpy(), tbl["lat"].to_numpy(), country, biomes)
        tbl = tbl.append_column("bioma", pa.array(bioma, type=pa.string())).filter(pa.array(inside))
        cols = ["date", "time_utc", "lat", "lon", "sensor", "satellite", "confidence_raw",
                "confidence_class", "daynight", "frp", "bioma", "processing", "year", "month"]
        pq.write_table(tbl.select(cols), out_dir / path.name, compression="zstd")
        yr = int(path.stem.split("_")[-2] if path.stem.endswith("_api") else path.stem.split("_")[-1])
        funnel.append({
            "arquivo": path.stem, "sensor": "MODIS" if is_modis else "VIIRS", "ano": yr,
            "bruto": counts[0], "apos_satelite": counts[1], "apos_confianca": counts[2],
            "apos_type": counts[3], "apos_duplicatas": n_dedup, "final_no_brasil": tbl.num_rows,
            "fora_do_brasil": int((~inside).sum()), "orfaos_bioma_mais_proximo": int((orphan).sum()),
            "sensibilidade_conf50_apos_type": counts[4],
        })
        print(f"{path.stem}: {counts[0]:,} -> {tbl.num_rows:,} | {time.time() - t0:.0f}s", flush=True)
    df = pd.DataFrame(funnel)
    df.to_csv(path_of(cfg, "interim") / "funnel_stage2.csv", index=False)
    print(f"\nfunil salvo; total final: {df['final_no_brasil'].sum():,} linhas")


if __name__ == "__main__":
    main()
