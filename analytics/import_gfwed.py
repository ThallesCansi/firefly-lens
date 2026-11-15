"""Acquire official NASA GFWED numeric forecasts; preserve provider date granularity.

No meteorological values are calculated or inferred from map images. Native
product-key semantics are documented in NASA's 20181216.README.txt. The native
time=1/calendar=none cannot be treated as an absolute UTC validity timestamp.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
import hashlib
import json
from pathlib import Path
import re
import sys

import numpy as np
import requests
import xarray as xr

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'analytics/src'))
BASE='https://portal.nccs.nasa.gov/datashare/GlobalFWI/v2.0/fwiCalcs.GEOS-5/Default/GEOS-5/'
README='https://portal.nccs.nasa.gov/datashare/GlobalFWI/v2.0/20181216.README.txt'


def links(url):
    response=requests.get(url,timeout=30);response.raise_for_status()
    return re.findall(r'href="([^"?]+)"',response.text)


def import_product(days=3, offline=False):
    now=datetime.now(timezone.utc)
    cache=ROOT/'harmonization/data/weather'
    cache.mkdir(parents=True,exist_ok=True)
    if offline:
        candidates=list(cache.glob('FWI.GEOS-5.Daily.Default.*.*.nc'))
        issue=max(p.name.split('.')[-3] for p in candidates)
        files=sorted(p for p in candidates if issue in p.name)
    else:
        issues=sorted(value for value in links(BASE+f'{now.year}/') if re.fullmatch(r'\d{10}/',value) and value[:8]<=now.strftime('%Y%m%d'))
        if not issues: raise ValueError('No official NASA forecast issuance found')
        issue=issues[-1].rstrip('/')
        directory=BASE+f'{now.year}/{issue}/'
        available=[name for name in links(directory) if re.fullmatch(r'FWI\.GEOS-5\.Daily\.Default\.\d{10}\.\d{8}\.nc',name)]
        wanted=[name for name in sorted(available) if now.date()<=datetime.strptime(name.split('.')[-2],'%Y%m%d').date()<now.date()+timedelta(days=days)]
        if not wanted: raise ValueError('Latest official NASA issuance has no current valid dates')
        def download(name):
            target=cache/name
            if not target.exists():
                response=requests.get(directory+name,timeout=120);response.raise_for_status()
                if len(response.content)>60_000_000: raise ValueError('Unexpected NASA file size')
                temporary=target.with_suffix('.nc.part');temporary.write_bytes(response.content);temporary.replace(target)
            print('NASA numeric file verified for import: '+name,flush=True)
            return target
        with ThreadPoolExecutor(max_workers=2) as pool:
            files=list(pool.map(download,wanted))
    arrays=[];sources=[]
    for path in files:
        with xr.open_dataset(path,decode_times=False) as original:
            if original.attrs.get('Title')!='Global Fire Weather Database' or original.attrs.get('Center')!='NASA GISS / Columbia University':
                raise ValueError('Unexpected native NASA product metadata')
            field=original['GEOS-5_FWI']
            if field.attrs.get('long_name')!='GEOS-5 Fire Weather Index' or field.dims!=('time','lat','lon') or field.sizes['time']!=1:
                raise ValueError('Unexpected NASA FWI variable')
            value=field.isel(time=0,drop=True).sel(lat=slice(-58,15),lon=slice(-85,-30)).load()
            # Empty native units are resolved from the documented FWI variable,
            # without changing values. Preserve this mapping in the sidecar.
            value.attrs={'units':'1','original_variable':'GEOS-5_FWI','original_units':field.attrs.get('units','')}
            value=value.rename({'lat':'latitude','lon':'longitude'}).rename('fwi')
            valid=datetime.strptime(path.name.split('.')[-2],'%Y%m%d').date().isoformat()
            arrays.append(value.expand_dims(valid_date=[valid]))
            sources.append({'url':BASE+f'{issue[:4]}/{issue}/'+path.name,
                'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,
                'native_processing_history':str(original.attrs.get('History',''))})
    data=xr.concat(arrays,dim='valid_date').to_dataset()
    initialized=datetime.strptime(issue,'%Y%m%d%H').replace(tzinfo=timezone.utc)
    data=data.assign_coords(forecast_reference_time=np.datetime64(initialized.replace(tzinfo=None),'s'))
    data.attrs={'source':'NASA GFWED GEOS-5 experimental','time_basis':'Documented provider forecast product keys; valid_date is a local-noon daily field, not a UTC instant'}
    output=ROOT/'harmonization/output/fire_weather/geos5.nc'
    output.parent.mkdir(parents=True,exist_ok=True)
    temporary=output.with_suffix('.tmp.nc')
    data.to_netcdf(temporary,encoding={'fwi':{'zlib':True,'complevel':4}})
    temporary.replace(output)
    metadata={'source_id':'nasa_gfwed_geos5','synthetic':False,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),
        'licence':'Public NASA GFWED research data; preserve source attribution and notices; acknowledge Field et al. (2015)',
        'retrieved_at':now.isoformat(),'request_id':'NASA-NCCS-'+issue,'meteorological_source':'NASA GEOS-5',
        'system_version':'GFWED v2.0; GEOS model build not encoded in native FWI files',
        'source_files':sources,'documentation_url':README,'doi':'10.5194/nhess-15-1407-2015',
        'issuance_basis':'00 UTC GEOS forecast initialization from documented NASA product key; publication instant not supplied',
        'validity_basis':'Daily local-noon index date decoded from documented source product key. No fabricated UTC validity hour.',
        'spatial_processing':'Native grid subset -85 to -30 longitude, -58 to 15 latitude; no interpolation',
        'unit_basis':'Native GEOS-5_FWI is dimensionless by NASA FWI documentation; original empty unit attribute preserved',
        'variables':{'valid_at':'valid_date'}}
    output.with_suffix('.json').write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'normalized_file':str(output),'bytes':output.stat().st_size,'issued_at':initialized.isoformat(),'valid_dates':data.valid_date.values.tolist()}),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--days',type=int,choices=range(1,9),default=3)
    parser.add_argument('--offline',action='store_true')
    args=parser.parse_args()
    import_product(args.days,args.offline)
