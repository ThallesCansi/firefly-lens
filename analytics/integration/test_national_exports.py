import hashlib
import json
from pathlib import Path
import unittest
from firefly_analytics.export import validate

ROOT=Path(__file__).resolve().parents[2]


class NationalExports(unittest.TestCase):
    def test_eleven_country_reports_pass_declared_holdout_gates_and_preserve_quality(self):
        coverage=json.loads((ROOT/'public/data/coverage.json').read_text())
        countries=[d for d in coverage['datasets'] if d.get('national_url')]
        self.assertEqual(len(countries),11)
        for entry in countries:
            with self.subTest(country=entry['country_code']):
                raw=(ROOT/'public'/entry['national_url'].lstrip('/')).read_bytes()
                self.assertEqual(hashlib.sha256(raw).hexdigest(),entry['national_sha256'])
                bundle=json.loads(raw)
                calibration=json.loads((ROOT/'public'/entry['calibration_url'].lstrip('/')).read_text())
                self.assertEqual(calibration['scope'],'entire_country_only')
                self.assertEqual(calibration['holdout']['train_end'],'2021-12')
                self.assertFalse(calibration['brazil_parameters_transferred'])
                metrics,gates=calibration['holdout']['metrics'],calibration['gates']
                self.assertLessEqual(abs(metrics['relative_bias']),gates['max_abs_bias'])
                self.assertLessEqual(metrics['wape'],gates['max_wape'])
                self.assertGreaterEqual(metrics['spearman'],gates['min_spearman'])
                for section in bundle['sections'].values():
                    validate(section)
                    self.assertFalse(section['source']['synthetic'])
                rows=bundle['sections']['history']['data']['monthly']
                self.assertEqual(len(rows),282)
                self.assertEqual(rows[0]['date'],'2002-07')
                self.assertFalse(rows[0]['complete'])
                self.assertEqual(bundle['sections']['climatology']['data']['reference']['start_year'],2003)
                self.assertGreater(bundle['sections']['history']['data']['summary']['trend']['n_years'],15)
                self.assertTrue(all(r['source']=='modeled_viirs' and not r['valid_for_reference'] for r in rows if r['year']>=2024))
                self.assertTrue(all(all(y<int(row['date'][:4]) for y in row['reference']['years_used'])
                                    for row in bundle['sections']['anomalies']['data']['months']))
                self.assertTrue(all(p['value'] is None for p in bundle['sections']['forecast']['data']['predictions']))
