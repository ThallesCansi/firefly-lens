"""Etapa 7 — Validação.

1. Leave-one-year-out (LOYO) nos anos de calibração, para o Nível 1, o Nível 2 e o VIIRS bruto.
2. Teste fora da amostra nos anos posteriores à calibração (2024–2026), com os modelos finais.
3. Métricas em três escalas e figuras em output/figures/.

Saídas:
  data/interim/validation_pred.parquet   predições fora da amostra por célula × mês × daynight
  data/interim/validation_groups.parquet somas simuladas fora da amostra por bioma × ano × mês
  output/validation_metrics.csv          tabela de métricas
  output/validation_rankings.csv         Spearman dos rankings por bioma
  output/figures/*.png

Uso: uv run python -I pipeline/07_validate.py [--figures-only]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import json
import time

import duckdb
import numpy as np
import pandas as pd

import nbmodel as nb
import plotstyle as ps
from common import calib_where, load_config, make_rng, path_of, years
from calibration import fit_l1

pd.set_option("display.width", 250, "display.max_rows", 300, "display.max_columns", 40)
METHODS = {"viirs_bruto": "VIIRS bruto", "L1": "Nível 1", "L2": "Nível 2"}


def run_predictions(cfg: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    interim, out = path_of(cfg, "interim"), path_of(cfg, "output")
    con = duckdb.connect()
    rng = make_rng(cfg)
    n_sim, m = cfg["level2"]["n_sim"], cfg["level1"]["shrink_prior_n"]
    df = con.execute(f"""
        SELECT cell_id, bioma, year, month, daynight, n_modis, n_viirs_raw, n_viirs_1km, is_partial,
               ({calib_where(cfg)}) AS in_calib
        FROM '{interim}/grid_counts.parquet' WHERE n_viirs_1km IS NOT NULL
        ORDER BY year, month, daynight, cell_id""").df()
    for c in ["L1", "L2", "L2_var", "L2_lo", "L2_hi"]:
        df[c] = np.nan
    df["fold"] = ""
    gkeys = ["bioma", "year", "month"]
    groups = []

    def predict_block(mask, train, label):
        k = fit_l1(train, m)
        blk = df.loc[mask, ["bioma", "month", "daynight", "n_viirs_1km", "year"]]
        df.loc[mask, "L1"] = blk.merge(k, on=["bioma", "month", "daynight"], how="left")["k"].to_numpy() * blk["n_viirs_1km"].to_numpy()
        agg = nb.aggregate(train)
        fit = nb.fit_nb2(agg["n_modis"].to_numpy(float), nb.design(agg)[0], agg["w"].to_numpy(float))
        X, _ = nb.design(blk)
        gk = blk[gkeys].astype(str).agg("|".join, axis=1)
        codes, uniq = pd.factorize(gk)
        mean, var, lo, hi, gsum = nb.simulate(X, fit.params, fit.cov, rng, n_sim, codes, len(uniq), q=cfg["level2"]["quantiles"])
        df.loc[mask, "L2"] = nb.predict_mu(X, fit.params[:-1])
        df.loc[mask, "L2_var"], df.loc[mask, "L2_lo"], df.loc[mask, "L2_hi"] = var, lo, hi
        df.loc[mask, "fold"] = label
        g = pd.DataFrame(gsum.astype(np.float32), columns=[f"s{i:03d}" for i in range(n_sim)])
        kk = pd.Series(uniq).str.split("|", expand=True)
        g.insert(0, "month", kk[2].astype(int)); g.insert(0, "year", kk[1].astype(int)); g.insert(0, "bioma", kk[0])
        groups.append(g)
        return fit

    calib = df[df.in_calib]
    for y in years(cfg["validation"]["loyo_years"]):
        t0 = time.time()
        fit = predict_block((df.year == y).to_numpy(), calib[calib.year != y], "loyo")
        print(f"LOYO {y}: treino {int((calib.year != y).sum()):,} linhas | alpha {fit.params[-1]:.3f} | {time.time() - t0:.0f}s", flush=True)
    t0 = time.time()
    predict_block((df.year > cfg["periods"]["calibration"][1]).to_numpy(), calib, "oos")
    print(f"fora da amostra (modelo final): {time.time() - t0:.0f}s", flush=True)
    df["viirs_bruto"] = df["n_viirs_raw"].astype(float)
    g = pd.concat(groups, ignore_index=True)
    df.to_parquet(interim / "validation_pred.parquet", index=False)
    g.to_parquet(interim / "validation_groups.parquet", index=False)
    return df, g


# ----------------------------------------------------------------------------
# Métricas
# ----------------------------------------------------------------------------

def anomalies(d: pd.DataFrame, col: str, unit: list[str]) -> pd.Series:
    """Valor menos a média do mesmo mês do ano na mesma unidade."""
    return d[col] - d.groupby(unit + ["month"], observed=True)[col].transform("mean")


def metric_row(d: pd.DataFrame, pred: str, unit: list[str]) -> dict:
    o, p = d["n_modis"].to_numpy(float), d[pred].to_numpy(float)
    ao, ap = anomalies(d, "n_modis", unit), anomalies(d, pred, unit)
    return {"n": len(d), "vies_rel_pct": 100 * (p.sum() / o.sum() - 1),
            "mae_log1p": float(np.abs(np.log1p(p) - np.log1p(o)).mean()),
            "pearson_anomalias": float(np.corrcoef(ao, ap)[0, 1])}


def compute_metrics(df: pd.DataFrame, g: pd.DataFrame, cfg: dict):
    scols = [c for c in g.columns if c.startswith("s")]
    d = df[~df.is_partial & (df.fold != "")].copy()
    d["periodo"] = np.where(d.fold == "loyo", "LOYO 2018–2023", d.year.astype(str))
    d = d[(d.fold == "oos") | d.in_calib]              # nos anos de calibração, só os meses usados no ajuste
    preds = list(METHODS)
    cell = d
    bio = d.groupby(["periodo", "bioma", "year", "month"], observed=True)[["n_modis"] + preds + ["L2_var"]].sum().reset_index()
    br = d.groupby(["periodo", "year", "month"], observed=True)[["n_modis"] + preds + ["L2_var"]].sum().reset_index()
    br["bioma"] = "Brasil"
    # intervalos de 95% das somas, a partir das réplicas
    gb = g.merge(bio[["bioma", "year", "month"]], on=["bioma", "year", "month"])
    q = np.percentile(gb[scols].to_numpy(), [2.5, 97.5], axis=1)
    gb["lo"], gb["hi"] = q[0], q[1]
    bio = bio.merge(gb[["bioma", "year", "month", "lo", "hi"]], on=["bioma", "year", "month"])
    gbr = gb.groupby(["year", "month"])[scols].sum()
    q = np.percentile(gbr.to_numpy(), [2.5, 97.5], axis=1)
    br = br.merge(pd.DataFrame({"lo": q[0], "hi": q[1]}, index=gbr.index).reset_index(), on=["year", "month"])
    for t in (bio, br):                                # aproximação normal que o backend pode usar
        t["lo_norm"] = t.L2 - 1.96 * np.sqrt(t.L2_var)
        t["hi_norm"] = t.L2 + 1.96 * np.sqrt(t.L2_var)

    rows = []
    for periodo in ["LOYO 2018–2023"] + [str(y) for y in years(cfg["validation"]["oos_years"])]:
        for escala, t, unit in [("célula × mês × daynight", cell, ["cell_id", "daynight"]),
                                ("bioma × mês", bio, ["bioma"]), ("Brasil × mês", br, ["bioma"])]:
            tt = t[t.periodo == periodo]
            if tt.empty:
                continue
            for pcol, pname in METHODS.items():
                r = {"periodo": periodo, "escala": escala, "metodo": pname, **metric_row(tt, pcol, unit)}
                if periodo != "LOYO 2018–2023":
                    r["pearson_anomalias"] = np.nan    # um ano só: não há anomalia interanual
                if pcol == "L2":
                    lo, hi = ("L2_lo", "L2_hi") if escala.startswith("célula") else ("lo", "hi")
                    r["cobertura95_pct"] = 100 * ((tt.n_modis >= tt[lo]) & (tt.n_modis <= tt[hi])).mean()
                    if not escala.startswith("célula"):
                        r["cobertura95_normal_pct"] = 100 * ((tt.n_modis >= tt.lo_norm) & (tt.n_modis <= tt.hi_norm)).mean()
                rows.append(r)
    metrics = pd.DataFrame(rows)

    # Spearman dos rankings por bioma: meses do ano e anos
    rk = []
    allb = pd.concat([bio, br], ignore_index=True)
    for bioma, t in allb.groupby("bioma"):
        loyo = t[t.periodo == "LOYO 2018–2023"]
        for pcol, pname in METHODS.items():
            mo = loyo.groupby("month")[["n_modis", pcol]].mean()
            yr = loyo.groupby("year")[["n_modis", pcol]].sum()
            ya = t.groupby("year")[["n_modis", pcol]].sum()
            top = set(mo.n_modis.nlargest(3).index) == set(mo[pcol].nlargest(3).index)
            rk.append({"bioma": bioma, "metodo": pname,
                       "spearman_meses": mo.n_modis.corr(mo[pcol], method="spearman"),
                       "top3_meses_iguais": top,
                       "spearman_anos_2018_2023": yr.n_modis.corr(yr[pcol], method="spearman"),
                       "spearman_anos_2018_2026": ya.n_modis.corr(ya[pcol], method="spearman")})
    return metrics, pd.DataFrame(rk), bio, br


# ----------------------------------------------------------------------------
# Figuras
# ----------------------------------------------------------------------------

def figures(cfg: dict, df: pd.DataFrame, bio: pd.DataFrame, br: pd.DataFrame) -> None:
    import matplotlib.pyplot as plt
    from matplotlib.colors import LogNorm
    ps.apply()
    figdir, interim = path_of(cfg, "figures"), path_of(cfg, "interim")
    con = duckdb.connect()
    cal_end = cfg["periods"]["calibration"][1]
    excl = cfg["periods"]["calibration_exclude"]
    t_of = lambda d: pd.to_datetime(dict(year=d.year, month=d.month, day=15))

    # 1. antes/depois: série mensal do Brasil
    mod = con.execute(f"SELECT year, month, sum(n_modis) n_modis, sum(n_viirs_raw) n_viirs_raw FROM '{interim}/grid_counts.parquet' "
                      f"WHERE NOT is_partial AND make_date(year, month, 1) >= DATE '2003-01-01' GROUP BY 1, 2 ORDER BY 1, 2").df()
    b = br.sort_values(["year", "month"])
    fig, ax = plt.subplots(figsize=(13, 5))
    v = mod.dropna(subset=["n_viirs_raw"])
    ax.plot(t_of(v), v.n_viirs_raw, color=ps.SERIES[1], lw=1.4, label="VIIRS NOAA-20 bruto")
    ax.fill_between(t_of(b), b.lo, b.hi, color=ps.SERIES[0], alpha=0.25, lw=0, label="Faixa de 95% do harmonizado")
    ax.plot(t_of(mod), mod.n_modis, color=ps.INK, lw=1.4, label="MODIS Aqua observado")
    ax.plot(t_of(b), b.L2, color=ps.SERIES[0], lw=1.6, label="VIIRS harmonizado (Nível 2, fora da amostra)")
    ax.axvline(pd.Timestamp(cal_end + 1, 1, 1), color=ps.MUTED, lw=1, ls="--")
    ax.annotate("fim da calibração", (pd.Timestamp(cal_end + 1, 1, 1), ax.get_ylim()[1]), xytext=(4, -4),
                textcoords="offset points", va="top", color=ps.INK2, fontsize=9)
    ax.set_yscale("log")
    ax.set_ylabel("focos por mês (escala log)")
    ax.set_title("Brasil, focos mensais: MODIS Aqua, VIIRS bruto e VIIRS harmonizado")
    ax.legend(loc="upper left", ncol=2)
    ax.set_ylim(None, 2e6)
    fig.savefig(figdir / "before_after_brazil.png"); plt.close(fig)

    # 1b. zoom no período com VIIRS, escala linear
    fig, ax = plt.subplots(figsize=(13, 5))
    m2 = mod[mod.year >= 2018]
    ax.fill_between(t_of(b), b.lo, b.hi, color=ps.SERIES[0], alpha=0.25, lw=0, label="Faixa de 95% do harmonizado")
    ax.plot(t_of(m2), m2.n_modis, color=ps.INK, lw=1.6, label="MODIS Aqua observado")
    ax.plot(t_of(b), b.L2, color=ps.SERIES[0], lw=1.6, label="VIIRS harmonizado (Nível 2, fora da amostra)")
    ax.axvline(pd.Timestamp(cal_end + 1, 1, 1), color=ps.MUTED, lw=1, ls="--")
    ax.annotate("fim da calibração; depois disso o Aqua deriva", (pd.Timestamp(cal_end + 1, 1, 1), ax.get_ylim()[1]),
                xytext=(4, -4), textcoords="offset points", va="top", color=ps.INK2, fontsize=9)
    ax.set_ylim(0, None); ax.set_ylabel("focos por mês")
    ax.set_title("Brasil, 2018–2026: MODIS Aqua observado e VIIRS harmonizado")
    ax.legend(loc="upper left")
    fig.savefig(figdir / "before_after_brazil_zoom.png"); plt.close(fig)

    # 2. dispersão observado × previsto por bioma (bioma × mês)
    fig, axes = plt.subplots(2, 3, figsize=(12, 7.6))
    for ax, bioma in zip(axes.ravel(), ps.BIOMAS):
        t = bio[bio.bioma == bioma]
        for per, color, label in [(t.periodo == "LOYO 2018–2023", ps.SERIES[0], "2018–2023 (LOYO)"),
                                  (t.periodo != "LOYO 2018–2023", ps.SERIES[1], "2024–2026 (fora da amostra)")]:
            ax.scatter(t[per].n_modis + 1, t[per].L2 + 1, s=20, color=color, edgecolor=ps.SURFACE, linewidth=0.6, label=label)
        lim = [max(0.8, min(t.n_modis.min(), t.L2.min()) * 0.6), max(t.n_modis.max(), t.L2.max()) * 1.5]
        ax.plot(lim, lim, color=ps.MUTED, lw=1)
        ax.set_xscale("log"); ax.set_yscale("log"); ax.set_xlim(lim); ax.set_ylim(lim)
        ax.grid(True, axis="x"); ax.set_title(bioma)
    for ax in axes[:, 0]:
        ax.set_ylabel("previsto pelo Nível 2 (+1)")
    for ax in axes[1]:
        ax.set_xlabel("MODIS Aqua observado (+1)")
    h, l = axes[0, 0].get_legend_handles_labels()
    fig.legend(h, l, loc="lower center", ncol=2, bbox_to_anchor=(0.5, -0.03))
    fig.suptitle("Observado × previsto por bioma e mês (cada ponto é um mês)", x=0.01, ha="left", fontsize=13, fontweight="bold")
    fig.tight_layout(); fig.savefig(figdir / "scatter_by_biome.png"); plt.close(fig)

    # 3. resíduos ao longo do tempo (Brasil × mês), todos os meses com VIIRS
    a = df[~df.is_partial].groupby(["year", "month"])[["n_modis", "L1", "L2"]].sum().reset_index()
    fig, ax = plt.subplots(figsize=(13, 4.6))
    ax.axhline(0, color=ps.AXIS, lw=1)
    for col, color, label in [("L1", ps.SERIES[1], "Nível 1"), ("L2", ps.SERIES[0], "Nível 2")]:
        ax.plot(t_of(a), 100 * (a[col] / a.n_modis - 1), color=color, lw=1.6, label=label)
    for mm in excl:
        yy, mo = map(int, mm.split("-"))
        r = a[(a.year == yy) & (a.month == mo)]
        ax.scatter(t_of(r), 100 * (r.L2 / r.n_modis - 1), s=60, facecolor="none", edgecolor=ps.INK, linewidth=1.4, zorder=4)
        ax.annotate("queda do Aqua", (t_of(r).iloc[0], 100 * (r.L2.iloc[0] / r.n_modis.iloc[0] - 1)), xytext=(8, 0),
                    textcoords="offset points", va="center", color=ps.INK2, fontsize=9)
    ax.axvline(pd.Timestamp(cal_end + 1, 1, 1), color=ps.MUTED, lw=1, ls="--")
    ax.annotate("fim da calibração", (pd.Timestamp(cal_end + 1, 1, 1), ax.get_ylim()[1]), xytext=(4, -4),
                textcoords="offset points", va="top", color=ps.INK2, fontsize=9)
    ax.set_ylabel("previsto / observado − 1 (%)")
    ax.set_title("Resíduo mensal do Brasil: valores negativos depois de 2023 indicam a deriva orbital do Aqua")
    ax.legend(loc="lower left", ncol=2)
    fig.savefig(figdir / "residuals_time.png"); plt.close(fig)

    # 4. calendário (ano × mês) do Brasil e de cada bioma, série harmonizada
    last_obs = cfg["periods"]["climatology"][1]
    obs = con.execute(f"SELECT bioma, year, month, sum(n_modis) n FROM '{interim}/grid_counts.parquet' "
                      f"WHERE year BETWEEN 2003 AND {last_obs} GROUP BY ALL").df()
    modl = df[(df.year > last_obs) & ~df.is_partial].groupby(["bioma", "year", "month"], observed=True).L2.sum().rename("n").reset_index()
    h = pd.concat([obs, modl], ignore_index=True)
    hb = h.groupby(["year", "month"]).n.sum().reset_index(); hb["bioma"] = "Brasil"
    h = pd.concat([hb, h], ignore_index=True)
    fig, axes = plt.subplots(2, 4, figsize=(15, 9.5))
    for ax, bioma in zip(axes.ravel(), ["Brasil"] + ps.BIOMAS):
        mat = h[h.bioma == bioma].pivot(index="year", columns="month", values="n").sort_index()
        im = ax.imshow(mat.to_numpy() + 1, aspect="auto", cmap="viridis", norm=LogNorm(vmin=max(1, np.nanmin(mat.to_numpy()) + 1), vmax=np.nanmax(mat.to_numpy()) + 1))
        ax.set_xticks(range(12), [m[0].upper() for m in ps.MESES]); ax.set_yticks(range(0, len(mat), 2), mat.index[::2])
        ax.axhline(list(mat.index).index(last_obs) + 0.5, color="white", lw=1.5)
        ax.grid(False); ax.set_title(bioma)
        fig.colorbar(im, ax=ax, fraction=0.046, pad=0.03)
    axes.ravel()[-1].axis("off")
    axes.ravel()[-1].text(0, 0.9, "Cor: focos por mês em escala\nMODIS-Aqua-equivalente (log).\n\nAcima da linha branca:\nMODIS Aqua observado.\nAbaixo (2026): VIIRS harmonizado.",
                          va="top", color=ps.INK2, fontsize=10)
    fig.suptitle("Calendário de queima: focos por ano e mês, série harmonizada", x=0.01, ha="left", fontsize=13, fontweight="bold")
    fig.tight_layout(); fig.savefig(figdir / "calendar_heatmaps.png"); plt.close(fig)


def main() -> None:
    cfg = load_config()
    interim, out = path_of(cfg, "interim"), path_of(cfg, "output")
    if "--figures-only" in sys.argv:
        df, g = pd.read_parquet(interim / "validation_pred.parquet"), pd.read_parquet(interim / "validation_groups.parquet")
    else:
        df, g = run_predictions(cfg)
    metrics, rk, bio, br = compute_metrics(df, g, cfg)
    metrics.to_csv(out / "validation_metrics.csv", index=False)
    rk.to_csv(out / "validation_rankings.csv", index=False)
    print("\n=== Métricas ===")
    print(metrics.round(3).to_string(index=False))
    print("\n=== Spearman dos rankings por bioma ===")
    print(rk.round(3).to_string(index=False))
    print("\n=== Brasil por ano (meses avaliados) ===")
    y = br.groupby("year")[["n_modis", "viirs_bruto", "L1", "L2"]].sum()
    for c in ["L1", "L2"]:
        y[f"vies_{c}_pct"] = (100 * (y[c] / y.n_modis - 1)).round(1)
    print(y.round(0).to_string())
    print("\n=== 2026 mês a mês (Brasil): Aqua observado × harmonizado ===")
    print(br[br.year == 2026].sort_values("month")[["month", "n_modis", "L1", "L2", "lo", "hi"]].round(0).to_string(index=False))
    figures(cfg, df, bio, br)
    print("\nfiguras em", path_of(cfg, "figures"))


if __name__ == "__main__":
    main()
