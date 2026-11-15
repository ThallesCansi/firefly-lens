"""Rebuild the visual coverage mask from the shipped navigation boundaries."""
import json
from pathlib import Path
from shapely.geometry import shape,box,mapping
from shapely.ops import unary_union

root=Path(__file__).resolve().parents[1]
codes={'BRA','ARG','BOL','CHL','COL','ECU','GUY','PER','PRY','SUR','URY','VEN'}
features=json.loads((root/'public/interaction-boundaries/countries.geojson').read_text())['features']
land=unary_union([shape(f['geometry']) for f in features if f['properties']['countryCode'] in codes])
mask=box(-180,-85,180,85).difference(land)
if not mask.is_valid: raise ValueError('Invalid visual coverage mask')
payload={'type':'Feature','properties':{'scope':'South American navigation only; published national calibration is not local cell validation',
    'boundary_source':'Natural Earth navigation outlines'},'geometry':mapping(mask)}
(root/'public/interaction-boundaries/south-america-mask.geojson').write_text(json.dumps(payload,separators=(',',':'))+'\n',encoding='utf-8')
