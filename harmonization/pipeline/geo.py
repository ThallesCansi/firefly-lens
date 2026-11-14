"""Geometrias do IBGE (via geobr) e atribuição de bioma a pontos."""

from __future__ import annotations

import geopandas as gpd
import numpy as np
import shapely

from common import path_of


def load_geo(cfg: dict):
    """Polígono do Brasil e os 6 biomas (com cache em data/geo)."""
    geo = path_of(cfg, "geo")
    country = gpd.read_parquet(geo / "brazil_country_2020.parquet").geometry.union_all()
    cache = geo / "biomes_2019.parquet"
    if cache.exists():
        bi = gpd.read_parquet(cache)
    else:
        import geobr
        bi = geobr.read_biomes(year=2019, simplified=False)
        bi.to_parquet(cache)
    bi = bi[bi["name_biome"].isin(cfg["biomes"]["keep"])]
    missing = set(cfg["biomes"]["keep"]) - set(bi["name_biome"])
    if missing:
        raise RuntimeError(f"biomas ausentes no geobr: {missing}")
    biomes = [(r.name_biome, r.geometry) for r in bi.itertuples()]
    shapely.prepare(country)
    for _, g in biomes:
        shapely.prepare(g)
    return country, biomes


def assign_biome(lon: np.ndarray, lat: np.ndarray, country, biomes):
    """Devolve (dentro_do_brasil, bioma, órfão). Órfão = dentro do Brasil sem bioma -> mais próximo."""
    n = len(lon)
    idx = np.full(n, -1, dtype=np.int8)
    for i, (_, g) in enumerate(biomes):
        x0, y0, x1, y1 = g.bounds
        cand = (idx < 0) & (lon >= x0) & (lon <= x1) & (lat >= y0) & (lat <= y1)
        if cand.any():
            hit = shapely.contains_xy(g, lon[cand], lat[cand])
            where = np.flatnonzero(cand)[hit]
            idx[where] = i
    inside = shapely.contains_xy(country, lon, lat)
    orphan = inside & (idx < 0)
    if orphan.any():
        pts = shapely.points(lon[orphan], lat[orphan])
        dist = np.column_stack([shapely.distance(pts, g) for _, g in biomes])
        idx[orphan] = dist.argmin(axis=1)
    names = np.array([b for b, _ in biomes] + [None], dtype=object)
    return inside, names[idx], orphan
