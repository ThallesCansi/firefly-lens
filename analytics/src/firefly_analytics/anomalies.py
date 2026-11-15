from dataclasses import asdict
from datetime import date
import calendar
from .models import RegionalSeries, Reference, QualityPolicy
from .climatology import reference_rows, statistics


def anomalies(series: RegionalSeries, reference=Reference(), policy=QualityPolicy(), *, operational=True):
    result = []
    for target in series.regular():
        refs = reference_rows(series, target.month, reference, policy,
                              before_year=target.year if operational else None, exclude_year=target.year)
        if operational:
            cutoff = date(target.year, target.month, calendar.monthrange(target.year, target.month)[1])
            refs = [row for row in refs if not row.available_at or date.fromisoformat(row.available_at) <= cutoff]
        values = [m.value for m in refs]
        base = statistics(values, reference.min_years)
        why = {}
        outputs = {k: None for k in ("absolute", "percent", "z_score", "robust_z", "percentile")}
        if set(target.flags).intersection(policy.exclude_flags):
            why = dict.fromkeys(outputs, "target_quality_excluded")
            status = "unavailable"
        elif not target.complete or target.value is None:
            reason = "partial_month" if not target.complete and target.value is not None else "missing_value"
            why = dict.fromkeys(outputs, reason)
            status = "unavailable"
        elif base["status"] != "available":
            why = dict.fromkeys(outputs, "insufficient_history")
            status = "insufficient_history"
        else:
            x = target.value
            outputs["absolute"] = x - base["mean"]
            if base["mean"] != 0:
                outputs["percent"] = 100 * (x - base["mean"]) / base["mean"]
            else:
                why["percent"] = "zero_reference_mean"
            if base["std_sample"] > 0:
                outputs["z_score"] = (x - base["mean"]) / base["std_sample"]
            else:
                why["z_score"] = "zero_reference_std"
            if base["mad"] > 0:
                outputs["robust_z"] = (x - base["median"]) / (1.4826 * base["mad"])
            else:
                why["robust_z"] = "zero_reference_mad"
            outputs["percentile"] = 100 * (sum(v < x for v in values) + .5 * sum(v == x for v in values)) / len(values)
            status = "available" if not why else "partially_available"
        result.append({"date": target.date, "value": target.value, "source": target.source,
                       "quality_flags": list(target.flags), "complete": target.complete,
                       "status": status, **outputs, "null_reasons": why,
                       "reference": {**asdict(reference), "years_used": [m.year for m in refs],
                                     "n_years": len(refs), "operational_past_years_only": operational,
                                     "target_year_excluded": True}})
    return {"policy": asdict(policy), "percentile_ties": "midrank: 100*(less+0.5*equal)/n",
            "classification": "none; scores are descriptive and do not assume normality", "months": result}
