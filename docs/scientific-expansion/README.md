# Scientific intelligence and continental expansion

**Atualização posterior:** o estado desta primeira entrega foi superado por
[harmonização nacional em 11 países, FWI oficial e previsões retrospectivas](../continental-harmonization.md).
Os resultados abaixo documentam a etapa inicial, quando o Paraguai era apenas
bruto e o FWI ainda não tinha arquivo oficial.

Entrega na branch `feature/scientific-continental-expansion`, sem merge/publicação
automática. Revisão e medições locais: 15/11/2026.

## Inspeção e resultado

O checkout já integrava os tiles brasileiros, seleção poligonal, motor Python,
FastAPI autenticado, snapshots de cinco regiões, backtests e Firefly Signals.
A restrição de polígonos arbitrários em produção depende de **deploy separado**
do Python, não de um segundo motor. A Vercel serve Next e arquivos estáticos;
Parquet, processamento espacial pesado e treinamento ficam fora do navegador.
Algoritmos de harmonização, climatologia, anomalias e forecasting existentes
foram preservados. Os outros worktrees e o servidor de desenvolvimento existente
não foram alterados/interrompidos.

| Prioridade | Entregue | Limite explícito |
|---|---|---|
| P0 | Linha mensal em destaque no painel e relatório; série inteira por padrão; mensal/anual e intervalo no relatório Python; comparação sazonal; interpretação baseada em indicadores reais; diagnóstico de deploy | Estatísticas Python de polígonos arbitrários precisam do serviço configurado. O gráfico exploratório existente permanece disponível sem ele. |
| P1 | Fire Danger Assessment independente do histórico; leitor NetCDF, proveniência, classes GWIS, área válida, distribuição e extremos; Methods próprio | Sem download/token EWDS: FWI real indisponível. Compatibilidade com arquivo oficial e aquisição operacional ainda não verificadas. |
| P2 | Piloto **real bruto** do Paraguai, abril/2018–dezembro/2023; download, filtros, grade, exportação, mapa/relatório e benchmark; pipeline parametrizado por país | Harmonização e transferência da calibração **não validadas**. Portanto o piloto não conclui a etapa científica de expansão harmonizada. |
| P3 | Registro de cobertura; países sem dados continuam exploráveis; bloqueio de sinais em fontes brutas/sintéticas/não elegíveis | Outros países não foram processados. Demo sintético permanece desativado, sem controle operacional. |

## O que funciona com dados reais

**Brasil:** histórico Aqua-equivalente, observações MODIS e continuação VIIRS
modelada, calendário e filtros existentes, climatologia/anomalias elegíveis e
backtests. A API aceita polígonos válidos que intersectem células cobertas;
fora disso retorna indisponibilidade. Frações de células de fronteira não
representam medições locais. Partes de seleções além da grade não ganham dados.

**Paraguai:** escolher *Coordinates → Paraguay · real raw pilot* ou selecionar
o país pela ferramenta administrativa. O piloto começa em setembro/2023,
permite outros meses cobertos e mostra cada sensor separadamente. Relatórios
são totais do arquivo de país NASA, não agregações de polígonos personalizados.
O contorno Natural Earth 1:110m serve à navegação; não foi usado para excluir
detecções de fronteira classificadas pelo FIRMS como paraguaias. Recortes
arbitrários não recebem uma série harmonizada do Paraguai.

Foram preservados 147.982 registros Aqua e 784.411 NOAA-20, após filtros de
confiança/vegetação, duplicatas e seleção do intervalo comum. A razão anual
bruta NOAA-20/Aqua varia aproximadamente de 4,93 a 5,95. Essa variação é uma
comparação descritiva; não valida nenhuma conversão. Não há previsão, anomalia
ou Firefly Signal para esses dados brutos.

## Piloto e infraestrutura continental

`harmonization/pipeline/continental.py` reutiliza o downloader/schema dos
arquivos anuais FIRMS via HTTP Range, mantendo apenas o membro do país. Os
filtros correspondem à política existente: Aqua, confiança >=30; NOAA-20,
nominal/high; `type=0`; deduplicação por local/data/hora/satélite. Contagens
diurnas/noturnas são agregadas em células de 0,25°, com VIIRS também degradado
por subcélula de 0,01°/dia/passagem. Não existe ajuste importado do Brasil.

Fontes e saídas:

- Arquivos originais: `harmonization/data/continental/paraguay/raw/`, ignorados
  no Git. Doze arquivos Parquet; hashes/URLs registrados no manifesto público.
- Grade privada: `harmonization/data/continental/paraguay/cells/year=*.parquet`,
  particionada por ano, Zstandard. Aproximadamente 196 kB neste piloto.
- Web: `public/data/continental/paraguay/manifest.json`, aproximadamente 126 kB
  de metadados, resumo de 69 meses e índice; 483 blocos gzip mês × tile de 4°,
  somando 209.968 bytes. O navegador baixa somente o mês/blocos selecionados,
  verifica SHA-256 e mantém LRU de 32 blocos. Nunca recebe os arquivos FIRMS.
- Cobertura: `public/data/coverage.json`. BRA harmonizado, PRY bruto;
  `demo_enabled=false`. Não há cobertura presumida nos demais países.

Os blocos já processados são dados estáticos na Vercel; o piloto bruto funciona
sem FastAPI. O leitor legado brasileiro e seu cache permanecem os mesmos.
Mapas diários/time-lapse não estão disponíveis no piloto mensal; a interface
explica esse limite. A opção de sensor usa os controles de camadas existentes.

Para reproduzir, no ambiente com Python 3.12+ e dependências de processamento:

```powershell
uv pip install --python analytics/.venv --editable 'analytics[api,weather]' requests pyarrow pyyaml python-dotenv
analytics/.venv/Scripts/python.exe harmonization/pipeline/continental.py --country PRY
# repetir sem rede, usando os arquivos já baixados:
analytics/.venv/Scripts/python.exe harmonization/pipeline/continental.py --country PRY --offline
```

O script aceita ARG, BOL, CHL, COL, ECU, GUY, PER, SUR, URY e VEN. Cada execução
precisa efetivamente obter/verificar os arquivos; só então atualiza o registro
de cobertura. O intervalo piloto fica restrito a 2018–2023. Para outra janela,
deve-se revisar processamento, disponibilidade e elegibilidade em vez de incluir
deriva/NRT silenciosamente. As saídas brutas não se tornam harmonizadas por esse
comando. Revisar e publicar dados/registro juntos.

Para validar harmonização num novo país: obter estratos ecológicos locais com
licença e resolução adequadas, medir sobreposição e estabilidade dos sensores,
avaliar baseline e modelo existentes em holdouts temporais e espaciais, medir
viés/ordenação/intervalos por ecossistema e documentar falhas. Os biomas IBGE
usados no ajuste brasileiro não cobrem o Paraguai. País vizinho ou nome de bioma
similar não é evidência de transferência. Essa etapa permanece pendente.

## FWI e previsão de atividade

O leitor usa FWI calculado pelo fornecedor; não implementa uma aproximação da
recorrência canadense. A fonte numérica prevista é **CEMS seasonal / SEAS5**,
com publicação atrasada. FWI operacional GWIS é produto diferente. Grade regular
e metadados completos são obrigatórios. Sem credenciais/arquivo oficial o
estado real é `unavailable` — não há dados meteorológicos de demonstração.
Configuração, fórmula espacial, limites de classes, sidecar, licença e
referências: [FIRE_WEATHER_SOURCES.md](../../analytics/FIRE_WEATHER_SOURCES.md).

O FWI fica separado de Historical Fire Activity, Seasonal Fire Anomaly e
Statistical Activity Forecast. Ele não indica probabilidade de ignição nem
risco completo a propriedades. Não altera Firefly Signals.

Baseline sazonal, seasonal naive e SARIMA existentes foram mantidos. O SARIMA
continua opt-in no serviço. Em 2026, observações elegíveis terminam em dezembro
de 2023: 2024–2025 têm deriva orbital e as estimativas VIIRS de 2026 não são
observações de treinamento. Os valores futuros continuam nulos; a interface
explica o motivo e mostra métricas retrospectivas. Backtests não demonstram
disponibilidade de uma previsão corrente. Nenhuma previsão sintética é exibida.

## Publicar e verificar

1. Publicar o FastAPI separadamente com os três arquivos brasileiros existentes,
   `FIREFLY_DATA_ROOT` e `ANALYTICS_API_TOKEN`, inicialmente com um worker.
   O Dockerfile instala os extras API/weather. Montar os produtos meteorológicos
   e sidecars somente quando disponíveis. Não é necessário um token FIRMS para
   consultar os dados já processados.
2. Na Vercel configurar **server-only** `ANALYTICS_API_URL` e o mesmo
   `ANALYTICS_API_TOKEN`. Preservar os arquivos estáticos e o worker MapLibre.
   Fazer deploy conjunto dos dados/manifestos correspondentes. Ver
   [configuração existente](../dynamic-polygon-analytics.md).
3. Executar `node scripts/check-analytics-deployment.mjs https://URL-DO-PREVIEW`.
   `/api/analytics/status` consulta a saúde real do Python sem expor URL privada
   nem token. Configuração ausente e serviço inacessível retornam HTTP 503.
4. Consultar History para um polígono irregular e conferir geometria, fonte e
   `processing_version`. Saúde do serviço não verifica sozinha autenticação,
   igualdade dos dados, performance ou acesso a um produto meteorológico.

Nenhuma configuração de Vercel/credencial de hosting estava disponível para
inspeção nesta sessão. O teste local sem `ANALYTICS_API_URL` confirmou HTTP 503
`analytics_service_unconfigured`. Um processo Next separado foi ligado ao
FastAPI local para verificar os proxies. **Não foi verificado nem alterado o
deploy de produção**, e não foi feito push/merge. Credenciais meteorológicas,
aceite dos termos e hosting precisam ser configurados pelo responsável.

## Verificação e benchmarks

```powershell
node node_modules/vitest/vitest.mjs run
analytics/.venv/Scripts/python.exe -m unittest discover -s analytics/tests -v
analytics/.venv/Scripts/python.exe -m unittest discover -s analytics/integration -v
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js
node scripts/copy-maplibre-worker.mjs
node node_modules/next/dist/bin/next build
```

Esses comandos equivalem aos scripts `pnpm test`, `pnpm lint` e `pnpm build`.
Foram usados os executáveis locais porque o shim `pnpm.cmd` não conseguiu
acessar/verificar a assinatura da versão solicitada no registro. Nenhuma
verificação de assinatura foi desativada; os binários já instalados foram
executados diretamente. Não houve mudança do lockfile JavaScript.

Resultados finais e evidências visuais são registrados em
`browser-results.json`, capturas nesta pasta, [benchmark de API](../scientific-api-benchmark.json)
e [benchmark offline](../continental-paraguay-benchmark.json). O [teste completo
via proxy Next](../scientific-proxy-benchmark.json) mediu History em 1,349 s,
depois 52 ms com cache, e Forecast em 122 ms, com o estado indisponível esperado.
A consulta
irregular de History retornou 293 meses em 1,297 s, depois 0,024 s com cache;
Forecast reutilizando o agregado levou 0,069 s e retornou indisponibilidade
científica. São medições locais individuais, não garantias de throughput.
O reprocessamento offline do Paraguai levou 3,54 s; o download dos 12 membros
levou aproximadamente 55 s, com cerca de 4,2 MB por arquivo remoto consultado.
O maior custo do piloto é a coleta, não o carregamento de um mês no globo.

QA de navegador usa Chrome/Playwright já instalado, sem nova dependência:

```powershell
# Next precisa apontar ao Python local, ambos iniciados conforme o guia existente.
$env:PLAYWRIGHT_MODULE = 'file:///C:/caminho/playwright/index.mjs'
$env:QA_BASE_URL = 'http://localhost:3118'
node scripts/qa-scientific-expansion.mjs
```

Resultado final: **334 testes TypeScript**, **54 testes Python** e **2 testes de
integração** passaram; TypeScript, ESLint e build de produção passaram. QA Chrome
passou nos sete fluxos registrados em `browser-results.json`, sem erros de página.
A regressão existente `qa-firefly-signals.mjs` também passou: anomalias reais,
tooltips, abertura de análise, ativar/desativar, 2D/3D, temas, meses parciais,
mudanças de período, mobile/touch, indisponibilidade e entrada/saída do tour.
O aviso de depreciação Starlette/httpx emitido pelos testes não causou falhas.

O assistente também respeita a cobertura: no piloto retorna contagens brutas
por sensor, identifica ausência de harmonização e recusa datas não cobertas;
regiões globais sem células não são respondidas como atividade zero.

Para repetir o benchmark HTTP completo, iniciar Next e Python e executar
`node scripts/benchmark-analytics.mjs http://localhost:3118`; o resultado vai para
`docs/scientific-proxy-benchmark.json`. Esse teste usa um polígono irregular e
verifica meses reais, cache e ausência de previsões futuras indevidas.

Testes abrangem compatibilidade dos snapshots e schemas, geometria/ausência de
cobertura, isolamento temporal, índices/anomalias existentes, proveniência FWI,
ponderação de interseções/buracos, membros/validades, classes, integridade dos
483 blocos e reconciliação com os downloads reais. Demo continua desativado;
testes de rejeição asseguram que dados brutos/sintéticos não viram sinais.
As capturas de QA usam fundo de mapa controlado para evitar dependência de
serviços externos; não validam disponibilidade do basemap em produção.
