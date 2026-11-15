import unittest
from dataclasses import replace
from unittest.mock import patch
from firefly_analytics.forecasting import ForecastConfig, training_values, seasonal_median, seasonal_naive, sarima, backtest, forecast
from firefly_analytics.models import Month, month_stamp
from firefly_analytics.validation import evaluate, metrics
from support import synthetic, no_sarima


class ForecastTests(unittest.TestCase):
    def test_baselines_use_only_train_and_previous_calendar_year(self):
        train = [(f"{y}-01",float(y-2000)) for y in range(2000,2005)]
        self.assertEqual(seasonal_median(train,["2005-01"],5)[0]["value"],2)
        self.assertEqual(seasonal_naive(train,["2005-01"])[0]["value"],4)
        self.assertIsNone(seasonal_naive(train,["2005-02"])[0]["value"])

    def test_missing_modeled_partial_drift_and_availability_filtered(self):
        series = synthetic(4)
        for index, updates in enumerate([dict(source="modeled_viirs"),dict(complete=False),dict(flags=("orbital_drift",)),dict(available_at="2004-01-01")]):
            series.months[index] = replace(series.months[index],**updates)
        train = training_values(series,"2003-12",ForecastConfig())
        self.assertTrue(all(value is None for _,value in train[:4]))
        self.assertIsNotNone(training_values(series,"2003-12",ForecastConfig(include_drift=True))[2][1])

    def test_backtest_no_future_leakage_and_horizons(self):
        series = synthetic(9)
        config = ForecastConfig(min_train_months=48,min_season_years=2,max_origins=8,min_validation_origins=2)
        with patch("firefly_analytics.forecasting.sarima",side_effect=no_sarima):
            first = backtest(series,config)
            origin = first["origins"][0]
            baseline = [r for r in first["records"] if r["origin"]==origin]
            series.months = [replace(r,value=r.value+99999) if r.date > origin else r for r in series.months]
            second = [r for r in backtest(series,config)["records"] if r["origin"]==origin]
        for a,b in zip(baseline,second):
            self.assertEqual(a["prediction"],b["prediction"])
            self.assertLess(a["training_end"],a["date"])
        self.assertEqual({r["horizon"] for r in first["records"]},{1,2,3})

    def test_modeled_truth_never_scored_and_stale_forecast_withheld(self):
        series = synthetic(10)
        for i in range(-12,0): series.months[i] = replace(series.months[i],source="modeled_viirs")
        config = ForecastConfig(min_train_months=48,min_season_years=2,max_origins=24,min_validation_origins=2)
        with patch("firefly_analytics.forecasting.sarima",side_effect=no_sarima):
            bt = backtest(series,config)
            result = forecast(series,config,as_of=series.months[-1].date,evaluation=bt)
        modeled = [r for r in bt["records"] if r["truth_source"]=="modeled_viirs"]
        self.assertTrue(modeled)
        self.assertTrue(all(r["actual"] is None for r in modeled))
        self.assertEqual(result["forecast_status"],"unavailable")
        self.assertTrue(all(r["value"] is None for r in result["predictions"]))

    def test_sarima_runs_real_fit_on_reproducible_synthetic_series(self):
        series = synthetic(10)
        config = ForecastConfig(min_train_months=48,candidates=(((1,0,0),(1,0,0,12)),),maxiter=100)
        result,diag = sarima(training_values(series,"2009-12",config),3,config)
        self.assertTrue(diag["candidates"])
        self.assertTrue(all(row["value"] is not None and row["value"] >= 0 for row in result))
        self.assertTrue(all(row["lower"] <= row["upper"] for row in result))
        self.assertIn("sarima_log_gaussian", diag["interval_method"])

    def test_metrics_and_simple_model_selected_when_better(self):
        records=[]
        origins=[month_stamp(2000*12+i) for i in range(24)]
        for origin in origins:
            for h in range(1,4):
                for model,error in [("seasonal_median",0.),("seasonal_naive",1.),("sarima",10.)]:
                    records.append(dict(origin=origin,date=month_stamp(int(origin[:4])*12+int(origin[5:])-1+h),horizon=h,
                                        model=model,actual=10.,prediction=10.+error,lower=None,upper=None,stratum="stable_observed"))
        result=evaluate(records,origins,min_origins=3)
        self.assertEqual(result["recommended_model"],"seasonal_median")
        self.assertEqual(result["status"],"experimental_backtested")
        self.assertEqual(metrics([dict(origin="2000-01",actual=2,prediction=4)])["mean_bias"],2)

    def test_insufficient_series_not_validated(self):
        with patch("firefly_analytics.forecasting.sarima",side_effect=no_sarima):
            self.assertEqual(backtest(synthetic(2))["comparison"]["status"],"not_validated")

    def test_historical_forecast_selection_cannot_use_future_backtest(self):
        series=synthetic(12)
        config=ForecastConfig(min_train_months=48,min_season_years=2,max_origins=8,min_validation_origins=2)
        with patch("firefly_analytics.forecasting.sarima",side_effect=no_sarima):
            future=backtest(series,config)
            result=forecast(series,config,as_of="2008-12",evaluation=future)
            past=backtest(series,config,as_of="2008-12")
        self.assertTrue(all(r["date"] <= "2008-12" for r in past["records"]))
        self.assertEqual(result["backtesting"],past["comparison"])

    def test_actual_sarima_temporal_predictions_ignore_later_observations(self):
        series=synthetic(8)
        config=ForecastConfig(min_train_months=48,min_season_years=2,max_origins=4,min_validation_origins=2,
                              candidates=(((1,0,0),(1,0,0,12)),),maxiter=100)
        first=backtest(series,config)
        origin=first["origins"][0]
        expected=[r["prediction"] for r in first["records"] if r["origin"]==origin and r["model"]=="sarima"]
        self.assertTrue(all(v is not None for v in expected))
        series.months=[replace(r,value=r.value+10000) if r.date>origin else r for r in series.months]
        train=training_values(series,origin,config)
        actual,_=sarima(train,3,config)
        for a,b in zip(expected,actual): self.assertAlmostEqual(a,b["value"],places=7)

    def test_failed_convergence_is_missing_forecast_not_zero(self):
        from types import SimpleNamespace
        with patch("statsmodels.tsa.statespace.sarimax.SARIMAX") as mock:
            mock.return_value.fit.return_value=SimpleNamespace(mle_retvals={"converged":False},aic=100.)
            rows,diagnostic=sarima([(month_stamp(2000*12+i),float(i%12)) for i in range(60)],3,ForecastConfig())
        self.assertTrue(all(row["value"] is None and row["reason"]=="sarima_fit_failed" for row in rows))

    def test_sarima_tuning_winner_is_rejected_when_baselines_win_holdout(self):
        origins=[month_stamp(2000*12+i) for i in range(24)]
        records=[]
        for i,origin in enumerate(origins):
            for h in range(1,4):
                for model in ("seasonal_median","seasonal_naive","sarima"):
                    error=(0 if i<12 else 10) if model=="sarima" else (1 if model=="seasonal_median" else 2)
                    records.append(dict(origin=origin,date=month_stamp(2000*12+i+h),horizon=h,model=model,
                                        actual=10.,prediction=10.+error,lower=None,upper=None,stratum="stable_observed"))
        result=evaluate(records,origins,min_origins=3)
        self.assertEqual(result["selection_candidate"],"sarima")
        self.assertEqual(result["recommended_model"],"seasonal_median")
        self.assertIn("fallback",result["reason"])
