"""Build one bounded release asset containing the NASA subset and provenance."""
import base64
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'analytics/src'))
from firefly_analytics.weather_store import decode_bundle
from firefly_analytics.fwi_grid import read_netcdf


def package(output):
    path = ROOT/'harmonization/output/fire_weather/geos5.nc'
    metadata = json.loads(path.with_suffix('.json').read_text())
    result = read_netcdf(path,path.with_suffix('.json'),{'type':'Polygon','coordinates':[[[-58,-23],[-57,-23],[-57,-22],[-58,-22],[-58,-23]]]})
    if result['status'] != 'available':
        raise ValueError('Refusing to publish an expired or invalid weather product')
    raw = json.dumps({'schema_version':'1.0.0','published_at':datetime.now(timezone.utc).isoformat(),
        'metadata':metadata,'netcdf_base64':base64.b64encode(path.read_bytes()).decode()},separators=(',',':')).encode()
    decode_bundle(raw)
    Path(output).write_bytes(raw)
    print(json.dumps({'bytes':len(raw),'valid_dates':[r['valid_date'] for r in result['forecasts']], 'source':metadata['source_id']}))


if __name__ == '__main__':
    package(sys.argv[1])
