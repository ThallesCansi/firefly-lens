"""Read an exact published country series; never substitute border grid cells."""
import hashlib
import json
from shapely import normalize
from shapely.geometry import shape
from .models import Month, RegionalSeries
from .export import validate


def from_national(repo, geometry):
    coverage = repo / 'public/data/coverage.json'
    if not coverage.exists():
        return None
    selected = normalize(shape(geometry))
    for entry in json.loads(coverage.read_text(encoding='utf-8'))['datasets']:
        if entry.get('country_code') == 'BRA' or not entry.get('geometry'):
            continue
        if not normalize(shape(entry['geometry'])).equals_exact(selected, 1e-9):
            continue
        if (entry.get('scope') != 'entire_country_only'
                or entry.get('harmonization_status') != 'evaluated_country_aggregate'):
            raise ValueError('Country calibration is not evaluated')
        url = entry.get('national_url', '')
        path = (repo / 'public' / url.lstrip('/')).resolve()
        if not path.is_relative_to((repo / 'public/data/continental').resolve()):
            raise ValueError('Invalid country report path')
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != entry.get('national_sha256'):
            raise ValueError('Country report checksum mismatch')
        bundle = json.loads(raw)
        payload = bundle['sections']['history']
        validate(payload)
        provenance = payload['source']['provenance']
        if (payload['source']['synthetic'] or provenance.get('kind') != 'real_country_harmonized'
                or provenance.get('scope') != 'entire_country_only'
                or not normalize(shape(bundle['geometry'])).equals_exact(selected, 1e-9)):
            raise ValueError('Country report provenance or geometry mismatch')
        rows = payload['data']['monthly']
        months = [Month(r['date'], r['value'], r['source'], r['complete'], tuple(r['flags']),
                        r['lower'], r['upper'], r['uncertainty_method']) for r in rows]
        return RegionalSeries(bundle['region_id'], months, geometry,
            provenance={**provenance, 'series_end':entry['national_period']['end'],
                        'national_sha256':entry['national_sha256']},
            limitations=payload['limitations'])
    return None
