"""Contornos das regiões prontas do aplicativo -> pipeline/presets.geojson.

Fontes (IBGE via geobr):
  amazon    bioma Amazônia (geobr.read_biomes(year=2019)) ∩ caixa [-62, -13, -50, -5]
  matopiba  união das 31 microrregiões IBGE da delimitação oficial Embrapa/GITE (2015),
            337 municípios — Nota Técnica 1, Tabela 1:
            https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1037313/1/NT1DelimitacaoMatopiba.pdf
            (geobr.read_micro_region(year=2015))
  pantanal  bioma Pantanal (IBGE 2019)
  caatinga  bioma Caatinga (IBGE 2019)
  pampa     bioma Pampa (IBGE 2019)

Cada contorno perde partes/buracos < 0,05 grau², é simplificado (preservando a topologia)
até no máximo 600 vértices e arredondado a 4 casas decimais. O arquivo é lido por
09_app_data.py (meta.json) e, através de meta.json, pelos exports de analytics/.

Uso (a partir de harmonization/):  uv run python pipeline/build_presets.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import geobr
import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import MultiPolygon, Polygon, box, mapping
from shapely.geometry.polygon import orient

OUT = Path(__file__).resolve().parent / "presets.geojson"
MIN_AREA = 0.05          # grau²: ilhas, lascas e buracos menores são descartados
MAX_VERTICES = 600
NDIGITS = 4
# Albers cônica (SIRGAS/GRS80) só para relatar áreas em km².
ALBERS = Transformer.from_crs(4326, "+proj=aea +lat_1=-2 +lat_2=-22 +lat_0=-12 +lon_0=-54 +ellps=GRS80", always_xy=True)

# Embrapa GITE (2015), NT1 Tabela 1: 31 microrregiões IBGE (códigos de 2015).
MATOPIBA_MICRO = (
    [17001, 17002, 17003, 17004, 17005, 17006, 17007, 17008]                     # TO (8, 139 mun.)
    + [21004, 21006] + list(range(21009, 21022))                                 # MA (15, 135 mun.)
    + [22007, 22008, 22010, 22012]                                               # PI (4, 33 mun.)
    + [29001, 29002, 29003, 29007]                                               # BA (4, 30 mun.)
)

PRESETS = [
    {"id": "amazon", "name": "Southern Amazon",
     "place": "Brazil, arc of deforestation (Pará, Mato Grosso, Rondônia)",
     "source": "IBGE 2019 Amazon biome (geobr read_biomes, year=2019) clipped to [-62, -13, -50, -5]"},
    {"id": "matopiba", "name": "Matopiba",
     "place": "Brazil, Cerrado frontier (Maranhão, Tocantins, Piauí, Bahia)",
     "source": "Embrapa GITE 2015 delimitation: union of 31 IBGE microregions / 337 municipalities (geobr read_micro_region, year=2015)"},
    {"id": "pantanal", "name": "Pantanal",
     "place": "Brazil, IBGE Pantanal biome (Mato Grosso, Mato Grosso do Sul)",
     "source": "IBGE 2019 Pantanal biome (geobr read_biomes, year=2019)"},
    {"id": "caatinga", "name": "Sertão",
     "place": "Brazil, Caatinga of the northeast",
     "source": "IBGE 2019 Caatinga biome (geobr read_biomes, year=2019)"},
    {"id": "pampa", "name": "Pampa",
     "place": "Brazil, grasslands of Rio Grande do Sul",
     "source": "IBGE 2019 Pampa biome (geobr read_biomes, year=2019)"},
]


def clean(geom):
    """Polígonos >= MIN_AREA, sem buracos pequenos."""
    geom = shapely.make_valid(geom)
    parts = [p for p in getattr(geom, "geoms", [geom]) if isinstance(p, (Polygon, MultiPolygon))]
    polys = []
    for p in parts:
        polys += list(getattr(p, "geoms", [p]))
    keep = []
    for p in polys:
        if p.area < MIN_AREA:
            continue
        holes = [h for h in p.interiors if Polygon(h).area >= MIN_AREA]
        keep.append(Polygon(p.exterior, holes))
    return MultiPolygon(keep) if len(keep) > 1 else keep[0]


def finish(geom):
    """Simplifica até MAX_VERTICES, arredonda, orienta (externo anti-horário) e valida."""
    tol = 0.002
    while True:
        g = clean(shapely.set_precision(geom.simplify(tol, preserve_topology=True), 10 ** -NDIGITS))
        g = shapely.normalize(g)
        g = MultiPolygon([orient(p, 1.0) for p in g.geoms]) if g.geom_type == "MultiPolygon" else orient(g, 1.0)
        if shapely.get_num_coordinates(g) <= MAX_VERTICES and g.is_valid:
            return g
        tol *= 1.25


def rounded(geom):
    gj = mapping(geom)
    r = lambda ring: [[round(x, NDIGITS), round(y, NDIGITS)] for x, y in ring]
    if gj["type"] == "Polygon":
        return {"type": "Polygon", "coordinates": [r(ring) for ring in gj["coordinates"]]}
    return {"type": "MultiPolygon", "coordinates": [[r(ring) for ring in poly] for poly in gj["coordinates"]]}


def main() -> None:
    biomes = geobr.read_biomes(year=2019, simplified=False).to_crs(4326)
    biome = lambda name: shapely.union_all(biomes.loc[biomes.name_biome == name, "geometry"].to_numpy())
    micro = geobr.read_micro_region(code_micro="all", year=2015, simplified=False).to_crs(4326)
    sel = micro[micro.code_micro.astype(int).isin(MATOPIBA_MICRO)]
    assert len(sel) == 31, f"esperadas 31 microrregiões, achadas {len(sel)}"
    raw = {
        "amazon": biome("Amazônia").intersection(box(-62, -13, -50, -5)),
        "matopiba": shapely.union_all(sel.geometry.to_numpy()),
        "pantanal": biome("Pantanal"),
        "caatinga": biome("Caatinga"),
        "pampa": biome("Pampa"),
    }
    features = []
    for preset in PRESETS:
        g = finish(clean(raw[preset["id"]]))
        geometry = rounded(g)
        check = shapely.geometry.shape(geometry)
        assert check.is_valid and not check.is_empty, preset["id"]
        w, s, e, n = check.bounds
        q = 10 ** NDIGITS
        out = lambda v, f: f(round(v * q, 6)) / q  # para fora, sem erro de ponto flutuante
        bbox = [out(w, math.floor), out(s, math.floor), out(e, math.ceil), out(n, math.ceil)]
        rp = check.representative_point()
        props = {**preset, "bbox": bbox, "representative_point": [round(rp.x, NDIGITS), round(rp.y, NDIGITS)]}
        features.append({"type": "Feature", "properties": props, "geometry": geometry})
        area_km2 = shapely.area(shapely.transform(check, lambda c: np.column_stack(ALBERS.transform(c[:, 0], c[:, 1])))) / 1e6
        print(f"{preset['id']:9s} {geometry['type']:12s} parts={len(getattr(check, 'geoms', [check]))} "
              f"vertices={shapely.get_num_coordinates(check)} area={area_km2:,.0f} km² bbox={bbox} rp={props['representative_point']}")
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()
