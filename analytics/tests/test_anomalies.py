import unittest
from firefly_analytics.models import Month, RegionalSeries, Reference
from firefly_analytics.anomalies import anomalies


def analyze(values, target, **kwargs):
    rows = [Month(f"{2000+i}-09", float(v)) for i,v in enumerate(values)] + [Month("2010-09", target)]
    return anomalies(RegionalSeries("test", rows, synthetic=True), Reference(2000,2015,5), **kwargs)["months"][-1]


class AnomalyTests(unittest.TestCase):
    def test_positive_negative_and_midrank_ties(self):
        positive = analyze([1,2,3,4,5],6)
        self.assertEqual(positive["absolute"],3)
        self.assertEqual(positive["percent"],100)
        self.assertEqual(positive["percentile"],100)
        negative = analyze([1,2,3,4,5],0)
        self.assertEqual(negative["absolute"],-3)
        self.assertEqual(negative["percentile"],0)
        self.assertEqual(analyze([1,2,3,4,5],3)["percentile"],50)

    def test_zero_mean_std_mad_have_reasons(self):
        row = analyze([0,0,0,0,0],1)
        for key in ("percent","z_score","robust_z"):
            self.assertIsNone(row[key])
            self.assertIn(key,row["null_reasons"])
        self.assertEqual(row["absolute"],1)

    def test_no_target_or_future_year_in_operational_reference(self):
        series = RegionalSeries("test", [Month(f"{year}-09",float(year-1990)) for year in range(2000,2015)])
        result = anomalies(series, Reference(2000,2014,5))["months"]
        target = next(r for r in result if r["date"]=="2008-09")
        self.assertEqual(target["reference"]["years_used"],list(range(2000,2008)))
        series.months[-1] = Month("2014-09",999999)
        unchanged = next(r for r in anomalies(series,Reference(2000,2014,5))["months"] if r["date"]=="2008-09")
        self.assertEqual(target,unchanged)

    def test_partial_insufficient_and_quality_excluded(self):
        self.assertEqual(analyze([1,2],3)["status"],"insufficient_history")
        rows = [Month(f"{y}-09",1.) for y in range(2000,2005)] + [Month("2010-09",2.,complete=False)]
        result = anomalies(RegionalSeries("test",rows),Reference(2000,2004,5))["months"][-1]
        self.assertIsNone(result["z_score"])
        self.assertEqual(result["null_reasons"]["absolute"],"partial_month")
