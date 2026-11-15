import unittest
from unittest.mock import patch
from firefly_analytics.fire_weather import query_fire_weather, from_records

GEOMETRY = {"type":"Polygon","coordinates":[[[-58,-19],[-56,-19],[-56,-17],[-58,-17],[-58,-19]]]}


def sample(**kwargs):
    return {"issued_at":"2026-11-14T00:00:00Z", "valid_at":"2026-11-15T00:00:00Z", "lead_hours":24,
            "latitude":-18.,"longitude":-57.,"fwi":10.,**kwargs}


class WeatherTests(unittest.TestCase):
    def test_real_query_without_source_is_unavailable(self):
        with patch.dict('os.environ',{'FIREFLY_FWI_NETCDF':'missing-provider-file.nc'}):
            result=query_fire_weather("pantanal",GEOMETRY)
        self.assertEqual(result["status"],"unavailable")
        self.assertEqual(result["forecasts"],[])

    def test_explicit_synthetic_sample_mean_and_original_leads(self):
        rows=[sample(),sample(longitude=-56.5,fwi=20.),sample(latitude=0,longitude=0,fwi=999)]
        result=from_records(rows,GEOMETRY,source_id="synthetic_fixture",synthetic=True)
        self.assertEqual(result["status"],"synthetic")
        self.assertEqual(result["forecasts"][0]["value"],15.)
        self.assertEqual(result["forecasts"][0]["lead_hours"],24)
        self.assertEqual(result["forecasts"][0]["valid_samples"],2)

    def test_members_and_nulls_are_preserved(self):
        result=from_records([sample(member=1),sample(member=2,fwi=None)],GEOMETRY,source_id="synthetic_fixture",synthetic=True)
        self.assertEqual(len(result["forecasts"]),2)
        self.assertIsNone(result["forecasts"][1]["value"])
        self.assertEqual(result["forecasts"][1]["null_reason"],"all_samples_missing")

    def test_invalid_samples_unmarked_fixtures_and_duplicates_rejected(self):
        with self.assertRaises(ValueError): from_records([sample()],GEOMETRY,source_id="synthetic_fixture")
        for change in ({"lead_hours":48},{"latitude":100},{"fwi":float("inf")},{"issued_at":"2026-11-14T00:00:00"}):
            with self.assertRaises(ValueError): from_records([sample(**change)],GEOMETRY,source_id="synthetic_fixture",synthetic=True)
        with self.assertRaises(ValueError): from_records([sample(),sample()],GEOMETRY,source_id="synthetic_fixture",synthetic=True)
