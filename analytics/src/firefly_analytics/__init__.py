"""Regional hotspot analytics; independent of the frontend and calibration pipeline."""
from .models import Month, RegionalSeries, Reference, QualityPolicy
from .engine import analyze

__all__ = ["Month", "RegionalSeries", "Reference", "QualityPolicy", "analyze"]
__version__ = "0.1.0"
