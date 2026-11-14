"""Utilidades compartilhadas pelos scripts numerados do pipeline.

Os scripts rodam com `python -I` (modo isolado), então cada um insere esta
pasta no sys.path antes de importar este módulo:

    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from common import load_config, path_of
"""

from __future__ import annotations

import os
import random
from pathlib import Path

import numpy as np
import yaml
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent.parent


def load_config(path: str | Path | None = None) -> dict:
    """Lê o config.yaml da raiz do projeto."""
    with open(path or ROOT / "config.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def path_of(cfg: dict, key: str) -> Path:
    """Devolve o caminho absoluto de cfg['paths'][key], criando a pasta."""
    p = ROOT / cfg["paths"][key]
    p.mkdir(parents=True, exist_ok=True)
    return p


def years(pair: list[int]) -> list[int]:
    """[2018, 2025] -> [2018, 2019, ..., 2025]."""
    return list(range(pair[0], pair[1] + 1))


def get_map_key() -> str:
    """Lê a FIRMS_MAP_KEY do ambiente ou do .env. O valor nunca é impresso."""
    key = os.environ.get("FIRMS_MAP_KEY") or dotenv_values(ROOT / ".env").get("FIRMS_MAP_KEY")
    key = (key or "").strip()
    if not key:
        raise RuntimeError("FIRMS_MAP_KEY ausente: defina no ambiente ou no arquivo .env")
    return key


def redact(text: str, key: str) -> str:
    """Remove a chave de qualquer texto que vá para log ou mensagem de erro."""
    return text.replace(key, "<FIRMS_MAP_KEY>") if key else text


def make_rng(cfg: dict) -> np.random.Generator:
    """Fixa as sementes e devolve o gerador usado nas simulações."""
    seed = int(cfg["project"]["seed"])
    random.seed(seed)
    np.random.seed(seed)
    return np.random.default_rng(seed)


def calib_where(cfg: dict) -> str:
    """Condição SQL das linhas usadas na calibração (sobre grid_counts)."""
    y0, y1 = cfg["periods"]["calibration"]
    excl = ", ".join(f"'{m}'" for m in cfg["periods"].get("calibration_exclude", [])) or "''"
    return (f"year BETWEEN {y0} AND {y1} AND n_viirs_1km IS NOT NULL AND NOT is_partial "
            f"AND strftime(make_date(year, month, 1), '%Y-%m') NOT IN ({excl})")
