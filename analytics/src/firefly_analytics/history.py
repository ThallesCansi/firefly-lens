from dataclasses import asdict
import statistics as stats
from .models import RegionalSeries, QualityPolicy


def history(series: RegionalSeries, policy=QualityPolicy()):
    monthly = []
    rows = series.regular()
    for row in rows:
        monthly.append({**asdict(row), "year": row.year, "month": row.month,
                        "valid_for_reference": policy.accepts(row),
                        "uncertainty_kind": "harmonization" if row.lower is not None else None})
    annual = []
    for year in sorted({r.year for r in rows}):
        group = [r for r in rows if r.year == year]
        valid = [r for r in group if policy.accepts(r)]
        all_full = len(valid) == 12 and {r.month for r in valid} == set(range(1, 13))
        previous = annual[-1] if annual and annual[-1]["year"] == year - 1 else None
        total = sum(r.value for r in valid) if all_full else None
        yoy = None
        reason = "incomplete_year_or_policy_exclusion" if total is None else "previous_year_unavailable"
        if previous and total is not None and previous["total"] is not None:
            if previous["total"] > 0:
                yoy, reason = 100 * (total / previous["total"] - 1), None
            else:
                reason = "zero_previous_year"
        annual.append({"year": year, "total": total, "valid_month_sum": sum(r.value for r in valid) if valid else None,
                       "valid_months": len(valid), "complete": all_full,
                       "sources": sorted({r.source for r in valid}),
                       "quality_flags": sorted({f for r in group for f in r.flags}),
                       "yoy_percent": yoy, "yoy_null_reason": reason,
                       "lower": None, "upper": None,
                       "uncertainty_reason": "annual_covariance_not_supplied_do_not_sum_monthly_bounds"})
    complete = [a for a in annual if a["complete"]]
    usable = [r for r in rows if policy.accepts(r)]
    slope = intercept = None
    if len(complete) >= 3:
        slope, intercept = stats.linear_regression([a["year"] for a in complete], [a["total"] for a in complete])
    return {"monthly": monthly, "annual": annual, "policy": asdict(policy), "summary": {
        "mean_of_valid_monthly_totals": stats.mean(r.value for r in usable) if usable else None,
        "median_of_valid_monthly_totals": stats.median(r.value for r in usable) if usable else None,
        "highest_year": max(complete, key=lambda a: a["total"])["year"] if complete else None,
        "highest_month": max(usable, key=lambda r: r.value).date if usable else None,
        "trend": {"method": "OLS on complete policy-eligible annual totals versus actual calendar year",
                  "slope_per_year": slope, "intercept": intercept, "n_years": len(complete),
                  "null_reason": "requires_3_complete_years" if slope is None else None,
                  "interpretation": "descriptive association; not causality, forecast or significance test"}}}
