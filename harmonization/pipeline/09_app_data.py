"""Etapa 9 — Arquivos estáticos para o aplicativo FireFly Lens.

Gera, em public/data/brazil/ do repositório:
  meta.json            parâmetros da série, lista de blocos, biomas, regiões prontas
  brazil.geojson       contorno simplificado do Brasil (para o mapa)
  t_{tx}_{ty}.bin.gz   um bloco de 4° × 4° (16 × 16 células de 0,25°) com:
                         - contagens diárias por célula (Aqua dia/noite, NOAA-20 dia/noite, NOAA-20 degradado a 1 km)
                         - média harmonizada mensal por célula (Nível 2, abr/2018 em diante)
                         - variância harmonizada mensal por célula (meses modelados)

Formato binário (little-endian), descrito também em src/lib/data/tiles.ts:
  header   uint32[8]: magic 'FFLB' (0x424C4646), versão, tx, ty, nDaily, nMonthly, nVar, 0
  bioma    uint8[256]: código do bioma de cada célula local (iy % 16) * 16 + (ix % 16); 255 = fora da grade
  diário   uint16[n] dia (dias desde 2002-01-01), uint16[n] aqua_d, aqua_n, n20_d, n20_n, n20_1km, uint8[n] célula, pad até 4
  mensal   float32[m] mu, uint16[m] mês (meses desde 2002-01), uint8[m] célula, pad
  variância float32[v] var, uint16[v] mês, uint8[v] célula, pad

Uso (a partir da raiz do repositório):
  python -I harmonization/pipeline/09_app_data.py --data-root <pasta com data/ e output/ do pipeline>
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import argparse
import datetime as dt
import gzip
import json
import shutil

import duckdb
import geopandas as gpd
import numpy as np

from common import ROOT, load_config

MAGIC = 0x424C4646          # 'FFLB'
VERSION = 1
TILE = 16                   # células por lado do bloco
EPOCH_DAY = dt.date(2002, 1, 1)
EPOCH_YEAR = 2002
BIOMES = ["Amazônia", "Caatinga", "Cerrado", "Mata Atlântica", "Pampa", "Pantanal"]
PRESETS = [
    {"id": "amazon", "name": "Southern Amazon", "place": "Brazil, arc of deforestation (Pará, Mato Grosso, Rondônia)", "bbox": [-62, -13, -50, -5]},
    {"id": "matopiba", "name": "Matopiba", "place": "Brazil, Cerrado frontier (Maranhão, Tocantins, Piauí, Bahia)", "bbox": [-50, -14, -42, -6]},
    {"id": "pantanal", "name": "Pantanal", "place": "Brazil, wetlands of Mato Grosso and Mato Grosso do Sul", "bbox": [-58.5, -22, -54.5, -16]},
    {"id": "caatinga", "name": "Sertão", "place": "Brazil, Caatinga of the northeast", "bbox": [-42, -11, -36, -5]},
    {"id": "pampa", "name": "Pampa", "place": "Brazil, grasslands of Rio Grande do Sul", "bbox": [-57.5, -33.5, -50, -28]},
]


def pad4(buf: bytearray) -> None:
    buf.extend(b"\0" * (-len(buf) % 4))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", type=Path, default=ROOT, help="pasta que contém data/ e output/ do pipeline")
    ap.add_argument("--out", type=Path, default=ROOT.parent / "public" / "data" / "brazil")
    args = ap.parse_args()
    cfg = load_config()
    root, out = args.data_root.resolve(), args.out.resolve()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    x0, y0 = cfg["grid"]["origin"]
    sub = cfg["grid"]["subcell_deg"]
    ratio = round(cfg["grid"]["cell_deg"] / sub)
    viirs = cfg["sensors"]["model_viirs"]
    con = duckdb.connect()

    cells = con.execute(f"SELECT cell_id, bioma FROM '{root}/data/interim/grid_cells.parquet'").df()
    cells["ix"], cells["iy"] = cells.cell_id % 1000, cells.cell_id // 1000
    cells["code"] = cells.bioma.map({b: i for i, b in enumerate(BIOMES)}).astype(np.uint8)

    print("agregando contagens diárias por célula…", flush=True)
    daily = con.execute(f"""
        WITH p AS (
            SELECT date, satellite, daynight,
                   floor((lon - {x0}) / {sub})::INT AS sx, floor((lat - {y0}) / {sub})::INT AS sy
            FROM read_parquet('{root}/data/interim/filtered/*.parquet') WHERE satellite IN ('Aqua', '{viirs}')
        )
        SELECT (sy // {ratio}) * 1000 + (sx // {ratio}) AS cell_id, (date - DATE '{EPOCH_DAY}')::INT AS day,
               count(*) FILTER (satellite = 'Aqua' AND daynight = 'D') AS aqua_d,
               count(*) FILTER (satellite = 'Aqua' AND daynight = 'N') AS aqua_n,
               count(*) FILTER (satellite = '{viirs}' AND daynight = 'D') AS n20_d,
               count(*) FILTER (satellite = '{viirs}' AND daynight = 'N') AS n20_n,
               count(DISTINCT (sx, sy, daynight)) FILTER (satellite = '{viirs}') AS n20_1km
        FROM p GROUP BY 1, 2 ORDER BY 1, 2""").df()
    print("lendo a série harmonizada mensal…", flush=True)
    monthly = con.execute(f"""
        SELECT cell_id, (year - {EPOCH_YEAR}) * 12 + month - 1 AS month, n_viirs_harmonized AS mu, var_harmonized AS var
        FROM '{root}/output/grid_monthly_total.parquet' WHERE n_viirs_harmonized IS NOT NULL ORDER BY 1, 2""").df()
    for c in ["aqua_d", "aqua_n", "n20_d", "n20_n", "n20_1km"]:
        assert daily[c].max() < 65536, f"{c} excede uint16"
    known = set(cells.cell_id)
    assert set(daily.cell_id) <= known, "há focos fora das células da grade"

    tiles, total_bytes = [], 0
    cells["tx"], cells["ty"] = cells.ix // TILE, cells.iy // TILE
    for (tx, ty), tc in cells.groupby(["tx", "ty"]):
        ids = set(tc.cell_id)
        local = lambda s: ((s // 1000) % TILE) * TILE + (s % 1000) % TILE
        biomes = np.full(TILE * TILE, 255, dtype=np.uint8)
        biomes[local(tc.cell_id.to_numpy())] = tc.code.to_numpy()
        d = daily[daily.cell_id.isin(ids)].sort_values(["day", "cell_id"])
        m = monthly[monthly.cell_id.isin(ids)].sort_values(["month", "cell_id"])
        v = m[m["var"].notna()]
        buf = bytearray()
        buf += np.array([MAGIC, VERSION, tx, ty, len(d), len(m), len(v), 0], dtype="<u4").tobytes()
        buf += biomes.tobytes()
        for c in ["day", "aqua_d", "aqua_n", "n20_d", "n20_n", "n20_1km"]:
            buf += d[c].to_numpy().astype("<u2").tobytes()
        buf += local(d.cell_id.to_numpy()).astype(np.uint8).tobytes(); pad4(buf)
        buf += m.mu.to_numpy().astype("<f4").tobytes()
        buf += m.month.to_numpy().astype("<u2").tobytes()
        buf += local(m.cell_id.to_numpy()).astype(np.uint8).tobytes(); pad4(buf)
        buf += v["var"].to_numpy().astype("<f4").tobytes()
        buf += v.month.to_numpy().astype("<u2").tobytes()
        buf += local(v.cell_id.to_numpy()).astype(np.uint8).tobytes(); pad4(buf)
        gz = gzip.compress(bytes(buf), compresslevel=9, mtime=0)
        (out / f"t_{tx}_{ty}.bin.gz").write_bytes(gz)
        tiles.append([int(tx), int(ty)])
        total_bytes += len(gz)

    params = json.loads((root / "output" / "harmonization_params.json").read_text())
    last_day = EPOCH_DAY + dt.timedelta(days=int(daily.day.max()))
    first_aqua = con.execute(f"SELECT min(date) FROM read_parquet('{root}/data/interim/filtered/*.parquet') WHERE satellite = 'Aqua'").fetchone()[0]
    first_viirs = con.execute(f"SELECT min(date) FROM read_parquet('{root}/data/interim/filtered/*.parquet') WHERE satellite = '{viirs}'").fetchone()[0]
    meta = {
        "version": VERSION, "origin": [x0, y0], "cellDeg": cfg["grid"]["cell_deg"], "tileCells": TILE,
        "epochDay": str(EPOCH_DAY), "epochYear": EPOCH_YEAR,
        "firstDay": str(first_aqua), "lastDay": str(last_day), "viirsStart": str(first_viirs),
        "observedUntil": params["observed_until"], "seriesEnd": params["series_end"], "partialMonth": params["partial_month"],
        "climatologyBase": params["climatology_base"], "commonErrorC": params["common_error_c"],
        "biomes": BIOMES, "presets": PRESETS, "tiles": tiles,
        "bounds": [round(float(x0 + cells.ix.min() * 0.25), 2), round(float(y0 + cells.iy.min() * 0.25), 2),
                   round(float(x0 + (cells.ix.max() + 1) * 0.25), 2), round(float(y0 + (cells.iy.max() + 1) * 0.25), 2)],
        "sources": "NASA FIRMS: MODIS C6.1 Aqua (SP to Aug 2026, NRT after), VIIRS NOAA-20 375 m (SP to Jul 2026, NRT after)",
    }
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))

    br = gpd.read_parquet(root / "data" / "geo" / "brazil_country_2020.parquet").to_crs(4326)
    br["geometry"] = br.geometry.simplify(0.02, preserve_topology=True)
    (out / "brazil.geojson").write_text(br[["geometry"]].to_json(drop_id=True))

    print(f"{len(tiles)} blocos, {total_bytes / 1e6:.1f} MB comprimidos | linhas diárias {len(daily):,} | "
          f"mensais {len(monthly):,} | variância {int(monthly['var'].notna().sum()):,}")
    print(f"período diário: {first_aqua} a {last_day} | VIIRS desde {first_viirs}")
    print(f"brazil.geojson: {(out / 'brazil.geojson').stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
