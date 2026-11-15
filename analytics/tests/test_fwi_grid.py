"""Generated NetCDF software fixtures; never published as meteorological data."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import xarray as xr
from fastapi.testclient import TestClient

from firefly_analytics.fwi_grid import read_netcdf, classify
from firefly_analytics.fire_weather import query_fire_weather
from firefly_analytics.service import create_app
from firefly_analytics.export import envelope, validate
from support import synthetic

GEOMETRY = {"type": "Polygon", "coordinates": [[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]]}
NOW = datetime(2026, 11, 15, tzinfo=timezone.utc)


class GridTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "forecast.nc"
        self.meta = self.path.with_suffix(".json")
        self.dataset = xr.Dataset({"fwi": (("valid_time", "number", "latitude", "longitude"),
            np.array([[[[10., 75.], [np.nan, 30.]], [[20., 60.], [40., 80.]]]]), {"units": "1"})},
            coords={"latitude": [-.5,.5], "longitude": [-.5,.5], "number": [0,1],
                    "forecast_reference_time": np.datetime64("2026-11-01T00:00:00"),
                    "valid_time": [np.datetime64("2026-11-16T00:00:00")]})
        self.save()

    def save(self):
        self.dataset.to_netcdf(self.path)
        self.meta.write_text(json.dumps({"source_id": "copernicus_ewds_cems_fire_seasonal",
            "synthetic": False, "licence": "CC-BY", "retrieved_at": "2026-11-14T00:00:00Z",
            "request_id": "software-test-only", "meteorological_source": "ECMWF SEAS5",
            "system_version": "4.1", "sha256": hashlib.sha256(self.path.read_bytes()).hexdigest()}))

    def read(self, geometry=GEOMETRY, **kwargs):
        return read_netcdf(self.path, self.meta, geometry, now=NOW, **kwargs)

    def test_spatial_weights_missing_area_extremes_and_members_are_preserved(self):
        result = self.read()
        self.assertEqual(result["status"], "available")
        self.assertEqual(len(result["forecasts"]), 2)
        first, second = result["forecasts"]
        self.assertAlmostEqual(first["value"], (10+75+30)/3, places=2)
        self.assertAlmostEqual(first["coverage_fraction"], .75, places=4)
        self.assertEqual(first["maximum"], 75.)
        self.assertEqual(first["lead_hours"], 15*24)
        self.assertEqual(second["member"], "1")
        self.assertAlmostEqual(sum(c["area_fraction"] for c in first["distribution"]), .75, places=4)
        self.assertIsNone(first["percentile"])
        self.assertEqual(result["resolution_degrees"], {"latitude": 1., "longitude": 1.})
        self.assertEqual(result["provenance"]["request_id"], "software-test-only")
        validate(envelope("fire_weather", synthetic(), result, {"name": "numeric_netcdf_reader"}))

    def test_fractional_intersections_and_holes(self):
        left = {"type": "Polygon", "coordinates": [[[-1,-1],[0,-1],[0,0],[-1,0],[-1,-1]]]}
        self.assertEqual(self.read(left)["forecasts"][0]["value"], 10.)
        fraction = {"type": "Polygon", "coordinates": [[[-.5,-1],[1,-1],[1,1],[-.5,1],[-.5,-1]]]}
        self.assertAlmostEqual(self.read(fraction)["forecasts"][0]["value"], 44., places=2)
        self.assertAlmostEqual(self.read(fraction)["forecasts"][0]["coverage_fraction"], 5/6, places=4)
        hole = {**GEOMETRY, "coordinates": [*GEOMETRY["coordinates"], [[.01,-.99],[.99,-.99],[.99,-.01],[.01,-.01],[.01,-.99]]]}
        result = self.read(hole)["forecasts"][0]
        self.assertLess(result["value"], 22.)
        self.assertEqual(result["maximum"], 75.)

    def test_absent_expired_and_all_missing_are_not_zero(self):
        outside = {"type": "Polygon", "coordinates": [[[10,10],[11,10],[11,11],[10,11],[10,10]]]}
        self.assertEqual(self.read(outside)["status"], "unavailable")
        expired = read_netcdf(self.path, self.meta, GEOMETRY, now=datetime(2027,1,1,tzinfo=timezone.utc))
        self.assertEqual(expired["reason"], "no_current_valid_numeric_values")
        self.dataset["fwi"].values[:] = np.nan
        self.save()
        result = self.read()
        self.assertEqual(result["status"], "unavailable")
        self.assertIsNone(result["forecasts"][0]["value"])
        self.assertEqual(result["forecasts"][0]["coverage_fraction"], 0.)

    def test_descending_axes_and_wrapped_longitude(self):
        self.dataset = self.dataset.sortby("latitude", ascending=False).assign_coords(longitude=[359.5,.5])
        self.save()
        self.assertAlmostEqual(self.read()["forecasts"][0]["value"], (10+75+30)/3, places=2)

    def test_global_grid_cell_at_dateline_is_split_without_losing_coverage(self):
        self.dataset = self.dataset.reindex(longitude=[-180.,-90.,0.,90.], fill_value=10.)
        self.dataset['fwi'].values[:] = 10.
        self.save()
        east = {"type":"Polygon","coordinates":[[[179,-.5],[180,-.5],[180,.5],[179,.5],[179,-.5]]]}
        result = self.read(east)['forecasts'][0]
        self.assertEqual(result['value'],10.)
        self.assertAlmostEqual(result['coverage_fraction'],1.,places=5)

    def test_bad_provenance_and_units_fail_closed(self):
        with self.path.open("ab") as stream:
            stream.write(b"modified")
        with self.assertRaisesRegex(ValueError, "checksum"):
            self.read()
        with patch.dict(os.environ, {"FIREFLY_FWI_NETCDF": str(self.path)}):
            self.assertEqual(query_fire_weather("test", GEOMETRY)["status"], "unavailable")
        self.dataset["fwi"].attrs["units"] = "hotspots"
        self.save()
        with self.assertRaisesRegex(ValueError, "dimensionless"):
            self.read()
        meta = json.loads(self.meta.read_text())
        self.meta.write_text(json.dumps({**meta, "synthetic": True}))
        with self.assertRaises(ValueError):
            self.read()

    def test_future_issue_and_missing_original_timestamps_rejected(self):
        self.dataset = self.dataset.assign_coords(forecast_reference_time=np.datetime64("2027-01-01"))
        self.save()
        with self.assertRaisesRegex(ValueError, "future"):
            self.read()
        self.dataset = self.dataset.drop_vars("forecast_reference_time")
        self.save()
        with self.assertRaisesRegex(ValueError, "issuance"):
            self.read()

    def test_classification_boundaries(self):
        self.assertEqual([classify(v) for v in (0,11.2,21.3,38,50,70,70.01)],
                         ["Low","Moderate","High","Very high","Extreme","Extreme","Very extreme"])
        for value in (-1,float("nan"),float("inf")):
            with self.assertRaises(ValueError): classify(value)

    def test_weather_endpoint_is_independent_of_brazil_and_authenticated(self):
        client = TestClient(create_app(self.temp.name, token="test"))
        body = {"schema_version": "1.0.0", "geometry": GEOMETRY, "data_version": {}, "horizon": 3}
        self.assertEqual(client.post("/analytics/fire-weather", json=body).status_code, 401)
        response = client.post("/analytics/fire-weather", json=body, headers={"Authorization": "Bearer test"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["status"], "unavailable")
        body["geometry"]["coordinates"][0][-1] = [1,0]
        self.assertEqual(client.post("/analytics/fire-weather", json=body, headers={"Authorization": "Bearer test"}).status_code, 422)
