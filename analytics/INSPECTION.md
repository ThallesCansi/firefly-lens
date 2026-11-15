# Inspeção e isolamento

Base de implementação: `c37b5f5b1f896b9b80c25c75b503af89187d7acc`, `origin/main` após PR #7 de UI. Branch: `feature/scientific-analytics-engine`, worktree separado em `.worktrees/scientific-analytics-engine`. Nenhuma alteração ou instalação de dependências no frontend foi necessária.

Foram lidos README.md, AGENTS.md, harmonization/README.md, `docs/METHODOLOGY.md`, `docs/FEATURES.md`, função `pipeline/fire_calendar.py`, regras de configuração e parâmetros exportados. Os caminhos dos dados estão confirmados na base atual.

| Recurso existente | Uso / decisão |
|---|---|
| `harmonization/output/grid_monthly_total.parquet` | Fonte mensal real da análise regional; cerca de 3,45 milhões de linhas, incluindo zeros. |
| `harmonization/output/climatology.parquet` | Medianas e quartis por célula; não somados para obter climatologia regional. |
| `harmonization/output/harmonization_params.json` | Erro comum, unidade, grade e regras observada/modelada e mês parcial. |
| `public/data/brazil/meta.json` | Cobertura exata, primeiro mês incompleto e último dia de dados. Somente leitura. |
| `harmonization/pipeline/fire_calendar.py` | Referência de soma fracionária, mediana das somas e incerteza; importada nos testes, sem executar etapas que escrevem arquivos. |
| `src/lib/harmonize.ts`, `src/lib/data/area.ts` | Indicadores/integração existentes no navegador, incluindo geometrias atuais. Não alterados. Os novos indicadores não dependem de React ou de arquivos binários do navegador. |
| `harmonization/output/validation_metrics.csv`, `validation_rankings.csv` | Validação da harmonização, não métricas preditivas; não são reutilizados como evidência do SARIMA. |
| `qa/data-audit/` | Evidências de consistência, problemas de comparação parcial/completo, fontes e limites já registrados. Não alterados. |
| Testes do app e scripts `check_*.py` | Testes existentes foram inspecionados para diferenciar regressões de UI/agregação e validação do novo motor. Scripts que escrevem saídas/cache não foram executados. |

Dados brutos e predições intermediárias da harmonização continuam ausentes. O novo motor consome derivados existentes, sem recalibrar MODIS/VIIRS ou alegar reproduzir a validação científica anterior.

O núcleo acrescenta estatísticas mensais completas, anomalias com referência sem alvo/futuro, backtesting e seleção de modelos. Geometria e incerteza seguem a referência; intervalos/medianas de células não são somados indevidamente. A pequena reprodução do cálculo de pesos é necessária porque a função original não expõe pesos e incerteza para cada mês, e é verificada por integração real.

Todos os novos arquivos de código, testes, schemas, exemplos, documentação e relatórios ficam em `analytics/`. O ambiente Python e resultados volumosos são ignorados. Não foi feito push, merge, alteração de UI, alteração de dados originais ou edição de configuração compartilhada.
