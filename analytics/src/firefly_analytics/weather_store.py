"""Refresh the small verified NASA subset without rebuilding the historical API.

The operator publishes a single release asset, so NetCDF and provenance travel
together. Failed refreshes retain the bundled/previous product; expiry is still
enforced by the numeric reader. No weather is inferred or downloaded per polygon.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import tempfile
from threading import Lock
import time
import urllib.request

_lock = Lock()
_checked = 0.
_current = None


def decode_bundle(raw):
    if len(raw) > 2_000_000:
        raise ValueError('Weather bundle exceeds budget')
    bundle = json.loads(raw)
    metadata = bundle['metadata']
    if (bundle.get('schema_version') != '1.0.0' or metadata.get('source_id') != 'nasa_gfwed_geos5'
            or metadata.get('synthetic') is not False):
        raise ValueError('Unsupported weather bundle')
    data = base64.b64decode(bundle['netcdf_base64'], validate=True)
    if hashlib.sha256(data).hexdigest() != metadata.get('sha256'):
        raise ValueError('Weather bundle checksum mismatch')
    if not metadata.get('source_files'):
        raise ValueError('Weather source provenance missing')
    return data, metadata


def current_product(fallback):
    global _checked, _current
    url = os.environ.get('FIREFLY_FWI_REFRESH_URL')
    if not url:
        return fallback, fallback.with_suffix('.json')
    with _lock:
        if _checked == 0 or time.monotonic() - _checked >= 3600:
            _checked = time.monotonic()
            try:
                request = urllib.request.Request(url, headers={'User-Agent':'FireFly-weather/1.0', 'Cache-Control':'no-cache'})
                with urllib.request.urlopen(request, timeout=15) as response:
                    data, metadata = decode_bundle(response.read(2_000_001))
                # Validate metadata, native product keys, dates, units and grid
                # before replacing a previously usable download.
                with tempfile.TemporaryDirectory(prefix='firefly-weather-check-') as folder:
                    path = Path(folder) / 'geos5.nc'
                    path.write_bytes(data)
                    path.with_suffix('.json').write_text(json.dumps(metadata))
                    from .fwi_grid import read_netcdf
                    result = read_netcdf(path,path.with_suffix('.json'),{'type':'Polygon','coordinates':[[[-58,-23],[-57,-23],[-57,-22],[-58,-22],[-58,-23]]]})
                    if result['status'] != 'available':
                        raise ValueError('Weather bundle has no current valid values')
                folder = Path(tempfile.gettempdir()) / 'firefly-current-weather'
                folder.mkdir(exist_ok=True)
                path = folder / (metadata['sha256'] + '.nc')
                path.write_bytes(data)
                path.with_suffix('.json').write_text(json.dumps(metadata))
                _current = path
                # Two products maximum; never remove the active product.
                products = sorted(folder.glob('*.nc'), key=lambda p:p.stat().st_mtime, reverse=True)
                for obsolete in products[2:]:
                    if obsolete != path:
                        obsolete.unlink(missing_ok=True)
                        obsolete.with_suffix('.json').unlink(missing_ok=True)
            except (OSError, ValueError, KeyError, TypeError, ImportError):
                import logging
                logging.getLogger(__name__).warning('Weather refresh failed; retaining last product and enforcing expiry')
        path = _current or fallback
        return path, path.with_suffix('.json')
