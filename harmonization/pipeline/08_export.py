"""Etapa 8 — Série final e exportação.

Saídas (lidas pelo backend):
  output/grid_monthly.parquet         célula × ano × mês × daynight
  output/grid_monthly_total.parquet   célula × ano × mês (dia + noite)
  output/climatology.parquet          célula × mês do ano: mediana, p25, p75 (base 2003–2025)
  output/harmonization_params.json    erro comum c e metadados

Uso: uv run python -I pipeline/08_export.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import json

import duckdb
import numpy as np
import pandas as pd

import nbmodel as nb
from common import load_config, make_rng, path_of

pd.set_option("display.width", 250, "display.max_rows", 200)


def coverage(t: pd.DataFrame, c: float) -> float:
    sd = np.sqrt(t.L2_var + (c * t.L2) ** 2)
    return float(((t.n_modis >= t.L2 - 1.96 * sd) & (t.n_modis <= t.L2 + 1.96 * sd)).mean())


def calibrate_common_error(cfg: dict, interim: Path) -> tuple[float, pd.DataFrame]:
    """Menor c tal que  L2 ± 1,96·sqrt(Σvar + (c·L2)²)  cobre a fração-alvo em bioma × mês no LOYO."""
    d = pd.read_parquet(interim / "validation_pred.parquet")
    d = d[~d.is_partial & (d.fold != "") & ((d.fold == "oos") | d.in_calib)]
    d["periodo"] = np.where(d.fold == "loyo", "LOYO 2018–2023", "2024–2026")
    bio = d.groupby(["periodo", "bioma", "year", "month"], observed=True)[["n_modis", "L2", "L2_var"]].sum().reset_index()
    br = d.groupby(["periodo", "year", "month"], observed=True)[["n_modis", "L2", "L2_var"]].sum().reset_index()
    target = cfg["level2"]["common_error_target_coverage"]
    loyo = bio[bio.periodo == "LOYO 2018–2023"]
    lo, hi = 0.0, 2.0
    for _ in range(40):
        mid = (lo + hi) / 2
        lo, hi = (lo, mid) if coverage(loyo, mid) >= target else (mid, hi)
    c = round(hi, 3)
    rows = []
    for per in ["LOYO 2018–2023", "2024–2026"]:
        for name, t in [("bioma × mês", bio), ("Brasil × mês", br)]:
            tt = t[t.periodo == per]
            rows.append({"periodo": per, "escala": name, "n": len(tt), "cobertura_sem_c_pct": 100 * coverage(tt, 0.0),
                         "cobertura_com_c_pct": 100 * coverage(tt, c)})
    for bioma, tt in loyo.groupby("bioma"):
        rows.append({"periodo": "LOYO 2018–2023", "escala": f"  {bioma} × mês", "n": len(tt),
                     "cobertura_sem_c_pct": 100 * coverage(tt, 0.0), "cobertura_com_c_pct": 100 * coverage(tt, c)})
    return c, pd.DataFrame(rows)


def simulate_totals(cfg: dict, con, interim: Path, obs_until: int) -> pd.DataFrame:
    """Intervalo de 95% de dia + noite por célula × mês nos meses modelados (mesmas réplicas para dia e noite)."""
    model = json.loads((path_of(cfg, "output") / "level2_model.json").read_text())
    params, cov = np.array(model["params"]), np.array(model["cov"])
    rng = make_rng(cfg)
    n_sim = cfg["level2"]["n_sim"]
    draws = rng.multivariate_normal(params, cov, size=n_sim)
    betas, size = draws[:, :-1].T, 1.0 / np.clip(draws[:, -1], 1e-6, None)
    parts = {}
    for dn in "DN":
        parts[dn] = con.execute(f"""SELECT cell_id, bioma, year, month, daynight, n_viirs_1km FROM '{interim}/grid_counts.parquet'
            WHERE year > {obs_until} AND daynight = '{dn}' ORDER BY year, month, cell_id""").df()
    n = len(parts["D"])
    assert (parts["D"][["cell_id", "year", "month"]].to_numpy() == parts["N"][["cell_id", "year", "month"]].to_numpy()).all()
    XD, XN = nb.design(parts["D"])[0], nb.design(parts["N"])[0]
    var, lo, hi = np.empty(n), np.empty(n), np.empty(n)
    for a in range(0, n, 25_000):
        b = min(a + 25_000, n)
        y = np.zeros((b - a, n_sim), dtype=np.float32)
        for X in (XD, XN):
            mu = np.exp(X[a:b] @ betas)
            y += rng.negative_binomial(size, size / (size + mu))
        var[a:b] = y.var(axis=1, ddof=1)
        lo[a:b], hi[a:b] = np.percentile(y, cfg["level2"]["quantiles"], axis=1)
    out = parts["D"][["cell_id", "year", "month"]].copy()
    out["var_tot"], out["lo_tot"], out["hi_tot"] = var, lo, hi
    return out


def main() -> None:
    cfg = load_config()
    interim, out = path_of(cfg, "interim"), path_of(cfg, "output")
    con = duckdb.connect()
    obs_until = cfg["periods"]["observed_until"]
    b0, b1 = cfg["periods"]["climatology"]

    c, cov_tab = calibrate_common_error(cfg, interim)
    print(f"erro comum calibrado: c = {c}")
    print(cov_tab.round(1).to_string(index=False))

    con.execute(f"""
        COPY (
        SELECT g.cell_id, c.lat, c.lon, g.bioma, g.year, g.month, g.daynight,
               g.n_modis, g.n_viirs_raw, g.n_viirs_1km,
               p.mu_L2 AS n_viirs_harmonized,
               CASE WHEN g.year <= {obs_until} THEN g.n_modis::DOUBLE ELSE p.mu_L2 END AS n_harmonized,
               CASE WHEN g.year > {obs_until} THEN p.sim_var END AS var_harmonized,
               CASE WHEN g.year > {obs_until} THEN p.sim_p025 END AS lo95,
               CASE WHEN g.year > {obs_until} THEN p.sim_p975 END AS hi95,
               CASE WHEN g.year <= {obs_until} THEN 'observed_modis' ELSE 'modeled_viirs' END AS source_flag,
               g.is_partial
        FROM '{interim}/grid_counts.parquet' g
        JOIN '{interim}/grid_cells.parquet' c USING (cell_id)
        LEFT JOIN '{interim}/level2_pred.parquet' p USING (cell_id, year, month, daynight)
        ORDER BY g.year, g.month, g.daynight, g.cell_id
        ) TO '{out}/grid_monthly.parquet' (FORMAT parquet, COMPRESSION zstd)""")

    tot = simulate_totals(cfg, con, interim, obs_until)
    con.register("tot", tot)
    con.execute(f"""
        COPY (
        SELECT g.cell_id, any_value(g.lat) AS lat, any_value(g.lon) AS lon, any_value(g.bioma) AS bioma, g.year, g.month,
               sum(g.n_modis)::INTEGER AS n_modis, sum(g.n_viirs_raw)::INTEGER AS n_viirs_raw, sum(g.n_viirs_1km)::INTEGER AS n_viirs_1km,
               sum(g.n_viirs_harmonized) AS n_viirs_harmonized, sum(g.n_harmonized) AS n_harmonized,
               any_value(t.var_tot) AS var_harmonized, any_value(t.lo_tot) AS lo95, any_value(t.hi_tot) AS hi95,
               any_value(g.source_flag) AS source_flag, bool_or(g.is_partial) AS is_partial
        FROM '{out}/grid_monthly.parquet' g LEFT JOIN tot t USING (cell_id, year, month)
        GROUP BY g.cell_id, g.year, g.month ORDER BY g.year, g.month, g.cell_id
        ) TO '{out}/grid_monthly_total.parquet' (FORMAT parquet, COMPRESSION zstd)""")

    con.execute(f"""
        COPY (
        SELECT cell_id, any_value(lat) AS lat, any_value(lon) AS lon, any_value(bioma) AS bioma, month,
               median(n_harmonized) AS median, quantile_cont(n_harmonized, 0.25) AS p25,
               quantile_cont(n_harmonized, 0.75) AS p75, count(*)::INTEGER AS n_years
        FROM '{out}/grid_monthly_total.parquet' WHERE year BETWEEN {b0} AND {b1}
        GROUP BY cell_id, month ORDER BY cell_id, month
        ) TO '{out}/climatology.parquet' (FORMAT parquet, COMPRESSION zstd)""")

    json.dump({"common_error_c": c, "common_error_target_coverage": cfg["level2"]["common_error_target_coverage"],
               "interval_formula": "total ± 1.96 * sqrt(sum(w^2 * var_harmonized) + (c * total)^2)",
               "observed_until": obs_until, "series_end": cfg["periods"]["series_end"],
               "partial_month": cfg["periods"]["partial_month"], "climatology_base": [b0, b1],
               "unit": "focos MODIS-Aqua-equivalentes", "cell_deg": cfg["grid"]["cell_deg"]},
              open(out / "harmonization_params.json", "w"), ensure_ascii=False, indent=1)

    # --- conferências --------------------------------------------------------
    for f in ["grid_monthly", "grid_monthly_total", "climatology"]:
        n = con.execute(f"SELECT count(*) FROM '{out}/{f}.parquet'").fetchone()[0]
        cols = con.execute(f"DESCRIBE SELECT * FROM '{out}/{f}.parquet'").df()
        print(f"\n{f}.parquet: {n:,} linhas, {(out / (f + '.parquet')).stat().st_size / 1e6:.1f} MB")
        print("  " + ", ".join(f"{r.column_name}:{r.column_type}" for r in cols.itertuples()))
    print("\nsérie harmonizada do Brasil por ano (dia + noite):")
    print(con.execute(f"""SELECT year, any_value(source_flag) fonte, count(DISTINCT month) meses, round(sum(n_harmonized)) n_harmonized,
        sum(n_modis) n_modis, round(sum(n_viirs_harmonized)) n_viirs_harmonized, round(sum(lo95)) soma_lo95_celulas
        FROM '{out}/grid_monthly_total.parquet' GROUP BY 1 ORDER BY 1""").df().to_string(index=False))
    chk = con.execute(f"""SELECT sum((n_harmonized IS NULL)::INT) nulos, sum((source_flag='modeled_viirs' AND lo95 IS NULL)::INT) modelado_sem_ic,
        sum((source_flag='observed_modis' AND lo95 IS NOT NULL)::INT) observado_com_ic FROM '{out}/grid_monthly_total.parquet'""").fetchone()
    print("conferência (nulos em n_harmonized, modelado sem intervalo, observado com intervalo):", chk)


if __name__ == "__main__":
    main()
