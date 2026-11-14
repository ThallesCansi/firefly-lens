# Metodologia

## 1. Objetivo

Série mensal única de focos de calor para o Brasil em escala **MODIS-Aqua-equivalente**, de jul/2002
em diante, em que o sensor de origem deixa de importar. Até 2025 a série é o MODIS Aqua observado;
a partir de 2026 é o VIIRS NOAA-20 convertido para a escala do Aqua.

## 2. Decisões de desenho

| Decisão | Valor |
|---|---|
| Unidade da série | Focos MODIS-Aqua-equivalentes |
| Satélites no modelo | MODIS Aqua e VIIRS NOAA-20. Terra, S-NPP e NOAA-21 ficam fora do modelo |
| Calibração | Sobreposição Aqua × NOAA-20, abr/2018–dez/2023, processamento SP, sem ago/2020 e abr/2022 (decisão revista em 14/11/2026 após a Etapa 4; o plano original era 2018–2025) |
| Unidade de modelagem | Célula de 0,25° × mês × dia/noite |
| Estratos | 6 biomas do IBGE (`geobr.read_biomes`) |
| Métodos | Nível 1: fator de escala (baseline). Nível 2: GLM binomial negativo (principal) |
| Validação | Leave-one-year-out em 2018–2023 e teste fora da amostra em 2024–2026 (anos com deriva do Aqua) |

Decisões tomadas em 14/11/2026, antes da Etapa 0:

1. **NOAA-21:** só o NOAA-20 alimenta `n_viirs_*` e o modelo, porque a calibração é de um satélite só.
   O NOAA-21 entra apenas no arquivo de focos.
2. **2026:** usa SP onde existir e NRT só na cauda; a coluna `processing` marca cada linha.
3. **Filtro `type`:** aplicado só onde a coluna existe (SP). O trecho NRT fica sem esse filtro
   (ver Limitações).
4. **Mês corrente:** a série vai até out/2026; nov/2026 entra marcado com `is_partial = true`.
5. **Arquivo de focos:** mesmo conjunto filtrado usado no modelo (Aqua, NOAA-20, e NOAA-21 em 2026).
6. **`n_viirs_harmonized` em 2018–2025:** vem do modelo final, ajustado com todos os anos. As
   métricas fora da amostra são reportadas à parte.

## 3. Dados

Disponibilidade na API do FIRMS, consultada em 14/11/2026:

| Fonte | Início | Fim |
|---|---|---|
| `MODIS_SP` | 2000-11-01 | 2026-08-31 |
| `MODIS_NRT` | 2026-09-01 | 2026-11-14 |
| `VIIRS_NOAA20_SP` | 2018-04-01 | 2026-07-31 |
| `VIIRS_NOAA20_NRT` | 2026-08-01 | 2026-11-14 |
| `VIIRS_NOAA21_SP` | 2023-03-01 | 2026-07-31 |
| `VIIRS_NOAA21_NRT` | 2024-01-17 | 2026-11-14 |

Consequências: o NOAA-20 SP começa em abril de 2018, então 2018 é um ano parcial na calibração; e
2026 é SP até julho (VIIRS) ou agosto (MODIS), com NRT apenas depois disso.

### Ingestão (Etapa 1)

**Arquivos anuais por país (SP).** Os ZIPs do FIRMS trazem um CSV por país. Como o servidor aceita
requisições parciais, o pipeline lê o índice de cada ZIP e baixa só o CSV do Brasil (cerca de 0,5 GB
no total, em vez de 4,7 GB).

**2026 pela API.** Janelas de 5 dias sobre a caixa envolvente, usando a fonte SP até a data em que ela
existe e a fonte NRT depois; as linhas fora do polígono do Brasil (`geobr.read_country`, 2020, não
simplificado) são removidas.

| Conjunto | Período | Linhas |
|---|---|---|
| MODIS, arquivos anuais (Terra + Aqua) | 2002-01-01 a 2025-12-31 | 9.821.169 (Aqua: 6.173.230) |
| VIIRS NOAA-20, arquivos anuais | 2018-04-01 a 2025-12-31 | 10.830.346 |
| MODIS 2026, API | SP até 31/08, NRT de 01/09 a 14/11 | 198.931 (SP 77.047, NRT 121.884) |
| VIIRS NOAA-20 2026, API | SP até 31/07, NRT de 01/08 a 14/11 | 731.964 (SP 150.751, NRT 581.213) |
| VIIRS NOAA-21 2026, API | SP até 31/07, NRT de 01/08 a 14/11 | 714.571 (SP 148.296, NRT 566.275) |

**Verificação de consistência entre as duas fontes.** Para saber se "API + recorte pelo geobr" é
comparável ao arquivo anual, baixamos pela API três janelas de 5 dias já cobertas pelos arquivos
anuais e comparamos as contagens dentro do polígono do Brasil:

| Fonte e janela | API recortada | Arquivo anual dentro do polígono | Diferença |
|---|---|---|---|
| VIIRS NOAA-20, 01–05/09/2025 | 35.081 | 35.081 | 0 |
| MODIS, 01–05/09/2025 | 8.400 | 8.400 | 0 |
| VIIRS NOAA-20, 20–24/08/2019 | 48.267 | 48.199 | +68 (0,14%) |

Além disso, entre 0,04% e 0,13% das linhas dos arquivos anuais caem fora do polígono do `geobr`
(o FIRMS usa outro contorno de país). A Etapa 2 aplica o mesmo polígono a todos os anos, o que
elimina essa diferença.

**Coluna `type`.** Existe em todos os dados SP e não existe nos NRT. Nos arquivos anuais, `type != 0`
soma 1,3% das linhas, tanto no MODIS quanto no VIIRS; no trecho SP de 2026 (janeiro a julho, fora da
estação de fogo) chega a 6,3% no VIIRS, porque as fontes estáticas pesam mais quando há pouco fogo.

## 4. Filtros e padronização

Aplicados nesta ordem a cada arquivo bruto (`pipeline/02_filter.py`):

1. **Satélite.** No MODIS fica só o Aqua (`satellite = 'Aqua'`); sai 37% do MODIS.
2. **Confiança.** MODIS com `confidence >= 30` (sai 4,6% do Aqua); VIIRS nominal ou high (sai 9,1%).
3. **`type`.** Fica `type = 0` (fogo presumido em vegetação). As linhas NRT não têm essa coluna e passam.
4. **Duplicatas exatas** (mesma latitude, longitude, data, hora e satélite): só 6 linhas em todo o conjunto.
5. **Brasil e bioma.** O ponto precisa estar dentro do polígono `geobr.read_country` (2020). O bioma é
   o polígono do IBGE (`geobr.read_biomes`, 2019) que contém o ponto; 604 pontos (0,004%) ficam na
   faixa do "Sistema Costeiro" ou em frestas e recebem o bioma mais próximo.

Resultado: 16.947.392 focos, sendo 5.954.870 do Aqua, 10.354.954 do NOAA-20 e 637.568 do NOAA-21.

**Classe de confiança harmonizada.** MODIS: low abaixo de 30, nominal de 30 a 79, high a partir de 80.
VIIRS: `l`, `n`, `h`. Depois do filtro só restam nominal e high.

**Sensibilidade ao limiar de confiança do MODIS.** Com `confidence >= 50` restariam 5.041.750 focos do
Aqua em 2002–2025, 13,7% a menos que com 30. A série principal usa 30.

**Efeito de não haver `type` no NRT.** Nos dados SP de 2018–2025, depois dos filtros de satélite e
confiança, `type != 0` representa:

| Sensor | Agosto a novembro | Dezembro a julho |
|---|---|---|
| MODIS Aqua | 0,68% | 2,93% |
| VIIRS NOAA-20 | 0,64% | 4,03% |

A cauda NRT de 2026 cobre agosto/setembro a novembro, então o excesso esperado é de cerca de 0,7%,
e quase igual nos dois sensores. O efeito sobre a razão MODIS/VIIRS é desprezível nessa época; seria
relevante se o NRT cobrisse a estação chuvosa.

**Datas em UTC.** `year` e `month` vêm da data UTC. As passagens sobre o Brasil ocorrem por volta de
17h UTC (dia) e 5h UTC (noite), então a data UTC e a data local coincidem.

**Deriva orbital do Aqua, já visível nos horários.** A hora mediana das detecções diurnas do Aqua
passou de 17,03h UTC (até 2021) para 17,73h UTC (2022 em diante), cerca de 42 minutos mais tarde; à
noite, de 4,90h para 5,62h. O NOAA-20 ficou estável (17,02h e 17,00h). Metade do período de
calibração está no trecho com deriva; o efeito sobre o modelo é avaliado na Etapa 7.

## 5. Grade e VIIRS degradado

**Grade.** Células regulares de 0,25° com origem em (−74°, −34°). Entram as 11.763 células que tocam o
Brasil. Cada célula tem um único bioma, o majoritário entre 100 pontos de amostra (Amazônia 5.720,
Cerrado 2.688, Mata Atlântica 1.648, Caatinga 1.155, Pampa 329, Pantanal 223).

**Tabela de contagens.** Célula × ano × mês × dia/noite, de jul/2002 a nov/2026, incluindo zeros:
6.893.118 linhas. Na calibração (abr/2018–dez/2025), 87,3% das linhas têm `n_modis = 0` e 71,2% têm
`n_viirs_raw = 0`.

**VIIRS degradado (`n_viirs_1km`).** O VIIRS tem pixels de 375 m e o MODIS de 1 km, então um mesmo fogo
gera vários pixels VIIRS. Para aproximar as resoluções, contamos as subcélulas distintas de 0,01°
(~1,1 km) com pelo menos um foco do NOAA-20 no mesmo dia UTC e no mesmo período (dia ou noite), e
somamos no mês. A degradação reduz a contagem em 1,3 a 2,3 vezes conforme o bioma, mas não iguala os
sensores: o VIIRS degradado ainda é 3,7 vezes o MODIS, porque o VIIRS detecta fogos menores.

**Dia e noite são muito diferentes.** De dia o VIIRS degradado é 2,5 a 3,7 vezes o Aqua; à noite, 6 a
15 vezes. O Aqua detecta pouco à noite (175 mil focos noturnos contra 1,43 milhão diurnos na
calibração).

**Correlação entre os contadores (calibração).**

| Escala | Pearson MODIS × VIIRS bruto | Pearson MODIS × VIIRS degradado |
|---|---|---|
| Célula × mês × dia/noite | 0,814 | 0,847 |
| Bioma × mês × dia/noite | 0,875 | 0,912 |
| Brasil × mês | 0,994 | 0,992 |

A degradação ajuda nas escalas finas, onde o modelo é ajustado.

**MODIS sem VIIRS.** Em 1,3% das linhas há foco do Aqua e nenhum do NOAA-20 (41.556 focos, 2,6% do
total do Aqua). Um fator multiplicativo sobre o VIIRS prevê zero nesses casos.

**Quedas do Aqua dentro da calibração.** O Aqua ficou sem dados de 31/03 a 16/04/2022 e teve dados
muito incompletos de 16/08 a 02/09/2020. Nesses meses a razão VIIRS/MODIS salta (10,0 em abr/2022 e 8,1
em ago/2020, contra cerca de 6 no resto). Isso afeta a calibração e também a série "observada".

**Deriva do Aqua acelerando.** A hora mediana das detecções diurnas do Aqua foi de 16,8h UTC (nov/2019)
para 17,5h (nov/2024), 18,1h (nov/2025) e 19,1h (out/2026); o NOAA-20 ficou em 16,8–17,1h. No mesmo
período a razão VIIRS bruto/Aqua de novembro caiu de 4,9 para 3,7, 2,7 e 2,9. A relação entre os dois
sensores não é estacionária a partir de 2024.

## 6. Modelos

**Período de calibração.** Abr/2018 a dez/2023, sem ago/2020 e abr/2022: 1.576.242 linhas célula × mês ×
dia/noite. Os anos de 2024 em diante ficam de fora porque a órbita do Aqua derivou (seção 5); a série
harmonizada fica na escala do Aqua de órbita nominal, coerente com o histórico de 2003–2021.

### Nível 1 — fator de escala (baseline)

Para cada bioma × mês do ano × dia/noite (144 estratos):

    k = (Σ n_modis + m · k_bioma) / (Σ n_viirs_1km + m),   m = 200
    n_hat_L1 = k × n_viirs_1km

`k_bioma` é a razão do bioma × dia/noite somando os 12 meses. O encolhimento só pesa onde há poucos
focos: muda o fator em mais de 20% em 8 estratos, todos noturnos (7 no Pampa e 1 na Caatinga).

Faixas do fator: de dia, entre 0,12 (Caatinga, fevereiro) e 0,55 (Cerrado, março); à noite, entre 0,05
e 0,19. O fator varia bastante ao longo do ano dentro de um mesmo bioma (na Caatinga, de 0,12 a 0,40),
o que justifica estratificar por mês.

Conferência por ano, somando dia e noite (viés = predito / observado − 1):

| Ano | Na calibração | Viés do Nível 1 |
|---|---|---|
| 2018 (abr–dez) | sim | +6,7% |
| 2019 | sim | −0,2% |
| 2020 (sem agosto) | sim | −0,8% |
| 2021 | sim | −0,1% |
| 2022 (sem abril) | sim | −0,2% |
| 2023 | sim | −2,9% |
| 2024 | não | −15,4% |
| 2025 | não | −14,5% |
| 2026 (jan–out) | não | −7,5% |

Nos meses de queda do Aqua o Nível 1 prevê 42% a mais que o observado em ago/2020 e o dobro em
abr/2022, que é o esperado se o Aqua perdeu dados. Em 2024–2026 o Aqua observado fica 8% a 15% acima
do previsto: é o tamanho do efeito da deriva na escala do Brasil.

### Nível 2 — GLM binomial negativo

**Especificação.** Resposta `n_modis`, família binomial negativa NB2, link log. Com
`x = log1p(n_viirs_1km)`:

    n_modis ~ x × bioma + mês + daynight            (plano original)
            + viirs_zero + x² + daynight × x + daynight × x²    (acrescentadas em 14/11/2026)

**Por que a especificação original foi ampliada.** Com só as features do plano, o NB2 superestimava o
total de focos em 44% dentro da própria amostra. A relação entre MODIS e VIIRS não é uma reta em
`log1p`: a inclinação era ditada pelas células de contagem baixa, que são a maioria, e extrapolava mal
nas células de muito fogo (razão predito/observado de 2,9 acima de 200 subcélulas). Além disso, à noite
o modelo previa 9.100 focos em células sem nenhum VIIRS, onde o Aqua viu 689.

**Ajuste.** Máxima verossimilhança, 28 coeficientes mais a dispersão. Como a verossimilhança só depende
dos padrões distintos de (bioma, mês, dia/noite, `n_viirs_1km`, `n_modis`), o ajuste é feito sobre os
41.891 padrões com pesos de frequência, o que é exato e leva segundos. Os coeficientes vêm de um GLM
com `alpha` fixo e `alpha` vem da verossimilhança perfilada.

| Modelo | Parâmetros | AIC | Predito / observado | Zeros previstos |
|---|---|---|---|---|
| Poisson (mesmas features) | 28 | 1.507.096 | 1,000 | 84,4% |
| NB2 do plano original | 25 | 1.406.650 | 1,444 | 85,9% |
| NB2 sem `bioma × x` | 24 | 1.381.207 | 0,998 | 85,8% |
| **NB2 principal** | 29 | **1.377.377** | **1,000** | 85,8% |
| Observado | — | — | — | 87,2% |

Dispersão: `alpha` = 0,564 (erro padrão 0,004). O Poisson perde por 130 mil pontos de AIC; a interação
com bioma vale 3.800 pontos.

**Leitura dos coeficientes.** A inclinação em `x` é 1,61 de dia na Amazônia, com curvatura negativa
(−0,067 em `x²`); à noite a inclinação é maior (+1,08) e a curvatura mais forte (−0,14). Células sem
VIIRS têm média 0,60 vezes a que a curva daria em `x = 0`. O efeito do mês vai de 1,00 (janeiro) a
1,42 (julho).

**Excesso de zeros.** O modelo prevê 85,8% de zeros e o observado é 87,2%, diferença de 1,4 ponto
percentual (2,2 de dia e 0,6 à noite). Não usamos modelo *zero-inflated*.

**Onde o ajuste ainda falha (dentro da amostra).**

- Por faixa de `n_viirs_1km`, de dia a razão predito/observado fica entre 0,94 e 1,10 em todas as faixas.
- À noite há erro nas pontas: 2,3 nas células sem VIIRS (1.561 previstos contra 689) e 0,26 a 0,59
  acima de 200 subcélulas (315 linhas, 12.932 focos observados).
- Por bioma: Pantanal de dia +23%; à noite, Mata Atlântica −34%, Pampa −35% e Pantanal −25%. A
  Amazônia e o Cerrado, que somam 78% dos focos, ficam dentro de ±8%.
- Por mês: entre −9% (maio e junho) e +10% (fevereiro).

**Incerteza.** Simulação paramétrica com 500 réplicas: os coeficientes e `alpha` são sorteados de uma
normal multivariada com a covariância estimada e, para cada réplica, sorteia-se uma contagem NB2 por
célula × mês. Guardamos por célula × mês a média, a variância e os percentis 2,5 e 97,5, e também a
soma simulada por bioma × mês × dia/noite em cada réplica.

**Agregação para polígonos.** O backend pode somar as médias e as variâncias das células do polígono e
usar uma aproximação normal: `total ± 1,96 × sqrt(Σ variâncias)`. Limitações dessa soma: ela supõe
independência entre células, o que ignora (a) a incerteza dos coeficientes, que é comum a todas as
células, e (b) a correlação espacial dos resíduos, porque fogos grandes atravessam células vizinhas.
O intervalo resultante tende a ser estreito demais; a cobertura real é medida na Etapa 7.

**Células sem VIIRS.** São 71,8% das linhas e respondem por 2,7% do total previsto (44.297 focos
previstos contra 47.308 observados em abr/2018–nov/2026).

## 7. Validação

**Desenho.** (a) *Leave-one-year-out* (LOYO) nos seis anos de calibração: para cada ano, os dois modelos
são reajustados sem ele e avaliados nele. (b) Teste fora da amostra em 2024, 2025 e 2026 (janeiro a
outubro) com os modelos finais. O "VIIRS bruto" é a referência ingênua, sem correção. As métricas e os
gráficos são gerados por `pipeline/07_validate.py`.

**Métricas.** Viés relativo = Σ previsto / Σ observado − 1. MAE em log1p = média de
|log1p(previsto) − log1p(observado)|. Anomalia = valor menos a média do mesmo mês do ano na mesma
unidade. Cobertura = fração das observações dentro do intervalo de 95% do Nível 2.

### Resultado no LOYO (2018–2023)

| Escala | Método | Viés | MAE log1p | Pearson das anomalias | Cobertura de 95% |
|---|---|---|---|---|---|
| Célula × mês × dia/noite | VIIRS bruto | +506% | 0,384 | 0,791 | — |
| | Nível 1 | −0,3% | 0,129 | 0,877 | — |
| | Nível 2 | −0,1% | 0,136 | 0,853 | 98,9% |
| Bioma × mês | VIIRS bruto | +506% | 1,804 | 0,978 | — |
| | Nível 1 | −0,3% | 0,151 | 0,982 | — |
| | Nível 2 | −0,1% | 0,187 | 0,975 | 55,5% |
| Brasil × mês | VIIRS bruto | +506% | 1,766 | 0,981 | — |
| | Nível 1 | −0,3% | 0,072 | 0,981 | — |
| | Nível 2 | −0,1% | 0,096 | 0,975 | 31,3% |

**Veredito Nível 1 × Nível 2.** Os dois eliminam o viés de +506% do VIIRS bruto e reduzem o erro em
escala log de 1,77 para menos de 0,10 na escala do Brasil. O Nível 1 é um pouco melhor que o Nível 2 em
todas as escalas, tanto em erro quanto em correlação de anomalias. O Nível 2 tem duas vantagens: prevê
focos em células sem VIIRS e fornece incerteza. A incerteza, porém, só está calibrada na escala da
célula.

**Os intervalos agregados são estreitos demais.** Na célula, 98,9% das observações caem no intervalo
de 95%. Em bioma × mês caem 55% e em Brasil × mês, 31%. A aproximação normal que soma variâncias dá
praticamente o mesmo (56% e 33%). A causa é a hipótese de independência entre células: os erros do
modelo são correlacionados no espaço e no tempo (um mês em que o Aqua passou mais cedo ou mais tarde,
ou com mais nuvem, desloca todas as células juntas). O erro típico em bioma × mês é de 19% e em
Brasil × mês de 10%, muito maior que a largura dos intervalos simulados.

### Ranking dos meses e dos anos (Spearman, por bioma)

| Bioma | Meses, Nível 1 | Meses, Nível 2 | Anos 2018–2026, Nível 1 | Anos 2018–2026, Nível 2 |
|---|---|---|---|---|
| Brasil | 1,000 | 0,993 | 0,983 | 0,967 |
| Amazônia | 0,993 | 0,993 | 1,000 | 0,983 |
| Cerrado | 1,000 | 1,000 | 0,983 | 0,983 |
| Caatinga | 1,000 | 0,958 | 0,817 | 0,767 |
| Mata Atlântica | 1,000 | 0,937 | 0,883 | 0,883 |
| Pantanal | 0,993 | 0,993 | 0,983 | 0,983 |
| Pampa | 0,986 | 0,937 | 0,883 | 0,950 |

Com o Nível 1, os três piores meses do ano coincidem com os do MODIS em todos os biomas e no Brasil.
Com o Nível 2 coincidem no Brasil, na Amazônia, no Cerrado, na Caatinga e no Pantanal; na Mata
Atlântica e no Pampa um dos três troca. O ranking dos anos de 2018–2026 inclui os anos com deriva.

### Fora da amostra, 2024–2026

| Ano | MODIS Aqua | Nível 1 | Nível 2 | Viés N1 | Viés N2 | MAE log1p Brasil × mês (N1 / N2) |
|---|---|---|---|---|---|---|
| 2024 | 299.295 | 253.236 | 250.419 | −15,4% | −16,3% | 0,192 / 0,193 |
| 2025 | 140.712 | 120.367 | 118.594 | −14,5% | −15,7% | 0,174 / 0,184 |
| 2026 (jan–out) | 103.961 | 96.172 | 95.802 | −7,5% | −7,8% | 0,121 / 0,130 |

No LOYO o viés anual fica entre −4% e +2% de 2019 a 2023 (+6% a +8% em 2018, primeiro ano do NOAA-20).
A partir de 2024 o Aqua observado fica 8% a 16% acima do VIIRS harmonizado. Como o NOAA-20 manteve o
horário e o Aqua passou a cruzar 0,5 a 2 horas mais tarde, mais perto do pico de queima da tarde,
atribuímos essa diferença à deriva orbital do Aqua e não ao modelo. A consequência é que, nesses anos,
o Aqua deixou de ser uma referência estável, e o teste de 2026 mede a soma do erro do modelo com a deriva.

Em 2026, mês a mês, o VIIRS harmonizado fica dentro de ±6% do Aqua em julho, agosto e setembro e 20% a
25% abaixo em janeiro, maio, junho e outubro.

### Figuras (`output/figures/`)

- `before_after_brazil.png`: série mensal do Brasil 2003–2026 com MODIS observado, VIIRS bruto e VIIRS
  harmonizado com faixa de 95% (escala log). `before_after_brazil_zoom.png`: 2018–2026 em escala linear.
- `scatter_by_biome.png`: observado × previsto por bioma e mês.
- `residuals_time.png`: resíduo mensal do Brasil, com as quedas do Aqua e o fim da calibração marcados.
- `calendar_heatmaps.png`: calendário ano × mês do Brasil e de cada bioma (viridis, escala log).
- `level1_factors.png`: fatores do Nível 1.

## 8. Série final

**Regras.**

- Até 2025: `n_harmonized = n_modis` (`source_flag = "observed_modis"`).
- De abr/2018 a 2025: `n_viirs_harmonized` também é guardado, para mostrar a concordância.
- De 2026 em diante: `n_harmonized = n_viirs_harmonized` (`source_flag = "modeled_viirs"`), com variância
  e intervalo de 95%.
- Nov/2026 tem dados até o dia 14 e vai marcado com `is_partial = true`; a série completa termina em out/2026.

**Intervalo para somas de células.** `total ± 1,96 · sqrt(Σ var + (c · total)²)`, com `c = 0,213`. O termo
`c · total` representa o erro comum a todas as células de um mês, que a soma de variâncias ignora. `c` foi
calibrado para 95% de cobertura em bioma × mês no leave-one-year-out:

| Escala | Sem `c` | Com `c` |
|---|---|---|
| Bioma × mês, LOYO 2018–2023 | 56,2% | 94,8% |
| Brasil × mês, LOYO 2018–2023 | 32,8% | 100% |
| Bioma × mês, 2024–2026 | 48,0% | 88,2% |
| Brasil × mês, 2024–2026 | 20,6% | 94,1% |

Por bioma, no LOYO, a cobertura com `c` vai de 82% (Caatinga) a 100% (Amazônia). O intervalo fica largo
demais na escala do Brasil e um pouco estreito na Caatinga: um único `c` é um compromisso.

**Climatologia.** Por célula × mês do ano, mediana e quartis de `n_harmonized` em 2003–2025.

**Mediana de um polígono.** Deve ser a mediana das somas anuais do polígono, e não a soma das medianas
das células. No Brasil, em setembro, a mediana das somas é 65.527 e a soma das medianas das células é
41.668, 36% a menos. `pipeline/fire_calendar.py::calendar_for_polygon` faz a conta certa.

## 9. Limitações

- **Deriva orbital do Aqua.** O horário de passagem do Aqua derivou cerca de 0,5 hora até 2024 e 2 horas
  até 2026. A calibração usa só 2018–2023. Consequências: (a) o Aqua observado de 2024 e 2025, que entra
  na série como "observado", está 15% a 16% acima da escala do Aqua de órbita nominal; (b) há um degrau
  para baixo na passagem de 2025 (observado, com deriva) para 2026 (modelado, na escala nominal); (c) o
  teste fora da amostra de 2024–2026 mede a soma do erro do modelo com a deriva.
- **Quedas do Aqua.** Ago/2020 (16/08 a 02/09) e abr/2022 (31/03 a 16/04) estão subcontados na série
  observada; o VIIRS harmonizado indica cerca de 42% e 100% a mais, respectivamente. Há outros meses com
  2 a 7 dias sem detecção (ago/2002, por exemplo) que não foram tratados.
- **Independência entre células.** A soma de variâncias supõe independência. O termo de erro comum `c`
  corrige isso de forma global, mas não por tamanho de polígono: polígonos pequenos, dominados por poucas
  células, podem ter intervalo otimista ou pessimista.
- **NRT × SP.** De agosto/setembro de 2026 em diante os dados são NRT: sem a coluna `type` (excesso
  estimado de 0,7% nos dois sensores) e com geolocalização preliminar. Quando o SP sair, vale reprocessar.
- **Ausência do Terra e do S-NPP.** A série começa em jul/2002 e só tem a passagem da tarde/madrugada.
  A calibração tem um único satélite VIIRS (NOAA-20) e seis anos.
- **2018.** O NOAA-20 SP começa em abr/2018 e o viés fora da amostra nesse ano é de +6% a +8%.
- **Noite.** O Aqua detecta pouco à noite (11% dos focos). O modelo erra mais à noite na Mata Atlântica,
  no Pampa e no Pantanal (−25% a −35% dentro da amostra).
- **Anomalia do Atlântico Sul.** O VIIRS tem falsos alarmes noturnos na região da anomalia, que cobre
  boa parte do Brasil. Usamos só confiança nominal e alta e `type = 0`, o que remove parte deles; não
  aplicamos filtro específico.
- **Bioma por célula.** Cada célula de 0,25° tem um único bioma (o majoritário); células de transição
  recebem o fator ou os coeficientes de um bioma só.
- **Datas em UTC.** Meses e dias são UTC; para o Brasil isso coincide com a data local nas duas passagens.
- **Mês corrente.** Nov/2026 é parcial e não deve ser comparado à mediana de meses cheios.
- **Unidade.** A série está em "focos MODIS-Aqua-equivalentes", não em número de incêndios nem em área
  queimada.
