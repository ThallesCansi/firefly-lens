"""Integration checks of shipped real outputs, independent of UI assumptions."""
import hashlib
import json
from pathlib import Path
import sys
import unittest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "analytics/src"))
from firefly_analytics.export import validate, assert_finite
from firefly_analytics.forecasting import engine_fingerprints


class SiteExports(unittest.TestCase):
    def test_exports_match_engine_schema_source_version_and_exact_regions(self):
        meta = json.loads((REPO / "public/data/brazil/meta.json").read_text())
        manifest = json.loads((REPO / "public/analytics/manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["engine_sources"], engine_fingerprints())
        self.assertEqual({r["id"] for r in manifest["regions"]}, {r["id"] for r in meta["presets"]})
        for key, value in manifest["data_meta"].items():
            self.assertEqual(value, meta[key])
        for region in manifest["regions"]:
            raw = (REPO / "public/analytics" / (region["id"] + ".json")).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), region["sha256"])
            bundle = json.loads(raw)
            assert_finite(bundle)
            preset = next(r for r in meta["presets"] if r["id"] == region["id"])
            w, s, e, n = preset["bbox"]
            self.assertEqual(bundle["geometry"], {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]})
            for section, payload in bundle["sections"].items():
                validate(payload)
                self.assertEqual(payload["section"], section)
                self.assertFalse(payload["source"]["synthetic"])
                self.assertEqual(payload["geometry"], bundle["geometry"])
                self.assertEqual(payload["region_id"], region["id"])
            forecast = bundle["sections"]["forecast"]["data"]
            self.assertEqual(forecast["forecast_origin"], meta["seriesEnd"])
            self.assertTrue(all(p["date"] > forecast["forecast_origin"] for p in forecast["predictions"]))
            if forecast["forecast_status"] != "experimental":
                self.assertTrue(all(p["value"] is None for p in forecast["predictions"]))


if __name__ == "__main__":
    unittest.main()
