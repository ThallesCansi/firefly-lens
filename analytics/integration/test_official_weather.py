import hashlib
import json
from pathlib import Path
import unittest
from datetime import datetime,timezone
import xarray as xr
from firefly_analytics.fwi_grid import read_netcdf

ROOT=Path(__file__).resolve().parents[2]


class OfficialWeather(unittest.TestCase):
    def test_real_triangle_fractions_respect_coverage_without_changing_fwi(self):
        path=ROOT/'harmonization/output/fire_weather/geos5.nc'
        geometry={'type':'Polygon','coordinates':[[[-57.6,-18.6],[-56.4,-18.3],[-56.8,-17.4],[-57.6,-18.6]]]}
        result=read_netcdf(path,path.with_suffix('.json'),geometry,now=datetime(2026,11,15,tzinfo=timezone.utc))
        self.assertEqual(result['status'],'available')
        self.assertAlmostEqual(result['forecasts'][0]['value'],0.3683036132014024)
        for row in result['forecasts']:
            self.assertTrue(all(0<=d['area_fraction']<=1 for d in row['distribution']))
            self.assertAlmostEqual(sum(d['area_fraction'] for d in row['distribution']),row['coverage_fraction'],places=12)

    def test_original_nasa_bytes_are_traceable_and_date_granularity_is_preserved(self):
        path=ROOT/'harmonization/output/fire_weather/geos5.nc'
        meta=json.loads(path.with_suffix('.json').read_text())
        self.assertEqual(meta['source_id'],'nasa_gfwed_geos5')
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),meta['sha256'])
        for source in meta['source_files']:
            original=ROOT/'harmonization/data/weather'/source['url'].rsplit('/',1)[1]
            if original.exists():
                self.assertEqual(hashlib.sha256(original.read_bytes()).hexdigest(),source['sha256'])
        with xr.open_dataset(path) as ds:
            self.assertEqual(ds.fwi.attrs['original_variable'],'GEOS-5_FWI')
        coverage=json.loads((ROOT/'public/data/coverage.json').read_text())
        geometry=next(d['geometry'] for d in coverage['datasets'] if d['country_code']=='PRY')
        result=read_netcdf(path,path.with_suffix('.json'),geometry,now=datetime(2026,11,15,tzinfo=timezone.utc))
        self.assertEqual(result['status'],'available')
        self.assertEqual(len(result['forecasts']),3)
        row=result['forecasts'][0]
        self.assertIsNone(row['valid_at'])
        self.assertIsNone(row['lead_hours'])
        self.assertEqual(row['valid_date'],'2026-11-15')
        self.assertEqual(row['lead_days'],3)
        self.assertEqual(row['member'],'deterministic')
        self.assertGreater(row['coverage_fraction'],.99)
        expired=read_netcdf(path,path.with_suffix('.json'),geometry,now=datetime(2026,11,18,tzinfo=timezone.utc))
        self.assertEqual(expired['status'],'unavailable')

    def test_prepared_weather_is_numeric_and_exact_geometry_only(self):
        data=json.loads((ROOT/'public/data/weather/snapshots.json').read_text())
        self.assertEqual(len(data['regions']),16)
        for region in data['regions']:
            self.assertEqual(region['data']['status'],'available')
            self.assertFalse(region['data']['provenance']['synthetic'])
            self.assertEqual(region['data']['product_kind'],'experimental_deterministic')
            for row in region['data']['forecasts']:
                self.assertIsNotNone(row['value'])
                self.assertAlmostEqual(sum(c['area_fraction'] for c in row['distribution']),row['coverage_fraction'],places=5)
