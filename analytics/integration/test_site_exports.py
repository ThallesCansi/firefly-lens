"""Integration checks of shipped real outputs, independent of UI assumptions."""
import hashlib
import json
from pathlib import Path
import sys
import subprocess
import unittest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "analytics/src"))
from firefly_analytics.export import validate, assert_finite
from firefly_analytics.forecasting import engine_fingerprints


class SiteExports(unittest.TestCase):
    def test_exports_match_engine_schema_source_version_and_exact_regions(self):
        meta = json.loads((REPO / "public/data/brazil/meta.json").read_text())
        manifest = json.loads((REPO / "public/analytics/manifest.json").read_text(encoding="utf-8"))
        # Archived results retain the exact engine that generated them. Verify
        # those immutable Git sources instead of relabeling them as the live API.
        commit = manifest.get("engine_commit")
        if commit:
            self.assertRegex(commit, r"^[a-f0-9]{40}$")
            files = subprocess.run(["git", "-C", str(REPO), "ls-tree", "--name-only", f"{commit}:analytics/src/firefly_analytics"],
                                   capture_output=True, check=True).stdout.decode().splitlines()
            hashes = {}
            for name in sorted(f for f in files if f.endswith(".py")):
                raw = subprocess.run(["git", "-C", str(REPO), "show", f"{commit}:analytics/src/firefly_analytics/{name}"],
                                     capture_output=True, check=True).stdout
                hashes[name] = hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest()
            self.assertEqual(manifest["engine_sources"], hashes)
        else:
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
            self.assertEqual(bundle["geometry"], preset["geometry"])
            self.assertEqual(region["geometry"], preset["geometry"])
            self.assertEqual(region.get("representative_point"), preset["representative_point"])
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
