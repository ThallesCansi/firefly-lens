"""Shared Level-1 estimator, unchanged from the Brazilian LOYO pipeline."""


def fit_l1(train, m):
    s = train.groupby(["bioma", "month", "daynight"], observed=True)[["n_modis", "n_viirs_1km"]].sum()
    b = s.groupby(["bioma", "daynight"]).sum()
    kb = (b.n_modis / b.n_viirs_1km).rename("kb")
    s = s.join(kb, on=["bioma", "daynight"])
    s["k"] = (s.n_modis + m * s.kb) / (s.n_viirs_1km + m)
    return s[["k"]].reset_index()
