"""Publish exact-geometry offline weather snapshots; no browser raster calculations."""
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'analytics/src'))
from firefly_analytics.fire_weather import query_fire_weather


def export():
    coverage=json.loads((ROOT/'public/data/coverage.json').read_text())
    regions=[]
    for entry in coverage['datasets']:
        if entry.get('geometry'):
            regions.append({'id':entry['country_code'],'geometry':entry['geometry']})
    meta=json.loads((ROOT/'public/data/brazil/meta.json').read_text())
    for preset in meta['presets']:
        regions.append({'id':preset['id'],'geometry':preset['geometry']})
    for region in regions:
        region['data']=query_fire_weather(region['id'],region['geometry'])
        print(json.dumps({'region':region['id'],'status':region['data']['status'],'validities':len(region['data']['forecasts'])}),flush=True)
    target=ROOT/'public/data/weather/snapshots.json';target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps({'schema_version':'1.0.0','generated_at':datetime.now(timezone.utc).isoformat(),
        'aggregation':'Python WGS84 grid-cell intersection; exact published geometries only','regions':regions},separators=(',',':'),allow_nan=False)+'\n',encoding='utf-8')


if __name__=='__main__': export()
