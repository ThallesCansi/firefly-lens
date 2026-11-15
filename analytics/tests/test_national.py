"""Synthetic count fixtures test estimator isolation; real export tests are separate."""
from pathlib import Path
import sys
import unittest
import pandas as pd
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'harmonization/pipeline'))
from national import calibrate, GATES, accepted
from calibration import fit_l1


def fixture():
    rows=[]
    for year in range(2018,2026):
        for month in range(1,13):
            for dn in ['D','N']:
                n=100+month*20+(year-2018)*10
                rows.append({'year':year,'month':month,'daynight':dn,'bioma':'SOFTWARE_FIXTURE',
                    'n_modis':n*.2,'n_viirs_1km':n,'n_viirs_raw':n*3,'date':f'{year}-{month:02}'})
    return pd.DataFrame(rows)


class NationalTests(unittest.TestCase):
    def test_shared_level1_keeps_the_original_shrinkage_formula(self):
        data=fixture()
        result=fit_l1(data,200.)
        self.assertTrue(all(abs(k-.2)<1e-12 for k in result.k))

    def test_post_calibration_values_never_change_the_country_fit(self):
        data=fixture()
        before,estimates=calibrate(data,bootstrap=12)
        data.loc[data.year>2023,['n_modis','n_viirs_raw']]*=1000
        after,changed=calibrate(data,bootstrap=12)
        self.assertEqual(before['parameters'],after['parameters'])
        self.assertEqual(before['holdout'],after['holdout'])
        self.assertEqual(estimates,changed)

    def test_holdout_truth_cannot_enter_the_fit_used_to_predict_it(self):
        data=fixture()
        before,_=calibrate(data,bootstrap=12)
        data.loc[data.year.isin([2022,2023]),'n_modis']*=10
        after,_=calibrate(data,bootstrap=12)
        self.assertEqual(before['holdout']['metrics']['prediction_total'],after['holdout']['metrics']['prediction_total'])
        self.assertEqual(before['status'],'evaluated_country_aggregate')
        self.assertEqual(after['status'],'not_validated')
        self.assertGreater(after['holdout']['metrics']['wape'],GATES['max_wape'])

    def test_insufficient_or_nonfinite_holdout_is_not_accepted(self):
        good={'months':23,'relative_bias':0.,'wape':.1,'spearman':.95,'worst_annual_abs_bias':.1,'mae':1.,'raw_viirs_mae':10.}
        self.assertTrue(accepted(good))
        self.assertFalse(accepted({**good,'months':2}))
        self.assertFalse(accepted({**good,'spearman':None}))
