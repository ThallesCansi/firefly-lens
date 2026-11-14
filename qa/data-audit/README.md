# Data Quality Audit

Auditoria independente, somente leitura, dos derivados brasileiros do FireFly Lens. Toda implementação, fixtures e saídas ficam nesta pasta. Python 3.10+; nenhuma dependência obrigatória. Não importa nem executa módulos de produção.

Na raiz do worktree:

```powershell
python qa/data-audit/audit.py
python -m unittest discover -s qa/data-audit/tests -v
```

O comando gera `qa/data-audit/reports/REPORT.md` e `report.json`. Retorna 1 se houver erros comprovados, 0 quando há somente aprovações/avisos/limitações, 2 para argumentos inválidos. **Código 0 não garante auditoria completa nem validade científica.** Leia também os status `not_run` e o relatório documental.

A referência padrão é **2026-11-14**, data de corte desta fotografia científica. Para outro conjunto, informe explicitamente:

```powershell
python qa/data-audit/audit.py --reference-date 2026-11-14 --root . --out qa/data-audit/reports
```

`--root` seleciona a raiz dos dados; `--out` deve permanecer dentro deste módulo e não pode conter pastas auditadas. Fontes são abertas somente para leitura. Os hashes SHA-256 identificam os bytes inspecionados; não são assinaturas oficiais do FIRMS. O JSON registra commit, branch, período, fonte declarada, resultados individuais, evidências, inventário e somas mensais Brasil.

Para ler o conteúdo dos Parquet, use um Python com **DuckDB**, já declarado em `harmonization/pyproject.toml`. Sem ele, a auditoria verifica a assinatura externa dos Parquet e registra o conteúdo como `not_run`, mantendo a inspeção completa dos blocos gzip. Não confunda assinatura `PAR1` com validação de páginas internas.

Se o ambiente científico não estiver disponível, uma instalação opcional e isolada é suficiente:

```powershell
python -m pip install --target qa/data-audit/.deps "duckdb>=1.3,<2"
$env:PYTHONPATH = (Resolve-Path qa/data-audit/.deps).Path
python qa/data-audit/audit.py
```

`.deps/` é ignorado pelo Git. A execução real desta entrega usou Python 3.13 e DuckDB 1.5.6, sem instalar o conjunto pesado do pipeline. Neste ambiente gerenciado, a DLL instalada exigiu execução fora do sandbox; em uma máquina normal basta o comando acima.

As regras acrescentadas verificam manifesto, gzip/CRC, cabeçalho/layout/padding, datas/limites temporais, código de bioma e célula, duplicatas, todas as chaves mensais esperadas, degradação VIIRS ≤ bruto, valores não negativos/finitos, período parcial, metadados app/pipeline, origem e disponibilidade dos intermediários. Com DuckDB: leitura dos quatro Parquet, valores/quantis/flags, completude temporal e paridade das somas Brasil por mês entre blocos e tabela mensal total (tolerância 1e-6 relativa, 1e-3 absoluta para float32).

Não se exige contagem constante entre meses ou atividade em cada célula-dia: os blocos diários são esparsos. Dias nacionais sem detecção por sensor são **avisos**, sem atribuir falha instrumental ou ausência de incêndios. A estrutura não contém informação de disponibilidade/passagens/nuvens que permita essa distinção. Não são validados eventos de incêndio, área queimada ou risco. Quantis preditivos não precisam conter a média estimada.

[DOCUMENTATION_AUDIT.md](DOCUMENTATION_AUDIT.md) contém matriz manual, linhas de código, divergências, hipóteses e recomendações. Sua fotografia é fixa; reexecutar `audit.py` não renova a revisão documental. Não execute os scripts numerados/checks do pipeline para esta auditoria: alguns criam arquivos ou baixam dados.

Testes novos usam arquivos temporários mínimos, explicitamente sintéticos, incluindo versões desconhecidas, arquivo truncado, gzip inválido, dados futuros, mês inválido/incompleto, chaves ausentes, valores negativos/NaN/infinitos e a distinção entre aviso de zero e erro comprovado. Os testes de produção foram preservados e executados separadamente.
