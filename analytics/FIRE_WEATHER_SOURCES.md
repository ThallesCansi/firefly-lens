# Fire Danger & Risk Assessment

Atualização: 15/11/2026. **Arquivos numéricos oficiais NASA GFWED/GEOS-5 foram
baixados e integrados.** Inicialização 12/11/2026 00 UTC; datas válidas diárias
15–17/11/2026. O fornecedor os identifica como experimentais. A validação de
bytes, metadados e agregação não demonstra habilidade meteorológica local.
Não há credenciais EWDS; o importador CEMS sazonal continua opcional.

## Produtos e acesso

- [NASA GFWED](https://data.giss.nasa.gov/impacts/gfwed/), fonte ativa: download
  HTTPS público do NCCS, sem autenticação. NetCDF GEOS-5 experimental com FWI
  calculado pelo fornecedor. Os arquivos realmente obtidos têm grade 0,25° ×
  0,3125°, lida das coordenadas. Dados/avisos e atribuição NASA GISS/Columbia e
  Field et al. (2015) são preservados; o NetCDF não declara licença SPDX própria,
  portanto não foi rotulado arbitrariamente CC0/CC-BY. [README oficial](https://portal.nccs.nasa.gov/datashare/GlobalFWI/v2.0/20181216.README.txt).

- [GWIS operacional](https://gwis.jrc.ec.europa.eu/about-gwis/technical-background/fire-danger-forecast):
  modelos determinísticos com resoluções/horizontes distintos. O [acesso CEMS-Fire](https://confluence.ecmwf.int/spaces/CEMS/pages/382667784/CEMS-Fire+Data+access)
  direciona produtos em tempo real ao JRC/EFFIS/GWIS. Esse download operacional
  ainda precisa ser obtido e verificado com o fornecedor. Imagens WMS não são
  valores numéricos de FWI.
- [EWDS CEMS seasonal](https://ewds.climate.copernicus.eu/datasets/cems-fire-seasonal?tab=overview):
  produto escolhido para o leitor. FWI GEFF/ECMWF SEAS5, grade regular terrestre
  global de 1°, validade diária, emissão mensal, até 216 dias. O catálogo atual
  informa publicação no dia 5, um mês atrás: **não é serviço em tempo real**.
  Formatos NetCDF e GRIB, licença CC-BY. DOI: [10.24381/cds.b9c753f1](https://doi.org/10.24381/cds.b9c753f1).
- [EWDS API](https://ewds.climate.copernicus.eu/how-to-api): requer conta/token e
  aceite manual dos termos. Usar a requisição específica gerada no portal.
  Quotas e tempo de fila não foram medidos.
- [Licença GWIS](https://gwis.jrc.ec.europa.eu/about-gwis/data-license): conteúdo
  da UE normalmente CC BY 4.0, sujeito a avisos específicos/direitos de terceiros.
  Preservar a licença e atribuição específicas do produto baixado.

## Leitor e contrato

`fwi_grid.read_netcdf` usa xarray/NetCDF4 com máscara/escala CF. Requer FWI
adimensional, coordenadas geográficas regulares 1D e uma inicialização por arquivo.
CEMS usa coordenadas temporais absolutas. NASA usa as chaves de produto
oficialmente documentadas, explicadas abaixo. Ordena eixos decrescentes e normaliza
longitudes 0–360. Células globais em ±180° são divididas na antimeridiana;
polígonos que a atravessam permanecem não suportados. Recusa grades
reduzidas/irregulares, emissão futura, datas ambíguas ou proveniência incompleta.
GRIB nativo ainda não é lido. Baixar NetCDF ou converter offline preservando
metadados; a compatibilidade com um download oficial concreto está pendente.

`query_fire_weather` usa por padrão `harmonization/output/fire_weather/geos5.nc`
e o sidecar real distribuído. `FIREFLY_FWI_NETCDF`/`FIREFLY_FWI_METADATA` podem
substituí-los (sidecar padrão: mesmo nome, extensão `.json`). Sem produto válido retorna
indisponibilidade, sem números sintéticos. O legado `from_records` mantém médias
de pontos normalizados e não alimenta a nova avaliação espacial da interface.

O cache LRU contém até 48 consultas, chaveadas por geometria, tamanho/mtime dos
dois arquivos e minuto UTC. A integridade SHA-256 é verificada por versão do
arquivo. Validades vencidas são removidas mesmo dentro do minuto do cache.
Atualizar arquivo e sidecar atomicamente. Hash/declaração do operador não
autenticam sozinhos o fornecedor.

### Semântica temporal do produto NASA realmente obtido

O NetCDF nativo contém `time=1`, `units=day`, `calendar=none`, sem origem absoluta.
Não é possível derivar dele um horário UTC de validade. O README oficial define
`YYYYMMDD00/FWI.GEOS-5.Daily.Default.YYYYMMDD00.yyyymmdd.nc`: a primeira chave
é a inicialização; a segunda é a data do campo diário. A [documentação GEOS](https://gmao.gsfc.nasa.gov/gmao-products/geos-near-real-time-data-products/)
identifica o ciclo 00z. O importador decodifica esse contrato documentado,
verifica prefixo/domínio/consistência das chaves e grava a inicialização UTC.
**Não** inventa hora de validade: fornece `valid_date`, `lead_days` e mantém
`valid_at`/`lead_hours` nulos. O campo representa meio-dia local por célula, não
um instante UTC mundial. A inicialização não é o horário exato de publicação,
que permanece desconhecido. O atributo nativo `History` é preservado sem ser
reinterpretado como emissão.

O importador verifica `GEOS-5_FWI`, título/centro do arquivo e hashes dos bytes
originais; resolve a unidade nativa vazia pela definição documentada do FWI
adimensional, sem alterar valores. Subconjunto nativo da América do Sul, sem
interpolação. A grade real prevalece sobre valores aproximados de catálogos.

```powershell
analytics/.venv/Scripts/python.exe analytics/import_gfwed.py --days 3
analytics/.venv/Scripts/python.exe analytics/export_weather.py
```

O primeiro comando descobre a última emissão pública disponível e baixa até três
datas válidas, com no máximo duas transferências simultâneas; arquivos nativos
ficam em `harmonization/data/weather/`, ignorados no Git. O segundo calcula
offline os 16 snapshots geométricos exatos em `public/data/weather/snapshots.json`.
Eles são um fallback durante indisponibilidade do Python, sem copiar resultados
entre áreas. O cliente e o servidor removem datas vencidas. A versão distribuída
vence após 17/11/2026; atualização deve ser agendada no host/CI ou executada pelo
operador. Nenhuma data é alterada para simular frescor.

Snapshots exatos ainda válidos são preferidos antes de consultar o raster no
serviço. O processamento meteorológico tem semáforo próprio e não bloqueia o
worker de History/Forecast. Ao trocar o fornecedor no servidor, regenerar os
snapshots preparados para que ambos publiquem o mesmo produto.

## Agregação e classes

Para polígono P, células C e conjunto V de FWI finito e não negativo:

```
w_i = area_WGS84(P ∩ C_i)
FWI_mean = Σ(V) w_i FWI_i / Σ(V) w_i
coverage = Σ(V) w_i / area_WGS84(P)
fraction(class k) = Σ(V, class(FWI_i)=k) w_i / area_WGS84(P)
```

Os limites da célula ficam meio passo além dos centros regulares. Interseções
preservam buracos/MultiPolygon. Áreas usam `pyproj.Geod`, elipsoide WGS84, com
arestas geográficas densificadas a até 0,1°. A aproximação assume FWI uniforme
na célula. Nulos/negativos não viram zero; a distribuição usa a área **total**
selecionada, incluindo a parcela sem dados. Exibem-se média, maior célula,
distribuição, cobertura, resolução, fonte/modelo, emissão, validade, lead e membro.
Percentil e anomalia permanecem nulos: nenhuma climatologia é reconstruída.

Os membros e datas são mantidos separados. A consulta limita a resposta às
validades dos próximos nove dias, mantendo o lead original, que pode ser muito
maior num produto sazonal atrasado. Isso não o transforma em previsão operacional.

No produto NASA a filtragem usa a data diária, sem inventar subprecisão horária.
As classes abaixo são a convenção GWIS aplicada ao FWI numérico; não são a paleta
de classes da visualização NASA SVS. A interface identifica fornecedor e caráter
experimental separadamente da classificação.

Classes GWIS: Low [0,11.2), Moderate [11.2,21.3), High [21.3,38), Very high
[38,50), Extreme [50,70], Very extreme (70,+∞). Limites compartilhados são
atribuídos à classe superior, exceto 70: GWIS especifica “above 70” para Very
extreme. Classes globais não validam impactos em cada ecossistema.

FWI descreve perigo meteorológico relacionado à intensidade/propagação
potencial. Não é probabilidade de ignição, contagem prevista de incêndios ou
risco completo a pessoas/propriedades. Não é somado a hotspots e não alimenta
Firefly Signals. Risco exige exposição, vulnerabilidade e outros fatores.

## Configurar um arquivo real

Aceitar pessoalmente os termos no EWDS e baixar FWI NetCDF, preservando o
recibo/requisição. Inspecionar os nomes e a semântica das coordenadas. Criar
sidecar com valores **do download real**, substituindo todos os placeholders:

```json
{
  "source_id": "copernicus_ewds_cems_fire_seasonal",
  "synthetic": false,
  "sha256": "<SHA-256 dos bytes do NetCDF>",
  "licence": "<licença e atribuição do download>",
  "retrieved_at": "<instante real UTC ISO 8601>",
  "request_id": "<identificador da requisição EWDS>",
  "meteorological_source": "<modelo documentado no produto>",
  "system_version": "<versão no produto>",
  "variables": {
    "fwi": "fwi", "latitude": "latitude", "longitude": "longitude",
    "issued_at": "forecast_reference_time", "valid_at": "valid_time", "member": "number"
  }
}
```

`variables` mapeia nomes reais. Um `time` escalar pode representar a emissão e
`valid_time(step)` a validade. Selecionar uma emissão offline se necessário.
Se a conversão perdeu a emissão ou a grade, o leitor deve recusar o arquivo.
Não inventar timestamps pelo nome do arquivo.

```powershell
uv pip install --python analytics/.venv --editable 'analytics[api,weather]'
$env:FIREFLY_FWI_NETCDF = 'C:/data/cems-fwi.nc'
$env:FIREFLY_FWI_METADATA = 'C:/data/cems-fwi.json'
# iniciar/reiniciar o FastAPI; no container montar arquivos somente para leitura
```

Testes: `test_fwi_grid.py`, `test_fire_weather.py`, `test_official_weather.py`, `weather.test.ts` e
`FireDangerAssessment.test.tsx`. Verificam proveniência, datas/leads, membros,
frações, buracos, cobertura, classes e separação sintética. O teste de integração
reconcilia hashes originais, datas do produto NASA, ausência de horários inventados
e expiração. Permanecem pendentes: download EWDS real, integração Copernicus
operacional, atualização automática no host e validação meteorológica local.

## Referências

- Field, R. D. et al. (2015). *Development of a Global Fire Weather Database*.
  Natural Hazards and Earth System Sciences, 15, 1407–1423.
  DOI: [10.5194/nhess-15-1407-2015](https://doi.org/10.5194/nhess-15-1407-2015).

- Van Wagner, C. E.; Pickett, T. L. (1985). *Equations and FORTRAN program for
  the Canadian Forest Fire Weather Index System*. Canadian Forestry Service,
  Forestry Technical Report 33. [Registro](https://purl.org/INRMM-MiD/c-14026112).
- Di Giuseppe, F. et al. (2016). *The Potential Predictability of Fire Danger
  Provided by Numerical Weather Prediction*. Journal of Applied Meteorology and
  Climatology, 55, 2469–2491. DOI: [10.1175/JAMC-D-15-0297.1](https://doi.org/10.1175/JAMC-D-15-0297.1).
- Di Giuseppe, F. et al. (2024). *Global seasonal prediction of fire danger*.
  Scientific Data, 11, 128. DOI: [10.1038/s41597-024-02948-3](https://doi.org/10.1038/s41597-024-02948-3).
- CEMS (2023, catálogo atualizado). *Seasonal forecast of fire danger indices*.
  DOI: [10.24381/cds.b9c753f1](https://doi.org/10.24381/cds.b9c753f1).
