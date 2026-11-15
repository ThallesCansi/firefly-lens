import unittest
from dataclasses import replace
from firefly_analytics.models import Month, RegionalSeries, Reference, QualityPolicy
from firefly_analytics.climatology import climatology, quantile


class ClimatologyTests(unittest.TestCase):
    def test_months_are_separate_and_sample_statistics(self):
        rows = [Month(f"{2000+i}-{m:02d}", v if m == 9 else 10000.) for i, v in enumerate([1., 2., 3., 4., 5.]) for m in range(1,13)]
        series = RegionalSeries("test", rows, synthetic=True)
        result = climatology(series, Reference(2000,2004,5))["months"]
        september = result[8]
        self.assertEqual(september["mean"],3)
        self.assertEqual(september["median"],3)
        self.assertAlmostEqual(september["std_sample"],(2.5)**.5)
        self.assertEqual(september["mad"],1)
        self.assertAlmostEqual(september["p10"],1.4)
        self.assertEqual(result[0]["median"],10000)

    def test_insufficient_and_partial_excluded(self):
        rows = [Month(f"{2000+i}-09", float(i), complete=i != 0) for i in range(5)]
        result = climatology(RegionalSeries("test", rows), Reference(2000,2004,5))["months"][8]
        self.assertEqual(result["n_years"],4)
        self.assertIsNone(result["median"])
        self.assertEqual(result["status"],"insufficient_history")

    def test_quantile_linear_interpolation(self):
        self.assertEqual(quantile([10, 20, 30, 40], .25),17.5)
        self.assertEqual(quantile([0, 0], .9),0)
        self.assertIsNone(quantile([], .9))
