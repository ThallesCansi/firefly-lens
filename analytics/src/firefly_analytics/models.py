from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import date
import math
import re

UNITS = "MODIS-Aqua-equivalent hotspots"


def month_id(stamp: str) -> int:
    if not isinstance(stamp, str) or not re.fullmatch(r"\d{4}-\d{2}", stamp):
        raise ValueError("Expected YYYY-MM")
    value = date.fromisoformat(stamp + "-01")
    return value.year * 12 + value.month - 1


def month_stamp(index: int) -> str:
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def finite(value, *, nonnegative=False):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and (not nonnegative or value >= 0)


@dataclass(frozen=True)
class Month:
    date: str
    value: float | None
    source: str = "observed_modis"
    complete: bool = True
    flags: tuple[str, ...] = ()
    lower: float | None = None
    upper: float | None = None
    uncertainty_method: str | None = None
    available_at: str | None = None

    def __post_init__(self):
        month_id(self.date)
        if self.source not in ("observed_modis", "modeled_viirs", "missing", "mixed"):
            raise ValueError("Unknown observation source")
        if self.value is not None and not finite(self.value, nonnegative=True):
            raise ValueError("Activity must be finite, nonnegative or null")
        if type(self.complete) is not bool:
            raise ValueError("complete must be boolean")
        if (self.lower is None) != (self.upper is None):
            raise ValueError("Both interval bounds are required")
        if self.lower is not None and (not finite(self.lower, nonnegative=True) or not finite(self.upper, nonnegative=True) or self.lower > self.upper):
            raise ValueError("Invalid uncertainty bounds")
        if self.lower is not None and not self.uncertainty_method:
            raise ValueError("Uncertainty method is required")
        if self.available_at:
            available = date.fromisoformat(self.available_at)
            if available < date.fromisoformat(self.date + "-01"):
                raise ValueError("available_at precedes observation month")

    @property
    def year(self):
        return int(self.date[:4])

    @property
    def month(self):
        return int(self.date[5:])


@dataclass(frozen=True)
class QualityPolicy:
    include_drift: bool = False
    include_modeled: bool = False
    exclude_flags: tuple[str, ...] = ("sensor_outage", "incomplete_spatial_coverage")

    def accepts(self, row: Month, *, observed_only=False) -> bool:
        return (row.value is not None and row.complete and row.source != "missing"
                and (row.source == "observed_modis" if observed_only else (self.include_modeled or row.source == "observed_modis"))
                and (self.include_drift or "orbital_drift" not in row.flags)
                and not set(row.flags).intersection(self.exclude_flags))


@dataclass(frozen=True)
class Reference:
    start_year: int = 2003
    end_year: int = 2023
    min_years: int = 5

    def __post_init__(self):
        if not 1 <= self.start_year <= self.end_year <= 9999 or self.min_years < 2:
            raise ValueError("Invalid reference or min_years < 2")


@dataclass
class RegionalSeries:
    region_id: str
    months: list[Month]
    geometry: dict | None = None
    provenance: dict = field(default_factory=dict)
    synthetic: bool = False
    units: str = UNITS
    limitations: list[str] = field(default_factory=list)

    def __post_init__(self):
        if not self.region_id or not self.months or self.units != UNITS:
            raise ValueError("Region, nonempty series and compatible units required")
        self.months = sorted(self.months, key=lambda row: row.date)
        if len({row.date for row in self.months}) != len(self.months):
            raise ValueError("Duplicate months")
        if self.synthetic:
            self.limitations.append("Explicitly synthetic test/demo series; not NASA observations.")

    def regular(self, end: str | None = None) -> list[Month]:
        mapping = {row.date: row for row in self.months}
        last = month_id(end or self.months[-1].date)
        return [mapping.get(month_stamp(i), Month(month_stamp(i), None, "missing", False, ("missing_month",)))
                for i in range(month_id(self.months[0].date), last + 1)]

    def to_input(self):
        return {"region_id": self.region_id, "units": self.units, "geometry": self.geometry,
                "synthetic": self.synthetic, "provenance": self.provenance,
                "limitations": self.limitations, "months": [asdict(m) for m in self.months]}
