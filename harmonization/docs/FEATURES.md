# Dicionário de dados

Registro de todas as colunas e features de todos os arquivos gerados pelo pipeline, com a etapa em
que cada uma surgiu. É atualizado ao fim de cada etapa. Nenhuma feature entra no modelo sem estar
declarada aqui.

Formato de cada entrada:

| nome | tipo | definição exata | origem | por que existe | onde é usada | etapa |
|---|---|---|---|---|---|---|

## Arquivos

| Arquivo | Conteúdo | Etapa | Estado |
|---|---|---|---|
| `data/raw/modis_{ano}.parquet` | MODIS do Brasil como veio do FIRMS | 1 | feito |
| `data/raw/viirs_n20_{ano}.parquet` | VIIRS NOAA-20 do Brasil como veio do FIRMS | 1 | feito |
| `data/raw/*_2026_api.parquet` | 2026 pela API (SP + cauda NRT) | 1 | feito |
| `data/interim/filtered/{arquivo}.parquet` | Focos filtrados no esquema padronizado, um arquivo por arquivo bruto | 2 | feito |
| `data/interim/funnel_stage2.csv` | Funil de filtros por arquivo | 2 | feito |
| `output/points/year={ano}/part.parquet` | Focos para download no aplicativo | 3 | feito |
| `data/interim/grid_cells.parquet` | Células da grade de 0,25° | 4 | feito |
| `data/interim/grid_counts.parquet` | Contagens por célula × ano × mês × daynight, com zeros | 4 | feito |
| `output/level1_factors.parquet` | Fatores do Nível 1 | 5 | feito |
| `output/grid_monthly.parquet` | Série harmonizada por célula × mês × daynight | 8 | feito |
| `output/grid_monthly_total.parquet` | Idem, somando dia e noite | 8 | feito |
| `output/climatology.parquet` | Mediana, p25 e p75 por célula × mês do ano | 8 | feito |
| `output/harmonization_params.json` | Erro comum `c` e metadados da série | 8 | feito |
| `output/level2_model.json` | Coeficientes e covariância do Nível 2 | 6 | feito |
| `data/interim/level2_pred.parquet`, `level2_sim_groups.parquet` | Predições e réplicas do Nível 2 | 6 | feito |
| `data/interim/validation_*.parquet`, `output/validation_*.csv` | Validação | 7 | feito |

## Colunas por arquivo

### `data/raw/*.parquet` (Etapa 1)

Vale para os cinco conjuntos: `modis_{ano}`, `viirs_n20_{ano}`, `modis_2026_api`, `viirs_n20_2026_api`
e `viirs_n21_2026_api`. O esquema foi conferido nos cabeçalhos reais dos CSVs do FIRMS; o script
aborta se um cabeçalho vier diferente.

Colunas do FIRMS, mantidas com o nome original:

| nome | tipo | definição exata | origem | por que existe | onde é usada | etapa |
|---|---|---|---|---|---|---|
| `latitude` | DOUBLE | Latitude do centro do pixel, graus decimais | FIRMS | Posição do foco | Etapas 2–4 | 1 |
| `longitude` | DOUBLE | Longitude do centro do pixel, graus decimais | FIRMS | Posição do foco | Etapas 2–4 | 1 |
| `brightness` (MODIS) / `bright_ti4` (VIIRS) | DOUBLE | Temperatura de brilho no canal de fogo (21/22 no MODIS, I-4 no VIIRS), em kelvin | FIRMS | Vem no produto | Não usada | 1 |
| `scan`, `track` | DOUBLE | Tamanho real do pixel nas direções de varredura e de trajetória, em km | FIRMS | Vem no produto | Não usada | 1 |
| `acq_date` | DATE | Data UTC da aquisição | FIRMS | Tempo do foco | Etapas 2–4 | 1 |
| `acq_time` | VARCHAR | Hora UTC da aquisição no formato `HHMM` | FIRMS, **alterada** (ver abaixo) | Tempo do foco e chave de duplicata | Etapa 2 | 1 |
| `satellite` | VARCHAR | `Terra` ou `Aqua` no MODIS; `N20` ou `N21` no VIIRS | FIRMS | Separar o Aqua e os satélites VIIRS | Etapa 2 | 1 |
| `instrument` | VARCHAR | `MODIS` ou `VIIRS` | FIRMS | Identifica o sensor | Etapa 2 | 1 |
| `confidence` | INTEGER (MODIS) / VARCHAR (VIIRS) | 0–100 no MODIS; `l`, `n` ou `h` no VIIRS | FIRMS | Filtro de qualidade | Etapa 2 | 1 |
| `version` | VARCHAR | Coleção e processamento, por exemplo `61.03`, `2`, `6.1NRT`, `2.0NRT` | FIRMS | Rastrear SP × NRT | Verificação | 1 |
| `bright_t31` (MODIS) / `bright_ti5` (VIIRS) | DOUBLE | Temperatura de brilho no canal de fundo, em kelvin | FIRMS | Vem no produto | Não usada | 1 |
| `frp` | DOUBLE | Potência radiativa do fogo, em MW | FIRMS | Vai no arquivo de focos | Etapa 3 | 1 |
| `daynight` | VARCHAR | `D` (dia) ou `N` (noite) | FIRMS | Dimensão de modelagem | Etapas 2–8 | 1 |
| `type` | INTEGER | 0 = fogo presumido em vegetação, 1 = vulcão ativo, 2 = outra fonte estática em terra, 3 = offshore | FIRMS (só SP), **alterada** (ver abaixo) | Filtro de fogo em vegetação | Etapa 2 | 1 |

Colunas adicionadas ou alteradas na Etapa 1:

| nome | tipo | definição exata | origem | por que existe | onde é usada | etapa |
|---|---|---|---|---|---|---|
| `processing` | VARCHAR | `SP` para os arquivos anuais e para as fontes `*_SP` da API; `NRT` para as fontes `*_NRT` da API | Fonte do download | Marcar a origem de cada linha, como pede o plano | Etapas 2, 3, 7 e 8 | 1 |
| `source` | VARCHAR | `archive` para os arquivos anuais; o identificador da fonte na API (por exemplo `MODIS_NRT`) para 2026 | Fonte do download | Rastrear de onde cada linha veio | Verificação | 1 |
| `acq_time` (alterada) | VARCHAR | `lpad(acq_time, 4, '0')`: a API devolve a hora sem zeros à esquerda (`342`), os arquivos anuais devolvem `0342` | `acq_time` do FIRMS | Mesmo formato nas duas fontes; sem isso a chave de duplicata e a hora ficam inconsistentes | Etapa 2 | 1 |
| `type` (alterada) | INTEGER | Nas fontes NRT a coluna não existe e é preenchida com `NULL` | Ausência da coluna no NRT | Mesmo esquema em todos os arquivos | Etapa 2 | 1 |

### `data/interim/filtered/*.parquet` (Etapa 2) — esquema padronizado

Um arquivo para cada arquivo de `data/raw`, com o mesmo nome. Este é o esquema comum a todos os
sensores, reaproveitado no arquivo de focos da Etapa 3.

| nome | tipo | definição exata | origem | por que existe | onde é usada | etapa |
|---|---|---|---|---|---|---|
| `date` | DATE | `acq_date` (data UTC) | `acq_date` | Tempo do foco | Etapas 3, 4 | 2 |
| `time_utc` | VARCHAR | `acq_time[1:2] || ':' || acq_time[3:4]`, formato `HH:MM` | `acq_time` | Hora legível no CSV de focos | Etapa 3; verificação da deriva do Aqua | 2 |
| `lat`, `lon` | DOUBLE | `latitude`, `longitude`, sem alteração | FIRMS | Posição do foco | Etapas 3, 4 | 2 |
| `sensor` | VARCHAR | `instrument`: `MODIS` ou `VIIRS` | `instrument` | Separar os dois sensores | Etapas 3, 4 | 2 |
| `satellite` | VARCHAR | `satellite`: `Aqua`, `N20` ou `N21` | `satellite` | Só `Aqua` e `N20` entram no modelo | Etapas 3, 4 | 2 |
| `confidence_raw` | VARCHAR | `confidence` convertida para texto: `30`–`100` no MODIS, `n`/`h` no VIIRS | `confidence` | Guarda o valor original; permite refazer o teste de sensibilidade com 50 | Etapa 3 | 2 |
| `confidence_class` | VARCHAR | MODIS: `low` se < 30, `high` se >= 80, senão `nominal`. VIIRS: `l`→`low`, `n`→`nominal`, `h`→`high`. Após o filtro só restam `nominal` e `high` | `confidence` | Classe comparável entre sensores | Etapa 3 | 2 |
| `daynight` | VARCHAR | `daynight` do FIRMS: `D` ou `N` | FIRMS | Dimensão de modelagem | Etapas 3–8 | 2 |
| `frp` | DOUBLE | `frp` do FIRMS, em MW | FIRMS | Informação do foco no CSV | Etapa 3 | 2 |
| `bioma` | VARCHAR | Bioma do IBGE (`geobr.read_biomes`, 2019, não simplificado) que contém o ponto. Se o ponto está dentro do Brasil mas em nenhum dos 6 biomas (faixa do "Sistema Costeiro" e frestas), recebe o bioma mais próximo | `lat`, `lon` | Estrato dos modelos | Etapas 3–8 | 2 |
| `processing` | VARCHAR | Igual à Etapa 1: `SP` ou `NRT` | Etapa 1 | Marcar a origem | Etapas 3, 7, 8 | 2 |
| `year` | SMALLINT | `year(date)`, em UTC | `date` | Partição e agregação | Etapas 3–8 | 2 |
| `month` | TINYINT | `month(date)`, em UTC | `date` | Agregação mensal | Etapas 4–8 | 2 |

Colunas do bruto que não seguem adiante: `brightness`/`bright_ti4`, `bright_t31`/`bright_ti5`,
`scan`, `track`, `version`, `type` (já usada no filtro) e `source`.

### `data/interim/funnel_stage2.csv` (Etapa 2)

Uma linha por arquivo: `bruto`, `apos_satelite`, `apos_confianca`, `apos_type`, `apos_duplicatas`,
`final_no_brasil` (contagens cumulativas, na ordem dos filtros), `fora_do_brasil`,
`orfaos_bioma_mais_proximo` e `sensibilidade_conf50_apos_type` (quantas linhas do MODIS restariam
com `confidence >= 50` em vez de 30; só diagnóstico).

### `output/points/year={ano}/part.parquet` (Etapa 3)

Mesmas linhas e mesmas colunas do esquema padronizado da Etapa 2 (16.947.392 focos, 25 partições,
187 MB). Nenhuma coluna nova. Duas diferenças de armazenamento:

| nome | tipo | definição exata | origem | por que existe | onde é usada | etapa |
|---|---|---|---|---|---|---|
| `year` (alterada) | partição Hive | Não está dentro do arquivo: vem do nome da pasta `year={ano}`. Leia com `hive_partitioning = true` | `year` da Etapa 2 | Ler só os anos pedidos | `export_points` | 3 |
| ordenação | — | Linhas ordenadas por `date`, `time_utc`, `satellite`, `lat`, `lon` | — | Saída determinística e melhor compressão | `export_points` | 3 |

O CSV devolvido por `export_points` (`pipeline/export_points.py`) tem as 14 colunas do esquema
padronizado, na mesma ordem, com `year` incluída.

### `data/interim/grid_cells.parquet` (Etapa 4)

11.763 células de 0,25° que tocam o Brasil.

| nome | tipo | definição exata | origem | por que existe | onde é usada | etapa |
|---|---|---|---|---|---|---|
| `ix`, `iy` | INTEGER | Índices da célula: `ix = floor((lon + 74) / 0,01) // 25`, `iy = floor((lat + 34) / 0,01) // 25`. A origem (−74, −34) é o canto sudoeste da grade | `grid.origin`, `grid.cell_deg`, `grid.subcell_deg` | Posição na grade; calculada a partir da subcélula para que cada célula contenha exatamente 25 × 25 subcélulas | Etapa 4 | 4 |
| `cell_id` | INTEGER | `iy * 1000 + ix` | `ix`, `iy` | Chave da célula | Etapas 4–8 | 4 |
| `lat`, `lon` | DOUBLE | Centro da célula: `lat = −34 + (iy + 0,5) × 0,25`, `lon = −74 + (ix + 0,5) × 0,25` | `ix`, `iy` | O backend localiza a célula pelo centro | Etapa 8 | 4 |
| `bioma` | VARCHAR | Bioma majoritário: 100 pontos de amostra por célula (malha regular 10 × 10); entre os que caem dentro do Brasil, o bioma mais frequente (empate: ordem alfabética). 9 células sem nenhum ponto de amostra dentro do Brasil, mas com focos, recebem o bioma mais frequente entre os seus focos | Polígonos do `geobr` | Estrato dos modelos, um único bioma por célula | Etapas 5–8 | 4 |

### `data/interim/grid_counts.parquet` (Etapa 4)

Uma linha por `cell_id` × `year` × `month` × `daynight`, de jul/2002 a nov/2026, incluindo as
combinações sem nenhum foco: 11.763 × 293 × 2 = 6.893.118 linhas.

| nome | tipo | definição exata | origem | por que existe | onde é usada | etapa |
|---|---|---|---|---|---|---|
| `cell_id`, `bioma` | — | Como em `grid_cells` | `grid_cells` | Chave e estrato | Etapas 5–8 | 4 |
| `year`, `month` | SMALLINT, TINYINT | Ano e mês UTC | `date` | Unidade de tempo | Etapas 5–8 | 4 |
| `daynight` | VARCHAR | `D` ou `N` | `daynight` | Dia e noite são modelados em separado | Etapas 5–8 | 4 |
| `n_modis` | INTEGER | Número de focos do MODIS Aqua (após os filtros da Etapa 2) na célula, mês e período do dia. Zero quando não há foco | Pontos com `satellite = 'Aqua'` | Resposta dos modelos e série observada | Etapas 5–8 | 4 |
| `n_viirs_raw` | INTEGER | Número de focos do VIIRS NOAA-20 (pixels de 375 m). `NULL` antes de abr/2018, quando o NOAA-20 não existe | Pontos com `satellite = 'N20'` | Referência ingênua, sem correção | Etapas 7, 8 | 4 |
| `n_viirs_1km` | INTEGER | VIIRS degradado: número de combinações distintas (`date`, `sx`, `sy`) com pelo menos um foco do NOAA-20 na célula, mês e período do dia, em que `sx = floor((lon + 74) / 0,01)` e `sy = floor((lat + 34) / 0,01)` são os índices da subcélula de 0,01° (~1,1 km). Vários pixels de 375 m na mesma subcélula, no mesmo dia UTC e no mesmo período (`daynight`), contam uma vez; órbitas consecutivas sobrepostas também contam uma vez. `NULL` antes de abr/2018 | Pontos com `satellite = 'N20'` | Aproxima a resolução de 1 km do MODIS; é o preditor dos dois modelos | Etapas 5–8 | 4 |
| `is_partial` | BOOLEAN | Verdadeiro para o mês `periods.partial_month` (2026-11, com dados até o dia 14) | `config.yaml` | O mês corrente não pode ser comparado a meses cheios | Etapa 8 e backend | 4 |

### `output/level1_factors.parquet` (Etapa 5)

Uma linha por `bioma` × `month` × `daynight` (144 estratos). Ajustado nas linhas de calibração:
abr/2018 a dez/2023, sem ago/2020 e abr/2022 (quedas do Aqua).

| nome | tipo | definição exata | origem | por que existe | onde é usada | etapa |
|---|---|---|---|---|---|---|
| `bioma`, `month`, `daynight` | — | Chave do estrato (`month` é o mês do ano, 1–12) | `grid_counts` | Estratos do fator | Etapas 7, 8 | 5 |
| `n_rows` | BIGINT | Número de linhas célula × mês no estrato | `grid_counts` | Diagnóstico | Verificação | 5 |
| `sum_modis` | DOUBLE | `Σ n_modis` no estrato | `n_modis` | Numerador do fator | Etapa 5 | 5 |
| `sum_viirs_1km` | DOUBLE | `Σ n_viirs_1km` no estrato | `n_viirs_1km` | Denominador do fator | Etapa 5 | 5 |
| `k_raw` | DOUBLE | `sum_modis / sum_viirs_1km`, sem encolhimento | as duas somas | Mostrar o efeito do encolhimento | Figura | 5 |
| `k_bioma` | DOUBLE | `Σ n_modis / Σ n_viirs_1km` no `bioma` × `daynight`, somando os 12 meses | as duas somas | Alvo do encolhimento | Etapa 5 | 5 |
| `k` | DOUBLE | `(sum_modis + m · k_bioma) / (sum_viirs_1km + m)`, com `m = level1.shrink_prior_n = 200` | `k_bioma`, somas | Fator usado. O encolhimento equivale a acrescentar `m` focos VIIRS fictícios com a razão do bioma; pesa só em estratos com poucas centenas de focos | Etapas 7, 8 | 5 |

Predição do Nível 1 (calculada nas Etapas 7 e 8, não armazenada aqui): `n_hat_L1 = k × n_viirs_1km`.

### `public/data/brazil/` (Etapa 9) — arquivos lidos pelo aplicativo

Gerados por `pipeline/09_app_data.py`. São um recorte compacto das tabelas acima; nenhuma coluna
nova é calculada aqui.

| arquivo | conteúdo | origem |
|---|---|---|
| `t_{tx}_{ty}.bin.gz` | Bloco de 4° × 4° (16 × 16 células de 0,25°). `tx = ix // 16`, `ty = iy // 16`, com `ix`, `iy` de `grid_cells` | ver abaixo |
| `meta.json` | Período, regras da série (`observedUntil`, `seriesEnd`, `partialMonth`), `commonErrorC`, base da climatologia, biomas, regiões prontas e lista de blocos | `harmonization_params.json`, `config.yaml` |
| `brazil.geojson` | Contorno do Brasil simplificado a 0,02° | `geobr.read_country` (2020) |

Colunas de cada bloco (formato binário descrito em `src/lib/data/tiles.ts`):

| nome | tipo | definição exata | origem |
|---|---|---|---|
| `biome` | uint8[256] | Código do bioma de cada célula local (`(iy % 16) * 16 + ix % 16`), na ordem de `meta.biomes`; 255 = fora da grade | `grid_cells.bioma` |
| `day` | uint16 | Dias desde 2002-01-01 (UTC) | `date` dos focos filtrados |
| `aquaD`, `aquaN` | uint16 | Focos do MODIS Aqua na célula e no dia, de dia e de noite | Etapa 2, `satellite = 'Aqua'` |
| `n20D`, `n20N` | uint16 | Focos do VIIRS NOAA-20, de dia e de noite | Etapa 2, `satellite = 'N20'` |
| `n20Km` | uint16 | Subcélulas de 0,01° distintas com foco do NOAA-20 no dia, contadas por período (dia/noite) e somadas. A soma no mês é igual a `n_viirs_1km` da Etapa 4 | Etapa 2 |
| `mu` | float32 | `n_viirs_harmonized` de `grid_monthly_total` (dia + noite), de abr/2018 em diante | Etapa 8 |
| `var` | float32 | `var_harmonized` de `grid_monthly_total`, só nos meses modelados | Etapa 8 |

Só entram as combinações célula × dia com algum foco (3.952.350 linhas no total) e todas as
células × meses com `mu` (1.223.352). No aplicativo, um retângulo soma as células que cobre,
cada uma ponderada pela fração da sua área dentro do retângulo; a variância soma `w² · var`.

## Features do modelo (Nível 2)

Resposta: `n_modis`. Família: binomial negativa NB2, link log. Ajustado nas linhas de calibração
(abr/2018–dez/2023, sem ago/2020 e abr/2022). Níveis de referência: bioma Amazônia, mês 1, dia.
O código que monta a matriz de desenho é `pipeline/nbmodel.py::design`.

| nome | tipo | definição exata | origem | por que existe | onde é usada | etapa |
|---|---|---|---|---|---|---|
| `log1p(n_viirs_1km)` | numérica | `x = ln(1 + n_viirs_1km)` | `n_viirs_1km` | Preditor principal (plano original) | Nível 2 | 6 |
| `bioma` | fator, 5 indicadoras | Bioma majoritário da célula | `grid_cells` | Nível por bioma (plano original) | Nível 2 | 6 |
| `month` | fator, 11 indicadoras | Mês do ano | `month` | Sazonalidade da razão entre sensores (plano original) | Nível 2 | 6 |
| `daynight` | indicadora | 1 se `daynight = 'N'` | `daynight` | O Aqua detecta muito menos à noite (plano original) | Nível 2 | 6 |
| `bioma × log1p(n_viirs_1km)` | interação, 5 colunas | indicadora do bioma × `x` | `bioma`, `n_viirs_1km` | Inclinação por bioma (plano original) | Nível 2 | 6 |
| `viirs_zero` | indicadora | 1 se `n_viirs_1km = 0` | `n_viirs_1km` | As células sem VIIRS têm um nível próprio; sem ela o modelo criava "fogo fantasma" (aprovada em 14/11/2026) | Nível 2 | 6 |
| `log1p(n_viirs_1km)²` | numérica | `x²` | `n_viirs_1km` | Deixa a relação curvar; sem ela as células de muito fogo eram superestimadas em até 3 vezes (aprovada em 14/11/2026) | Nível 2 | 6 |
| `daynight × log1p(n_viirs_1km)` | interação | indicadora de noite × `x` | `daynight`, `n_viirs_1km` | Inclinação própria à noite (aprovada em 14/11/2026) | Nível 2 | 6 |
| `daynight × log1p(n_viirs_1km)²` | interação | indicadora de noite × `x²` | `daynight`, `n_viirs_1km` | Curvatura própria à noite (aprovada em 14/11/2026) | Nível 2 | 6 |

Total: 28 coeficientes mais a dispersão `alpha`.

### `output/level2_model.json` (Etapa 6)

`names` (nomes dos 28 coeficientes + `alpha`), `params`, `cov` (matriz de covariância 29 × 29, em blocos:
coeficientes e `alpha` são independentes), `alpha`, `aic`, `loglik`, `n_obs`, `formula`, `calibration`
e `reference_levels`.

### `data/interim/level2_pred.parquet` (Etapa 6)

Uma linha por célula × ano × mês × daynight com VIIRS disponível (abr/2018–nov/2026): 2.446.704 linhas.

| nome | tipo | definição exata | origem | por que existe | onde é usada | etapa |
|---|---|---|---|---|---|---|
| `cell_id`, `bioma`, `year`, `month`, `daynight`, `n_modis`, `n_viirs_1km` | — | Como em `grid_counts` | `grid_counts` | Chave e observado | Etapas 7, 8 | 6 |
| `mu_L2` | DOUBLE | Média do NB2 com os coeficientes estimados: `exp(X · beta)` | Modelo | Predição pontual do Nível 2 | Etapas 7, 8 | 6 |
| `sim_mean` | DOUBLE | Média das 500 contagens simuladas | Simulação | Média com incerteza dos coeficientes | Etapa 8 | 6 |
| `sim_var` | DOUBLE | Variância amostral das 500 contagens simuladas | Simulação | O backend soma variâncias entre células | Etapa 8 | 6 |
| `sim_p025`, `sim_p975` | DOUBLE | Percentis 2,5 e 97,5 das 500 contagens simuladas | Simulação | Intervalo de 95% por célula | Etapas 7, 8 | 6 |

Simulação: para cada uma das 500 réplicas, os 28 coeficientes e `alpha` são sorteados de uma normal
multivariada com a covariância estimada; depois, para cada linha, sorteia-se uma contagem NB2 com
média `exp(X · beta_s)` e dispersão `alpha_s`. Semente fixa (`project.seed`).

### `data/interim/level2_sim_groups.parquet` (Etapa 6)

Uma linha por `bioma` × `year` × `month` × `daynight` e uma coluna por réplica (`s000` a `s499`): a soma
das contagens simuladas das células do grupo. Serve para calcular intervalos de somas (bioma, Brasil)
sem supor independência dos coeficientes entre células.

### Arquivos da validação (Etapa 7)

`data/interim/validation_pred.parquet`: uma linha por célula × ano × mês × daynight com VIIRS.

| nome | tipo | definição exata | origem | por que existe | onde é usada | etapa |
|---|---|---|---|---|---|---|
| `in_calib` | BOOLEAN | A linha está no conjunto de calibração | `config.yaml` | Separar o que é avaliado | Etapa 7 | 7 |
| `fold` | VARCHAR | `loyo` (previsto por modelos ajustados sem o ano da linha) ou `oos` (2024+, modelos finais) | — | Identificar o tipo de predição | Etapa 7 | 7 |
| `viirs_bruto` | DOUBLE | `n_viirs_raw` | `grid_counts` | Referência ingênua | Etapa 7 | 7 |
| `L1` | DOUBLE | `k × n_viirs_1km`, com `k` ajustado sem o ano da linha (ou final, se `oos`) | Nível 1 | Predição fora da amostra | Etapa 7 | 7 |
| `L2` | DOUBLE | `exp(X · beta)` do NB2 ajustado sem o ano da linha (ou final) | Nível 2 | Predição fora da amostra | Etapa 7 | 7 |
| `L2_var`, `L2_lo`, `L2_hi` | DOUBLE | Variância e percentis 2,5 e 97,5 de 500 réplicas | Simulação | Cobertura | Etapa 7 | 7 |

`data/interim/validation_groups.parquet`: somas simuladas fora da amostra por `bioma` × `year` × `month`
(dia + noite), uma coluna por réplica.

`output/validation_metrics.csv`: `periodo`, `escala`, `metodo`, `n`, `vies_rel_pct`, `mae_log1p`,
`pearson_anomalias`, `cobertura95_pct` (intervalo das réplicas) e `cobertura95_normal_pct`
(aproximação normal somando variâncias).

`output/validation_rankings.csv`: por `bioma` e `metodo`, `spearman_meses`, `top3_meses_iguais`,
`spearman_anos_2018_2023` e `spearman_anos_2018_2026`.

### `output/grid_monthly.parquet` (Etapa 8) — arquivo final

Uma linha por `cell_id` × `year` × `month` × `daynight`, de jul/2002 a nov/2026: 6.893.118 linhas, 14,5 MB.

| nome | tipo | definição exata | origem | por que existe | onde é usada | etapa |
|---|---|---|---|---|---|---|
| `cell_id` | INTEGER | Chave da célula de 0,25° | `grid_cells` | Chave | Backend | 4 |
| `lat`, `lon` | DOUBLE | Centro da célula | `grid_cells` | Localizar a célula | Backend | 4 |
| `bioma` | VARCHAR | Bioma majoritário da célula | `grid_cells` | Filtro por bioma | Backend | 4 |
| `year`, `month` | SMALLINT, TINYINT | Ano e mês UTC | — | Tempo | Backend | 4 |
| `daynight` | VARCHAR | `D` ou `N` | — | Período do dia | Backend | 4 |
| `n_modis` | INTEGER | Focos do MODIS Aqua observados (existe em todos os meses, inclusive 2026) | `grid_counts` | Série observada | Backend | 4 |
| `n_viirs_raw` | INTEGER | Focos do VIIRS NOAA-20; nulo antes de abr/2018 | `grid_counts` | Mostrar o "antes" | Backend | 4 |
| `n_viirs_1km` | INTEGER | VIIRS degradado; nulo antes de abr/2018 | `grid_counts` | Preditor | Diagnóstico | 4 |
| `n_viirs_harmonized` | DOUBLE | `mu_L2`: média do NB2 final, em escala MODIS-Aqua-equivalente; nulo antes de abr/2018 | Nível 2 | VIIRS convertido; em 2018–2025 serve para mostrar a concordância com o MODIS | Backend | 8 |
| `n_harmonized` | DOUBLE | `n_modis` se `year <= 2025`; `n_viirs_harmonized` se `year >= 2026` | `n_modis`, `n_viirs_harmonized` | **A série única do calendário** | Backend | 8 |
| `var_harmonized` | DOUBLE | Variância das 500 réplicas (`sim_var`) nas linhas modeladas; nulo nas observadas | Simulação | O backend soma variâncias no polígono | Backend | 8 |
| `lo95`, `hi95` | DOUBLE | Percentis 2,5 e 97,5 das 500 réplicas nas linhas modeladas; nulo nas observadas | Simulação | Intervalo de 95% **da célula** (não some entre células) | Backend | 8 |
| `source_flag` | VARCHAR | `observed_modis` se `year <= 2025`; `modeled_viirs` se `year >= 2026` | `periods.observed_until` | Dizer ao usuário de onde vem o número | Backend | 8 |
| `is_partial` | BOOLEAN | Verdadeiro em nov/2026 (dados até o dia 14) | config | Não comparar mês incompleto com meses cheios | Backend | 4 |

### `output/grid_monthly_total.parquet` (Etapa 8) — arquivo final

Uma linha por `cell_id` × `year` × `month`, somando dia e noite: 3.446.559 linhas, 9,6 MB. Mesmas colunas,
sem `daynight`. `n_modis`, `n_viirs_raw`, `n_viirs_1km`, `n_viirs_harmonized` e `n_harmonized` são a soma de
dia e noite. `var_harmonized`, `lo95` e `hi95` vêm de uma simulação própria de dia + noite (as mesmas 500
réplicas de coeficientes para os dois períodos), só nas linhas modeladas.

### `output/climatology.parquet` (Etapa 8) — arquivo final

Uma linha por `cell_id` × `month` (mês do ano): 141.156 linhas.

| nome | tipo | definição exata | origem | por que existe | onde é usada | etapa |
|---|---|---|---|---|---|---|
| `cell_id`, `lat`, `lon`, `bioma` | — | Como acima | — | Chave | Backend | 8 |
| `month` | TINYINT | Mês do ano, 1–12 | — | Chave | Backend | 8 |
| `median` | DOUBLE | Mediana de `n_harmonized` (dia + noite) da célula nesse mês, nos anos 2003–2025 | `grid_monthly_total` | Mediana histórica **de uma célula** | Mapas por célula | 8 |
| `p25`, `p75` | DOUBLE | Quartis da mesma distribuição | `grid_monthly_total` | Faixa típica | Mapas por célula | 8 |
| `n_years` | INTEGER | Número de anos na base (23) | — | Conferência | — | 8 |

Não some `median` entre células para obter a mediana de um polígono; veja o README.

### `output/harmonization_params.json` (Etapa 8)

| nome | definição exata | por que existe |
|---|---|---|
| `common_error_c` | 0,213. Menor `c` tal que `L2 ± 1,96 · sqrt(Σ var + (c · L2)²)` cobre 95% das observações em bioma × mês no leave-one-year-out | Alarga o intervalo de somas de células, que sem ele cobria só 56% |
| `interval_formula` | `total ± 1.96 * sqrt(sum(w^2 * var_harmonized) + (c * total)^2)` | Fórmula que o backend aplica a qualquer polígono |
| `observed_until`, `series_end`, `partial_month`, `climatology_base`, `unit`, `cell_deg` | Metadados da série | O backend não precisa repetir constantes |

### Saída de `calendar_for_polygon` (`pipeline/fire_calendar.py`)

| chave | definição exata |
|---|---|
| `matrix` | `{ano: {mês: n}}`: soma de `n_harmonized` (dia + noite) das células, ponderada pela fração da área de cada célula dentro do polígono |
| `matrix_flags` | `observed`, `modeled` ou `partial` para cada ano e mês |
| `monthly_median` | Por mês do ano: mediana, p25 e p75 **das somas do polígono** nos anos 2003–2025 |
| `current` | Mês `end`: `n`, `lo95`, `hi95` (só se modelado), `median`, `anomaly_pct = 100 · (n / median − 1)`, `percentile` (posição de `n` entre os valores do mesmo mês nos anos-base), `source_flag`, `is_partial` |
| `top_months` | Os 5 meses com mais focos no período pedido (meses parciais não entram) |
| `top_years` | Os 5 anos com mais focos, só entre anos com os 12 meses no período pedido |
| `n_cells`, `unit` | Número de células usadas e a unidade |

## Removido ou filtrado

### Etapa 1

Os arquivos anuais não sofreram filtro: o FIRMS já entrega o CSV por país. Em 2026 a API devolve a
caixa envolvente inteira, então as linhas fora do polígono do Brasil (`geobr.read_country`, 2020,
não simplificado) foram removidas:

| Arquivo | Linhas na caixa | Dentro do Brasil | Removidas | Motivo |
|---|---|---|---|---|
| `modis_2026_api` | 283.161 | 198.931 | 84.230 | Fora do polígono do Brasil |
| `viirs_n20_2026_api` | 1.064.993 | 731.964 | 333.029 | Fora do polígono do Brasil |
| `viirs_n21_2026_api` | 1.032.107 | 714.571 | 317.536 | Fora do polígono do Brasil |

Nenhuma coluna do FIRMS foi removida.

### Etapa 2

Filtros aplicados nesta ordem; contagens somadas sobre todos os arquivos (o funil por ano está em
`data/interim/funnel_stage2.csv`).

| Filtro | Regra | MODIS 2002–2025 | MODIS 2026 | NOAA-20 2018–2025 | NOAA-20 2026 | NOAA-21 2026 |
|---|---|---|---|---|---|---|
| Bruto | — | 9.821.169 | 198.931 | 10.830.346 | 731.964 | 714.571 |
| Satélite | MODIS: `satellite = 'Aqua'` | −3.647.939 | −75.459 | 0 | 0 | 0 |
| Confiança | MODIS: `confidence >= 30`; VIIRS: `n` ou `h` | −281.313 | −4.952 | −987.598 | −70.442 | −67.970 |
| `type` | Mantém `type = 0`; linhas NRT (sem `type`) passam | −50.926 | −1.210 | −131.423 | −9.241 | −9.033 |
| Duplicatas | Mesma lat, lon, data, hora e satélite; fica a de maior `frp` | 0 | 0 | −6 | 0 | 0 |
| Fora do Brasil | Fora do polígono `geobr.read_country` | −3.431 | 0 | −8.646 | 0 | 0 |
| **Final** | | **5.837.560** | **117.310** | **9.702.673** | **652.281** | **637.568** |

Pontos dentro do Brasil sem bioma, atribuídos ao bioma mais próximo: 604 no total (0,004%).

### Etapa 3

Nada removido: o arquivo de focos tem exatamente as linhas que saíram da Etapa 2.

### Etapa 4

Nada removido: a soma de `n_modis` (5.954.870) e de `n_viirs_raw` (10.354.954) na grade é igual ao
número de pontos do Aqua e do NOAA-20. O NOAA-21 não entra na grade.

### Etapa 5

Fora do ajuste (não removidas dos arquivos): as linhas de 2024 em diante (deriva do Aqua), ago/2020 e
abr/2022 (quedas do Aqua) e nov/2026 (mês parcial). Restam 1.576.242 linhas célula × mês × daynight.

### Etapa 6

Nada removido. O ajuste usa as mesmas 1.576.242 linhas de calibração da Etapa 5; a simulação cobre
todas as linhas com VIIRS.

### Etapa 7

Nada removido. Nas métricas do LOYO entram só os meses de calibração (ago/2020 e abr/2022 ficam de fora);
nov/2026 (parcial) não é avaliado.

### Etapa 8

Nada removido. Nos anos até 2025 as colunas de incerteza ficam nulas, porque o valor é observado.
