import copy
from dataclasses import replace
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from threading import Event

from fastapi.testclient import TestClient
from firefly_analytics.service import create_app, META_KEYS, AnalyticsRequest
from firefly_analytics.data_adapter import from_parquet
from firefly_analytics.forecasting import ForecastConfig, backtest, forecast
from support import synthetic

ROOT = Path(__file__).resolve().parents[2]


def rectangle(w, s, e, n):
    return {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}


class ServiceTests(unittest.TestCase):
    def test_exact_country_history_and_past_forecast_never_borrow_brazilian_border_cells(self):
        coverage=json.loads((ROOT/'public/data/coverage.json').read_text())
        entry=next(d for d in coverage['datasets'] if d['country_code']=='PRY')
        response=self.post(body=self.request(entry['geometry']))
        self.assertEqual(response.status_code,200,response.text[:500])
        bundle=response.json()
        history=bundle['sections']['history']
        self.assertEqual(history['source']['provenance']['kind'],'real_country_harmonized')
        self.assertEqual(history['source']['provenance']['country_code'],'PRY')
        self.assertEqual(len(history['data']['monthly']),282)
        self.assertEqual(history['data']['monthly'][0]['date'],'2002-07')
        retro=self.post('retrospective',self.request(entry['geometry'],forecast_origin='2016-09'))
        self.assertEqual(retro.status_code,200,retro.text[:500])
        forecast=retro.json()['sections']['forecast']['data']
        self.assertEqual(forecast['forecast_origin'],'2016-09')
        self.assertLessEqual(forecast['training_period']['end'],'2016-09')
        self.assertEqual([p['date'] for p in forecast['predictions']],['2016-10','2016-11','2016-12'])
        self.assertTrue(all(p['value'] is not None for p in forecast['predictions']))
        invalid=self.post('retrospective',self.request(entry['geometry'],forecast_origin='2025-12'))
        self.assertEqual(invalid.status_code,422)

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(create_app(ROOT, token="test-token", enable_sarima=False))
        cls.meta = json.loads((ROOT / "public/data/brazil/meta.json").read_text())
        cls.geometry = rectangle(-57.5, -18.5, -56.5, -17.5)

    def request(self, geometry=None, **changes):
        return {"schema_version": "1.0.0", "geometry": geometry or self.geometry,
                "data_version": {key: self.meta[key] for key in META_KEYS}, "horizon": 3, **changes}

    def post(self, section="history", body=None):
        return self.client.post(f"/analytics/{section}", json=body or self.request(),
                                headers={"Authorization": "Bearer test-token"})

    def test_real_shapes_contract_and_no_temporal_leakage(self):
        preset = self.meta["presets"][0]
        states = json.loads((ROOT / "public/interaction-boundaries/states.geojson").read_text(encoding="utf-8"))
        state = min(states["features"], key=lambda f: len(json.dumps(f["geometry"])))
        geometries = {
            "preset": preset["geometry"],
            "custom_rectangle": self.geometry,
            "irregular": {"type": "Polygon", "coordinates": [[[-57.47, -18.47], [-56.57, -18.43], [-56.83, -17.67], [-57.47, -18.47]]]},
            "brazilian_state": state["geometry"],
            "small": rectangle(-57.01, -18.01, -57, -18),
        }
        for name, geometry in geometries.items():
            with self.subTest(name=name):
                result = self.post(body=self.request(geometry))
                self.assertEqual(result.status_code, 200, result.text[:500])
                sections = result.json()["sections"]
                h = sections["history"]["data"]
                self.assertEqual(len(h["monthly"]), 293)
                self.assertFalse(h["monthly"][0]["complete"])
                self.assertFalse(h["annual"][-1]["complete"])
                for row in sections["anomalies"]["data"]["months"]:
                    self.assertTrue(all(year < int(row["date"][:4]) for year in row["reference"]["years_used"]))
                self.assertFalse(sections["history"]["source"]["synthetic"])
                self.assertIn("0.25", " ".join(sections["history"]["limitations"]))

    def test_dynamic_equals_preprocessed_same_region(self):
        preset = self.meta["presets"][0]
        geometry = preset["geometry"]
        dynamic = self.post(body=self.request(geometry)).json()["sections"]
        prepared = json.loads((ROOT / f"public/analytics/{preset['id']}.json").read_text(encoding="utf-8"))["sections"]
        for section in ("history", "climatology", "anomalies"):
            # Fractional polygon weights and statistics use the same existing functions.
            self.assertEqual(dynamic[section]["data"], prepared[section]["data"])

    def test_outside_invalid_and_untrusted_input(self):
        self.assertEqual(self.post(body=self.request(rectangle(10, 10, 11, 11))).json()["detail"], "region_outside_coverage")
        invalid = {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]}
        self.assertEqual(self.post(body=self.request(invalid)).status_code, 422)
        self.assertEqual(self.post(body=self.request(months=[], provenance={"real": True})).status_code, 422)
        self.assertEqual(self.post(body=self.request(horizon=12)).status_code, 422)
        self.assertEqual(self.post(body=self.request(data_version={})).status_code, 409)
        self.assertEqual(self.client.post("/analytics/history", json=self.request()).status_code, 401)
        unclosed = copy.deepcopy(self.geometry)
        unclosed["coordinates"][0].pop()
        self.assertEqual(self.post(body=self.request(unclosed)).status_code, 422)

    def test_published_request_schema_matches_runtime(self):
        schema = json.loads((ROOT / "analytics/schemas/request.schema.json").read_text())
        self.assertEqual(schema, AnalyticsRequest.model_json_schema())

    def test_cache_reuses_aggregation_and_binds_region(self):
        client = TestClient(create_app(ROOT, enable_sarima=False, token=""))
        with patch("firefly_analytics.service.from_parquet", wraps=from_parquet) as aggregate:
            first = client.post("/analytics/history", json=self.request())
            reversed_geometry = copy.deepcopy(self.geometry)
            reversed_geometry["coordinates"][0].reverse()
            second = client.post("/analytics/forecast", json=self.request(reversed_geometry))
            third = client.post("/analytics/forecast", json=self.request())
            self.assertEqual(first.status_code, 200)
            self.assertEqual(second.status_code, 200, second.text[:500])
            self.assertEqual(second.json(), third.json())
            self.assertEqual(aggregate.call_count, 1)
            f = second.json()["sections"]["forecast"]["data"]
            self.assertEqual(f["forecast_status"], "unavailable")
            self.assertTrue(all(p["value"] is None for p in f["predictions"]))
            self.assertNotIn("sarima", f["backtesting"]["validation"]["metrics"])

    def test_model_failure_keeps_history_available(self):
        with patch("firefly_analytics.service.forecast", side_effect=RuntimeError("fit failed")):
            client = TestClient(create_app(ROOT, enable_sarima=False, token=""))
            self.assertEqual(client.post("/analytics/forecast", json=self.request()).status_code, 500)
            self.assertEqual(client.post("/analytics/history", json=self.request()).status_code, 200)

    def test_container_without_git_preserves_file_provenance(self):
        with patch("firefly_analytics.data_adapter.subprocess.run", side_effect=FileNotFoundError):
            series = from_parquet(ROOT, "container-region", self.geometry)
        self.assertIsNone(series.provenance["repository_commit"])
        self.assertEqual(len(series.provenance["files"]), 3)
        self.assertTrue(all(len(f["sha256"]) == 64 for f in series.provenance["files"]))

    def test_backtest_of_another_region_is_recomputed(self):
        config = ForecastConfig(min_train_months=48, min_season_years=2, max_origins=8,
                                min_validation_origins=2, enable_sarima=False)
        a = synthetic(12)
        evaluation = backtest(a, config)
        b = synthetic(12)
        b.region_id = "another-region"
        b.months = [replace(row, value=row.value * 10) for row in b.months]
        with patch("firefly_analytics.forecasting.backtest", wraps=backtest) as recompute:
            result = forecast(b, config, evaluation=evaluation)
            self.assertEqual(recompute.call_count, 1)
            self.assertEqual(result["forecast_status"], "experimental")
            self.assertTrue(all(p["value"] is not None for p in result["predictions"]))

    def test_real_retrospective_origin_uses_only_past_evidence_and_matches_current_geometry(self):
        body={**self.request(), 'forecast_origin':'2023-09'}
        response=self.client.post('/analytics/retrospective',json=body,headers={'Authorization':'Bearer test-token'})
        self.assertEqual(response.status_code,200,response.text[:300])
        data=response.json()['sections']['forecast']['data']
        self.assertEqual(data['forecast_origin'],'2023-09')
        self.assertEqual(data['last_complete_observation_used'],'2023-09')
        self.assertLessEqual(data['training_period']['end'],'2023-09')
        self.assertEqual([p['date'] for p in data['predictions']],['2023-10','2023-11','2023-12'])
        self.assertEqual(data['forecast_status'],'experimental')
        self.assertTrue(all(p['value'] is not None for p in data['predictions']))
        self.assertEqual(self.client.post('/analytics/retrospective',json={**body,'forecast_origin':'2026-10'},headers={'Authorization':'Bearer test-token'}).status_code,422)
        self.assertEqual(self.client.post('/analytics/retrospective',json=body).status_code,401)

    def test_slow_weather_initialization_does_not_lock_historical_analytics(self):
        from firefly_analytics.fire_weather import unavailable
        active,release=Event(),Event()
        def slow_weather(*args):
            active.set(); release.wait(10)
            return unavailable('software_test_slow_provider')
        client=TestClient(create_app(ROOT,token='',enable_sarima=False))
        with patch('firefly_analytics.service.query_fire_weather',side_effect=slow_weather),ThreadPoolExecutor(max_workers=2) as pool:
            pending=pool.submit(client.post,'/analytics/fire-weather',json=self.request())
            self.assertTrue(active.wait(5))
            try:
                response=client.post('/analytics/history',json=self.request())
                self.assertEqual(response.status_code,200,response.text[:300])
            finally: release.set()
            self.assertEqual(pending.result().status_code,200)


if __name__ == "__main__":
    unittest.main()
