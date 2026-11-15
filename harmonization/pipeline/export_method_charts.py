"""Exporta os dados das quatro figuras da Etapa 7 para os gráficos SVG da página Method.

Os valores são exatamente os que `07_validate.py:figures()` desenha: as mesmas tabelas
(`mod`, `br`, `bio` e `a`), as mesmas agregações e o mesmo arredondamento nenhum, só
compactados em JSON. Nada é reajustado aqui:

1. Se `data/interim/validation_pred.parquet` e `validation_groups.parquet` existem, são lidos.
2. Senão, `grid_counts.parquet` é reconstruído a partir de `output/grid_monthly.parquet`
   (mesmas colunas, mesma ordem; a Etapa 8 apenas copia essas colunas) e as predições
   fora da amostra são refeitas com `07_validate.run_predictions` (mesma semente, mesmo código).
3. As métricas recalculadas precisam coincidir com `output/validation_metrics.csv`
   (tolerância 1e-6 relativa); senão o script falha e nada é escrito.

Saída: ../public/method/evidence/harmonization-charts.json

Uso: uv run python -I pipeline/export_method_charts.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import hashlib
import importlib.util
import json

import duckdb
import numpy as np
import pandas as pd

from common import ROOT, load_config, path_of

BIOMES_EN = {"Amazônia": "Amazon", "Cerrado": "Cerrado", "Caatinga": "Caatinga",
             "Mata Atlântica": "Atlantic Forest", "Pantanal": "Pantanal", "Pampa": "Pampa"}
OUT = ROOT.parent / "public/method/evidence/harmonization-charts.json"


def load_validate():
    spec = importlib.util.spec_from_file_location("validate07", Path(__file__).with_name("07_validate.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ensure_inputs(cfg: dict, v) -> tuple[pd.DataFrame, pd.DataFrame, str]:
    interim = path_of(cfg, "interim")
    pred, groups = interim / "validation_pred.parquet", interim / "validation_groups.parquet"
    gc, marker = interim / "grid_counts.parquet", interim / "grid_counts.rebuilt_from_grid_monthly"
    rebuilt = "Stage 7 run_predictions re-executed (seed from config.yaml) on grid_counts rebuilt from output/grid_monthly.parquet"
    if pred.exists() and groups.exists():
        how = rebuilt if marker.exists() else "Stage 7 intermediates from a full pipeline run (data/interim)"
        return pd.read_parquet(pred), pd.read_parquet(groups), how
    if not gc.exists():
        marker.touch()
        duckdb.execute(f"""COPY (SELECT cell_id, bioma, year, month, daynight, n_modis, n_viirs_raw, n_viirs_1km, is_partial
            FROM '{path_of(cfg, "output")}/grid_monthly.parquet' ORDER BY year, month, daynight, cell_id)
            TO '{gc}' (FORMAT parquet, COMPRESSION zstd)""")
        print("grid_counts.parquet reconstruído de output/grid_monthly.parquet", flush=True)
    df, g = v.run_predictions(cfg)
    return df, g, rebuilt if marker.exists() else "Stage 7 run_predictions on grid_counts from a full pipeline run"


def check_metrics(metrics: pd.DataFrame, published: Path) -> None:
    pub = pd.read_csv(published)
    key = ["periodo", "escala", "metodo"]
    m = pub.merge(metrics, on=key, suffixes=("_pub", "_new"), validate="one_to_one")
    assert len(m) == len(pub) == len(metrics), "conjunto de linhas diferente do CSV publicado"
    for c in ["n", "vies_rel_pct", "mae_log1p", "pearson_anomalias", "cobertura95_pct", "cobertura95_normal_pct"]:
        a, b = m[f"{c}_pub"].to_numpy(float), m[f"{c}_new"].to_numpy(float)
        ok = np.isclose(a, b, rtol=1e-6, atol=1e-9, equal_nan=True)
        assert ok.all(), f"{c} não reproduz o CSV publicado:\n{m.loc[~ok, key + [f'{c}_pub', f'{c}_new']]}"
    print(f"métricas reproduzidas: {len(m)} linhas iguais a {published.name}", flush=True)


def ym(year, month) -> list[str]:
    return [f"{int(y):04d}-{int(m):02d}" for y, m in zip(year, month)]


def r(x, digits=0):
    return [None if pd.isna(v) else (round(float(v), digits) if digits else int(round(float(v)))) for v in x]


def main() -> None:
    cfg = load_config()
    v = load_validate()
    df, g, how = ensure_inputs(cfg, v)
    metrics, _, bio, br = v.compute_metrics(df, g, cfg)
    published = path_of(cfg, "output") / "validation_metrics.csv"
    check_metrics(metrics, published)

    cal_end = cfg["periods"]["calibration"][1]
    excl = cfg["periods"]["calibration_exclude"]
    grid = path_of(cfg, "output") / "grid_monthly.parquet"

    # Figura 1 / 1b: as mesmas consultas de figures()
    mod = duckdb.execute(f"SELECT year, month, sum(n_modis) n_modis, sum(n_viirs_raw) n_viirs_raw FROM '{grid}' "
                         f"WHERE NOT is_partial AND make_date(year, month, 1) >= DATE '2003-01-01' GROUP BY 1, 2 ORDER BY 1, 2").df()
    b = br.sort_values(["year", "month"])
    # Figura 2
    biomes = []
    for bioma in ["Amazônia", "Cerrado", "Caatinga", "Mata Atlântica", "Pantanal", "Pampa"]:
        t = bio[bio.bioma == bioma].sort_values(["year", "month"])
        biomes.append({"biome": BIOMES_EN[bioma], "month": ym(t.year, t.month),
                       "observed": r(t.n_modis), "predicted": r(t.L2, 1),
                       "loyo": [p == "LOYO 2018–2023" for p in t.periodo]})
    # Figura 3
    a = df[~df.is_partial].groupby(["year", "month"])[["n_modis", "L1", "L2"]].sum().reset_index()

    out = {
        "description": "Values drawn by harmonization/pipeline/07_validate.py figures(); exported by harmonization/pipeline/export_method_charts.py",
        "provenance": how,
        "metricsCheck": "Recomputed Stage 7 metrics match harmonization/output/validation_metrics.csv (rtol 1e-6)",
        "calibrationEnd": f"{cal_end + 1}-01",
        "outageMonths": excl,
        "observed": {"month": ym(mod.year, mod.month), "aqua": r(mod.n_modis), "viirsRaw": r(mod.n_viirs_raw)},
        "harmonized": {"month": ym(b.year, b.month), "aqua": r(b.n_modis), "l2": r(b.L2), "lo": r(b.lo), "hi": r(b.hi),
                       "loyo": [p == "LOYO 2018–2023" for p in b.periodo]},
        "biomes": biomes,
        "residuals": {"month": ym(a.year, a.month),
                      "l1": r(100 * (a.L1 / a.n_modis - 1), 2), "l2": r(100 * (a.L2 / a.n_modis - 1), 2)},
        "sources": [{"path": str(p.relative_to(ROOT.parent)), "sha256": sha256(p)}
                    for p in [published, grid, ROOT / "pipeline/07_validate.py", ROOT / "config.yaml"]],
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"escrito {OUT.relative_to(ROOT.parent)} ({OUT.stat().st_size / 1e3:.0f} kB)")


if __name__ == "__main__":
    main()
