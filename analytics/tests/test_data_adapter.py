import importlib.util
import json
from pathlib import Path
import unittest
from firefly_analytics.data_adapter import from_parquet

ROOT = Path(__file__).resolve().parents[2]
GEOMETRY = json.loads((ROOT/"analytics/examples/region.geojson").read_text())


@unittest.skipUnless((ROOT/"harmonization/output/grid_monthly_total.parquet").exists(),"real Parquet unavailable")
class AdapterIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path=ROOT/"harmonization/pipeline/fire_calendar.py"
        spec=importlib.util.spec_from_file_location("firefly_reference_calendar",path)
        cls.reference=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.reference)

    def compare(self, geometry):
        series=from_parquet(ROOT,"pantanal",geometry)
        reference=self.reference.calendar_for_polygon(geometry,"2002-07","2026-11",ROOT/"harmonization/output")
        for row in series.months:
            self.assertAlmostEqual(row.value,reference["matrix"][row.year][row.month],places=7)
        latest=series.months[-1]
        self.assertAlmostEqual(latest.lower,reference["current"]["lo95"],places=7)
        self.assertAlmostEqual(latest.upper,reference["current"]["hi95"],places=7)
        self.assertFalse(series.months[0].complete)  # pipeline omits this initial partial flag
        self.assertFalse(latest.complete)
        self.assertEqual(latest.source,"modeled_viirs")
        self.assertIn("orbital_drift",next(r for r in series.months if r.date=="2024-09").flags)
        self.assertIn("sensor_outage",next(r for r in series.months if r.date=="2022-04").flags)

    def test_grid_aligned_region_matches_pipeline(self):
        self.compare(GEOMETRY)

    def test_nonrectangular_partial_cells_match_pipeline(self):
        self.compare({"type":"Polygon","coordinates":[[[-57.47,-18.47],[-56.57,-18.43],[-56.83,-17.67],[-57.47,-18.47]]]})

    def test_region_outside_grid_is_not_zero(self):
        with self.assertRaises(ValueError):
            from_parquet(ROOT,"outside",{"type":"Polygon","coordinates":[[[10,10],[11,10],[11,11],[10,11],[10,10]]]})
