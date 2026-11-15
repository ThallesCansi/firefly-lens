# Harmonização MODIS × VIIRS — Brasil

Pipeline de dados do desafio "Harmonization of MODIS and VIIRS Hot Spots" (NASA Space Apps 2026).
Produz uma série mensal única de focos de calor em escala **MODIS-Aqua-equivalente** e o arquivo de
focos que o aplicativo oferece para download.

Esta pasta cuida da harmonização. O aplicativo Next.js da raiz do repositório lê os arquivos que a
etapa 9 gera em `public/data/brazil/` (contagens diárias por célula, série harmonizada mensal e sua
variância, em blocos de 4°). Nenhum modelo roda no servidor nem no navegador.

A etapa 9 precisa das pastas `data/` e `output/` de uma execução completa do pipeline:

```bash
uv run python -I pipeline/09_app_data.py            # escreve em ../public/data/brazil/
```

Os contornos das regiões prontas (`presets` em `meta.json`) vêm de `pipeline/presets.geojson`, versionado e
gerado por `uv run python pipeline/build_presets.py` (biomas IBGE 2019 e delimitação MATOPIBA da Embrapa/GITE
via geobr). Depois de mudá-los, regenere `public/analytics/` (`analytics/integration/export_site.py`) e as
entradas das regiões prontas em `public/data/weather/snapshots.json` (`analytics/export_weather.py`).

**O que está versionado:** o código, a documentação e as saídas compactas de `output/` (cerca de 25 MB).
**O que não está:** `data/` (downloads e intermediários, ~1 GB) e `output/points/` (focos para download,
187 MB). Os dois são regenerados pelo pipeline.

## Como rodar

Pré-requisitos: [`uv`](https://docs.astral.sh/uv/) e uma MAP_KEY do FIRMS.

```bash
cd harmonization
cp .env.example .env      # preencha FIRMS_MAP_KEY
uv sync                   # cria .venv com Python 3.12 e as dependências
```

Cada etapa é um script numerado, executado a partir desta pasta (`harmonization/`):

```bash
uv run python -I pipeline/01_download.py
```

O `-I` roda o Python em modo isolado, para que nada dentro das pastas de dados baixados seja
importado como código.

| Etapa | Script | O que faz | Estado |
|---|---|---|---|
| 0 | — | Estrutura, ambiente, `config.yaml` | feito |
| 1 | `pipeline/01_download.py` | Baixa os ZIPs anuais e 2026 pela API; salva `data/raw/*.parquet` | feito |
| 2 | `pipeline/02_filter.py` | Filtros, biomas e esquema padronizado | feito |
| 3 | `pipeline/03_points.py` | `output/points/year=*/part.parquet` e `export_points` | feito |
| 4 | `pipeline/04_grid.py` | Grade de 0,25° e contagens mensais | feito |
| 5 | `pipeline/05_level1.py` | Fatores de escala (baseline) | feito |
| 6 | `pipeline/06_level2.py` | GLM binomial negativo e incerteza | feito |
| 7 | `pipeline/07_validate.py` | Leave-one-year-out, teste em 2024–2026 e figuras | feito |
| 8 | `pipeline/08_export.py` | Série final, climatologia e `calendar_for_polygon` | feito |
| 9 | `pipeline/09_app_data.py` | Blocos binários do app em `../public/data/brazil/` | feito |

Todos os parâmetros (anos, limiares, grade, caminhos, semente) estão em `config.yaml`.

## Estrutura

```
config.yaml          parâmetros do pipeline
pipeline/            scripts numerados, common.py e check_NN.py (verificação de cada etapa)
docs/FEATURES.md     dicionário de dados de todos os arquivos gerados
docs/METHODOLOGY.md  dados, filtros, modelos, validação e limitações
data/zips/           temporários do download (apagados ao final de cada arquivo)
data/raw/            Parquet bruto por sensor e ano
data/interim/        tabelas intermediárias
data/geo/            cache de biomas e contorno do Brasil
output/              arquivos finais lidos pelo backend
```

## Notas para o backend

### Download de focos

`pipeline/export_points.py` é a função de referência; depende só de `duckdb`, `shapely` e `pyarrow`.

```python
from export_points import export_points
csv_text = export_points(polygon_geojson, "2024-01-01", "2024-12-31", sensors=["Aqua", "N20"])
```

- `polygon_geojson`: dict ou texto GeoJSON (Polygon, MultiPolygon, Feature ou FeatureCollection), em lon/lat.
- Datas em UTC, intervalo fechado.
- `sensors`: `MODIS`, `VIIRS`, `Aqua`, `N20`, `N21`; `None` devolve todos.
- `out_path`: se informado, grava o CSV em disco e devolve o número de linhas.
- A pasta `output/points/` precisa ir junto com o backend (187 MB). A coluna `year` vem do nome da
  pasta, então leia com `hive_partitioning = true`.
- O NOAA-21 só existe em 2026 e não entra na série harmonizada; avise o usuário de que somar
  N20 + N21 dobra a contagem de VIIRS.

### Arquivos que o backend lê

| Arquivo | Tamanho | Conteúdo |
|---|---|---|
| `output/grid_monthly_total.parquet` | 9,6 MB | Série harmonizada por célula × mês (dia + noite). É o arquivo do calendário |
| `output/grid_monthly.parquet` | 14,5 MB | Idem, separando dia e noite |
| `output/climatology.parquet` | 0,2 MB | Mediana, p25 e p75 por célula × mês do ano (2003–2025) |
| `output/harmonization_params.json` | < 1 kB | Erro comum `c` e metadados |
| `output/points/year=*/part.parquet` | 187 MB | Focos para download |

A coluna a usar no calendário é `n_harmonized`: MODIS Aqua observado até 2025 e VIIRS convertido para a
escala do Aqua a partir de 2026. `source_flag` diz qual dos dois. O dicionário completo está em
`docs/FEATURES.md`.

### Calendário de um polígono

`pipeline/fire_calendar.py` é a função de referência; depende de `duckdb`, `pandas`, `numpy` e `shapely`.

```python
from fire_calendar import calendar_for_polygon
cal = calendar_for_polygon(polygon_geojson, "2003-01", "2026-10")
cal["matrix"]          # {ano: {mês: focos}}
cal["monthly_median"]  # {mês: {median, p25, p75, n_years}}
cal["current"]         # mês final: n, lo95, hi95, median, anomaly_pct, percentile, source_flag
cal["top_months"]      # 5 piores meses
cal["top_years"]       # 5 piores anos (só anos completos)
```

Tempo medido: 0,2 s para um quadrado de 1°, 0,3 s para Mato Grosso, 4,9 s para o Brasil inteiro.

Três regras que o backend precisa respeitar se reimplementar a função:

1. **Mediana histórica do polígono = mediana das somas anuais do polígono**, nunca a soma das medianas
   das células. No Brasil, em setembro, a soma das medianas dá 36% a menos que o valor certo.
2. **Intervalo de 95% do polígono** (só em meses com `source_flag = "modeled_viirs"`):
   `total ± 1,96 · sqrt(Σ w² · var_harmonized + (c · total)²)`, com `c = common_error_c` do JSON e `w` a
   fração da célula dentro do polígono. Não some `lo95` e `hi95` das células: eles valem só para a célula.
   Somar apenas as variâncias supõe independência entre células e dá um intervalo estreito demais.
3. **Mês parcial**: linhas com `is_partial = true` (nov/2026) não devem ser comparadas à mediana de meses
   cheios. Use `series_end` (2026-10) como mês atual.

### O que avisar ao usuário do aplicativo

- A unidade é "focos MODIS-Aqua-equivalentes".
- A partir de 2026 os valores são estimados a partir do VIIRS e têm faixa de incerteza.
- O Aqua derivou de órbita em 2024–2025; nesses dois anos o valor observado está cerca de 15% acima da
  escala do resto da série (detalhes em `docs/METHODOLOGY.md`, seção 9).
