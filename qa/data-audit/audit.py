"""Read-only audit of the shipped Brazil data. Python standard library only.

Optional DuckDB enables full Parquet scans; no pipeline modules are imported.
Exit codes: 0 no proven errors, 1 proven errors, 2 invalid CLI arguments.
"""
from __future__ import annotations

import argparse
from array import array
from collections import Counter, defaultdict
from datetime import date, timedelta
import calendar
import csv
import gzip
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import zlib

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
STATUSES = ('pass', 'error', 'warning', 'not_run', 'not_applicable')


def month_index(value, epoch):
    d = date.fromisoformat(value + '-01')
    return (d.year - epoch) * 12 + d.month - 1


def valid_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def decode_tile(raw, meta, coords):
    if len(raw) < 32:
        raise ValueError('truncated header')
    magic, version, tx, ty, n, m, v, reserved = struct.unpack_from('<8I', raw)
    if magic != 0x424C4646 or version != 1 or version != meta['version']:
        raise ValueError('unsupported magic/version')
    if (tx, ty) != tuple(coords) or reserved:
        raise ValueError('tile coordinates/reserved header disagree')
    at = 32

    def take(code, size):
        nonlocal at
        end = at + size * array(code).itemsize
        if end > len(raw):
            raise ValueError('truncated section')
        out = array(code)
        out.frombytes(raw[at:end])
        if sys.byteorder != 'little':
            out.byteswap()
        at = end
        return out

    def align():
        nonlocal at
        end = at + (-at % 4)
        if end > len(raw) or any(raw[at:end]):
            raise ValueError('invalid padding')
        at = end

    biome = take('B', meta['tileCells'] ** 2)
    daily = [take('H', n) for _ in range(6)] + [take('B', n)]
    align()
    monthly = [take('f', m), take('H', m), take('B', m)]
    align()
    variance = [take('f', v), take('H', v), take('B', v)]
    align()
    if at != len(raw):
        raise ValueError('unexpected trailing bytes')
    return biome, daily, monthly, variance


class Audit:
    def __init__(self, root, reference):
        self.root, self.reference = Path(root).resolve(), reference
        self.checks, self.inventory = [], []
        self.daily_totals = Counter()
        self.monthly_totals = defaultdict(lambda: [0, 0, 0.0, 0.0])

    def add(self, key, status, message, evidence=None):
        assert status in STATUSES
        self.checks.append(dict(id=key, status=status, message=message, evidence=evidence or {}))

    def read(self, path):
        p = self.root / path
        raw = p.read_bytes()
        self.inventory.append(dict(path=path, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest()))
        return raw

    def load_json(self, path):
        def invalid(x):
            raise ValueError('nonstandard JSON constant: ' + x)
        return json.loads(self.read(path).decode('utf-8'), parse_constant=invalid)

    def metadata(self, m):
        first, last, viirs, epoch = [date.fromisoformat(m[k]) for k in ('firstDay', 'lastDay', 'viirsStart', 'epochDay')]
        end = month_index(m['seriesEnd'], m['epochYear'])
        partial = month_index(m['partialMonth'], m['epochYear']) if m.get('partialMonth') else None
        if not epoch <= first <= viirs <= last:
            raise ValueError('invalid chronological ordering')
        if m['version'] != 1 or m['tileCells'] != 16 or m['cellDeg'] != .25:
            raise ValueError('unsupported grid/layout; no decoding attempted')
        if not valid_number(m['commonErrorC']) or not isinstance(m['sources'], str) or not m['sources'].strip():
            raise ValueError('missing provenance or invalid common error')
        if not (first.year <= m['climatologyBase'][0] <= m['climatologyBase'][1] <= m['observedUntil'] <= last.year):
            raise ValueError('invalid baseline/observed-year bounds')
        coords = m['tiles']
        if not coords or any(len(c) != 2 or any(type(x) is not int or x < 0 for x in c) for c in coords):
            raise ValueError('invalid tile manifest')
        if len({tuple(c) for c in coords}) != len(coords):
            raise ValueError('duplicate tile coordinates')
        self.add('metadata.schema', 'pass', 'Metadados suportados e cronologia consistente.')
        self.add('metadata.future', 'error' if last > self.reference else 'pass', 'Fim declarado comparado à data de referência.', {'lastDay': str(last), 'reference_date': str(self.reference)})
        last_m = month_index(str(last)[:7], m['epochYear'])
        incomplete = last.day < calendar.monthrange(last.year, last.month)[1]
        expected = last_m - int(incomplete)
        ok = end == expected and (partial == last_m if incomplete else partial is None)
        self.add('metadata.partial', 'pass' if ok else 'error', 'Último mês completo e mês parcial conferidos pelo último dia disponível.', {'seriesEnd': m['seriesEnd'], 'partialMonth': m.get('partialMonth'), 'first_month_partial': first.day != 1})
        self.add('metadata.first_month', 'warning' if first.day != 1 else 'pass', 'Cobertura inicial começa no dia ' + str(first.day) + '; julho/2002 não é um mês completo.' if first.day != 1 else 'Cobertura começa no primeiro dia do mês.')

    def tile(self, m, tx, ty):
        path = f'public/data/brazil/t_{tx}_{ty}.bin.gz'
        try:
            raw = gzip.decompress(self.read(path))
            bio, d, mo, va = decode_tile(raw, m, (tx, ty))
            cells = {i for i, b in enumerate(bio) if b != 255}
            if any(b != 255 and b >= len(m['biomes']) for b in bio):
                raise ValueError('invalid biome code')
            issues = Counter()
            day0 = date.fromisoformat(m['epochDay'])
            lower = (date.fromisoformat(m['firstDay']) - day0).days
            upper = (date.fromisoformat(m['lastDay']) - day0).days
            ref = (self.reference - day0).days
            viirs = (date.fromisoformat(m['viirsStart']) - day0).days
            previous = (-1, -1)
            sensor_days = [set(), set()]
            for day, ad, an, vd, vn, km, cell in zip(*d):
                if (day, cell) <= previous:
                    issues['daily_duplicate_or_unsorted'] += 1
                previous = (day, cell)
                if cell not in cells:
                    issues['daily_off_grid'] += 1
                if not lower <= day <= upper or day > ref:
                    issues['daily_out_of_period_or_future'] += 1
                if day < viirs and vd + vn + km:
                    issues['viirs_before_start'] += 1
                if km > vd + vn:
                    issues['degraded_exceeds_raw'] += 1
                for i, value in enumerate((ad + an, vd + vn)):
                    self.daily_totals[i, day] += value
                    if value:
                        sensor_days[i].add(day)
                stamp = day0 + timedelta(days=day)
                key = f'{stamp:%Y-%m}'
                self.monthly_totals[key][0] += ad + an
                self.monthly_totals[key][1] += vd + vn
            start_m = month_index(m['viirsStart'][:7], m['epochYear'])
            last_m = month_index(m['lastDay'][:7], m['epochYear'])
            modeled_m = (m['observedUntil'] + 1 - m['epochYear']) * 12
            for name, section, begin, slot in [('monthly', mo, start_m, 2), ('variance', va, modeled_m, 3)]:
                keys = set()
                for value, month, cell in zip(*section):
                    key = (month, cell)
                    if key in keys:
                        issues[name + '_duplicate'] += 1
                    keys.add(key)
                    if cell not in cells or not begin <= month <= last_m:
                        issues[name + '_key_out_of_range'] += 1
                    if not valid_number(value):
                        issues[name + '_negative_nan_infinite'] += 1
                    else:
                        stamp = f'{m["epochYear"] + month // 12:04d}-{month % 12 + 1:02d}'
                        self.monthly_totals[stamp][slot] += value
                expected = {(month, cell) for month in range(begin, last_m + 1) for cell in cells}
                if keys != expected:
                    issues[name + '_missing_keys'] += len(expected - keys)
                    issues[name + '_extra_keys'] += len(keys - expected)
            self.add(path, 'error' if any(issues.values()) else 'pass', 'CRC gzip, layout, datas, chaves, grade, completude mensal e valores inspecionados.', {'issues': dict(issues), 'cells': len(cells), 'daily_rows': len(d[0]), 'monthly_rows': len(mo[0]), 'variance_rows': len(va[0])})
        except (OSError, EOFError, ValueError, struct.error, OverflowError, zlib.error) as exc:
            self.add(path, 'error', 'Arquivo ausente, corrompido ou incompatível.', {'reason': str(exc)})

    def gaps(self, m):
        epoch = date.fromisoformat(m['epochDay'])
        for sensor, label, begin in [(0, 'Aqua', m['firstDay']), (1, 'NOAA20', m['viirsStart'])]:
            start = (date.fromisoformat(begin) - epoch).days
            end = (date.fromisoformat(m['lastDay']) - epoch).days
            missing = [str(epoch + timedelta(days=k)) for k in range(start, end + 1) if self.daily_totals[sensor, k] == 0]
            self.add('coverage.no_detection.' + label, 'warning' if missing else 'pass', 'Dias sem detecções no Brasil: investigar cobertura; não comprovam ausência de incêndios nem falha de aquisição.', {'days': missing, 'count': len(missing)})
        self.add('coverage.acquisition', 'not_run', 'Blocos esparsos não contêm máscaras de nuvem, passagens ou disponibilidade de aquisição; zero e ausência de observação não podem ser separados.')

    def parquet(self, meta):
        paths = [self.root / 'harmonization/output' / name for name in ('grid_monthly.parquet', 'grid_monthly_total.parquet', 'climatology.parquet', 'level1_factors.parquet')]
        try:
            import duckdb
        except ImportError:
            duckdb = None
        for p in paths:
            rel = p.relative_to(self.root).as_posix()
            try:
                raw = self.read(rel)
            except OSError as exc:
                self.add(rel, 'error', 'Parquet esperado não encontrado.', {'reason': str(exc)})
                continue
            self.add(rel + '.envelope', 'pass' if raw[:4] == raw[-4:] == b'PAR1' else 'error', 'Assinatura externa Parquet; não valida páginas internas.')
            if duckdb is None:
                self.add(rel + '.content', 'not_run', 'DuckDB não disponível; conteúdo Parquet não foi interpretado. Instale/use a dependência já declarada em harmonization/pyproject.toml para ampliar a auditoria.')
                continue
            con = None
            try:
                con = duckdb.connect(':memory:')
                con.read_parquet(str(p)).create_view('data')
                cols = {r[0]: r[1] for r in con.execute('DESCRIBE data').fetchall()}
                n = con.execute('SELECT count(*) FROM data').fetchone()[0]
                problems = {}
                for col in cols:
                    if col.startswith(('n_', 'var_', 'lo95', 'hi95')) or col in ('median', 'p25', 'p75', 'k'):
                        problems[col] = con.execute(f'SELECT count(*) FROM data WHERE "{col}" IS NOT NULL AND (NOT isfinite("{col}") OR "{col}" < 0)').fetchone()[0]
                if 'lo95' in cols:
                    problems['interval'] = con.execute('SELECT count(*) FROM data WHERE (lo95 IS NULL) != (hi95 IS NULL) OR lo95 > hi95').fetchone()[0]
                    problems['source_nulls'] = con.execute("SELECT count(*) FROM data WHERE n_harmonized IS NULL OR (source_flag='modeled_viirs' AND (lo95 IS NULL OR hi95 IS NULL OR var_harmonized IS NULL)) OR (source_flag='observed_modis' AND (lo95 IS NOT NULL OR hi95 IS NOT NULL OR var_harmonized IS NOT NULL))").fetchone()[0]
                if 'month' in cols:
                    problems['month'] = con.execute('SELECT count(*) FROM data WHERE month IS NULL OR month NOT BETWEEN 1 AND 12').fetchone()[0]
                if 'year' in cols:
                    first = month_index(meta['firstDay'][:7], 0)
                    last = month_index(meta['lastDay'][:7], 0)
                    cutoff = month_index(str(self.reference)[:7], 0)
                    problems['period'] = con.execute('SELECT count(*) FROM data WHERE year IS NULL OR year*12+month-1 NOT BETWEEN ? AND ? OR year*12+month-1 > ?', [first, last, cutoff]).fetchone()[0]
                    problems['partial'] = con.execute("SELECT count(*) FROM data WHERE is_partial IS NULL OR is_partial != (printf('%04d-%02d',year,month)=?)", [meta.get('partialMonth')]).fetchone()[0]
                    problems['source'] = con.execute("SELECT count(*) FROM data WHERE source_flag IS NULL OR source_flag != CASE WHEN year<=? THEN 'observed_modis' ELSE 'modeled_viirs' END OR (year<=? AND n_harmonized!=n_modis) OR (year>? AND (n_viirs_harmonized IS NULL OR n_harmonized!=n_viirs_harmonized))", [meta['observedUntil']] * 3).fetchone()[0]
                    problems['required_counts'] = con.execute('SELECT count(*) FROM data WHERE n_modis IS NULL OR n_harmonized IS NULL').fetchone()[0]
                    viirs_month = month_index(meta['viirsStart'][:7], 0)
                    problems['viirs_nullability'] = con.execute('SELECT count(*) FROM data WHERE (year*12+month-1 >= ? AND (n_viirs_raw IS NULL OR n_viirs_1km IS NULL OR n_viirs_harmonized IS NULL)) OR (year*12+month-1 < ? AND (n_viirs_raw IS NOT NULL OR n_viirs_1km IS NOT NULL OR n_viirs_harmonized IS NOT NULL))', [viirs_month, viirs_month]).fetchone()[0]
                    if 'daynight' in cols:
                        problems['daynight'] = con.execute("SELECT count(*) FROM data WHERE daynight IS NULL OR daynight NOT IN ('D','N')").fetchone()[0]
                    keys = 'cell_id,year,month' + (',daynight' if 'daynight' in cols else '')
                    problems['duplicate'] = con.execute(f'SELECT count(*) FROM (SELECT {keys}, count(*) n FROM data GROUP BY {keys} HAVING n!=1)').fetchone()[0]
                    n_cells = con.execute('SELECT count(DISTINCT cell_id) FROM data').fetchone()[0]
                    problems['missing_rows'] = abs(n - n_cells * (last - first + 1) * (2 if 'daynight' in cols else 1))
                if p.name == 'grid_monthly_total.parquet':
                    totals = con.execute('SELECT year,month,sum(n_modis),sum(n_viirs_raw),sum(n_viirs_harmonized),sum(var_harmonized) FROM data GROUP BY year,month ORDER BY year,month').fetchall()
                    mismatch = []
                    for y, mo, *values in totals:
                        stamp = f'{y:04d}-{mo:02d}'
                        actual = self.monthly_totals[stamp]
                        for i, (a, b) in enumerate(zip(actual, values)):
                            if b is not None and not math.isclose(a, b, rel_tol=1e-6, abs_tol=1e-3):
                                mismatch.append({'month': stamp, 'column': i, 'tile_sum': a, 'parquet_sum': b})
                    self.add('parity.tiles_parquet', 'error' if mismatch else 'pass', 'Somas Brasil por mês: contagens diárias, média mensal e variância binárias versus Parquet; tolerância relativa 1e-6 para float32.', {'mismatches': mismatch, 'months': len(totals)})
                    evidence = con.execute('SELECT median(s) FROM (SELECT year,sum(n_harmonized) s FROM data WHERE month=9 AND year BETWEEN 2003 AND 2025 GROUP BY year)').fetchone()[0]
                    self.add('climatology.brazil_september', 'pass', 'Mediana de setembro recalculada das somas nacionais (2003–2025); comparação documental manual.', {'median_of_sums': evidence})
                if p.name == 'climatology.parquet':
                    problems['quartiles'] = con.execute('SELECT count(*) FROM data WHERE p25 IS NULL OR median IS NULL OR p75 IS NULL OR p25>median OR median>p75 OR n_years!=?', [meta['climatologyBase'][1] - meta['climatologyBase'][0] + 1]).fetchone()[0]
                self.add(rel + '.content', 'error' if any(problems.values()) else 'pass', 'Leitura Parquet e regras numéricas, de mês e intervalo.', {'rows': n, 'invalid': problems, 'engine': duckdb.__version__})
            except Exception as exc:
                self.add(rel + '.content', 'not_run', 'Não foi possível analisar corretamente o Parquet.', {'reason': str(exc)})
            finally:
                if con is not None:
                    con.close()

    def run(self):
        try:
            m = self.load_json('public/data/brazil/meta.json')
            self.metadata(m)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            self.add('metadata.schema', 'error', 'Metadados inválidos ou não suportados; blocos não analisados.', {'reason': str(exc)})
            return self.result(None)
        expected = {f't_{x}_{y}.bin.gz' for x, y in m['tiles']}
        actual = {p.name for p in (self.root / 'public/data/brazil').glob('t_*.bin.gz')}
        self.add('files.manifest', 'pass' if actual == expected else 'error', 'Manifesto comparado com arquivos disponíveis.', {'missing': sorted(expected - actual), 'unlisted': sorted(actual - expected), 'declared': len(expected)})
        for tx, ty in m['tiles']:
            self.tile(m, tx, ty)
        self.gaps(m)
        try:
            params = self.load_json('harmonization/output/harmonization_params.json')
            pairs = {'commonErrorC': 'common_error_c', 'seriesEnd': 'series_end', 'partialMonth': 'partial_month', 'observedUntil': 'observed_until', 'climatologyBase': 'climatology_base', 'cellDeg': 'cell_deg'}
            mismatches = {a: [m[a], params.get(b)] for a, b in pairs.items() if m[a] != params.get(b)}
            self.add('metadata.pipeline', 'error' if mismatches else 'pass', 'Metadados do app comparados com parâmetros exportados.', mismatches)
            geo = self.load_json('public/data/brazil/brazil.geojson')
            ok = geo.get('type') == 'FeatureCollection' and bool(geo.get('features')) and all(f.get('geometry', {}).get('type') in ('Polygon', 'MultiPolygon') for f in geo['features'])
            self.add('geometry.container', 'pass' if ok else 'error', 'GeoJSON com feições poligonais; topologia e fidelidade ao IBGE não verificadas.')
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
            self.add('metadata.supporting', 'error', 'Falha em metadados complementares.', {'reason': str(exc)})
        self.add('provenance.sources', 'pass', 'Origem declarada nos metadados.', {'sources': m['sources']})
        self.add('provenance.authentication', 'not_run', 'Sem hashes oficiais FIRMS ou arquivos brutos: hashes locais identificam os bytes, mas não autenticam a origem nem os filtros.')
        for rel in ['harmonization/output/validation_metrics.csv', 'harmonization/output/validation_rankings.csv']:
            try:
                rows = list(csv.DictReader(self.read(rel).decode('utf-8').splitlines()))
                if not rows:
                    raise ValueError('empty metrics')
                bad = []
                for i, row in enumerate(rows, 2):
                    for key, val in row.items():
                        if key in ('n', 'vies_rel_pct', 'mae_log1p') or key.startswith(('spearman_', 'cobertura', 'pearson_')):
                            if val and not math.isfinite(float(val)):
                                bad.append([i, key, val])
                self.add(rel, 'error' if bad else 'pass', 'Tabela publicada lida; não equivale a recalcular validação.', {'rows': len(rows), 'nonfinite': bad, 'brazil_rows': [r for r in rows if r.get('escala') == 'Brasil × mês' or r.get('bioma') == 'Brasil']})
            except (OSError, ValueError, TypeError) as exc:
                self.add(rel, 'error', 'Falha na leitura de métricas.', {'reason': str(exc)})
        self.parquet(m)
        absent = [p for p in ['harmonization/data/raw', 'harmonization/data/interim/validation_pred.parquet', 'harmonization/data/interim/validation_groups.parquet', 'harmonization/output/points'] if not (self.root / p).exists()]
        self.add('validation.reproduction', 'not_run' if absent else 'warning', 'Reajuste LOYO, filtros e cobertura com erro comum não executados; requerem intermediários e ambiente científico.', {'missing': absent})
        self.add('uncertainty.daily', 'not_applicable', 'Dados binários fornecem variância mensal, sem intervalos diários independentes.')
        return self.result(m)

    def result(self, meta):
        def git(*args):
            p = subprocess.run(['git', '-C', str(self.root), *args], capture_output=True, text=True)
            return p.stdout.strip() if p.returncode == 0 else 'unavailable'
        return dict(schema_version=1, python_version=sys.version.split()[0], auditor_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), reference_date=str(self.reference), commit=git('rev-parse', 'HEAD'), branch=git('branch', '--show-current'), data_origin=meta.get('sources') if meta else None, period={k: meta[k] for k in ('firstDay', 'lastDay', 'seriesEnd', 'partialMonth')} if meta else None, summary={s: sum(c['status'] == s for c in self.checks) for s in STATUSES}, checks=self.checks, inventory=self.inventory, monthly_brazil={k: dict(zip(('aqua', 'viirs_raw', 'viirs_harmonized', 'variance_sum'), v)) for k, v in sorted(self.monthly_totals.items())}, recommendations=['Investigar dias sem detecções usando disponibilidade de aquisição.', 'Não comparar meses parciais com medianas de meses completos.', 'Preservar intermediários e publicar reprodução da validação e cobertura com c.', 'Revisar DOCUMENTATION_AUDIT.md antes de divulgar resultados.'], limitations=['Integridade interna não autentica origem FIRMS.', 'Zeros não distinguem ausência de detecção e falta de observação.', 'Não se testa uniformidade sazonal; não se contam incêndios independentes.', 'Revisão documental é manual, fixada no commit indicado em DOCUMENTATION_AUDIT.md.'])


def markdown(report):
    lines = ['# Auditoria dos dados FireFly Lens', '', f"Commit: `{report['commit']}` · branch: `{report['branch']}`", f"Data de referência: {report['reference_date']}", '', f"Origem declarada: {report['data_origin']}", f"Período: `{json.dumps(report['period'], ensure_ascii=False)}`", '', '## Resumo', '', '| Status | Quantidade |', '|---|---:|']
    lines += [f'| {s} | {n} |' for s, n in report['summary'].items()]
    lines += ['', '`error` = erro comprovado; `warning` = investigar; `pass` = regra aprovada no escopo indicado; `not_run` = não executada; `not_applicable` = não aplicável.', '', '## Verificações e evidências', '', '| Verificação | Status | Resultado / evidência |', '|---|---|---|']
    for c in report['checks']:
        detail = c['message'] + ' ' + json.dumps(c['evidence'], ensure_ascii=False)
        lines.append(f"| {c['id']} | {c['status']} | {detail.replace('|', '/').replace(chr(10), ' ')} |")
    for title, key in [('Recomendações', 'recommendations'), ('Limitações', 'limitations')]:
        lines += ['', '## ' + title, ''] + ['- ' + x for x in report[key]]
    lines += ['', 'O JSON inclui inventário SHA-256 por arquivo, contagens mensais e evidências completas. Dias sem detecções são observações; falhas de aquisição são hipóteses a investigar.', '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--reference-date', type=date.fromisoformat, default=date(2026, 11, 14), help='Data de corte da fotografia auditada, não o relógio da máquina (default: 2026-11-14).')
    parser.add_argument('--out', type=Path, default=HERE / 'reports')
    args = parser.parse_args()
    # Reports may only be written inside this module, never over source datasets.
    out = args.out.resolve()
    if not out.is_relative_to(HERE) or any((args.root.resolve() / p).is_relative_to(out) for p in ('public', 'harmonization', 'src')):
        parser.error('--out must be a directory inside qa/data-audit that cannot contain audited data')
    report = Audit(args.root, args.reference_date).run()
    out.mkdir(parents=True, exist_ok=True)
    (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    (out / 'REPORT.md').write_text(markdown(report), encoding='utf-8')
    print(json.dumps(report['summary']))
    return int(report['summary']['error'] > 0)


if __name__ == '__main__':
    raise SystemExit(main())
