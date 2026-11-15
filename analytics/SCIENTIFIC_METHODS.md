# Métodos, hipóteses e validação

## Dados e unidade

A fonte principal é `harmonization/output/grid_monthly_total.parquet`: contagens mensais por célula, Aqua observado até 2025 e VIIRS harmonizado desde 2026. `harmonization_params.json` fornece grade, erro comum e regras temporais; `public/data/brazil/meta.json` informa as datas exatas. O motor não ajusta nem modifica a calibração MODIS/VIIRS.

O adaptador aplica a fração da célula dentro do polígono, em graus quadrados, como a função de referência `harmonization/pipeline/fire_calendar.py`. Polígonos com mais de 2.000 vértices são simplificados a 0,005° e geometrias inválidas são reparadas, conforme o método existente. Como a função original não expõe pesos nem incerteza para todos os meses, esse pequeno trecho de geometria é reproduzido no adaptador e testado contra a referência em regiões alinhadas e não retangulares. Não há soma de medianas climatológicas de células.

Para um total regional `T = Σ wᵢxᵢ`, preserva-se a faixa modelada `max(0,T−1,96s), T+1,96s`, onde `s² = Σwᵢ²vᵢ+(cT)²`, com c dos metadados. Variância faltante não vira zero silenciosamente. Não se somam os quantis das células. Não há faixas anuais: covariâncias entre meses não foram fornecidas. Essas faixas medem incerteza de harmonização, não erro de previsão temporal.

## Qualidade e referências

Meses parciais iniciais/finais são detectados pela cobertura real, inclusive julho/2002. Meses sem uma célula esperada, duplicados espacialmente ou com valores inválidos produzem ausência/flags, não zeros artificiais. Zero continua sendo zero; falta de máscara de aquisição/nuvem impede interpretá-lo como ausência de incêndios.

São marcados agosto/setembro de 2020 e março/abril de 2022 por falhas documentadas do Aqua; são excluídos por padrão. Isso é mais conservador que a exclusão de dois meses usada na calibração original e **não a altera**. Não é um inventário completo de falhas instrumentais. Os anos 2024–2025 recebem `orbital_drift`; 2026 modelado recebe `harmonized_estimate_not_observed_truth`.

`QualityPolicy` permite sensibilidade: admitir deriva, admitir estimativas em análises descritivas/referências, ou alterar flags excluídas. Previsão sempre exige fonte observada, mesmo se a análise descritiva permite modelados. A referência padrão é 2003–2023 com cinco anos válidos por mês; resultados mostram os anos efetivamente usados, pois exclusões mudam o tamanho da amostra.

## Histórico e climatologia

Totais anuais comparáveis exigem doze meses válidos. Para o restante, `total=null` e o subtotal elegível fica identificado. Variação anual é `100(Tᵧ/Tᵧ₋₁−1)`, somente entre anos completos consecutivos e com denominador positivo. A tendência é OLS dos totais anuais elegíveis contra o ano civil real, com pelo menos três anos; é associação descritiva, sem inferência causal, p-valor ou previsão.

Para cada mês do calendário, calculam-se média, mediana, desvio amostral (`n−1`), mínimo, máximo, MAD não escalado e quantis 10/25/75/90 por interpolação linear na posição `(n−1)p`. A mediana regional é a mediana das somas regionais históricas. Quantidades insuficientes são null com motivo.

## Anomalias sazonais

Para alvo x e referências do mesmo mês: absoluta `x−média`; percentual `100(x−média)/média`; z sazonal `(x−média)/s`; robusto `(x−mediana)/(1,4826 MAD)`; percentil empírico `100(quantidade menor + 0,5 quantidade igual)/n`. Empates usam midrank.

No modo operacional padrão, exclui-se o ano-alvo e qualquer ano futuro; `available_at` também limita a referência. `operational=False` é somente análise retrospectiva, ainda excluindo o alvo, e deve ser identificado como tal. O default não mistura setembro com outros meses. Média/desvio/MAD zero geram null apenas nos indicadores que dependem do denominador, com razões próprias. Não há hipótese de normalidade, probabilidade inferida ou classificação forte automática. Alvos modelados ficam explicitamente identificados; meses parciais ou de qualidade excluída não recebem scores.

## Previsão experimental

São comparadas mediana sazonal do treino, seasonal naive (`x` de doze meses antes, se válido) e SARIMA mensal com período 12. Cada origem usa somente observações anteriores/conhecidas até ela, mantendo meses faltantes como NaN na grade temporal do estado espacial de Statsmodels; não há interpolação com dados futuros. A definição de referências e todos os ajustes usam somente o treino da origem. O calendário não é comprimido ao remover meses inválidos.

A busca padrão tem dois candidatos pequenos: `(1,0,0)×(1,0,0,12)` e `(0,1,1)×(0,1,1,12)`. São configuráveis de um a quatro, com ordens até 2, orçamento de iterações e falhas de convergência registradas. Seleção por AIC é feita dentro de cada treino; não é uma busca global ótima. Configurações e ordens escolhidas constam nos diagnósticos ignorados em `output/`.

SARIMA usa `log1p(x)`. A inversa é `max(0,expm1(z))`: o ponto é interpretado como mediana sob a hipótese log-Gaussiana censurada em zero, **não média corrigida por viés**. Limites nominais de 95% vêm de `get_forecast` na escala transformada, com a mesma inversa. São aproximações do modelo; a cobertura empírica é calculada e pode ser inferior a 95%. Não se confundem essas faixas com as do harmonizador nem se propaga automaticamente a incerteza de VIIRS. Baselines são pontuais e não recebem faixas inventadas.

O backtest usa janela expansiva, mínimo padrão de 96 meses elegíveis e até 48 origens mensais. Horizontes 1/2/3 são separados. Somente alvos observados completos e de qualidade elegível são pontuados; observações com deriva são avaliadas em estrato separado e estimativas de 2026 nunca são verdade de teste. Também se fornecem resultados por ano-alvo.

As primeiras origens selecionam a família por MAE; a segunda metade é holdout. Alvos de seleção são limitados à data da primeira origem de validação para evitar vazamento dos horizontes que atravessam a divisão. Comparações exigem ao menos 90% de previsões disponíveis e usam a interseção dos mesmos pares origem/horizonte. Falhas e denominadores são visíveis; tabelas não pareadas também existem, mas não devem sustentar ranking entre modelos.

Um SARIMA selecionado no primeiro trecho precisa superar ambos os baselines no holdout pareado por MAE; caso contrário retorna-se ao baseline classificado no primeiro trecho. Essa regra de fallback não transforma o holdout em uma nova seleção independente validada. Há um mínimo configurável de origens no holdout e em cada horizonte. `experimental_backtested` indica evidência temporal mínima, não validação científica definitiva nem significância estatística. Erros são MAE, RMSE e viés médio (`predito−real`), em focos equivalentes; horizontes sobrepostos são correlacionados.

Uma origem histórica limita também a seleção da família e os alvos do backtest, não apenas o ajuste final. Se dados elegíveis não chegam à origem solicitada, o motor não converte uma extrapolação longa em um horizonte de 1–3 meses: devolve indisponibilidade. Em 2026 essa limitação é material.

## Referências verificadas

- Hyndman & Athanasopoulos, *Forecasting: Principles and Practice*, [métodos simples e validação temporal](https://otexts.com/fpp3/toolbox.html). Fundamenta baselines e origens móveis sem observações futuras; não valida este modelo de fogo.
- Statsmodels 0.14.6: [SARIMAX, seleção e dados faltantes](https://www.statsmodels.org/v0.14.6/examples/notebooks/generated/statespace_sarimax_internet.html) e [previsões/intervalos](https://www.statsmodels.org/v0.14.6/generated/statsmodels.tsa.statespace.sarimax.SARIMAXResults.get_prediction.html).
- Fontes meteorológicas e a diferença conceitual de FWI: [FIRE_WEATHER_SOURCES.md](FIRE_WEATHER_SOURCES.md).

Documentação e testes demonstram o método implementado; resultados quantitativos medidos e suas limitações estão em [REAL_DATA_RESULTS.md](reports/REAL_DATA_RESULTS.md). Não há alegação antecipada de ganho sobre baselines, previsão de incêndios individuais ou validação universal por região.
