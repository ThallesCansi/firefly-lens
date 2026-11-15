# FireFly Scientific Analytics

Motor Python independente do Next.js para atividade histórica, climatologia, anomalias e previsões estatísticas experimentais de **focos MODIS-Aqua-equivalentes**. Não estima incêndios independentes, área queimada ou causalidade. Todos os arquivos desta entrega ficam em `analytics/`; a aplicação e o pipeline são acessados somente para leitura.

## Executar

A partir da raiz do worktree `feature/scientific-analytics-engine`, Python 3.12+:

```powershell
python -m venv analytics/.venv
analytics/.venv/Scripts/python.exe -m pip install -e analytics
analytics/.venv/Scripts/python.exe -m firefly_analytics --geometry analytics/examples/region.geojson --region-id pantanal-study --origins 48 --sensitivity
analytics/.venv/Scripts/python.exe -m unittest discover -s analytics/tests -v
```

Em Linux/macOS, substitua `analytics/.venv/Scripts/python.exe` por `analytics/.venv/bin/python`. Não é necessário Node, servidor web, chave FIRMS ou executar os scripts numerados de harmonização.

O comando produz em `analytics/output/` (ignorado pelo Git): `history.json`, `climatology.json`, `anomalies.json`, `forecast.json`, `fire_weather.json`, a entrada regional normalizada e os backtests por origem. `--no-forecast` executa somente o núcleo estatístico e devolve previsão indisponível de forma explícita. `--out` deve ser um diretório de resultados dentro de `analytics/`, fora de código, schemas, testes e ambiente.

Parâmetros úteis:

```powershell
# Séries já agregadas, para integração futura com outro processo:
analytics/.venv/Scripts/python.exe -m firefly_analytics --series analytics/examples/synthetic/input.json --no-forecast
# Referência configurável; meses/anos realmente utilizados constam nos resultados:
analytics/.venv/Scripts/python.exe -m firefly_analytics --geometry analytics/examples/region.geojson --reference-start 2003 --reference-end 2023 --min-years 5
# Estudo retrospectivo, com seleção e avaliação limitadas à origem indicada:
analytics/.venv/Scripts/python.exe -m firefly_analytics --geometry analytics/examples/region.geojson --forecast-origin 2023-12
```

`--include-drift` admite observações marcadas com deriva orbital em treinamento e referências. `--sensitivity` executa também o backtest com a política oposta. Valores modelados jamais entram como observações de treino ou verdade de avaliação do módulo de previsão. Hiperparâmetros, orçamento, número de origens e critérios mínimos também são configuráveis pela API Python `ForecastConfig`.

## Integração sem frontend

```python
from firefly_analytics.data_adapter import from_parquet, from_json
from firefly_analytics import analyze, Reference, QualityPolicy
from firefly_analytics.export import write_results

regional = from_parquet(repo_root, "my-region", polygon_geojson)
results = analyze(regional, reference=Reference(2003, 2023, min_years=5))
write_results(results, "analytics/output/my-region")
```

`analyze` não grava arquivos nem consulta serviços. O adaptador lê e agrega os Parquet; o exportador valida e serializa; um futuro processo de API poderá chamar essas mesmas funções. Não foi criado FastAPI, endpoint Next.js nem painel visual. Um exemplo estático não atende automaticamente consultas a qualquer região: para outra geometria é necessário executar novamente o adaptador e o motor.

## Contratos e exemplos

Cada seção tem `schema_version`, `section`, `region_id`, `period`, `units`, `source`, `data_status`, `generated_at`, `method` e `data`, mais limitações e geometria. Confira [CONTRACTS.md](CONTRACTS.md), [schema de entrada](schemas/input.schema.json) e [schema de saída](schemas/result.schema.json).

- [Exemplos reais](examples/real/): região de 1° no Pantanal, 16 células. Incluem histórico mensal/anual, doze meses de climatologia, anomalias, forecast atual indisponível e weather indisponível.
- [Forecast retrospectivo real](examples/real/forecast_retrospective.json): demonstração ancorada em dezembro/2023, identificada como retrospectiva; não é um outlook atual.
- [Exemplos sintéticos](examples/synthetic/): explicitamente rotulados, com semente 42, incluindo previsão numérica e fixture FWI para integração visual sem alegar observações reais.
- [Resultados reais](reports/REAL_DATA_RESULTS.md) e [resumo estruturado dos backtests](reports/backtest_summary.json).

Após o fluxo real com `--sensitivity`, gere novamente os exemplos e relatórios:

```powershell
analytics/.venv/Scripts/python.exe analytics/create_examples.py
```

Arquivos por origem, diagnósticos extensos, ambiente e intermediários ficam ignorados em `output/` ou `.venv/`. Os schemas são distribuídos também dentro do pacote; `python analytics/build_schemas.py` regenera as duas cópias idênticas a partir da definição única.

## Limites principais

A política padrão exclui meses parciais, falhas Aqua documentadas, anos com deriva orbital e estimativas modeladas das referências/treino. O histórico preserva os valores e flags originais para exibição, mas só soma totais anuais comparáveis quando todos os meses são elegíveis. A climatologia é calculada **depois** da agregação regional; medianas de células não são somadas.

Na fotografia disponível, sem admitir 2024–2025, o último treino elegível termina em dezembro/2023. Mesmo admitindo deriva, as últimas observações terminam em dezembro/2025. O restante de 2026 é estimativa harmonizada. Por isso, o motor não apresenta uma previsão corrente de 1–3 meses como validada quando a origem pedida é outubro/2026: devolve `null` e uma justificativa. A comparação retrospectiva continua disponível.

SARIMA não é promovido por complexidade. A comparação usa cortes temporais, casos pareados e seleção anterior ao holdout. Testes de software aprovados não equivalem a validação científica. Veja [métodos](SCIENTIFIC_METHODS.md), [inspeção inicial](INSPECTION.md) e [fontes meteorológicas verificadas](FIRE_WEATHER_SOURCES.md).

Não houve push nem merge nesta entrega.
