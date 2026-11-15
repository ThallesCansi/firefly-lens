# Contratos JSON 1.0.0

Há cinco resultados independentes: `history`, `climatology`, `anomalies`, `forecast` e `fire_weather`. Cada um é validado pelo mesmo JSON Schema Draft 2020-12, discriminado por `section`. Os schemas estão em `schemas/` e são incluídos como recursos do pacote instalado.

```json
{
  "schema_version": "1.0.0",
  "section": "climatology",
  "region_id": "pantanal-study",
  "period": {"start": "2002-07", "end": "2026-11"},
  "units": "MODIS-Aqua-equivalent hotspots",
  "source": {"synthetic": false, "provenance": {}},
  "data_status": "available",
  "generated_at": "2026-11-14T00:00:00+00:00",
  "method": {"name": "same_calendar_month_statistics"},
  "data": {},
  "limitations": [],
  "geometry": null
}
```

O trecho acima ilustra o envelope; `data` deve obedecer ao contrato específico da seção, como nos arquivos completos de `examples/`. `period` informa a série de entrada. A referência histórica efetivamente usada consta em climatologia/anomalias; `forecast_origin`, `training_period` e as datas de cada previsão informam o período preditivo, que pode ultrapassar o período de entrada. Não derive o horizonte apenas de `period.end`.

| Seção | Campos de `data` para o frontend | Cuidados |
|---|---|---|
| `history` | `monthly[]`: date, year, month, value, source, complete, flags, lower/upper; `annual[]`: year, total, valid_month_sum, valid_months, complete, yoy_percent; `summary` | `total=null` em anos incompletos/excluídos. `valid_month_sum` é subtotal, não total comparável. Intervalos mensais são de harmonização; faixas anuais não são inventadas. |
| `climatology` | `months[12]`: month, years_used, n_years, mean, median, std_sample, p10/p25/p75/p90, min/max, mad, status/reason | Estatísticas insuficientes retornam null. Não ligar uma curva por células antes de agregar a região. |
| `anomalies` | `months[]`: date, value, source, quality_flags, absolute, percent, z_score, robust_z, percentile, null_reasons, reference | Default operacional só usa anos anteriores e exclui o ano-alvo. Scores não são probabilidades. Não transformar `null` em zero. |
| `forecast` | forecast_status, model, forecast_origin, last_complete_observation_used, training_period, predictions[], backtesting | Forecasts são experimentais. Se a observação não alcança a origem, previsões são null. Faixas são do modelo preditivo, não do harmonizador. |
| `fire_weather` | status, index, units, forecasts[], reason; no import normalizado: issued_at, valid_at, lead_hours, member, value e contagens | FWI é adimensional. Preservar data de emissão, membro e lead. Não convertê-lo em quantidade de hotspots. |

`data_status` é `available`, `experimental`, `not_validated`, `unavailable` ou `synthetic`. Um payload sintético também tem `source.synthetic=true`, mesmo quando o comportamento do modelo em `data.forecast_status` é experimental. Uma falha de seção retorna `data.status=unavailable` e `data.reason`, sem bloquear as demais. `available` significa dados/cálculos disponíveis, não validação científica.

## Entrada regional normalizada

`region_id`, `units`, `synthetic` e `months` são obrigatórios no arquivo JSON. Cada mês tem `date` em YYYY-MM, `value` não negativo ou null, `source` e `complete`. Opcionais: `flags`, `lower`, `upper`, `uncertainty_method`, `available_at` (YYYY-MM-DD), geometria, proveniência e limitações.

Fontes aceitas: `observed_modis`, `modeled_viirs`, `missing`, `mixed`. O treino preditivo exige `observed_modis`; a classificação em fixtures sintéticas apenas exercita o contrato e não atribui origem NASA à simulação. Duplicatas, datas inválidas, unidades incompatíveis, NaN, Infinity, negativos e intervalos invertidos são rejeitados. O calendário é regularizado mantendo meses ausentes como null, nunca zero.

`available_at`, quando conhecido, impede usar no treino/referência uma observação que ainda não havia sido publicada na origem. Sem esse campo, assume-se disponibilidade após o fechamento do mês e registra-se que o backtest é de dados retrospectivos finais, sem arquivo de vintages. Isso não demonstra operacionalidade em tempo real.

## Integração futura

O frontend pode consumir os cinco JSONs separadamente e exibir somente seções disponíveis. Para regiões arbitrárias, um futuro adaptador de execução deve obter a série regional, chamar `analyze` e serializar; o motor não mantém estado do mapa. Não foi implementado transporte HTTP, cache, autenticação ou execução remota.

`generated_at` indica a geração do resultado, não aquisição dos dados nem emissão meteorológica. Para FWI, `issued_at` é preservado do fornecedor. Proveniência contém hashes locais e commit; hashes não autenticam a origem FIRMS nem certificam o fornecedor.
