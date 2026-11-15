"""Run against the built container or deployed Render URL; never print the token."""
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request

origin = sys.argv[1].rstrip('/')
token = os.environ['ANALYTICS_API_TOKEN']
root = Path(__file__).resolve().parents[1]
meta = json.loads((root / 'public/data/brazil/meta.json').read_text())
keys = ('version', 'firstDay', 'lastDay', 'seriesEnd', 'partialMonth', 'observedUntil',
        'climatologyBase', 'cellDeg', 'commonErrorC')


def call(path, body=None, authenticated=True):
    headers = {'Content-Type': 'application/json'}
    if authenticated:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(origin + path, headers=headers,
        data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


for attempt in range(60):
    try:
        assert call('/health')['status'] == 'ok'
        break
    except (OSError, ValueError):
        if attempt == 59:
            raise
        time.sleep(1)

coverage = json.loads((root / 'public/data/coverage.json').read_text())
paraguay = next(d for d in coverage['datasets'] if d['country_code'] == 'PRY')
small = {'type': 'Polygon', 'coordinates': [[[-57.5,-18.5],[-56.5,-18.5],[-56.5,-17.5],[-57.5,-17.5],[-57.5,-18.5]]]}
large = {'type': 'Polygon', 'coordinates': [[[-74,-34],[-34,-34],[-34,5],[-74,5],[-74,-34]]]}
for name, geometry, months in [('small Brazilian polygon',small,293), ('Brazilian grid extent',large,293), ('Paraguay',paraguay['geometry'],282)]:
    body = {'schema_version':'1.0.0','geometry':geometry,'data_version':{k:meta[k] for k in keys},'horizon':3}
    started = time.monotonic()
    result = call('/analytics/history',body)
    history = result['sections']['history']
    assert not history['source']['synthetic']
    assert len(history['data']['monthly']) == months
    assert any(row['value'] is not None for row in history['data']['monthly'])
    try:
        call('/analytics/history',body,authenticated=False)
        raise AssertionError('Unauthenticated request accepted')
    except urllib.error.HTTPError as error:
        assert error.code == 401
    print(f'{name}: real history and authentication verified ({time.monotonic()-started:.2f}s)')

# The shipped product can expire between releases; verify its exact valid dates
# against its actual source dates, never assume a permanent "available" state.
from datetime import datetime, timezone
metadata=json.loads((root/'harmonization/output/fire_weather/geos5.json').read_text())
today=datetime.now(timezone.utc).date().isoformat()
expected=any(source['url'].split('.')[-2]>=today.replace('-','') for source in metadata['source_files'])
body={'schema_version':'1.0.0','geometry':small,'data_version':{k:meta[k] for k in keys},'horizon':3}
weather=call('/analytics/fire-weather',body)['data']
assert weather['status']==('available' if expected else 'unavailable'),weather.get('reason')
if expected:
    assert weather['provenance']['synthetic'] is False
    assert weather['forecasts'][0]['value'] is not None
    assert weather['forecasts'][0]['valid_at'] is None
    print('Numeric NASA weather: dates, provenance and custom polygon verified')
# History still works after importing the meteorological reader under 512 MB.
assert len(call('/analytics/history',body)['sections']['history']['data']['monthly'])==293
