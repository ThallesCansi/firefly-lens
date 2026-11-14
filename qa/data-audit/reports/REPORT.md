# Auditoria dos dados FireFly Lens

Commit: `6ea44c7a8962e2e462cba0cb48cd8883a1f8757c` · branch: `feature/data-quality-audit`
Data de referência: 2026-11-14

Origem declarada: NASA FIRMS: MODIS C6.1 Aqua (SP to Aug 2026, NRT after), VIIRS NOAA-20 375 m (SP to Jul 2026, NRT after)
Período: `{"firstDay": "2002-07-04", "lastDay": "2026-11-14", "seriesEnd": "2026-10", "partialMonth": "2026-11"}`

## Resumo

| Status | Quantidade |
|---|---:|
| pass | 86 |
| error | 0 |
| warning | 3 |
| not_run | 3 |
| not_applicable | 1 |

`error` = erro comprovado; `warning` = investigar; `pass` = regra aprovada no escopo indicado; `not_run` = não executada; `not_applicable` = não aplicável.

## Verificações e evidências

| Verificação | Status | Resultado / evidência |
|---|---|---|
| metadata.schema | pass | Metadados suportados e cronologia consistente. {} |
| metadata.future | pass | Fim declarado comparado à data de referência. {"lastDay": "2026-11-14", "reference_date": "2026-11-14"} |
| metadata.partial | pass | Último mês completo e mês parcial conferidos pelo último dia disponível. {"seriesEnd": "2026-10", "partialMonth": "2026-11", "first_month_partial": true} |
| metadata.first_month | warning | Cobertura inicial começa no dia 4; julho/2002 não é um mês completo. {} |
| files.manifest | pass | Manifesto comparado com arquivos disponíveis. {"missing": [], "unlisted": [], "declared": 67} |
| public/data/brazil/t_0_5.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 14, "daily_rows": 178, "monthly_rows": 1456, "variance_rows": 154} |
| public/data/brazil/t_0_6.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 222, "daily_rows": 52607, "monthly_rows": 23088, "variance_rows": 2442} |
| public/data/brazil/t_0_7.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 80, "daily_rows": 822, "monthly_rows": 8320, "variance_rows": 880} |
| public/data/brazil/t_0_8.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 4, "daily_rows": 40, "monthly_rows": 416, "variance_rows": 44} |
| public/data/brazil/t_1_5.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 46, "daily_rows": 26137, "monthly_rows": 4784, "variance_rows": 506} |
| public/data/brazil/t_1_6.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 59487, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_1_7.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 251, "daily_rows": 7215, "monthly_rows": 26104, "variance_rows": 2761} |
| public/data/brazil/t_1_8.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 226, "daily_rows": 3978, "monthly_rows": 23504, "variance_rows": 2486} |
| public/data/brazil/t_1_9.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 3, "daily_rows": 1, "monthly_rows": 312, "variance_rows": 33} |
| public/data/brazil/t_2_5.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 152, "daily_rows": 56803, "monthly_rows": 15808, "variance_rows": 1672} |
| public/data/brazil/t_2_6.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 91523, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_2_7.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 17322, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_2_8.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 237, "daily_rows": 2355, "monthly_rows": 24648, "variance_rows": 2607} |
| public/data/brazil/t_2_9.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 84, "daily_rows": 1604, "monthly_rows": 8736, "variance_rows": 924} |
| public/data/brazil/t_3_3.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 6, "daily_rows": 982, "monthly_rows": 624, "variance_rows": 66} |
| public/data/brazil/t_3_4.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 105, "daily_rows": 33681, "monthly_rows": 10920, "variance_rows": 1155} |
| public/data/brazil/t_3_5.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 251, "daily_rows": 82575, "monthly_rows": 26104, "variance_rows": 2761} |
| public/data/brazil/t_3_6.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 70840, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_3_7.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 51373, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_3_8.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 247, "daily_rows": 22579, "monthly_rows": 25688, "variance_rows": 2717} |
| public/data/brazil/t_3_9.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 111, "daily_rows": 43772, "monthly_rows": 11544, "variance_rows": 1221} |
| public/data/brazil/t_4_0.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 66, "daily_rows": 3430, "monthly_rows": 6864, "variance_rows": 726} |
| public/data/brazil/t_4_1.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 98, "daily_rows": 10362, "monthly_rows": 10192, "variance_rows": 1078} |
| public/data/brazil/t_4_2.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 85, "daily_rows": 12553, "monthly_rows": 8840, "variance_rows": 935} |
| public/data/brazil/t_4_3.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 253, "daily_rows": 67949, "monthly_rows": 26312, "variance_rows": 2783} |
| public/data/brazil/t_4_4.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 255, "daily_rows": 74159, "monthly_rows": 26520, "variance_rows": 2805} |
| public/data/brazil/t_4_5.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 148176, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_4_6.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 85288, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_4_7.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 91871, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_4_8.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 254, "daily_rows": 35761, "monthly_rows": 26416, "variance_rows": 2794} |
| public/data/brazil/t_4_9.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 21, "daily_rows": 1644, "monthly_rows": 2184, "variance_rows": 231} |
| public/data/brazil/t_5_0.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 141, "daily_rows": 17043, "monthly_rows": 14664, "variance_rows": 1551} |
| public/data/brazil/t_5_1.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 253, "daily_rows": 84166, "monthly_rows": 26312, "variance_rows": 2783} |
| public/data/brazil/t_5_2.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 71149, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_5_3.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 35784, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_5_4.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 72357, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_5_5.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 115587, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_5_6.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 89283, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_5_7.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 118595, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_5_8.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 56887, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_5_9.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 70, "daily_rows": 8912, "monthly_rows": 7280, "variance_rows": 770} |
| public/data/brazil/t_6_1.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 79, "daily_rows": 20327, "monthly_rows": 8216, "variance_rows": 869} |
| public/data/brazil/t_6_2.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 208, "daily_rows": 68154, "monthly_rows": 21632, "variance_rows": 2288} |
| public/data/brazil/t_6_3.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 89210, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_6_4.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 98795, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_6_5.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 150711, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_6_6.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 189547, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_6_7.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 216315, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_6_8.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 116, "daily_rows": 64244, "monthly_rows": 12064, "variance_rows": 1276} |
| public/data/brazil/t_7_2.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 89, "daily_rows": 24814, "monthly_rows": 9256, "variance_rows": 979} |
| public/data/brazil/t_7_3.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 94299, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_7_4.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 93622, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_7_5.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 121060, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_7_6.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 193968, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_7_7.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 244, "daily_rows": 211800, "monthly_rows": 25376, "variance_rows": 2684} |
| public/data/brazil/t_7_8.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 20, "daily_rows": 9883, "monthly_rows": 2080, "variance_rows": 220} |
| public/data/brazil/t_8_2.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 8, "daily_rows": 1505, "monthly_rows": 832, "variance_rows": 88} |
| public/data/brazil/t_8_3.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 126, "daily_rows": 34856, "monthly_rows": 13104, "variance_rows": 1386} |
| public/data/brazil/t_8_4.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 200, "daily_rows": 81280, "monthly_rows": 20800, "variance_rows": 2200} |
| public/data/brazil/t_8_5.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 246, "daily_rows": 64581, "monthly_rows": 25584, "variance_rows": 2706} |
| public/data/brazil/t_8_6.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 256, "daily_rows": 95592, "monthly_rows": 26624, "variance_rows": 2816} |
| public/data/brazil/t_8_7.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 195, "daily_rows": 107828, "monthly_rows": 20280, "variance_rows": 2145} |
| public/data/brazil/t_9_5.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 43, "daily_rows": 12699, "monthly_rows": 4472, "variance_rows": 473} |
| public/data/brazil/t_9_6.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 195, "daily_rows": 64387, "monthly_rows": 20280, "variance_rows": 2145} |
| public/data/brazil/t_9_7.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 56, "daily_rows": 16043, "monthly_rows": 5824, "variance_rows": 616} |
| public/data/brazil/t_10_7.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 1, "daily_rows": 0, "monthly_rows": 104, "variance_rows": 11} |
| public/data/brazil/t_11_3.bin.gz | pass | CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados. {"issues": {}, "cells": 2, "daily_rows": 0, "monthly_rows": 208, "variance_rows": 22} |
| coverage.no_detection.Aqua | warning | Dias sem detecções no Brasil: investigar cobertura; não comprovam ausência de incêndios nem falha de aquisição. {"days": ["2002-07-30", "2002-07-31", "2002-08-01", "2002-08-02", "2002-08-03", "2002-08-04", "2002-08-05", "2002-08-06", "2002-08-07", "2002-09-13", "2002-11-15", "2016-02-19", "2016-02-28", "2020-08-28", "2021-09-24", "2022-04-01", "2022-04-02", "2022-04-03", "2022-04-04", "2022-04-05", "2022-04-06", "2022-04-07", "2022-04-08", "2022-04-09", "2022-04-10", "2022-04-11", "2022-04-12", "2022-04-13", "2022-04-14", "2022-04-15", "2022-04-16", "2025-12-24"], "count": 32} |
| coverage.no_detection.NOAA20 | warning | Dias sem detecções no Brasil: investigar cobertura; não comprovam ausência de incêndios nem falha de aquisição. {"days": ["2023-07-19", "2023-07-20", "2023-07-21", "2023-07-22", "2023-09-30", "2024-02-04"], "count": 6} |
| coverage.acquisition | not_run | Blocos esparsos não contêm máscaras de nuvem, passagens ou disponibilidade de aquisição; zero e ausência de observação não podem ser separados. {} |
| metadata.pipeline | pass | Metadados do app comparados com parâmetros exportados. {} |
| geometry.container | pass | GeoJSON com feições poligonais; topologia e fidelidade ao IBGE não verificadas. {} |
| provenance.sources | pass | Origem declarada nos metadados. {"sources": "NASA FIRMS: MODIS C6.1 Aqua (SP to Aug 2026, NRT after), VIIRS NOAA-20 375 m (SP to Jul 2026, NRT after)"} |
| provenance.authentication | not_run | Sem hashes oficiais FIRMS ou arquivos brutos: hashes locais identificam os bytes, mas não autenticam a origem nem os filtros. {} |
| harmonization/output/validation_metrics.csv | pass | Tabela publicada lida; não equivale a recalcular validação. {"rows": 36, "nonfinite": [], "brazil_rows": [{"periodo": "LOYO 2018–2023", "escala": "Brasil × mês", "metodo": "VIIRS bruto", "n": "67", "vies_rel_pct": "505.79312276025365", "mae_log1p": "1.7663750483901222", "pearson_anomalias": "0.9809157936606909", "cobertura95_pct": "", "cobertura95_normal_pct": ""}, {"periodo": "LOYO 2018–2023", "escala": "Brasil × mês", "metodo": "Nível 1", "n": "67", "vies_rel_pct": "-0.3158919789236103", "mae_log1p": "0.07204360281064004", "pearson_anomalias": "0.981466194940367", "cobertura95_pct": "", "cobertura95_normal_pct": ""}, {"periodo": "LOYO 2018–2023", "escala": "Brasil × mês", "metodo": "Nível 2", "n": "67", "vies_rel_pct": "-0.08297131554640957", "mae_log1p": "0.09578592570974631", "pearson_anomalias": "0.9745020112417824", "cobertura95_pct": "31.343283582089555", "cobertura95_normal_pct": "32.83582089552239"}, {"periodo": "2024", "escala": "Brasil × mês", "metodo": "VIIRS bruto", "n": "12", "vies_rel_pct": "501.1567182879768", "mae_log1p": "1.7084802353665438", "pearson_anomalias": "", "cobertura95_pct": "", "cobertura95_normal_pct": ""}, {"periodo": "2024", "escala": "Brasil × mês", "metodo": "Nível 1", "n": "12", "vies_rel_pct": "-15.389315565765948", "mae_log1p": "0.19211722422444844", "pearson_anomalias": "", "cobertura95_pct": "", "cobertura95_normal_pct": ""}, {"periodo": "2024", "escala": "Brasil × mês", "metodo": "Nível 2", "n": "12", "vies_rel_pct": "-16.330369980525372", "mae_log1p": "0.1930344242583669", "pearson_anomalias": "", "cobertura95_pct": "8.333333333333332", "cobertura95_normal_pct": "0.0"}, {"periodo": "2025", "escala": "Brasil × mês", "metodo": "VIIRS bruto", "n": "12", "vies_rel_pct": "431.6149297856615", "mae_log1p": "1.6186006429387", "pearson_anomalias": "", "cobertura95_pct": "", "cobertura95_normal_pct": ""}, {"periodo": "2025", "escala": "Brasil × mês", "metodo": "Nível 1", "n": "12", "vies_rel_pct": "-14.458458001498842", "mae_log1p": "0.17380176998098565", "pearson_anomalias": "", "cobertura95_pct": "", "cobertura95_normal_pct": ""}, {"periodo": "2025", "escala": "Brasil × mês", "metodo": "Nível 2", "n": "12", "vies_rel_pct": "-15.71870106390576", "mae_log1p": "0.1843449787129813", "pearson_anomalias": "", "cobertura95_pct": "25.0", "cobertura95_normal_pct": "25.0"}, {"periodo": "2026", "escala": "Brasil × mês", "metodo": "VIIRS bruto", "n": "10", "vies_rel_pct": "469.6482334721675", "mae_log1p": "1.6668783961491562", "pearson_anomalias": "", "cobertura95_pct": "", "cobertura95_normal_pct": ""}, {"periodo": "2026", "escala": "Brasil × mês", "metodo": "Nível 1", "n": "10", "vies_rel_pct": "-7.492272887394524", "mae_log1p": "0.12123773930223791", "pearson_anomalias": "", "cobertura95_pct": "", "cobertura95_normal_pct": ""}, {"periodo": "2026", "escala": "Brasil × mês", "metodo": "Nível 2", "n": "10", "vies_rel_pct": "-7.848397831220932", "mae_log1p": "0.12958265479144648", "pearson_anomalias": "", "cobertura95_pct": "30.0", "cobertura95_normal_pct": "40.0"}]} |
| harmonization/output/validation_rankings.csv | pass | Tabela publicada lida; não equivale a recalcular validação. {"rows": 21, "nonfinite": [], "brazil_rows": [{"bioma": "Brasil", "metodo": "VIIRS bruto", "spearman_meses": "1.0", "top3_meses_iguais": "True", "spearman_anos_2018_2023": "0.942857142857143", "spearman_anos_2018_2026": "0.9666666666666667"}, {"bioma": "Brasil", "metodo": "Nível 1", "spearman_meses": "1.0", "top3_meses_iguais": "True", "spearman_anos_2018_2023": "1.0", "spearman_anos_2018_2026": "0.9833333333333333"}, {"bioma": "Brasil", "metodo": "Nível 2", "spearman_meses": "0.9930069930069931", "top3_meses_iguais": "True", "spearman_anos_2018_2023": "0.942857142857143", "spearman_anos_2018_2026": "0.9666666666666667"}]} |
| harmonization/output/grid_monthly.parquet.envelope | pass | Assinatura externa Parquet; não valida páginas internas. {} |
| harmonization/output/grid_monthly.parquet.content | pass | Leitura Parquet e regras numéricas, de mês e intervalo. {"rows": 6893118, "invalid": {"n_modis": 0, "n_viirs_raw": 0, "n_viirs_1km": 0, "n_viirs_harmonized": 0, "n_harmonized": 0, "var_harmonized": 0, "lo95": 0, "hi95": 0, "interval": 0, "source_nulls": 0, "month": 0, "period": 0, "partial": 0, "source": 0, "required_counts": 0, "viirs_nullability": 0, "daynight": 0, "duplicate": 0, "missing_rows": 0}, "engine": "1.5.6"} |
| harmonization/output/grid_monthly_total.parquet.envelope | pass | Assinatura externa Parquet; não valida páginas internas. {} |
| parity.tiles_parquet | pass | Somas Brasil por mês: contagens diárias, média mensal e variância binárias versus Parquet; tolerância relativa 1e-6 para float32. {"mismatches": [], "months": 293} |
| climatology.brazil_september | pass | Mediana de setembro recalculada das somas nacionais (2003–2025); comparação documental manual. {"median_of_sums": 65527.0} |
| harmonization/output/grid_monthly_total.parquet.content | pass | Leitura Parquet e regras numéricas, de mês e intervalo. {"rows": 3446559, "invalid": {"n_modis": 0, "n_viirs_raw": 0, "n_viirs_1km": 0, "n_viirs_harmonized": 0, "n_harmonized": 0, "var_harmonized": 0, "lo95": 0, "hi95": 0, "interval": 0, "source_nulls": 0, "month": 0, "period": 0, "partial": 0, "source": 0, "required_counts": 0, "viirs_nullability": 0, "duplicate": 0, "missing_rows": 0}, "engine": "1.5.6"} |
| harmonization/output/climatology.parquet.envelope | pass | Assinatura externa Parquet; não valida páginas internas. {} |
| harmonization/output/climatology.parquet.content | pass | Leitura Parquet e regras numéricas, de mês e intervalo. {"rows": 141156, "invalid": {"median": 0, "p25": 0, "p75": 0, "n_years": 0, "month": 0, "quartiles": 0}, "engine": "1.5.6"} |
| harmonization/output/level1_factors.parquet.envelope | pass | Assinatura externa Parquet; não valida páginas internas. {} |
| harmonization/output/level1_factors.parquet.content | pass | Leitura Parquet e regras numéricas, de mês e intervalo. {"rows": 144, "invalid": {"n_rows": 0, "k": 0, "month": 0}, "engine": "1.5.6"} |
| validation.reproduction | not_run | Reajuste LOYO, filtros e cobertura com erro comum não executados; requerem intermediários e ambiente científico. {"missing": ["harmonization/data/raw", "harmonization/data/interim/validation_pred.parquet", "harmonization/data/interim/validation_groups.parquet", "harmonization/output/points"]} |
| uncertainty.daily | not_applicable | Dados binários fornecem variância mensal, sem intervalos diários independentes. {} |

## Recomendações

- Investigar dias sem detecções usando disponibilidade de aquisição.
- Não comparar meses parciais com medianas de meses completos.
- Preservar intermediários e publicar reprodução da validação e cobertura com c.
- Revisar DOCUMENTATION_AUDIT.md antes de divulgar resultados.

## Limitações

- Integridade interna não autentica origem FIRMS.
- Zeros não distinguem ausência de detecção e falta de observação.
- Não se testa uniformidade sazonal; não se contam incêndios independentes.
- Revisão documental é manual, fixada no commit indicado em DOCUMENTATION_AUDIT.md.

O JSON inclui inventário SHA-256 por arquivo, contagens mensais e evidências completas. Dias sem detecções são observações; falhas de aquisição são hipóteses a investigar.
