"""Real long records, unchanged sensor calibration and daily/monthly consistency."""
from collections import defaultdict
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import unittest
from shapely.geometry import shape, Point

ROOT=Path(__file__).resolve().parents[2]
PREVIOUS='414d9a713361c1e8479a24b3b4a7cbd8eeb04183'


class CountryHistory(unittest.TestCase):
    def test_longer_history_keeps_the_evaluated_sensor_fit_unchanged(self):
        coverage=json.loads((ROOT/'public/data/coverage.json').read_text())
        for entry in [d for d in coverage['datasets'] if d.get('national_url')]:
            with self.subTest(country=entry['country_code']):
                relative='public'+entry['calibration_url']
                old=json.loads(subprocess.run(['git','-C',str(ROOT),'show',f'{PREVIOUS}:{relative}'],capture_output=True,check=True).stdout)
                new=json.loads((ROOT/relative).read_text())
                self.assertEqual(new['parameters'],old['parameters'])
                self.assertEqual(new['holdout'],old['holdout'])
                raw=json.loads((ROOT/'public'/entry['manifest_url'].lstrip('/')).read_text())
                self.assertEqual(raw['period'],{'start':'2002-07','end':'2025-12'})
                self.assertEqual(len(raw['daily']),24)
                totals=defaultdict(lambda:[0,0])
                dates=set()
                for year,item in raw['daily'].items():
                    encoded=(ROOT/'public'/item['url'].lstrip('/')).read_bytes()
                    decoded=gzip.decompress(encoded)
                    self.assertEqual(hashlib.sha256(encoded).hexdigest(),item['sha256'])
                    self.assertEqual(hashlib.sha256(decoded).hexdigest(),item['decoded_sha256'])
                    for date,ad,an,vd,vn,km,ac,vc in json.loads(decoded):
                        self.assertNotIn(date,dates)
                        self.assertTrue(date.startswith(year+'-'))
                        dates.add(date)
                        totals[date[:7]][0]+=ad+an
                        totals[date[:7]][1]+=vd+vn
                        if date<'2018-04-01': self.assertEqual(vd+vn+km,0)
                for month in raw['monthly']:
                    self.assertEqual(totals[month['date']],[month['modis'],month['viirs']])
                # Native archives are intentionally not shipped to the browser
                # or CI. When available locally, independently verify the old
                # observed counts rather than just two derived exports.
                folder=ROOT/'harmonization/data/continental'/Path(entry['manifest_url']).parent.name/'raw'
                if (folder/'modis_2002.parquet').exists():
                    import duckdb
                    paths=[str(folder/f'modis_{year}.parquet') for year in range(2002,2018)]
                    with duckdb.connect(config={'threads':2,'memory_limit':'256MB'}) as con:
                        observed=con.execute("""SELECT year(acq_date),count(DISTINCT(latitude,longitude,acq_date,acq_time,satellite,daynight))
                            FROM read_parquet(?,union_by_name=true)
                            WHERE satellite='Aqua' AND type=0 AND daynight IN ('D','N')
                            AND try_cast(confidence AS DOUBLE)>=30 AND acq_date>='2002-07-04' GROUP BY 1""",[paths]).fetchall()
                    annual={row['year']:row['modis'] for row in raw['annual']}
                    for year,count in observed: self.assertEqual(annual[year],count)
                for stamp in ('2003-09','2018-02','2025-09'):
                    cells=[]
                    for item in raw['day_tiles'][stamp]:
                        encoded=(ROOT/'public'/item['url'].lstrip('/')).read_bytes()
                        self.assertEqual(hashlib.sha256(encoded).hexdigest(),item['sha256'])
                        cells.extend(json.loads(gzip.decompress(encoded)))
                    self.assertEqual([sum(r[4] for r in cells),sum(r[5] for r in cells)],totals[stamp])

    def test_visual_mask_dims_outside_the_country_footprint(self):
        mask=shape(json.loads((ROOT/'public/interaction-boundaries/south-america-mask.geojson').read_text())['geometry'])
        self.assertTrue(mask.is_valid)
        for lon,lat in ((2,48),(-100,40),(20,-20)):
            self.assertTrue(mask.contains(Point(lon,lat)))
        for lon,lat in ((-58,-23),(-60,-10),(-70,-33),(-64,-35)):
            self.assertFalse(mask.contains(Point(lon,lat)))
