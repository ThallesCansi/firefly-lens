# Verificação da entrega

Executado no worktree `feature/scientific-analytics-engine`, com Python 3.13 e dependências isoladas em `analytics/.venv`:

```powershell
analytics/.venv/Scripts/python.exe -m unittest discover -s analytics/tests -q
analytics/.venv/Scripts/python.exe -m pip check
```

**37 testes aprovados, sem skips**, e nenhuma incompatibilidade declarada entre dependências instaladas.

| Área | Testes | Evidência |
|---|---:|---|
| Histórico | 5 | Totais anuais, YoY, anos parciais, ausentes versus zero, qualidade/fonte e entradas inválidas |
| Climatologia | 3 | Separação mensal, desvio amostral, MAD, percentis interpolados, referências insuficientes |
| Anomalias | 4 | Positivas/negativas, empates, denominadores zero, exclusão do alvo/futuro e meses parciais |
| Forecasting/validação | 11 | Baselines, origem temporal, disponibilidade, fontes, SARIMA ajustado de fato, falha de convergência, ausência de vazamento, seleção/fallback e forecast sem observações recentes |
| Contratos | 6 | Todos os envelopes, exemplos reais/sintéticos, schemas distribuídos, rejeição de NaN/estrutura/unidades e roundtrip da entrada |
| Fire weather | 4 | Indisponibilidade real, fixtures explícitas, coordenadas/datas/leads, membros, nulls e duplicatas |
| Adaptador espacial | 4 | Comparação real com a função original em duas geometrias, região fora da grade e fixture Parquet com zero/null distintos |

O fluxo real completo executou duas avaliações de 48 origens, com dois candidatos SARIMA por origem e baselines, mantendo previsões individuais/diagnósticos fora do versionamento em `analytics/output/`. Os resumos medidos e as versões estão em `backtest_summary.json`; os resultados interpretados estão em `REAL_DATA_RESULTS.md`.

Os exemplos foram serializados com `allow_nan=False` e validados por JSON Schema. Hashes dos arquivos científicos usados foram reconferidos após a execução; hashes do código do motor coincidem com os registrados no relatório. Somente `analytics/` foi adicionada. `src/`, `public/`, `harmonization/`, AGENTS.md, package.json, pnpm-lock.yaml e configurações compartilhadas permaneceram inalterados.

Não foram executados build do frontend, processos de download/recalibração, scripts do pipeline que escrevem saídas, push ou merge. A aprovação dos testes é de software e consistência, não certificação científica de previsão ou validação de FWI.
