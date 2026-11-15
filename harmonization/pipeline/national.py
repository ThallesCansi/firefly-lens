"""Country-wide Level-1 harmonization with an independent temporal holdout.

Country parameters never imply subnational/ecosystem validation. Brazil's model
and data are unchanged. Final fit uses 2018–2023; 2024+ uses converted NOAA-20.
"""
from pathlib import Path
import argparse
import hashlib
import json
import sys
import time

import duckdb
import numpy as np
import pandas as pd
from shapely.geometry import shape
from scipy.stats import spearmanr

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'analytics/src'))
from calibration import fit_l1
from continental import ROOT, COUNTRIES, write_json
from firefly_analytics.models import Month, RegionalSeries, Reference
from firefly_analytics.engine import analyze
from firefly_analytics.forecasting import ForecastConfig
from firefly_analytics.export import validate

OUTAGES = ('2020-08', '2022-04')
# Fixed before inspecting country results. These are project acceptance gates,
# not a universal scientific standard or evidence of subnational skill.
GATES = {'min_holdout_months':20, 'max_abs_bias':.20, 'max_wape':.40,
         'min_spearman':.80, 'max_annual_abs_bias':.50}


def country_counts(code, end=2025):
    root=ROOT/f'harmonization/data/continental/{COUNTRIES[code].lower()}/raw'
    paths=[root/f'{sensor}_{year}.parquet' for sensor in ('modis','viirs_n20') for year in range(2002 if sensor=='modis' else 2018,end+1)]
    if any(not p.exists() for p in paths):
        raise ValueError(f'{code}: missing country archives')
    with duckdb.connect() as con:
        con.read_parquet([str(p) for p in paths],union_by_name=True).create_view('archive')
        counts=con.execute("""WITH points AS (
          SELECT DISTINCT latitude,longitude,acq_date,acq_time,satellite,daynight,
            floor((longitude+180)/.01)::INT sx,floor((latitude+90)/.01)::INT sy
          FROM archive WHERE type=0 AND daynight IN ('D','N') AND acq_date >= '2002-07-04'
            AND isfinite(latitude) AND isfinite(longitude)
            AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
            AND ((satellite='Aqua' AND try_cast(confidence AS DOUBLE)>=30)
              OR (satellite IN ('N20','NOAA-20','1') AND acq_date >= '2018-04-01' AND lower(confidence) IN ('n','h','nominal','high'))))
          SELECT year(acq_date)::INT AS year,month(acq_date)::INT AS month,daynight,
            count(*) FILTER(satellite='Aqua') n_modis,
            count(*) FILTER(satellite!='Aqua') n_viirs_raw,
            count(DISTINCT(acq_date,sx,sy)) FILTER(satellite!='Aqua') n_viirs_1km
          FROM points GROUP BY ALL ORDER BY year,month,daynight""").df()
    skeleton=pd.MultiIndex.from_product([range(2002,end+1),range(1,13),['D','N']],names=['year','month','daynight']).to_frame(index=False)
    skeleton=skeleton[(skeleton.year>2002)|(skeleton.month>=7)]
    data=skeleton.merge(counts,how='left').fillna(0)
    data['bioma']=code  # generic estimator stratum name; this is the whole country, not an IBGE biome
    data['date']=data.year.astype(str)+'-'+data.month.map(lambda x:f'{x:02}')
    return data,paths


def apply_factors(data, factors):
    joined=data.merge(factors,on=['bioma','month','daynight'],how='left',validate='many_to_one')
    values=joined.k.to_numpy(float)*joined.n_viirs_1km.to_numpy(float)
    if not np.isfinite(values).all() or (values<0).any():
        raise ValueError('Insufficient sensor overlap for finite country factors')
    return values


def metrics(rows):
    monthly=rows.groupby(['year','month'],as_index=False)[['n_modis','prediction','n_viirs_raw']].sum()
    y,p,raw=(monthly[c].to_numpy(float) for c in ['n_modis','prediction','n_viirs_raw'])
    if not len(y) or y.sum()<=0:
        raise ValueError('No positive observed holdout activity')
    rank=float(spearmanr(y,p).statistic) if len(np.unique(y))>1 and len(np.unique(p))>1 else None
    annual=monthly.groupby('year')[['n_modis','prediction']].sum()
    year_bias=[abs(r.prediction/r.n_modis-1) for r in annual.itertuples() if r.n_modis>0]
    return {'months':len(y),'observed_total':float(y.sum()),'prediction_total':float(p.sum()),
        'relative_bias':float(p.sum()/y.sum()-1),'wape':float(abs(p-y).sum()/y.sum()),
        'mae':float(abs(p-y).mean()),'raw_viirs_mae':float(abs(raw-y).mean()),
        'spearman':rank,'worst_annual_abs_bias':float(max(year_bias)) if year_bias else None}


def accepted(report):
    return (report['months']>=GATES['min_holdout_months'] and abs(report['relative_bias'])<=GATES['max_abs_bias']
        and report['wape']<=GATES['max_wape'] and report['spearman'] is not None
        and report['spearman']>=GATES['min_spearman'] and report['worst_annual_abs_bias'] is not None
        and report['worst_annual_abs_bias']<=GATES['max_annual_abs_bias']
        and report['mae']<report['raw_viirs_mae'])


def calibrate(data, *, bootstrap=300):
    eligible=data[(data.date>='2018-04')&(data.year<=2023)&~data.date.isin(OUTAGES)].copy()
    train=eligible[eligible.year<=2021]
    holdout=eligible[eligible.year>=2022].copy()
    factors=fit_l1(train,200.)
    holdout['prediction']=apply_factors(holdout,factors)
    holdout_metrics=metrics(holdout)
    loyo=[]
    for year in sorted(eligible.year.unique()):
        test=eligible[eligible.year==year].copy()
        test['prediction']=apply_factors(test,fit_l1(eligible[eligible.year!=year],200.))
        loyo.append(test)
    final=fit_l1(eligible,200.)
    fitted=apply_factors(data,final)
    report={'status':'evaluated_country_aggregate' if accepted(holdout_metrics) else 'not_validated',
        'method':'existing_level1_shrunk_month_daynight_factors','scope':'entire_country_only',
        'shrink_prior_n':200.,'calibration_period':['2018-04','2023-12'],'excluded_months':list(OUTAGES),
        'holdout':{'train_end':'2021-12','test_start':'2022-01','test_end':'2023-12','metrics':holdout_metrics},
        'loyo':metrics(pd.concat(loyo)), 'gates':GATES, 'brazil_parameters_transferred':False,
        'parameters':[{'month':int(r.month),'daynight':r.daynight,'factor':float(r.k)} for r in final.itertuples()],
        'uncertainty':'95% country-year block bootstrap parameter range; excludes residual prediction error',
        'bootstrap_replicates':bootstrap,'seed':42,
        'limitations':['Country-level acceptance does not validate local cells or individual ecosystems.',
          'Post-2023 extrapolation is not validated against nominal-orbit MODIS truth.',
          'The 2022–2023 holdout evaluates a fit ending in 2021; final parameters are refitted through 2023.',
          'The project acceptance thresholds are predefined engineering gates, not a universal validation standard.']}
    # Resample entire years, preserving within-year seasonal/day-night dependence.
    rng=np.random.default_rng(42)
    years=np.array(sorted(eligible.year.unique()))
    draws=[]
    for _ in range(bootstrap):
        sampled=pd.concat([eligible[eligible.year==year] for year in rng.choice(years,len(years),replace=True)])
        try:
            draws.append(apply_factors(data,fit_l1(sampled,200.)))
        except ValueError:
            continue
    if len(draws)<bootstrap*.9:
        report['status']='not_validated'
        report['limitations'].append('Too many bootstrap fits lacked seasonal sensor overlap.')
    # Sum D/N in each bootstrap draw first; never sum interval endpoints.
    groups=data[['year','month']].drop_duplicates().itertuples(index=False,name=None)
    estimates={}
    for year,month in groups:
        mask=((data.year==year)&(data.month==month)).to_numpy()
        values=np.asarray(draws)[:,mask].sum(axis=1) if draws else np.array([])
        lo,hi=np.quantile(values,[.025,.975]) if len(values) else (None,None)
        estimates[f'{year}-{month:02}']={'value':float(fitted[mask].sum()),
            'lower':float(lo) if lo is not None else None,'upper':float(hi) if hi is not None else None}
    return report,estimates


def publish(code,end=2025):
    began=time.perf_counter()
    data,paths=country_counts(code,end)
    report,estimates=calibrate(data)
    slug=COUNTRIES[code].lower()
    public=ROOT/f'public/data/continental/{slug}'
    write_json(public/'calibration.json',report)
    print(json.dumps({'country':code,'status':report['status'],'holdout':report['holdout']['metrics']}),flush=True)
    if report['status']!='evaluated_country_aggregate':
        return {'country':code,'status':'not_validated','metrics':report['holdout']['metrics']}
    feature=next(f for f in json.loads((ROOT/'public/interaction-boundaries/countries.geojson').read_text())['features'] if f['properties']['countryCode']==code)
    monthly=data.groupby(['year','month'],as_index=False)[['n_modis','n_viirs_raw']].sum()
    months=[]
    for row in monthly.itertuples():
        stamp=f'{row.year}-{row.month:02}'
        modeled=row.year>2023
        flags=['country_aggregate_calibration']
        if stamp in OUTAGES: flags.append('sensor_outage')
        value=estimates[stamp]
        months.append(Month(stamp,value['value'] if modeled else float(row.n_modis),
            'modeled_viirs' if modeled else 'observed_modis',stamp!='2002-07',tuple(flags),
            value['lower'] if modeled else None,value['upper'] if modeled else None,
            'country_year_block_bootstrap_parameter_only_95' if modeled and value['lower'] is not None else None))
    series=RegionalSeries('country-'+code,months,feature['geometry'],provenance={
        'kind':'real_country_harmonized','country_code':code,'scope':'entire_country_only',
        'calibration_status':report['status'],'series_end':f'{end}-12',
        'files':[{'path':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]},
        limitations=report['limitations']+['Country archive membership follows NASA FIRMS; the generalized navigation outline is not a new border filter.',
          'Zeros denote no retained detections, not verified acquisition coverage or absence of fires.',
          'Bootstrap bounds reflect calibration-parameter variability, not a full predictive interval.'])
    sections=analyze(series,reference=Reference(2003,2023,5),forecast_config=ForecastConfig(enable_sarima=False,max_origins=32),run_fire_weather=False)
    for section in sections.values(): validate(section)
    bundle={'schema_version':'1.0.0','region_id':series.region_id,'geometry':series.geometry,'sections':sections,
        'calendar':{'first_day':'2002-07-04','last_day':f'{end}-12-31','observed_until':2023,
            'reference':[2003,2023], 'viirs_monthly':{stamp:value['value'] for stamp,value in estimates.items() if stamp>='2018-04'},
            'daily_method':'Existing browser calendar allocation: monthly country-converted VIIRS distributed by daily degraded VIIRS counts; not independently validated daily fire activity.'}}
    checksum=write_json(public/'national.json',bundle)
    coverage_path=ROOT/'public/data/coverage.json'
    coverage=json.loads(coverage_path.read_text())
    entry=next(d for d in coverage['datasets'] if d['country_code']==code)
    entry.update(data_kind='real_harmonized_data',harmonization_status=report['status'],
        scope='entire_country_only',signals_eligible=True,representative_point=list(shape(series.geometry).representative_point().coords)[0],national_url=f'/data/continental/{slug}/national.json',
        national_sha256=checksum,calibration_url=f'/data/continental/{slug}/calibration.json',
        calibration_metrics=report['holdout']['metrics'],
        national_period={'start':'2002-07','end':f'{end}-12'})
    write_json(coverage_path,coverage)
    return {'country':code,'status':report['status'],'metrics':report['holdout']['metrics'],
        'elapsed_seconds':round(time.perf_counter()-began,3),'national_sha256':checksum}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--countries',nargs='+',choices=COUNTRIES,default=list(COUNTRIES))
    parser.add_argument('--end',type=int,choices=range(2023,2026),default=2025)
    args=parser.parse_args()
    results=[]
    for code in args.countries:
        try: results.append(publish(code,args.end))
        except (ValueError,OSError,StopIteration) as exc:
            results.append({'country':code,'status':'unavailable','reason':str(exc)})
            print(json.dumps(results[-1]),flush=True)
    write_json(ROOT/'docs/national-harmonization-results.json',results)
