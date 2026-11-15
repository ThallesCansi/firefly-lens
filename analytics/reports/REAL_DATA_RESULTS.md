# Resultados reais — Pantanal

Base de dados/código do repositório: `c37b5f5b1f896b9b80c25c75b503af89187d7acc`. Região: `pantanal-study`, polígono de 1° entre 57,5°W–56,5°W e 18,5°S–17,5°S, 16 células.

Geração UTC: 2026-11-15T02:49:55.693332+00:00. Python 3.13.15; versões, configuração, hashes e métricas completas em [backtest_summary.json](backtest_summary.json).

## Fluxo completo

293 meses de julho/2002 a novembro/2026. Julho/2002 e novembro/2026 são parciais. Histórico, climatologia de doze meses, anomalias operacionais e cinco contratos JSON foram produzidos e validados. Nenhum dado original foi alterado.

Backtest principal: 48 origens de 2019-09 a 2023-12; separação seleção/holdout em 2021-11. Treino sempre observado; política exclui deriva e meses com falhas documentadas. A sensibilidade admite deriva e usa 48 origens de 2021-11 a 2025-12.

## Comparação pareada — holdout estável

Os mesmos pares origem/horizonte são usados para comparar os modelos. Os números não são uma métrica da harmonização nem avaliação de incêndios independentes.

| Modelo | N | MAE | RMSE | Viés médio | Cobertura nominal 95% |
|---|---:|---:|---:|---:|---:|
| seasonal_median | 55 | 90.245 | 216.610 | -73.082 | não fornecida |
| seasonal_naive | 55 | 86.945 | 203.429 | -55.491 | não fornecida |
| sarima | 55 | 87.617 | 218.162 | -75.779 | 78.18% |

A etapa de seleção anterior ao holdout recomendou **seasonal_median** (`experimental_backtested`). A família não é reescolhida retrospectivamente pelo menor erro do holdout. SARIMA não superou ambos os baselines por MAE nesta amostra; a análise não sustenta promovê-lo por complexidade. O menor MAE entre os três no holdout pareado desta região foi de **seasonal_naive**.

A cobertura observada do intervalo SARIMA é inferior ao nível nominal; não há calibração empírica demonstrada de 95%. Baselines não recebem faixas artificiais. Horizontes sobrepostos não são observações independentes.

## Erro por horizonte — casos disponíveis de cada modelo

Denominadores variam: use `paired_by_horizon` no JSON para comparação direta. Esta tabela descreve cada modelo, não um ranking com amostras diferentes.

| Horizonte | Modelo | N | MAE | RMSE |
|---|---|---:|---:|---:|
| 1 | seasonal_median | 22 | 76.250 | 197.794 |
| 2 | seasonal_median | 20 | 82.375 | 207.364 |
| 3 | seasonal_median | 19 | 86.237 | 212.739 |
| 1 | seasonal_naive | 20 | 80.150 | 194.779 |
| 2 | seasonal_naive | 18 | 88.389 | 205.299 |
| 3 | seasonal_naive | 17 | 93.412 | 211.250 |
| 1 | sarima | 22 | 70.745 | 195.262 |
| 2 | sarima | 20 | 82.669 | 211.808 |
| 3 | sarima | 19 | 85.623 | 215.428 |

## Sensibilidade 2024–2025

Os valores abaixo são contra Aqua observado com deriva, não uma correção nem isolamento causal do efeito orbital. Agregam horizontes sobrepostos 1–3; os resultados por ano e horizonte estão no JSON.

| Modelo | N contra observações com deriva | MAE | RMSE | Viés médio |
|---|---:|---:|---:|---:|
| seasonal_median | 72 | 37.604 | 76.555 | -24.729 |
| seasonal_naive | 72 | 97.375 | 197.354 | 51.958 |
| sarima | 72 | 45.254 | 107.816 | 17.835 |

O holdout dessa janela de sensibilidade contém somente anos com deriva: não fornece a quantidade mínima de casos estáveis para nova validação. Seu status é `not_validated`. Isso não declara que o treino com deriva foi validado, nem usa estimativas de 2026 como verdade.

## Resumo descritivo

Entre anos inteiramente elegíveis pela política conservadora, o maior total é 2023; o mês elegível de maior atividade é 2020-10. Média mensal elegível: 32.739; mediana: 5.000 focos equivalentes. Anos parcialmente excluídos não participam do ranking anual.

Setembro, referência 2003–2023 com exclusões: 20 anos, média 57.550, mediana 36.500, desvio amostral 58.972, MAD 22.000. A referência e todos os anos usados constam no JSON.

## Disponibilidade de previsão atual e FWI

A origem atual solicitada é outubro/2026; o treino conservador termina em dezembro/2023. Mesmo admitindo deriva, a última observação real é dezembro/2025. Portanto o forecast atual retorna `unavailable`, previsões null e motivo explícito: não se apresenta uma extrapolação de muitos meses como um horizonte validado de 1–3 meses.

Um forecast numérico **retrospectivo** ancorado em dezembro/2023 está nos exemplos reais, e há fixtures numéricas sintéticas separadas para o frontend. Não são previsões atuais verificadas.

Consultas meteorológicas reais retornam `unavailable`: faltam autenticação/termos e integração numérica de fornecedor. O adaptador normalizado é testado com fixtures explicitamente sintéticas, sem calcular FWI por aproximação própria.

## Limitações

Uma região, duas especificações SARIMA pequenas e uma janela limitada não validam desempenho nacional ou em qualquer polígono. Dados são de vintage retrospectivo, sem arquivo histórico de publicação. Regimes climáticos, manejo, sensores e falhas podem afetar comparabilidade. Testes de código aprovados não tornam o modelo cientificamente validado. Valores pequenos e zeros não significam ausência de incêndios. A documentação fornece métodos, denominadores, razões de null e fontes para revisão humana.
