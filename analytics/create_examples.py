"""Create compact frontend examples and measured reports, never original data.

Run after the real CLI flow (analytics/output). Every exported example is
validated against result.schema.json. Large per-origin files stay in output/.
"""
from dataclasses import replace
from datetime import datetime, timezone
import importlib.metadata
import hashlib
import sys
import json
from pathlib import Path
import random
import subprocess

from firefly_analytics.data_adapter import from_json
from firefly_analytics.models import Month, RegionalSeries, month_stamp
from firefly_analytics.engine import analyze
from firefly_analytics.forecasting import ForecastConfig, backtest, forecast, engine_fingerprints
from firefly_analytics.export import write_results, validate, assert_finite
from firefly_analytics.fire_weather import from_records
from firefly_analytics.export import envelope
from firefly_analytics.validation import evaluate

ROOT = Path(__file__).resolve().parent


def dump(path, value):
    assert_finite(value)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")


def main():
    output = ROOT / "output"
    series = from_json(output / "regional_input.json")
    main_bt = json.loads((output / "backtest.json").read_text())
    sensitivity = json.loads((output / "backtest_sensitivity.json").read_text())
    if series.region_id != "pantanal-study" or series.provenance.get("data_reference_date") != "2026-11-14":
        raise ValueError("This example generator is for the documented Pantanal snapshot; review before using another dataset")
    if any(bt.get("engine_sources") != engine_fingerprints() for bt in (main_bt,sensitivity)):
        raise ValueError("Backtest code fingerprint changed; rerun the CLI with --sensitivity")
    # Recompute summaries from saved predictions when summary metadata evolves.
    for bt in (main_bt, sensitivity):
        bt["comparison"] = evaluate(bt["records"], bt["origins"], min_origins=bt["config"]["min_validation_origins"])
    generated = datetime.now(timezone.utc).isoformat()
    config = ForecastConfig()
    results = analyze(series, generated_at=generated, evaluation=main_bt, forecast_config=config)
    write_results(results, ROOT / "examples/real")
    # Historical-origin forecast: do not use an evaluation with truth after that origin.
    cutoff = "2023-12"
    truncated = json.loads(json.dumps(main_bt))
    truncated["as_of"] = cutoff
    truncated["records"] = [r for r in main_bt["records"] if r["date"] <= cutoff]
    truncated["comparison"] = evaluate(truncated["records"], truncated["origins"], min_origins=config.min_validation_origins)
    old = forecast(series, config, as_of=cutoff, evaluation=truncated)
    old["limitations"].append("Retrospective demonstration anchored at December 2023; not a current outlook")
    retrospective = envelope("forecast", series, old, {"name": "retrospective_demonstration"}, generated_at=generated, data_status=old["forecast_status"])
    validate(retrospective)
    dump(ROOT / "examples/real/forecast_retrospective.json", retrospective)
    # Clear, reproducible synthetic fixtures with a complete numeric forecast contract.
    rng = random.Random(42)
    seasonal = [5,8,12,20,35,50,80,120,180,90,30,10]
    fake = RegionalSeries("SYNTHETIC_frontend_demo", [Month(month_stamp(2000*12+i), max(0., seasonal[i%12]+rng.gauss(0,2))) for i in range(144)],
                          synthetic=True, provenance={"kind":"synthetic_fixture","seed":42})
    fake_config = ForecastConfig(min_train_months=72, max_origins=16, min_validation_origins=4,
                                  candidates=(((1,0,0),(1,0,0,12)),), maxiter=80)
    fake_results = analyze(fake, forecast_config=fake_config, generated_at=generated)
    write_results(fake_results, ROOT / "examples/synthetic")
    dump(ROOT / "examples/synthetic/input.json", fake.to_input())
    weather = from_records([
        {"issued_at":"2026-11-14T00:00:00Z","valid_at":"2026-11-15T00:00:00Z","lead_hours":24,"latitude":-18.,"longitude":-57.,"fwi":10.},
        {"issued_at":"2026-11-14T00:00:00Z","valid_at":"2026-11-15T00:00:00Z","lead_hours":24,"latitude":-18.,"longitude":-56.8,"fwi":20.}],
        json.loads((ROOT / "examples/region.geojson").read_text()), source_id="synthetic_fixture", synthetic=True)
    weather_result = envelope("fire_weather", fake, weather, {"name":"synthetic_provider_fixture_point_mean"}, generated_at=generated, data_status="synthetic")
    validate(weather_result)
    dump(ROOT / "examples/synthetic/fire_weather.json", weather_result)
    versions = {p: importlib.metadata.version(p) for p in ("firefly-analytics","duckdb","numpy","pandas","shapely","statsmodels","scipy","jsonschema")}
    report = {"generated_at": generated, "data_commit": series.provenance["repository_commit"], "region_id":series.region_id,
              "geometry":series.geometry,"provenance":series.provenance,"versions":versions,
              "configuration":main_bt["config"],"primary":main_bt["comparison"],"drift_sensitivity":sensitivity["comparison"],
              "counts":{"primary_origins":len(main_bt["origins"]),"sensitivity_origins":len(sensitivity["origins"]),
                        "modeled_truth_scored":sum(r["truth_source"]=="modeled_viirs" and r["actual"] is not None for bt in (main_bt,sensitivity) for r in bt["records"])},
              "fit_diagnostics":{"primary_failed_candidates":sum(not c["converged"] for d in main_bt["fit_diagnostics"] for c in d["candidates"]),
                                 "sensitivity_failed_candidates":sum(not c["converged"] for d in sensitivity["fit_diagnostics"] for c in d["candidates"])}}
    report["python"] = sys.version.split()[0]
    report["engine_sources"] = [{"path":p.relative_to(ROOT).as_posix(),"sha256_lf":hashlib.sha256(p.read_bytes().replace(b"\r\n",b"\n")).hexdigest()}
                                for p in sorted((ROOT/"src/firefly_analytics").glob("*.py"))]
    dump(ROOT / "reports/backtest_summary.json",report)
    primary=report["primary"]
    validation_metrics=primary["validation"]["metrics"]
    holdout_winner=min(validation_metrics,key=lambda model:validation_metrics[model]["mae"])
    sarima_wins=all(validation_metrics["sarima"]["mae"] < validation_metrics[m]["mae"] for m in ("seasonal_median","seasonal_naive"))
    lines=["# Resultados reais — Pantanal", "", f"Base de dados/código do repositório: `{report['data_commit']}`. Região: `pantanal-study`, polígono de 1° entre 57,5°W–56,5°W e 18,5°S–17,5°S, {series.provenance['grid_cells']} células.",
           "", f"Geração UTC: {generated}. Python {report['python']}; versões, configuração, hashes e métricas completas em [backtest_summary.json](backtest_summary.json).",
           "", "## Fluxo completo", "", "293 meses de julho/2002 a novembro/2026. Julho/2002 e novembro/2026 são parciais. Histórico, climatologia de doze meses, anomalias operacionais e cinco contratos JSON foram produzidos e validados. Nenhum dado original foi alterado.",
           "", f"Backtest principal: {len(main_bt['origins'])} origens de {main_bt['origins'][0]} a {main_bt['origins'][-1]}; separação seleção/holdout em {primary['selection_cutoff']}. Treino sempre observado; política exclui deriva e meses com falhas documentadas. A sensibilidade admite deriva e usa {len(sensitivity['origins'])} origens de {sensitivity['origins'][0]} a {sensitivity['origins'][-1]}.",
           "", "## Comparação pareada — holdout estável", "", "Os mesmos pares origem/horizonte são usados para comparar os modelos. Os números não são uma métrica da harmonização nem avaliação de incêndios independentes.",
           "", "| Modelo | N | MAE | RMSE | Viés médio | Cobertura nominal 95% |", "|---|---:|---:|---:|---:|---:|"]
    for model,row in primary["validation"]["metrics"].items():
        coverage=f"{100*row['coverage95']:.2f}%" if row["coverage95"] is not None else "não fornecida"
        lines.append(f"| {model} | {row['n']} | {row['mae']:.3f} | {row['rmse']:.3f} | {row['mean_bias']:.3f} | {coverage} |")
    outcome="SARIMA superou ambos os baselines por MAE nesta amostra, sem demonstrar superioridade universal." if sarima_wins else "SARIMA não superou ambos os baselines por MAE nesta amostra; a análise não sustenta promovê-lo por complexidade."
    lines += ["", f"A etapa de seleção anterior ao holdout recomendou **{primary['recommended_model']}** (`{primary['status']}`). A família não é reescolhida retrospectivamente pelo menor erro do holdout. {outcome} O menor MAE entre os três no holdout pareado desta região foi de **{holdout_winner}**.",
              "", "A cobertura observada do intervalo SARIMA é inferior ao nível nominal; não há calibração empírica demonstrada de 95%. Baselines não recebem faixas artificiais. Horizontes sobrepostos não são observações independentes.",
              "", "## Erro por horizonte — casos disponíveis de cada modelo", "", "Denominadores variam: use `paired_by_horizon` no JSON para comparação direta. Esta tabela descreve cada modelo, não um ranking com amostras diferentes.",
              "", "| Horizonte | Modelo | N | MAE | RMSE |", "|---|---|---:|---:|---:|"]
    for model,items in primary["by_horizon"].items():
        for h,row in items.items():
            lines.append(f"| {h} | {model} | {row['n']} | {row['mae']:.3f} | {row['rmse']:.3f} |")
    lines += ["", "## Sensibilidade 2024–2025", "", "Os valores abaixo são contra Aqua observado com deriva, não uma correção nem isolamento causal do efeito orbital. Agregam horizontes sobrepostos 1–3; os resultados por ano e horizonte estão no JSON.",
              "", "| Modelo | N contra observações com deriva | MAE | RMSE | Viés médio |", "|---|---:|---:|---:|---:|"]
    for model,row in sensitivity["comparison"]["by_stratum"]["drift_observed"].items():
        lines.append(f"| {model} | {row['n']} | {row['mae']:.3f} | {row['rmse']:.3f} | {row['mean_bias']:.3f} |")
    h=results["history"]["data"]["summary"]
    sept=results["climatology"]["data"]["months"][8]
    lines += ["", "O holdout dessa janela de sensibilidade contém somente anos com deriva: não fornece a quantidade mínima de casos estáveis para nova validação. Seu status é `not_validated`. Isso não declara que o treino com deriva foi validado, nem usa estimativas de 2026 como verdade.",
              "", "## Resumo descritivo", "", f"Entre anos inteiramente elegíveis pela política conservadora, o maior total é {h['highest_year']}; o mês elegível de maior atividade é {h['highest_month']}. Média mensal elegível: {h['mean_of_valid_monthly_totals']:.3f}; mediana: {h['median_of_valid_monthly_totals']:.3f} focos equivalentes. Anos parcialmente excluídos não participam do ranking anual.",
              "", f"Setembro, referência 2003–2023 com exclusões: {sept['n_years']} anos, média {sept['mean']:.3f}, mediana {sept['median']:.3f}, desvio amostral {sept['std_sample']:.3f}, MAD {sept['mad']:.3f}. A referência e todos os anos usados constam no JSON.",
              "", "## Disponibilidade de previsão atual e FWI", "", "A origem atual solicitada é outubro/2026; o treino conservador termina em dezembro/2023. Mesmo admitindo deriva, a última observação real é dezembro/2025. Portanto o forecast atual retorna `unavailable`, previsões null e motivo explícito: não se apresenta uma extrapolação de muitos meses como um horizonte validado de 1–3 meses.",
              "", "Um forecast numérico **retrospectivo** ancorado em dezembro/2023 está nos exemplos reais, e há fixtures numéricas sintéticas separadas para o frontend. Não são previsões atuais verificadas.",
              "", "Consultas meteorológicas reais retornam `unavailable`: faltam autenticação/termos e integração numérica de fornecedor. O adaptador normalizado é testado com fixtures explicitamente sintéticas, sem calcular FWI por aproximação própria.",
              "", "## Limitações", "", "Uma região, duas especificações SARIMA pequenas e uma janela limitada não validam desempenho nacional ou em qualquer polígono. Dados são de vintage retrospectivo, sem arquivo histórico de publicação. Regimes climáticos, manejo, sensores e falhas podem afetar comparabilidade. Testes de código aprovados não tornam o modelo cientificamente validado. Valores pequenos e zeros não significam ausência de incêndios. A documentação fornece métodos, denominadores, razões de null e fontes para revisão humana.", ""]
    (ROOT/"reports/REAL_DATA_RESULTS.md").write_text("\n".join(lines),encoding="utf-8")
    print(json.dumps({"examples":"real + explicitly synthetic", "real_forecast":results["forecast"]["data_status"],
                      "retrospective_forecast":old["forecast_status"],"synthetic_forecast":fake_results["forecast"]["data_status"],"model":main_bt["comparison"].get("recommended_model")}))


if __name__ == "__main__":
    main()
