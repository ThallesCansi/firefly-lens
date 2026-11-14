"""Nível 2: GLM binomial negativo (NB2) — desenho, ajuste, predição e simulação.

Features (exatamente as aprovadas, regra R2), com x = log1p(n_viirs_1km):
    do plano:                 x, bioma, month (fator), daynight, bioma × x
    aprovadas em 14/11/2026:  viirs_zero = (n_viirs_1km == 0), x², daynight × x, daynight × x²
Fórmula equivalente:
    n_modis ~ x * C(bioma) + C(month) + C(daynight) + viirs_zero + I(x**2) + C(daynight):x + C(daynight):I(x**2)
Níveis de referência: bioma = Amazônia, month = 1, daynight = D.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import sparse

BIOMAS = ["Amazônia", "Caatinga", "Cerrado", "Mata Atlântica", "Pampa", "Pantanal"]


def design(df: pd.DataFrame, interaction: bool = True, extra: bool = True) -> tuple[np.ndarray, list[str]]:
    """Matriz de desenho a partir das colunas bioma, month, daynight, n_viirs_1km."""
    x = np.log1p(df["n_viirs_1km"].to_numpy(dtype=np.float64))
    bio = df["bioma"].to_numpy()
    month = df["month"].to_numpy()
    cols, names = [np.ones(len(df))], ["const"]
    for b in BIOMAS[1:]:
        cols.append((bio == b).astype(np.float64)); names.append(f"bioma[{b}]")
    for m in range(2, 13):
        cols.append((month == m).astype(np.float64)); names.append(f"month[{m}]")
    cols.append((df["daynight"].to_numpy() == "N").astype(np.float64)); names.append("daynight[N]")
    cols.append(x); names.append("log1p(n_viirs_1km)")
    if interaction:
        for b in BIOMAS[1:]:
            cols.append((bio == b) * x); names.append(f"bioma[{b}]:log1p(n_viirs_1km)")
    if extra:
        night = cols[names.index("daynight[N]")]
        cols.append((x == 0).astype(np.float64)); names.append("viirs_zero")
        cols.append(x ** 2); names.append("log1p(n_viirs_1km)^2")
        cols.append(night * x); names.append("daynight[N]:log1p(n_viirs_1km)")
        cols.append(night * x ** 2); names.append("daynight[N]:log1p(n_viirs_1km)^2")
    return np.column_stack(cols), names


class Fit:
    """Resultado de um ajuste: params (betas [+ alpha]), covariância, log-verossimilhança e AIC."""

    def __init__(self, params, cov, llf, k, converged):
        self.params, self.cov, self.llf, self.k, self.converged = params, cov, llf, k, converged
        self.aic = 2 * k - 2 * llf


def aggregate(df: pd.DataFrame) -> pd.DataFrame:
    """Padrões distintos (bioma, month, daynight, n_viirs_1km, n_modis) com a frequência `w`.

    A verossimilhança só depende desses padrões; ajustar sobre eles com pesos de
    frequência dá exatamente o mesmo resultado que ajustar linha a linha, bem mais rápido.
    """
    keys = ["bioma", "month", "daynight", "n_viirs_1km", "n_modis"]
    return df.groupby(keys, observed=True).size().rename("w").reset_index()


def fit_poisson(y, X, w=None) -> Fit:
    r = sm.GLM(y, X, family=sm.families.Poisson(), freq_weights=w).fit()
    return Fit(np.asarray(r.params), np.asarray(r.cov_params()), float(r.llf), X.shape[1], bool(r.converged))


def fit_nb2(y, X, w=None, start_beta=None) -> Fit:
    """NB2 por máxima verossimilhança.

    Os betas vêm de um GLM com alpha fixo (IRLS); alpha vem da maximização da
    verossimilhança perfilada. No NB2 a matriz de informação é bloco-diagonal entre
    os betas e alpha, então a covariância conjunta é montada em blocos: a dos betas
    vem do GLM em alpha-chapéu e a variância de alpha, da curvatura da verossimilhança perfilada.
    """
    from scipy.optimize import minimize_scalar
    state = {"beta": start_beta}

    def glm(alpha):
        r = sm.GLM(y, X, family=sm.families.NegativeBinomial(alpha=alpha), freq_weights=w).fit(start_params=state["beta"])
        state["beta"] = np.asarray(r.params)
        return r

    opt = minimize_scalar(lambda la: -glm(np.exp(la)).llf, bounds=(-4.0, 4.0), method="bounded", options={"xatol": 1e-5})
    alpha = float(np.exp(opt.x))
    r = glm(alpha)
    h = alpha * 1e-3
    d2 = (-glm(alpha + h).llf + 2 * r.llf - glm(alpha - h).llf) / h ** 2      # curvatura de -llf em alpha
    k = X.shape[1]
    cov = np.zeros((k + 1, k + 1))
    cov[:k, :k] = np.asarray(r.cov_params())
    cov[k, k] = 1.0 / d2
    return Fit(np.append(np.asarray(r.params), alpha), cov, float(r.llf), k + 1, bool(r.converged and opt.success))


def predict_mu(X, beta):
    return np.exp(X @ beta)


def prob_zero(mu, alpha):
    return (1.0 + alpha * mu) ** (-1.0 / alpha)


def simulate(X, params, cov, rng, n_sim: int, groups: np.ndarray | None = None, n_groups: int = 0,
             chunk: int = 50_000, q=(2.5, 97.5)):
    """Simulação paramétrica: coeficientes ~ normal multivariada, contagens ~ NB2.

    Devolve (mean, var, lo, hi) por linha e, se `groups` for dado, a matriz
    n_groups × n_sim com a soma das contagens simuladas de cada grupo.
    """
    draws = rng.multivariate_normal(params, cov, size=n_sim)
    betas, alphas = draws[:, :-1].T, np.clip(draws[:, -1], 1e-6, None)
    size = 1.0 / alphas
    n = X.shape[0]
    mean, var = np.empty(n), np.empty(n)
    lo, hi = np.empty(n), np.empty(n)
    gsum = np.zeros((n_groups, n_sim)) if groups is not None else None
    for a in range(0, n, chunk):
        b = min(a + chunk, n)
        mu = np.exp(X[a:b] @ betas)
        p = size / (size + mu)
        y = rng.negative_binomial(size, p).astype(np.float32)
        mean[a:b], var[a:b] = y.mean(axis=1), y.var(axis=1, ddof=1)
        lo[a:b], hi[a:b] = np.percentile(y, q, axis=1)
        if gsum is not None:
            gi = groups[a:b]
            S = sparse.csr_matrix((np.ones(b - a, dtype=np.float32), (gi, np.arange(b - a))), shape=(n_groups, b - a))
            gsum += S @ y
    return mean, var, lo, hi, gsum
