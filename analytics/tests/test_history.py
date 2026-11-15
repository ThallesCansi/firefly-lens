from dataclasses import replace
import unittest
from firefly_analytics.models import Month, RegionalSeries, QualityPolicy
from firefly_analytics.history import history
from support import synthetic


class HistoryTests(unittest.TestCase):
    def test_annual_complete_and_yoy(self):
        series = synthetic(4)
        result = history(series)
        self.assertTrue(all(row["complete"] for row in result["annual"]))
        self.assertEqual(result["annual"][0]["total"], sum(m.value for m in series.months[:12]))
        self.assertIsNotNone(result["annual"][1]["yoy_percent"])
        self.assertEqual(result["summary"]["trend"]["n_years"], 4)

    def test_missing_is_not_zero(self):
        series = synthetic(3)
        series.months[1] = replace(series.months[1], value=None, source="missing")
        series.months[2] = replace(series.months[2], value=0)
        result = history(series)
        self.assertIsNone(result["annual"][0]["total"])
        self.assertEqual(result["annual"][0]["valid_months"], 11)
        self.assertEqual(result["monthly"][2]["value"], 0)

    def test_absent_calendar_month_and_partial(self):
        series = synthetic(3)
        series.months.pop(1)
        series.months[0] = replace(series.months[0], complete=False)
        result = history(series)
        self.assertEqual(result["monthly"][1]["source"], "missing")
        self.assertEqual(result["annual"][0]["valid_months"], 10)
        self.assertIsNone(result["annual"][1]["yoy_percent"])

    def test_source_drift_and_outage_policy(self):
        series = synthetic(3)
        series.months[0] = replace(series.months[0], source="modeled_viirs")
        series.months[1] = replace(series.months[1], flags=("orbital_drift",))
        series.months[2] = replace(series.months[2], flags=("sensor_outage",))
        self.assertEqual(history(series)["annual"][0]["valid_months"], 9)
        self.assertEqual(history(series, QualityPolicy(include_drift=True, include_modeled=True))["annual"][0]["valid_months"], 11)

    def test_invalid_values_dates_duplicates_intervals(self):
        for value in (-1, float("nan"), float("inf")):
            with self.assertRaises(ValueError): Month("2020-01", value)
        with self.assertRaises(ValueError): Month("2020-13", 1)
        with self.assertRaises(ValueError): Month("2020-01", 1, lower=3, upper=2, uncertainty_method="test")
        with self.assertRaises(ValueError): RegionalSeries("duplicate", [Month("2020-01", 1)] * 2)


if __name__ == "__main__": unittest.main()
