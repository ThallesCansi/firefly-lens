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

## Integração HTTP e cobertura

O frontend consome snapshots e o FastAPI autenticado por proxies Next. History e Forecast usam o motor e contratos existentes; ver [integração dinâmica](../docs/dynamic-polygon-analytics.md). O motor não mantém estado do mapa.

`POST /analytics/fire-weather` aceita o mesmo `AnalyticsRequest`, mas sua cobertura independe do Parquet brasileiro. Retorna `{schema_version,geometry,data}`. O cliente valida geometria exata, proveniência real, unidades, datas/leads, cobertura e distribuição antes de mostrar números. `data_version`/`horizon` preservam compatibilidade de transporte; o horizonte meteorológico vem exclusivamente do produto. HTTP 200 pode conter `unavailable` quando não há produto. Autenticação, validação e sobrecarga usam os mesmos códigos HTTP do serviço.

Linhas FWI podem incluir `coverage_fraction`, `danger_class`, `maximum`, `distribution`, `percentile` e `anomaly`. `build_schemas.py` gera schemas publicados e empacotados juntos. Percentil/anomalia são nulos no leitor atual. O contrato legado `from_records` não é promovido a avaliação espacial na interface.

`public/data/coverage.json` distingue cobertura harmonizada real, detecções brutas reais, demonstração sintética e ausência de cobertura. BRA possui calibração espacial; os outros 11 países publicam séries nacionais, enquanto seus manifestos de mapas preservam contagens brutas por sensor. `demo_enabled=false`.

`generated_at` indica a geração do resultado, não aquisição dos dados nem emissão meteorológica. Para FWI, `issued_at` é preservado do fornecedor. Proveniência contém hashes locais e commit; hashes não autenticam a origem FIRMS nem certificam o fornecedor.

Atualização continental: `validateBundle` continua usando os metadados brasileiros por padrão; somente o carregador nacional autenticado por SHA-256 fornece o período e origem explicitamente registrados para cada país. Os novos bundles têm proveniência `real_country_harmonized`, escopo `entire_country_only`, calibração `evaluated_country_aggregate` e identidade geométrica exata. Não podem ser reutilizados em polígonos internos.

`POST /analytics/retrospective` usa `RetrospectiveRequest`, que acrescenta `forecast_origin` ao contrato existente. A origem deve permitir todos os alvos dentro da história completa. Somente esse carregador aceita uma origem passada; o carregador de previsão corrente mantém a proteção original. O endpoint não aceita séries ou métricas fornecidas pelo cliente.

Histórico continental ampliado: os relatórios nacionais cobrem julho/2002–dezembro/2025, com referência elegível 2003–2023. O ajuste entre sensores continua limitado a abril/2018–2023. O campo adicional `calendar` do bundle nacional informa início/fim diário, corte observado e os totais mensais VIIRS calculados offline. O manifesto bruto fornece `daily` (um resumo por país/ano) e `day_tiles` (células brutas por país/mês), ambos com hashes dos bytes comprimidos e descomprimidos. O calendário reaproveita `buildRecord` com contexto próprio e reconcilia seus totais com o histórico Python.

Para geometria nacional exata, o serviço carrega o catálogo confiável e verifica SHA-256, geometria e proveniência antes de reconstruir `RegionalSeries`. A origem retrospectiva respeita o término publicado daquele país, e a identidade do resultado segue a geometria normalizada da requisição. Um polígono interno não recebe os totais nacionais. Não são aceitos parâmetros, observações ou resultados de validação enviados pelo cliente.

NASA GFWED mantém `valid_at=null`, `lead_hours=null`, `valid_date=YYYY-MM-DD`, `lead_days` inteiro e `validity_basis`. Datas locais diárias não são transformadas em instantes UTC fictícios. CEMS e imports legados mantêm seus timestamps/leads originais. O discriminante de fornecedor/produto impede misturar as duas semânticas. Ver [integração e escopo atual](../docs/continental-harmonization.md).
