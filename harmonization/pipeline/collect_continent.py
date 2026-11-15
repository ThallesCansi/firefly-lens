"""Bounded parallel collection of real country archives; no calibration here."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import argparse
import copy
import importlib.util
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import load_config
from continental import COUNTRIES, write_json, ROOT


def collect(countries, end=2025, workers=4, start=2002):
    spec = importlib.util.spec_from_file_location("firms_download", Path(__file__).with_name("01_download.py"))
    download = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(download)
    jobs = []
    for code in countries:
        cfg = copy.deepcopy(load_config())
        slug = COUNTRIES[code].lower()
        cfg['archive'].update(country=COUNTRIES[code], buffer_mb=1)
        cfg['paths'].update(raw=f'data/continental/{slug}/raw', zips=f'data/continental/{slug}/temporary')
        cfg['api'].update(timeout_s=40,max_retries=2,backoff_s=1)
        for year in range(start,end+1):
            for prefix,schema,url in [('modis','modis','modis_url'),('viirs_n20','viirs','viirs_n20_url')]:
                if prefix == 'viirs_n20' and year < 2018:
                    continue
                jobs.append((code,cfg,prefix,schema,url,year))
    results = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        pending = {pool.submit(download.fetch_archive_year,*job[1:]):job for job in jobs}
        for future in as_completed(pending):
            job = pending[future]
            try:
                result = {'country':job[0],'year':job[-1],'sensor':job[2],**future.result()}
            except Exception as exc:
                result = {'country':job[0],'year':job[-1],'sensor':job[2], 'status':'unavailable','error':str(exc)}
                print(json.dumps(result),flush=True)
            results.append(result)
    write_json(ROOT/'docs/continental-collection.json',results)
    print(json.dumps({'files':len(results),'failed':sum(r['status']=='unavailable' for r in results)}),flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--countries',nargs='+',choices=COUNTRIES,default=list(COUNTRIES))
    parser.add_argument('--end',type=int,choices=range(2018,2026),default=2025)
    parser.add_argument('--start',type=int,choices=range(2002,2026),default=2002)
    parser.add_argument('--workers',type=int,choices=range(1,5),default=4)
    args=parser.parse_args()
    if args.start > args.end: parser.error('--start must not exceed --end')
    collect(args.countries,args.end,args.workers,args.start)
