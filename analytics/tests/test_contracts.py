import copy
import json
from pathlib import Path
import tempfile
import unittest
from firefly_analytics.engine import analyze
from firefly_analytics.export import validate, write_results
from firefly_analytics.data_adapter import from_json
from firefly_analytics.models import Reference
from support import synthetic

ROOT = Path(__file__).resolve().parents[1]


class ContractTests(unittest.TestCase):
    def test_all_sections_serialize_finitely_and_validate(self):
        results = analyze(synthetic(8), reference=Reference(2000,2007,5), run_forecast=False,
                          generated_at="2026-11-14T12:00:00+00:00")
        self.assertEqual(set(results),{"history","climatology","anomalies","forecast","fire_weather"})
        for result in results.values():
            validate(result)
            json.dumps(result,allow_nan=False)
            self.assertTrue(result["source"]["synthetic"])
        self.assertEqual(results["fire_weather"]["data_status"],"unavailable")
        with tempfile.TemporaryDirectory() as tmp:
            write_results(results,tmp)
            self.assertEqual(len(list(Path(tmp).glob("*.json"))),5)

    def test_bad_numeric_and_malformed_contracts_rejected(self):
        result = analyze(synthetic(3),run_forecast=False)["history"]
        broken=copy.deepcopy(result)
        broken["data"]["monthly"][0]["value"]=float("nan")
        with self.assertRaises(ValueError): validate(broken)
        broken=copy.deepcopy(result)
        del broken["region_id"]
        with self.assertRaises(ValueError): validate(broken)

    def test_published_schema_equals_installed_resource(self):
        for name in ("result", "input"):
            self.assertEqual(json.loads((ROOT/f"schemas/{name}.schema.json").read_text()),
                             json.loads((ROOT/f"src/firefly_analytics/{name}.schema.json").read_text()))

    def test_input_roundtrip_preserves_missing_and_zero(self):
        s=synthetic(2)
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"series.json"
            path.write_text(json.dumps(s.to_input()))
            loaded=from_json(path)
            self.assertEqual(loaded.months,s.months)
            raw=s.to_input()
            raw["units"]="fires"
            path.write_text(json.dumps(raw))
            with self.assertRaises(ValueError): from_json(path)

    def test_frontend_example_contracts_and_synthetic_labels(self):
        for kind in ("real","synthetic"):
            paths=list((ROOT/f"examples/{kind}").glob("*.json"))
            self.assertGreaterEqual(len(paths),5)
            for path in paths:
                if path.name=="input.json":
                    self.assertTrue(from_json(path).synthetic)
                    continue
                result=json.loads(path.read_text(encoding="utf-8"))
                validate(result)
                self.assertEqual(result["source"]["synthetic"],kind=="synthetic")

    def test_weather_units_cannot_be_hotspot_units(self):
        result=analyze(synthetic(3),run_forecast=False)["fire_weather"]
        result["units"]="MODIS-Aqua-equivalent hotspots"
        with self.assertRaises(ValueError): validate(result)
