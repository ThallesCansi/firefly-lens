from dataclasses import asdict
import statistics as stats
from .models import RegionalSeries, Reference, QualityPolicy


def quantile(values, p):
    ordered = sorted(values)
    if not ordered:
        return None
    at = (len(ordered) - 1) * p
    lo = int(at)
    hi = min(lo + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (at - lo)


def statistics(values, minimum):
    n = len(values)
    if n < minimum:
        return {"n_years": n, "status": "insufficient_history", "reason": f"requires_{minimum}_valid_years",
                **{k: None for k in ("mean", "median", "std_sample", "p10", "p25", "p75", "p90", "min", "max", "mad")}}
    mid = stats.median(values)
    return dict(n_years=n, status="available", reason=None, mean=stats.mean(values), median=mid,
                std_sample=stats.stdev(values), p10=quantile(values, .1), p25=quantile(values, .25),
                p75=quantile(values, .75), p90=quantile(values, .9), min=min(values), max=max(values),
                mad=stats.median(abs(x - mid) for x in values))


def reference_rows(series, month, reference, policy, *, before_year=None, exclude_year=None):
    return [m for m in series.months if m.month == month and reference.start_year <= m.year <= reference.end_year
            and (before_year is None or m.year < before_year) and m.year != exclude_year and policy.accepts(m)]


def climatology(series: RegionalSeries, reference=Reference(), policy=QualityPolicy()):
    result = []
    for month in range(1, 13):
        rows = reference_rows(series, month, reference, policy)
        result.append({"month": month, "years_used": [r.year for r in rows],
                       **statistics([r.value for r in rows], reference.min_years)})
    return {"reference": asdict(reference), "policy": asdict(policy), "months": result,
            "quantile_method": "linear interpolation at (n-1)*p; regional monthly totals before climatology"}
