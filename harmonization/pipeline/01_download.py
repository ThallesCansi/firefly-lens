"""Etapa 1 — Ingestão.

1. Arquivos anuais por país (SP): lê o índice de cada ZIP remoto e baixa só o
   CSV do Brasil. Salva data/raw/modis_{ano}.parquet e viirs_n20_{ano}.parquet.
2. 2026 pela API do FIRMS: SP onde existir e NRT na cauda, em janelas de 5 dias
   sobre a caixa envolvente, recortando depois pelo polígono do Brasil (geobr).
   Salva data/raw/{modis,viirs_n20,viirs_n21}_2026_api.parquet.

O script é idempotente: o que já existe em disco não é baixado de novo.

Uso (a partir da raiz do projeto):
    uv run python -I pipeline/01_download.py            # tudo
    uv run python -I pipeline/01_download.py --only archive
    uv run python -I pipeline/01_download.py --only api
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import argparse
import datetime as dt
import shutil
import time
from concurrent.futures import ThreadPoolExecutor

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
import requests
import shapely

from common import get_map_key, load_config, path_of, redact, years
from remote_zip import open_remote_zip

# Esquema real conferido nos cabeçalhos (regra R3). A ordem é a do CSV.
SCHEMAS = {
    "modis": {
        "latitude": "DOUBLE", "longitude": "DOUBLE", "brightness": "DOUBLE",
        "scan": "DOUBLE", "track": "DOUBLE", "acq_date": "DATE", "acq_time": "VARCHAR",
        "satellite": "VARCHAR", "instrument": "VARCHAR", "confidence": "INTEGER",
        "version": "VARCHAR", "bright_t31": "DOUBLE", "frp": "DOUBLE",
        "daynight": "VARCHAR", "type": "INTEGER",
    },
    "viirs": {
        "latitude": "DOUBLE", "longitude": "DOUBLE", "bright_ti4": "DOUBLE",
        "scan": "DOUBLE", "track": "DOUBLE", "acq_date": "DATE", "acq_time": "VARCHAR",
        "satellite": "VARCHAR", "instrument": "VARCHAR", "confidence": "VARCHAR",
        "version": "VARCHAR", "bright_ti5": "DOUBLE", "frp": "DOUBLE",
        "daynight": "VARCHAR", "type": "INTEGER",
    },
}
# Arquivos: (prefixo do parquet, chave do esquema, chave da URL no config)
ARCHIVE_SETS = [("modis", "modis", "modis_url", "modis_archive"),
                ("viirs_n20", "viirs", "viirs_n20_url", "viirs_archive")]
API_SETS = [("modis", "modis"), ("viirs_n20", "viirs"), ("viirs_n21", "viirs")]


def log(msg: str) -> None:
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


def typed_select(csv_path: Path, schema_key: str, processing: str, source: str) -> str:
    """SQL que lê um CSV do FIRMS com tipos explícitos e acrescenta processing/source.

    Confere o cabeçalho contra o esquema esperado. A única diferença aceita é a
    ausência de `type` (arquivos NRT), preenchida com NULL.
    """
    schema = SCHEMAS[schema_key]
    with open(csv_path, encoding="utf-8") as f:
        header = f.readline().strip().split(",")
    expected = list(schema)
    if header == expected:
        cols, type_expr = schema, "type"
    elif header == expected[:-1]:
        cols = {k: v for k, v in schema.items() if k != "type"}
        type_expr = "NULL::INTEGER AS type"
    else:
        raise RuntimeError(f"cabeçalho inesperado em {csv_path.name}: {header}")
    col_spec = ", ".join(f"'{k}': '{v}'" for k, v in cols.items())
    select = ", ".join(
        "lpad(acq_time, 4, '0') AS acq_time" if c == "acq_time"
        else type_expr if c == "type" else c
        for c in expected
    )
    return (f"SELECT {select}, '{processing}' AS processing, '{source}' AS source "
            f"FROM read_csv('{csv_path}', header=true, columns={{{col_spec}}})")


# ----------------------------------------------------------------------------
# 1. Arquivos anuais
# ----------------------------------------------------------------------------

def fetch_archive_year(cfg: dict, prefix: str, schema_key: str, url_key: str, year: int) -> dict:
    raw_dir, tmp_dir = path_of(cfg, "raw"), path_of(cfg, "zips")
    out = raw_dir / f"{prefix}_{year}.parquet"
    if out.exists():
        return {"file": out.name, "status": "já existia"}
    url = cfg["archive"][url_key].format(year=year)
    t0 = time.time()
    zf, raw = open_remote_zip(url, buffer_mb=cfg["archive"].get("buffer_mb", 4), timeout=cfg["api"]["timeout_s"],
                              max_retries=cfg["api"]["max_retries"],
                              backoff_s=cfg["api"]["backoff_s"])
    country = cfg["archive"]["country"].lower()
    members = [n for n in zf.namelist() if n.lower().endswith(f"_{country}.csv")]
    if len(members) != 1:
        raise RuntimeError(f"esperava 1 CSV do Brasil em {url}, achei {members}")
    tmp_csv = tmp_dir / f"{prefix}_{year}.csv"
    tmp_out = out.with_suffix(".parquet.tmp")
    try:
        with zf.open(members[0]) as src, open(tmp_csv, "wb") as dst:
            shutil.copyfileobj(src, dst, length=1024 * 1024)
        con = duckdb.connect()
        con.execute(f"COPY ({typed_select(tmp_csv, schema_key, 'SP', 'archive')}) "
                    f"TO '{tmp_out}' (FORMAT parquet, COMPRESSION zstd)")
        n = con.execute(f"SELECT count(*) FROM read_parquet('{tmp_out}')").fetchone()[0]
        con.close()
        tmp_out.rename(out)
    finally:
        tmp_csv.unlink(missing_ok=True)   # regra R6: nada de CSV/ZIP sobrando
        tmp_out.unlink(missing_ok=True)
    log(f"{out.name}: {n:,} linhas | membro {members[0]} | "
        f"{raw.bytes_fetched / 1e6:.1f} MB baixados de {raw.size / 1e6:.0f} MB | {time.time() - t0:.0f}s")
    return {"file": out.name, "status": "baixado", "rows": n}


def run_archive(cfg: dict, workers: int) -> None:
    jobs = [(p, s, u, y) for p, s, u, per in ARCHIVE_SETS for y in years(cfg["periods"][per])]
    log(f"arquivos anuais: {len(jobs)} arquivos, {workers} em paralelo")
    with ThreadPoolExecutor(workers) as ex:
        results = list(ex.map(lambda j: fetch_archive_year(cfg, *j), jobs))
    done = sum(r["status"] == "baixado" for r in results)
    log(f"arquivos anuais: {done} baixados, {len(results) - done} já existiam")


# ----------------------------------------------------------------------------
# 2. API (2026)
# ----------------------------------------------------------------------------

def get_availability(cfg: dict, key: str) -> dict[str, tuple[dt.date, dt.date]]:
    r = requests.get(cfg["api"]["availability_url"].format(key=key), timeout=cfg["api"]["timeout_s"])
    r.raise_for_status()
    lines = r.text.strip().splitlines()
    if lines[0].strip() != "data_id,min_date,max_date":
        raise RuntimeError("resposta inesperada do endpoint de disponibilidade")
    out = {}
    for line in lines[1:]:
        data_id, lo, hi = line.strip().split(",")
        out[data_id] = (dt.date.fromisoformat(lo), dt.date.fromisoformat(hi))
    return out


def plan_windows(cfg: dict, avail: dict) -> list[dict]:
    """Janelas de até 5 dias por produto: SP até onde existir, NRT no restante."""
    year = cfg["periods"]["api_year"]
    start, end = dt.date(year, 1, 1), min(dt.date(year, 12, 31), dt.date.today())
    step = cfg["api"]["day_range"]
    windows = []
    for prefix, _ in API_SETS:
        prod = cfg["api"]["products"][prefix]
        sp_end = min(avail[prod["sp"]][1], end) if cfg["api"]["prefer_sp"] else start - dt.timedelta(days=1)
        nrt_start = max(sp_end + dt.timedelta(days=1), avail[prod["nrt"]][0])
        if nrt_start > sp_end + dt.timedelta(days=1):
            raise RuntimeError(f"lacuna entre SP e NRT em {prefix}: {sp_end} -> {nrt_start}")
        nrt_end = min(avail[prod["nrt"]][1], end)
        for source, processing, lo, hi in [(prod["sp"], "SP", start, sp_end),
                                           (prod["nrt"], "NRT", nrt_start, nrt_end)]:
            d = lo
            while d <= hi:
                n = min(step, (hi - d).days + 1)
                windows.append({"prefix": prefix, "source": source, "processing": processing,
                                "date": d, "days": n})
                d += dt.timedelta(days=n)
    return windows


def fetch_window(cfg: dict, key: str, w: dict, cache_dir: Path) -> Path:
    """Baixa uma janela para o cache; devolve o caminho do CSV."""
    path = cache_dir / w["source"] / f"{w['date']}_{w['days']}.csv"
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    api = cfg["api"]
    url = api["area_url"].format(key=key, source=w["source"],
                                 bbox=",".join(str(x) for x in cfg["project"]["bbox"]),
                                 day_range=w["days"], date=w["date"])
    err = "?"
    for attempt in range(api["max_retries"]):
        time.sleep(api["sleep_s"])
        try:
            r = requests.get(url, timeout=api["timeout_s"])
            text = r.text
            if r.status_code == 200 and text.startswith("latitude,longitude"):
                # Verificação: toda linha deve cair dentro da janela pedida.
                lo, hi = str(w["date"]), str(w["date"] + dt.timedelta(days=w["days"] - 1))
                dates = {line.split(",")[5] for line in text.strip().splitlines()[1:]}
                if dates and (min(dates) < lo or max(dates) > hi):
                    raise RuntimeError(f"datas fora da janela em {w['source']} {lo}: {min(dates)}..{max(dates)}")
                tmp = path.with_suffix(".tmp")
                tmp.write_text(text, encoding="utf-8")
                tmp.rename(path)
                return path
            err = f"http {r.status_code}: {redact(text[:120], key)!r}"
            if "xceed" in text or r.status_code == 429:      # limite de transações
                time.sleep(60)
        except requests.RequestException as e:
            err = type(e).__name__                            # sem a URL: ela contém a chave
        time.sleep(api["backoff_s"] * 2 ** attempt)
    raise RuntimeError(f"falha em {w['source']} {w['date']} x{w['days']}: {err}")


def load_brazil(cfg: dict):
    """Polígono do Brasil (geobr.read_country), com cache em data/geo."""
    import geopandas as gpd
    cache = path_of(cfg, "geo") / "brazil_country_2020.parquet"
    if cache.exists():
        gdf = gpd.read_parquet(cache)
    else:
        import geobr
        gdf = geobr.read_country(year=2020, simplified=False)
        gdf.to_parquet(cache)
    geom = gdf.geometry.union_all()
    shapely.prepare(geom)
    return geom


def run_api(cfg: dict, workers: int) -> None:
    key = get_map_key()
    avail = get_availability(cfg, key)
    windows = plan_windows(cfg, avail)
    cache_dir = path_of(cfg, "zips") / "api"
    raw_dir = path_of(cfg, "raw")
    year = cfg["periods"]["api_year"]
    brazil = None
    for prefix, schema_key in API_SETS:
        out = raw_dir / f"{prefix}_{year}_api.parquet"
        if out.exists():
            log(f"{out.name}: já existia")
            continue
        ws = [w for w in windows if w["prefix"] == prefix]
        segs = {}
        for w in ws:
            s = segs.setdefault(w["source"], [w["date"], w["date"]])
            s[1] = w["date"] + dt.timedelta(days=w["days"] - 1)
        log(f"{prefix}: {len(ws)} janelas | " + " | ".join(f"{k} {a}..{b}" for k, (a, b) in segs.items()))
        t0 = time.time()
        with ThreadPoolExecutor(workers) as ex:
            paths = list(ex.map(lambda w: fetch_window(cfg, key, w, cache_dir), ws))
        brazil = brazil or load_brazil(cfg)
        con = duckdb.connect()
        writer, n_bbox, n_br = None, 0, 0
        tmp_out = out.with_suffix(".parquet.tmp")
        for w, p in zip(ws, paths):
            if p.stat().st_size < 200 and len(p.read_text().strip().splitlines()) <= 1:
                continue                                       # janela sem focos
            tbl = con.sql(typed_select(p, schema_key, w["processing"], w["source"])).to_arrow_table()
            n_bbox += tbl.num_rows
            inside = shapely.contains_xy(brazil, tbl["longitude"].to_numpy(), tbl["latitude"].to_numpy())
            tbl = tbl.filter(pa.array(inside))
            n_br += tbl.num_rows
            writer = writer or pq.ParquetWriter(tmp_out, tbl.schema, compression="zstd")
            writer.write_table(tbl)
        writer.close()
        con.close()
        tmp_out.rename(out)
        shutil.rmtree(cache_dir / cfg["api"]["products"][prefix]["sp"], ignore_errors=True)
        shutil.rmtree(cache_dir / cfg["api"]["products"][prefix]["nrt"], ignore_errors=True)
        log(f"{out.name}: {n_bbox:,} linhas na caixa -> {n_br:,} dentro do Brasil "
            f"({n_bbox - n_br:,} removidas) | {time.time() - t0:.0f}s")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--only", choices=["archive", "api"])
    ap.add_argument("--workers", type=int, default=3)
    args = ap.parse_args()
    cfg = load_config()
    if args.only in (None, "archive"):
        run_archive(cfg, args.workers)
    if args.only in (None, "api"):
        run_api(cfg, args.workers)


if __name__ == "__main__":
    main()
