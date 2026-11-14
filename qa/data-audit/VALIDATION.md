# Evidências da entrega

A auditoria adiciona uma ferramenta independente para verificar os derivados científicos brasileiros sem executar o pipeline nem alterar a aplicação. Os relatórios se referem ao commit de dados `6ea44c7a8962e2e462cba0cb48cd8883a1f8757c`, não às mudanças posteriores de UI/polígonos em outras branches.

## Execução real

- Python 3.13; DuckDB 1.5.6 instalado somente em `.deps/`, ignorado pelo Git.
- Período diário: 2002-07-04 a 2026-11-14; referência explícita 2026-11-14.
- 67 blocos, 11.763 células; quatro tabelas Parquet inspecionadas.
- 6.893.118 linhas célula-mês-dia/noite; 3.446.559 linhas célula-mês; 141.156 linhas de climatologia; 144 fatores de nível 1.
- 76 arquivos de dados/metadados inventariados com tamanho e SHA-256.
- **86 aprovações, 0 erros comprovados, 3 avisos, 3 verificações não executadas, 1 não aplicável.** As quantidades agregam verificações por arquivo/tema, não número de linhas avaliadas.
- Somatórios nacionais de 293 meses dos blocos correspondem ao Parquet mensal, dentro da tolerância declarada para float32.
- Totais dos blocos: 5.954.870 detecções Aqua e 10.354.954 NOAA-20. Não são contagens de incêndios independentes; NOAA-21 não é distribuído nesses blocos.
- Mediana das somas Brasil em setembro/2003–2025 recalculada: **65.527**, consistente com a metodologia.

Os três avisos são início em julho/2002 incompleto, 32 dias sem detecções Aqua e 6 sem detecções NOAA-20. Os dias estão listados no JSON. Isso exige investigação de aquisição/cobertura; não permite inferir ausência de incêndios nem provar defeito instrumental. As três verificações não executadas tratam disponibilidade de aquisição, autenticação da origem e reprodução completa da validação. Não há intervalo diário independente para verificar.

Os achados científicos/documentais são separados das contagens automáticas: comparação parcial/completo, fórmula ilustrativa divergente no About, interpretação exagerada do Spearman sazonal, diferença entre cobertura-alvo e cobertura publicada, e exceção NRT no filtro `type`. Consulte `DOCUMENTATION_AUDIT.md` para a matriz e as hipóteses ainda não demonstradas.

## Testes

```powershell
python -m unittest discover -s qa/data-audit/tests -v
```

**20 testes novos aprovados**, incluindo 5 com fixtures Parquet/DuckDB e 15 sem dependências. Sem DuckDB os 5 testes opcionais são explicitamente ignorados; não contam como aprovados. Fixtures são sintéticas e temporárias, nunca dados reais modificados.

```powershell
node_modules/.bin/vitest.cmd run --root .worktrees/data-quality-audit
```

Comando executado a partir do checkout principal, usando suas dependências já instaladas e apontando para o worktree auditado: **3 arquivos existentes, 16 testes aprovados**. Nenhum teste existente foi alterado. Build/lint de produção não foram executados: a entrega contém apenas Python, documentação e relatórios; não há alteração de aplicação/configuração.

## Isolamento e revisão

Todos os arquivos adicionados pertencem a `qa/data-audit/`. A comparação com o commit auditado preserva integralmente `src/`, `public/`, `harmonization/`, `package.json`, lockfiles e configurações compartilhadas. Os hashes do inventário podem ser conferidos novamente sem executar etapas científicas. O diff do PR deve conter somente essa pasta; não há correções de produção nem merge na main.

O relatório registra o commit de dados anterior ao commit de entrega para evitar autorreferência de hashes. Reexecutar em outro commit atualiza metadados e pode alterar as saídas. A revisão documental permanece fixada na fotografia explicitamente indicada.
