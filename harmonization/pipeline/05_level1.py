"""Etapa 5 — Nível 1 (baseline): fator de escala por bioma × mês × daynight.

    k_bruto  = Σ n_modis / Σ n_viirs_1km                 (no estrato)
    k_bioma  = Σ n_modis / Σ n_viirs_1km                 (no bioma × daynight, todos os meses)
    k        = (Σ n_modis + m · k_bioma) / (Σ n_viirs_1km + m)      m = level1.shrink_prior_n
    n_hat_L1 = k × n_viirs_1km

Saídas: output/level1_factors.parquet e output/figures/level1_factors.png

Uso: uv run python -I pipeline/05_level1.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import duckdb
import pandas as pd

import plotstyle as ps
from common import calib_where, load_config, path_of

pd.set_option("display.width", 250, "display.max_rows", 300)


def fit_level1(con, grid: str, where: str, m: float) -> pd.DataFrame:
    """Fatores do Nível 1 ajustados sobre as linhas de `grid` que satisfazem `where`."""
    return con.execute(f"""
        WITH s AS (SELECT bioma, month, daynight, sum(n_modis) AS sum_modis, sum(n_viirs_1km) AS sum_viirs_1km,
                          count(*) AS n_rows FROM {grid} WHERE {where} GROUP BY ALL),
             b AS (SELECT bioma, daynight, sum(sum_modis) / sum(sum_viirs_1km) AS k_bioma FROM s GROUP BY ALL)
        SELECT s.bioma, s.month, s.daynight, s.n_rows, s.sum_modis, s.sum_viirs_1km,
               s.sum_modis / nullif(s.sum_viirs_1km, 0) AS k_raw, b.k_bioma,
               (s.sum_modis + {m} * b.k_bioma) / (s.sum_viirs_1km + {m}) AS k
        FROM s JOIN b USING (bioma, daynight) ORDER BY 1, 3, 2""").df()


def plot(f: pd.DataFrame, out: Path, title: str) -> None:
    import matplotlib.pyplot as plt
    ps.apply()
    fig, axes = plt.subplots(2, 3, figsize=(12, 6.2), sharex=True, sharey=True)
    for ax, bioma in zip(axes.ravel(), ps.BIOMAS):
        for color, dn, label in [(ps.SERIES[0], "D", "dia"), (ps.SERIES[1], "N", "noite")]:
            d = f[(f.bioma == bioma) & (f.daynight == dn)].sort_values("month")
            ax.plot(d.month, d.k, color=color, label=f"{label} (fator usado)")
            ax.scatter(d.month, d.k_raw, s=22, facecolor=ps.SURFACE, edgecolor=color, linewidth=1.3,
                       zorder=3, label=f"{label} (sem encolhimento)")
            ax.annotate(label, (12, d.k.iloc[-1]), xytext=(6, 0), textcoords="offset points",
                        va="center", color=ps.INK2, fontsize=9)
        ax.set_title(bioma)
        ax.set_xticks(range(1, 13), [m[0].upper() for m in ps.MESES])
    axes[0, 0].set_ylim(0, max(f.k.max(), f.k_raw.max()) * 1.08)
    for ax in axes[:, 0]:
        ax.set_ylabel("k = MODIS / VIIRS degradado")
    h, l = axes[0, 0].get_legend_handles_labels()
    fig.legend(h, l, loc="lower center", ncol=4, bbox_to_anchor=(0.5, -0.04))
    fig.suptitle(title, x=0.01, ha="left", fontsize=13, fontweight="bold")
    fig.tight_layout()
    fig.savefig(out)
    plt.close(fig)


def main() -> None:
    cfg = load_config()
    grid = f"'{path_of(cfg, 'interim')}/grid_counts.parquet'"
    con = duckdb.connect()
    where, m = calib_where(cfg), cfg["level1"]["shrink_prior_n"]
    f = fit_level1(con, grid, where, m)
    out = path_of(cfg, "output")
    f.to_parquet(out / "level1_factors.parquet", index=False)
    print(f"calibração: {where}\nlinhas: {int(f.n_rows.sum()):,} | estratos: {len(f)} | m = {m}")

    print("\n=== Fator por bioma × daynight (todos os meses) ===")
    print(f.groupby(["bioma", "daynight"]).agg(sum_modis=("sum_modis", "sum"), sum_viirs_1km=("sum_viirs_1km", "sum"),
          k_bioma=("k_bioma", "first"), k_min=("k", "min"), k_max=("k", "max")).round(4).to_string())
    for dn, name in [("D", "DIA"), ("N", "NOITE")]:
        print(f"\n=== k (com encolhimento), {name}: bioma × mês ===")
        print(f[f.daynight == dn].pivot(index="bioma", columns="month", values="k").round(3).to_string())
    print("\n=== Estratos em que o encolhimento mais pesou (|k − k_bruto| / k_bruto) ===")
    s = f.assign(dif_pct=((f.k - f.k_raw) / f.k_raw * 100).round(1)).sort_values("dif_pct", key=abs, ascending=False)
    print(s[["bioma", "month", "daynight", "sum_modis", "sum_viirs_1km", "k_raw", "k_bioma", "k", "dif_pct"]].head(12).round(4).to_string(index=False))

    print("\n=== Conferência: Σ k × n_viirs_1km contra Σ n_modis, por ano (dia + noite) ===")
    con.register("f", f)
    chk = con.execute(f"""
        SELECT g.year AS ano, ({where}) AS na_calibracao, sum(g.n_modis) AS n_modis,
               round(sum(f.k * g.n_viirs_1km)) AS n_hat_L1,
               round(100 * (sum(f.k * g.n_viirs_1km) / sum(g.n_modis) - 1), 1) AS vies_pct
        FROM {grid} g JOIN f USING (bioma, month, daynight)
        WHERE g.n_viirs_1km IS NOT NULL AND NOT g.is_partial GROUP BY ALL ORDER BY 1, 2""").df()
    print(chk.to_string(index=False, formatters={"n_modis": "{:,.0f}".format, "n_hat_L1": "{:,.0f}".format}))

    fig = path_of(cfg, "figures") / "level1_factors.png"
    plot(f, fig, "Nível 1: fator MODIS Aqua / VIIRS degradado, por bioma e mês (calibração abr/2018–dez/2023)")
    print(f"\nfigura: {fig}")


if __name__ == "__main__":
    main()
