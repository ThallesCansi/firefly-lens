"""Offline FIRMS country pilot. Published values remain raw until locally validated.

Reuses the archive downloader and its schema checks; never copies Brazil's fit.
Run from the repository root with an environment containing analytics + requests,
pyarrow, pyyaml and python-dotenv. Source Parquet stays outside the web bundle.
"""
from pathlib import Path
import argparse
import copy
from datetime import datetime, timezone
import gzip
import hashlib
import importlib.util
import json
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
import duckdb
from common import load_config, path_of

ROOT = Path(__file__).resolve().parents[2]
COUNTRIES = {"PRY": "Paraguay", "ARG": "Argentina", "BOL": "Bolivia", "CHL": "Chile",
    "COL": "Colombia", "ECU": "Ecuador", "GUY": "Guyana", "PER": "Peru", "SUR": "Suriname",
    "URY": "Uruguay", "VEN": "Venezuela"}


def write_json(path, value, compressed=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(value, separators=(",", ":"), allow_nan=False) + "\n").encode()
    encoded=gzip.compress(data, mtime=0) if compressed else data
    if not path.exists() or path.read_bytes()!=encoded:
        path.write_bytes(encoded)
    return hashlib.sha256(encoded).hexdigest()


def build(country="PRY", start=2002, end=2025, *, download=True):
    if country not in COUNTRIES or not 2002 <= start <= end <= 2025:
        raise ValueError("Supported country archives are 2002–2025; sensor calibration remains 2018–2023")
    began = time.perf_counter()
    name, slug = COUNTRIES[country], COUNTRIES[country].lower()
    cfg = copy.deepcopy(load_config())
    cfg["archive"]["country"] = name
    cfg["archive"]["buffer_mb"] = 1
    cfg["paths"]["raw"] = f"data/continental/{slug}/raw"
    cfg["paths"]["zips"] = f"data/continental/{slug}/temporary"
    spec = importlib.util.spec_from_file_location("firms_download", Path(__file__).with_name("01_download.py"))
    downloader = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(downloader)
    if download:
        for year in range(start, end+1):
            for prefix, schema, url_key in (("modis", "modis", "modis_url"), ("viirs_n20", "viirs", "viirs_n20_url")):
                if prefix == 'viirs_n20' and year < 2018: continue
                downloader.fetch_archive_year(cfg, prefix, schema, url_key, year)
    raw = path_of(cfg, "raw")
    expected = [raw / f"{prefix}_{year}.parquet" for prefix in ("modis", "viirs_n20") for year in range(max(start,2002 if prefix=='modis' else 2018),end+1)]
    if any(not path.exists() for path in expected):
        raise ValueError("Missing country archive; incomplete sources cannot be published")
    # Country membership is NASA's archive membership. Natural Earth's generalized
    # outline is only for navigation, not an additional border filter.
    feature = next(f for f in json.loads((ROOT / "public/interaction-boundaries/countries.geojson").read_text())['features']
                   if f["properties"]["countryCode"] == country)
    with duckdb.connect() as con:
        con.execute("SET memory_limit='512MB'")
        con.execute("SET threads=2")
        paths = [str(p).replace("\\", "/") for p in expected]
        con.read_parquet(paths, union_by_name=True).create_view("archive")
        con.execute("""CREATE TEMP TABLE filtered AS
            SELECT DISTINCT latitude AS lat, longitude AS lon, acq_date AS date,
                acq_time, satellite, daynight,
                floor((longitude+180)/.01)::INT AS sx, floor((latitude+90)/.01)::INT AS sy
            FROM archive WHERE type=0 AND daynight IN ('D','N')
                AND ((satellite='Aqua' AND try_cast(confidence AS DOUBLE)>=30)
                  OR (satellite IN ('N20','NOAA-20','1') AND lower(confidence) IN ('n','h','nominal','high')))
                AND isfinite(latitude) AND isfinite(longitude)
                AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
                AND acq_date >= DATE '2002-07-04'
                AND (satellite='Aqua' OR acq_date >= DATE '2018-04-01')""")
        totals = dict(con.execute("SELECT satellite,count(*) FROM filtered GROUP BY satellite").fetchall())
        if not totals.get("Aqua") or not sum(n for s,n in totals.items() if s != "Aqua"):
            raise ValueError("Expected both Aqua and NOAA-20; inspect provider satellite encoding")
        con.execute("""CREATE TEMP TABLE grid_daily AS WITH counts AS (
            SELECT sx//25 AS ix, sy//25 AS iy, date,
                year(date)::INT AS year, month(date)::INT AS month, daynight,
                count(*) FILTER (satellite='Aqua')::INT AS modis,
                count(*) FILTER (satellite!='Aqua')::INT AS viirs,
                count(DISTINCT (date,sx,sy)) FILTER (satellite!='Aqua')::INT AS viirs_1km
            FROM filtered GROUP BY ALL)
            SELECT iy*2000+ix AS cell_id, (-180+(ix+.5)*.25)::DOUBLE AS lon, (-90+(iy+.5)*.25)::DOUBLE AS lat,
                date,year,month,daynight,modis,viirs,viirs_1km FROM counts""")
        con.execute("""CREATE TEMP TABLE grid AS SELECT cell_id,lon,lat,year,month,daynight,
            sum(modis)::BIGINT modis,sum(viirs)::BIGINT viirs,sum(viirs_1km)::BIGINT viirs_1km
            FROM grid_daily GROUP BY ALL""")
        private = ROOT / f"harmonization/data/continental/{slug}/cells"
        private.mkdir(parents=True, exist_ok=True)
        for year in range(start,end+1):
            target = (private / f"year={year}.parquet").as_posix()
            con.execute(f"COPY (SELECT * FROM grid WHERE year={year} ORDER BY month,cell_id,daynight) TO '{target}' (FORMAT parquet,COMPRESSION zstd)")
        aggregate = con.execute("SELECT year,month,sum(modis),sum(viirs),sum(viirs_1km) FROM grid GROUP BY ALL ORDER BY year,month").fetchall()
        monthly = {f"{y:04}-{m:02}": {"date": f"{y:04}-{m:02}", "modis": a, "viirs": b, "viirs_1km": c} for y,m,a,b,c in aggregate}
        first = f"{start}-07" if start == 2002 else f"{start}-01"
        # Archive periods, not the first/last detection dates, determine zero bins.
        monthly = [monthly.get(f"{y}-{m:02}", {"date":f"{y}-{m:02}","modis":0,"viirs":0,"viirs_1km":0})
                   for y in range(start,end+1) for m in range(1,13) if f"{y}-{m:02}" >= first]
        annual = [{"year": y, "modis": sum(r['modis'] for r in monthly if r['date'].startswith(str(y))),
                   "viirs": sum(r['viirs'] for r in monthly if r['date'].startswith(str(y)))} for y in range(start,end+1)]
        for row in annual:
            row["raw_viirs_to_modis"] = row["viirs"] / row["modis"] if row["modis"] and row['year']>=2018 else None
        public = ROOT / f"public/data/continental/{slug}"
        daily_index = {}
        # Small country/year summaries drive the same daily calendar as Brazil.
        # Raw counts remain separate from the national calibration published below.
        daily = con.execute("""SELECT date::VARCHAR,
            sum(modis) FILTER(daynight='D'),sum(modis) FILTER(daynight='N'),
            sum(viirs) FILTER(daynight='D'),sum(viirs) FILTER(daynight='N'),sum(viirs_1km),
            count(DISTINCT cell_id) FILTER(modis>0),count(DISTINCT cell_id) FILTER(viirs>0)
            FROM grid_daily GROUP BY date ORDER BY date""").fetchall()
        for year in range(start,end+1):
            rows = [[r[0],*[int(v or 0) for v in r[1:]]] for r in daily if r[0].startswith(str(year))]
            rel=f'daily/{year}.json.gz'
            digest=write_json(public/rel,rows,compressed=True)
            daily_index[str(year)]={'url':f'/data/continental/{slug}/{rel}','sha256':digest,
                'decoded_sha256':hashlib.sha256(gzip.decompress((public/rel).read_bytes())).hexdigest()}
        tile_index = {}
        tile_rows = con.execute("SELECT year,month,floor((lon+180)/4)::INT tx,floor((lat+90)/4)::INT ty,cell_id,lon,lat,sum(modis),sum(viirs) FROM grid GROUP BY ALL ORDER BY year,month,tx,ty,cell_id").fetchall()
        groups = {}
        for y,m,tx,ty,cell_id,lon,lat,a,b in tile_rows:
            groups.setdefault((f"{y}-{m:02}",tx,ty),[]).append([cell_id,lon,lat,a,b])
        for (period,tx,ty), rows in groups.items():
            rel = f"map/{period}/{tx}_{ty}.json.gz"
            checksum = write_json(public / rel, rows, compressed=True)
            decoded_hash = hashlib.sha256(gzip.decompress((public/rel).read_bytes())).hexdigest()
            tile_index.setdefault(period,[]).append({"tx":tx,"ty":ty,"url":f"/data/continental/{slug}/{rel}","sha256":checksum,"decoded_sha256":decoded_hash})
        day_index = {}
        day_rows=con.execute("""SELECT year,month,floor((lon+180)/4)::INT tx,floor((lat+90)/4)::INT ty,
            cell_id,lon,lat,day(date)::INT,sum(modis),sum(viirs)
            FROM grid_daily GROUP BY ALL ORDER BY year,month,tx,ty,8,cell_id""").fetchall()
        day_groups={}
        for y,m,tx,ty,cell_id,lon,lat,day,a,b in day_rows:
            day_groups.setdefault(f'{y}-{m:02}',[]).append([cell_id,lon,lat,day,a,b])
        for period,rows in day_groups.items():
            rel=f'map-days/{period}.json.gz'
            digest=write_json(public/rel,rows,compressed=True)
            day_index.setdefault(period,[]).append({'url':f'/data/continental/{slug}/{rel}',
                'sha256':digest,'decoded_sha256':hashlib.sha256(gzip.decompress((public/rel).read_bytes())).hexdigest()})
        inputs = [{"file":p.name,"sha256":hashlib.sha256(p.read_bytes()).hexdigest(),
                   "archive_url":cfg['archive']['modis_url' if p.name.startswith('modis') else 'viirs_n20_url'].format(year=int(p.stem.rsplit('_',1)[1]))}
                  for p in expected]
        payload = {"schema_version":"1.0.0","country_code":country,"name":name,
            "data_kind":"real_raw_detections","synthetic":False,"harmonization_status":"not_validated",
            "signals_eligible":False,"geometry":feature['geometry'],"boundary_source":feature['properties'],
            "period":{"start":first,"end":f"{end}-12"},"cell_degrees":.25,
            "grid_origin":[-180,-90],"monthly":monthly,"annual":annual,"tiles":tile_index,
            "daily":daily_index,"day_tiles":day_index,"inputs":inputs,
            "source":"NASA FIRMS country archives; MODIS Aqua C6.1 / VIIRS NOAA-20, standard processing",
            "generated_at":datetime.now(timezone.utc).isoformat(),
            "comparability":{"status":"not_validated","brazil_calibration_transferred":False,
                "reason":"IBGE biome strata do not cover this country. Raw sensor ratios are descriptive, not calibration validation."},
            "limitations":["Raw MODIS and VIIRS counts are not comparable and are never added together as activity.",
                "FIRMS archive country membership is preserved; the generalized Natural Earth outline is for navigation only.",
                "Zeros mean no retained detections in the country archive, not verified acquisition coverage or absence of fires.",
                "The Aqua record begins in July 2002; NOAA-20 begins in April 2018. Missing sensor periods are not observations of zero.",
                "Raw map cells and daily sensor detections do not establish local calibration skill."]}
        report_hash = write_json(public / "manifest.json",payload)
        coverage_path = ROOT / "public/data/coverage.json"
        brazil = json.loads((ROOT / "public/data/brazil/meta.json").read_text())
        coverage = json.loads(coverage_path.read_text()) if coverage_path.exists() else {
            "schema_version":"1.0.0","demo_enabled":False,"datasets":[{
                "country_code":"BRA","name":"Brazil","data_kind":"real_harmonized_data",
                "harmonization_status":"validated_within_brazil","signals_eligible":True,
                "period":{"start":brazil['firstDay'][:7],"end":brazil['lastDay'][:7]},
                "boundary_url":"/data/brazil/brazil.geojson","bounds":brazil['bounds']}]}
        coverage['datasets'] = [d for d in coverage['datasets'] if d['country_code'] != country] + [{
            "country_code":country,"name":name,"data_kind":"real_raw_detections","harmonization_status":"not_validated",
            "signals_eligible":False,"period":payload['period'],"geometry":feature['geometry'],
            "manifest_url":f"/data/continental/{slug}/manifest.json","sha256":report_hash}]
        write_json(coverage_path,coverage)
    return {"country":country,"report_sha256":report_hash,"retained_rows":totals,
            "months":len(monthly),"map_tiles":len(groups),"map_bytes":sum(p.stat().st_size for p in (public/'map').rglob('*.gz')),
            "private_parquet_bytes":sum(p.stat().st_size for p in private.glob('*.parquet')),
            "elapsed_seconds":round(time.perf_counter()-began,3),"annual_comparability":annual}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--country", choices=COUNTRIES, default="PRY")
    parser.add_argument("--start", type=int, default=2002)
    parser.add_argument("--end", type=int, default=2025)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    result = build(args.country,args.start,args.end,download=not args.offline)
    write_json(ROOT / f"docs/continental-{COUNTRIES[args.country].lower()}-benchmark.json",result)
    print(json.dumps(result,indent=2))
