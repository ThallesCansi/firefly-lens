from firefly_analytics.models import Month, RegionalSeries, month_stamp


def synthetic(years=12, start=2000):
    rows = [Month(month_stamp(start * 12 + i), float(10 + (i % 12) * 5 + (i // 12) % 3)) for i in range(years * 12)]
    return RegionalSeries("synthetic_test_region", rows, synthetic=True)


def no_sarima(train, horizon, config):
    return [{"value": None, "lower": None, "upper": None, "reason": "test_only_disabled"} for _ in range(horizon)], {}
