"""Verify real published country totals and every monthly map partition."""
import gzip
import hashlib
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


class ContinentalExports(unittest.TestCase):
    def test_real_raw_pilot_is_integral_partitioned_and_not_claimed_harmonized(self):
        coverage = json.loads((ROOT / "public/data/coverage.json").read_text())
        self.assertFalse(coverage['demo_enabled'])
        self.assertEqual({d['country_code'] for d in coverage['datasets']}, {'BRA','PRY','ARG','URY','BOL','CHL','COL','ECU','GUY','PER','SUR','VEN'})
        pilot = next(d for d in coverage['datasets'] if d['country_code']=='PRY')
        payload = (ROOT / 'public' / pilot['manifest_url'].lstrip('/')).read_bytes()
        self.assertEqual(hashlib.sha256(payload).hexdigest(),pilot['sha256'])
        data = json.loads(payload)
        self.assertFalse(data['synthetic'])
        self.assertFalse(data['signals_eligible'])
        self.assertEqual(data['harmonization_status'],'not_validated')
        self.assertFalse(data['comparability']['brazil_calibration_transferred'])
        self.assertEqual(len(data['monthly']),282)
        overlap=[r for r in data['monthly'] if '2018-04'<=r['date']<'2024-01']
        self.assertEqual(sum(r['modis'] for r in overlap),147982)
        self.assertEqual(sum(r['viirs'] for r in overlap),784411)
        self.assertEqual(len(data['inputs']),32)
        for month in data['monthly']:
            totals = [0,0]
            seen = set()
            for tile in data['tiles'][month['date']]:
                encoded = (ROOT/'public'/tile['url'].lstrip('/')).read_bytes()
                self.assertEqual(hashlib.sha256(encoded).hexdigest(),tile['sha256'])
                decoded = gzip.decompress(encoded)
                self.assertEqual(hashlib.sha256(decoded).hexdigest(),tile['decoded_sha256'])
                for cell,lon,lat,aqua,viirs in json.loads(decoded):
                    self.assertNotIn(cell,seen)
                    seen.add(cell)
                    self.assertTrue(-180+tile['tx']*4 <= lon < -180+(tile['tx']+1)*4)
                    self.assertTrue(-90+tile['ty']*4 <= lat < -90+(tile['ty']+1)*4)
                    totals[0] += aqua
                    totals[1] += viirs
            self.assertEqual(totals,[month['modis'],month['viirs']])
        # When local archives are present, independently reconcile the export to
        # the downloaded rows, without depending on the exporter implementation.
        import duckdb
        paths = ROOT/'harmonization/data/continental/paraguay/raw'
        if len(list(paths.glob('*.parquet'))) >= 12:
            with duckdb.connect() as con:
                totals = con.execute("""SELECT satellite,count(*) FROM (SELECT DISTINCT latitude,longitude,
                    acq_date,acq_time,satellite,daynight FROM read_parquet(?,union_by_name=true)
                    WHERE type=0 AND daynight IN ('D','N') AND acq_date >= '2018-04-01' AND acq_date<'2024-01-01'
                    AND ((satellite='Aqua' AND try_cast(confidence AS DOUBLE)>=30)
                    OR (satellite='N20' AND confidence IN ('n','h')))) GROUP BY satellite""",[str(paths/'*.parquet')]).fetchall()
            self.assertEqual(dict(totals),{'Aqua':147982,'N20':784411})
