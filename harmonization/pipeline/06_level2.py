"""Etapa 6 — Nível 2: GLM binomial negativo (NB2) e incerteza por simulação.

Saídas:
  output/level2_model.json                 coeficientes, covariância, alpha, AIC
  data/interim/level2_pred.parquet         por célula × mês × daynight: mu, média, variância, p2.5, p97.5
  data/interim/level2_sim_groups.parquet   somas simuladas por bioma × ano × mês × daynight (uma coluna por simulação)

Uso: uv run python -I pipeline/06_level2.py
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
from common import calib_where, load_config, make_rng, path_of

pd.set_option("display.width", 250, "display.max_rows", 300)


def main() -> None:
    cfg = load_config()
    interim, out = path_of(cfg, "interim"), path_of(cfg, "output")
    grid = f"'{interim}/grid_counts.parquet'"
    con = duckdb.connect()
    rng = make_rng(cfg)
    cols = "cell_id, bioma, year, month, daynight, n_modis, n_viirs_raw, n_viirs_1km, is_partial"
    cal = con.execute(f"SELECT {cols} FROM {grid} WHERE {calib_where(cfg)}").df()
    y = cal["n_modis"].to_numpy(dtype=np.float64)
    X, names = nb.design(cal)
    print(f"calibração: {len(cal):,} linhas, {X.shape[1]} coeficientes + alpha")

    # --- ajustes (sobre padrões distintos, com pesos de frequência) --------------
    agg = nb.aggregate(cal)
    ya, wa = agg["n_modis"].to_numpy(dtype=np.float64), agg["w"].to_numpy(dtype=np.float64)
    Xa, _ = nb.design(agg)
    Xa0, names0 = nb.design(agg, interaction=False)
    X0, _ = nb.design(cal, interaction=False)
    print(f"padrões distintos: {len(agg):,} (soma dos pesos {int(wa.sum()):,})", flush=True)
    t0 = time.time(); pois = nb.fit_poisson(ya, Xa, wa); t_p = time.time() - t0
    t0 = time.time(); res = nb.fit_nb2(ya, Xa, wa, pois.params); t_nb = time.time() - t0
    res0 = nb.fit_nb2(ya, Xa0, wa)
    Xa1, _ = nb.design(agg, extra=False)
    res1 = nb.fit_nb2(ya, Xa1, wa)      # especificação original do plano, para comparação
    mu1 = nb.predict_mu(nb.design(cal, extra=False)[0], res1.params[:-1])
    print(f"tempo: Poisson {t_p:.0f}s, NB2 {t_nb:.0f}s | convergiu: Poisson {pois.converged}, NB2 {res.converged}, "
          f"sem interação {res0.converged}", flush=True)
    params, cov = res.params, res.cov
    beta, alpha = params[:-1], params[-1]
    se = np.sqrt(np.diag(cov))
    tab = pd.DataFrame({"coef": params, "erro_padrao": se, "z": params / se,
                        "exp(coef)": np.exp(params)}, index=names + ["alpha"])
    tab.loc["alpha", "exp(coef)"] = np.nan
    print("\n=== NB2: coeficientes ===")
    print(tab.round(4).to_string())

    mu = nb.predict_mu(X, beta)
    mu0 = nb.predict_mu(X0, res0.params[:-1])
    mup = nb.predict_mu(X, pois.params)
    disp = float((wa * (ya - nb.predict_mu(Xa, pois.params)) ** 2 / nb.predict_mu(Xa, pois.params)).sum() / (len(cal) - X.shape[1]))
    comp = pd.DataFrame([
        {"modelo": "Poisson", "k": pois.k, "loglik": pois.llf, "AIC": pois.aic, "soma_predita": mup.sum(),
         "zeros_previstos_pct": 100 * np.exp(-mup).mean(), "dispersao_pearson": disp},
        {"modelo": "NB2 do plano original (sem as 4 extras)", "k": res1.k, "loglik": res1.llf, "AIC": res1.aic, "soma_predita": mu1.sum(),
         "zeros_previstos_pct": 100 * nb.prob_zero(mu1, res1.params[-1]).mean(), "dispersao_pearson": np.nan},
        {"modelo": "NB2 sem bioma × log1p", "k": res0.k, "loglik": res0.llf, "AIC": res0.aic, "soma_predita": mu0.sum(),
         "zeros_previstos_pct": 100 * nb.prob_zero(mu0, res0.params[-1]).mean(), "dispersao_pearson": np.nan},
        {"modelo": "NB2 (principal)", "k": res.k, "loglik": res.llf, "AIC": res.aic, "soma_predita": mu.sum(),
         "zeros_previstos_pct": 100 * nb.prob_zero(mu, alpha).mean(), "dispersao_pearson": np.nan},
    ])
    print(f"\n=== Comparação (observado: soma {y.sum():,.0f}, zeros {100 * (y == 0).mean():.2f}%) ===")
    print(comp.round(3).to_string(index=False))

    # --- zeros e viés por faixa -------------------------------------------------
    cal["mu"], cal["p0"] = mu, nb.prob_zero(mu, alpha)
    print("\n=== Zeros observados × previstos pelo NB2 ===")
    z = cal.assign(zero=(cal.n_modis == 0)).groupby("daynight").agg(
        linhas=("zero", "size"), zeros_obs_pct=("zero", lambda s: 100 * s.mean()), zeros_prev_pct=("p0", lambda s: 100 * s.mean()))
    print(z.round(2).to_string())
    zb = cal.assign(zero=(cal.n_modis == 0)).groupby("bioma").agg(
        zeros_obs_pct=("zero", lambda s: 100 * s.mean()), zeros_prev_pct=("p0", lambda s: 100 * s.mean()))
    print(zb.round(2).to_string())
    print("\n=== Calibração por faixa de n_viirs_1km (observado × predito) ===")
    bins = [-1, 0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1e9]
    cal["faixa"] = pd.cut(cal.n_viirs_1km, bins, labels=["0", "1", "2", "3-5", "6-10", "11-20", "21-50", "51-100", "101-200", "201-500", ">500"])
    f = cal.groupby(["daynight", "faixa"], observed=True).agg(linhas=("mu", "size"), obs=("n_modis", "sum"), pred=("mu", "sum"),
                                                              zeros_obs=("n_modis", lambda s: (s == 0).mean()), zeros_prev=("p0", "mean"))
    f["pred/obs"] = f.pred / f.obs
    print(f.round(3).to_string())
    print("\nviés por bioma × daynight (pred/obs):")
    print((cal.groupby(["bioma", "daynight"]).mu.sum() / cal.groupby(["bioma", "daynight"]).n_modis.sum()).unstack().round(3).to_string())
    print("viés por mês (pred/obs):", (cal.groupby("month").mu.sum() / cal.groupby("month").n_modis.sum()).round(3).to_dict())

    json.dump({"names": names + ["alpha"], "params": params.tolist(), "cov": cov.tolist(), "alpha": float(alpha),
               "aic": float(res.aic), "loglik": float(res.llf), "n_obs": int(len(cal)),
               "formula": cfg["level2"]["formula"], "calibration": calib_where(cfg),
               "reference_levels": {"bioma": nb.BIOMAS[0], "month": 1, "daynight": "D"}},
              open(out / "level2_model.json", "w"), ensure_ascii=False, indent=1)
    del cal, X, X0

    # --- incerteza: todas as linhas com VIIRS -----------------------------------
    full = con.execute(f"SELECT {cols} FROM {grid} WHERE n_viirs_1km IS NOT NULL ORDER BY year, month, daynight, cell_id").df()
    Xf, _ = nb.design(full)
    gkey = full[["bioma", "year", "month", "daynight"]].astype(str).agg("|".join, axis=1)
    gcodes, guniq = pd.factorize(gkey)
    n_sim = cfg["level2"]["n_sim"]
    t0 = time.time()
    mean, var, lo, hi, gsum = nb.simulate(Xf, params, cov, rng, n_sim, gcodes, len(guniq),
                                          chunk=cfg["level2"]["sim_chunk_rows"] // 4, q=cfg["level2"]["quantiles"])
    print(f"\nsimulação: {len(full):,} linhas × {n_sim} réplicas em {time.time() - t0:.0f}s")
    full["mu_L2"] = nb.predict_mu(Xf, beta)
    full["sim_mean"], full["sim_var"], full["sim_p025"], full["sim_p975"] = mean, var, lo, hi
    full.drop(columns=["n_viirs_raw", "is_partial"]).to_parquet(interim / "level2_pred.parquet", index=False)
    g = pd.DataFrame(gsum.astype(np.float32), columns=[f"s{i:03d}" for i in range(n_sim)])
    k = pd.Series(guniq).str.split("|", expand=True)
    g.insert(0, "daynight", k[3]); g.insert(0, "month", k[2].astype(int)); g.insert(0, "year", k[1].astype(int)); g.insert(0, "bioma", k[0])
    g.to_parquet(interim / "level2_sim_groups.parquet", index=False)
    print("conferência: Σ mu =", f"{full.mu_L2.sum():,.0f}", "| Σ média simulada =", f"{mean.sum():,.0f}",
          "| Σ n_modis =", f"{full.n_modis.sum():,.0f}")
    z0 = full[full.n_viirs_1km == 0]
    print(f"linhas com n_viirs_1km = 0: {len(z0):,} ({100 * len(z0) / len(full):.1f}%) | Σ mu nessas linhas: {z0.mu_L2.sum():,.0f} "
          f"({100 * z0.mu_L2.sum() / full.mu_L2.sum():.2f}% do total) | Σ n_modis nelas: {z0.n_modis.sum():,.0f}")


if __name__ == "__main__":
    main()
