# Fire Weather Outlook: disponibilidade verificada e escopo

Consulta documental realizada em 14/11/2026. Não foram fornecidas credenciais meteorológicas, aceitas licenças em nome do usuário nem baixados grids de previsão.

| Fonte oficial | O que foi confirmado | Acesso/formato e limite desta entrega |
|---|---|---|
| [EFFIS: dados e serviços](https://forest-fire.emergency.copernicus.eu/applications/data-and-services) e [instruções](https://forest-fire.emergency.copernicus.eu/downloads-instructions) | Existem camadas de FWI e outros índices de perigo. As instruções mostram WMS/GetMap em TIFF com parâmetro TIME. | Um mapa WMS não garante acesso a valores numéricos, emissão e todos os horizontes. Não foi inferida cobertura brasileira a partir de um exemplo europeu. |
| [Licença EFFIS](https://forest-fire.emergency.copernicus.eu/about-effis/data-license) | Conteúdo da UE é em geral CC BY 4.0, com exceções/avisos individuais e exigência de atribuição. | Conferir os termos do produto e direitos de terceiros antes de redistribuir dados específicos. |
| [GWIS: base técnica](https://gwis.jrc.ec.europa.eu/about-gwis/technical-background/fire-danger-forecast) | Há modelos meteorológicos com horizontes próprios e índices derivados. | Não presumir um único horizonte ou tratar a documentação de um viewer como contrato de API numérica. |
| [EWDS: cems-fire-seasonal](https://ewds.climate.copernicus.eu/datasets/cems-fire-seasonal?tab=overview), DOI [10.24381/cds.b9c753f1](https://doi.org/10.24381/cds.b9c753f1) | Produto global em grade/ensemble, formatos GRIB/NetCDF, licença indicada CC-BY. É um produto sazonal com atualização atrasada, distinto de um serviço operacional em tempo real. | Não foi implementado o decodificador desses formatos. Acesso deve preservar emissão, validade, lead e membro, sem inventar timestamps a partir do nome do arquivo. |
| [EWDS: configuração API](https://ewds.climate.copernicus.eu/how-to-api) | Requer conta/token e aceitação manual dos termos do dataset; a página oferece o código de requisição específico. | Não há token configurado nesta entrega. Não se assumiu acesso anônimo automatizado. Quotas/limites operacionais para esta consulta não foram confirmados; devem ser verificados antes da integração. |
| [ECMWF/CEMS User Guide](https://confluence.ecmwf.int/spaces/CEMS/pages/340760643/User+Guide) | Documenta o sistema GEFF e o papel dos índices meteorológicos. Referência científica: Di Giuseppe et al., *Global seasonal prediction of fire danger*, Scientific Data 11, 128 (2024), DOI [10.1038/s41597-024-02948-3](https://doi.org/10.1038/s41597-024-02948-3). | Essa documentação não valida o desempenho do nosso adaptador nem transforma FWI em contagem de hotspots. |

## Adaptador entregue

`query_fire_weather` retorna `unavailable` para consultas reais não configuradas, com resultados vazios e motivo. Não busca credenciais, não calcula um FWI aproximado e não preenche resultados com números fictícios.

`from_records` aceita importações JSON **normalizadas** de índices de um identificador de fonte verificado, ou fixtures explicitamente sintéticas. Para dados reais, exige proveniência informada pelo importador; isso não autentica automaticamente os bytes do fornecedor. Os registros precisam informar latitude/longitude, FWI não negativo ou null, `issued_at`/`valid_at` em UTC, `lead_hours` consistente e membro de ensemble quando aplicável. Duplicatas e datas/coordenadas inválidas são rejeitadas.

A agregação entregue é a média aritmética dos pontos fornecidos dentro do polígono, por emissão/validade/lead/membro. Ela **não** é uma média de área de um raster: para isso faltam decodificação, células/footprints e interseção ponderada do fornecedor. Pontos fora da região são removidos; valores ausentes não viram zero; membros e horizontes não são misturados. O produto de origem e os timestamps permanecem no objeto exportado.

Próxima integração: escolher produto e latência adequados; obter autorização/termos/token; implementar e testar o leitor GRIB/NetCDF com metadados reais; verificar limites e política de cache; definir pesos espaciais com footprints e área; medir cobertura de dados e qualidade. Nenhuma dessas etapas é presumida concluída.

FWI representa perigo meteorológico. A previsão estatística do motor representa atividade regional na escala MODIS-Aqua. Não são combinados, somados nem convertidos entre si.
