"""Tiny synthetic files exercise failures without changing scientific data."""
import copy
from datetime import date
import gzip
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import audit

META = json.loads((Path(__file__).parent / 'fixtures/meta.json').read_text(encoding='utf-8'))


def tile(value=1., day=0, cell=0, monthly=True, version=1):
    buf = bytearray(struct.pack('<8I', 0x424C4646, version, 0, 0, 1, int(monthly), 0, 0))
    buf.extend(bytes([0] + [255] * 255))
    for n in (day, 1, 0, 1, 0, 1):
        buf.extend(struct.pack('<H', n))
    buf.append(cell)
    buf.extend(bytes(-len(buf) % 4))
    if monthly:
        buf.extend(struct.pack('<fHB', value, 0, cell))
        buf.extend(bytes(-len(buf) % 4))
    return bytes(buf)


class Rules(unittest.TestCase):
    def check_tile(self, raw):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp) / 'public/data/brazil'
            directory.mkdir(parents=True)
            (directory / 't_0_0.bin.gz').write_bytes(gzip.compress(raw))
            run = audit.Audit(tmp, date(2026, 1, 14))
            run.tile(META, 0, 0)
            return run.checks[-1]

    def test_valid_layout(self):
        self.assertEqual(self.check_tile(tile())['status'], 'pass')

    def test_truncation(self):
        self.assertEqual(self.check_tile(tile()[:-5])['status'], 'error')

    def test_unknown_version(self):
        self.assertEqual(self.check_tile(tile(version=2))['status'], 'error')

    def test_trailing_bytes(self):
        self.assertEqual(self.check_tile(tile() + b'bad')['status'], 'error')

    def test_negative_nan_and_infinity(self):
        for v in (-1., float('nan'), float('inf')):
            with self.subTest(value=v):
                self.assertEqual(self.check_tile(tile(value=v))['status'], 'error')

    def test_outside_grid(self):
        self.assertEqual(self.check_tile(tile(cell=1))['status'], 'error')

    def test_future_day(self):
        self.assertEqual(self.check_tile(tile(day=14))['status'], 'error')

    def test_missing_monthly_key(self):
        result = self.check_tile(tile(monthly=False))
        self.assertEqual(result['evidence']['issues']['monthly_missing_keys'], 1)

    def test_invalid_gzip(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'public/data/brazil'
            p.mkdir(parents=True)
            for raw in (b'broken', gzip.compress(b'fixture')[:10] + b'\xff' * 20):
                with self.subTest(raw=raw):
                    (p / 't_0_0.bin.gz').write_bytes(raw)
                    run = audit.Audit(tmp, date(2026, 1, 14))
                    run.tile(META, 0, 0)
                    self.assertEqual(run.checks[-1]['status'], 'error')

    def test_partial_month_consistency(self):
        run = audit.Audit('.', date(2026, 1, 14))
        run.metadata(META)
        self.assertEqual(next(c for c in run.checks if c['id'] == 'metadata.partial')['status'], 'pass')
        m = copy.deepcopy(META)
        m['seriesEnd'] = '2026-01'
        run.metadata(m)
        self.assertEqual(run.checks[-2]['status'], 'error')

    def test_invalid_date(self):
        m = copy.deepcopy(META)
        m['lastDay'] = '2026-02-30'
        with self.assertRaises(ValueError):
            audit.Audit('.', date(2026, 1, 14)).metadata(m)

    def test_duplicate_manifest(self):
        m = copy.deepcopy(META)
        m['tiles'].append([0, 0])
        with self.assertRaises(ValueError):
            audit.Audit('.', date(2026, 1, 14)).metadata(m)

    def test_future_metadata(self):
        run = audit.Audit('.', date(2026, 1, 13))
        run.metadata(META)
        self.assertEqual(next(c for c in run.checks if c['id'] == 'metadata.future')['status'], 'error')

    def test_zero_detection_only_warns(self):
        run = audit.Audit('.', date(2026, 1, 14))
        run.gaps(META)
        self.assertEqual(run.checks[0]['status'], 'warning')
        self.assertEqual(run.checks[0]['evidence']['count'], 14)
        self.assertEqual(run.checks[-1]['status'], 'not_run')

    def test_malformed_metadata_still_reports(self):
        with tempfile.TemporaryDirectory() as tmp:
            run = audit.Audit(tmp, date(2026, 1, 14)).run()
            self.assertEqual(run['summary']['error'], 1)
            self.assertIsNone(run['period'])


try:
    import duckdb
    HAS_DUCKDB = hasattr(duckdb, 'connect')
except ImportError:
    HAS_DUCKDB = False


@unittest.skipUnless(HAS_DUCKDB, 'optional DuckDB unavailable')
class ParquetRules(unittest.TestCase):
    def inspect(self, lo=0., hi=2., variance=1., flag='modeled_viirs'):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'harmonization/output'
            p.mkdir(parents=True)
            con = duckdb.connect(':memory:')
            con.execute('CREATE TABLE fixture(cell_id INT, year INT, month INT, n_modis INT, n_viirs_raw INT, n_viirs_1km INT, n_viirs_harmonized DOUBLE, n_harmonized DOUBLE, var_harmonized DOUBLE, lo95 DOUBLE, hi95 DOUBLE, source_flag VARCHAR, is_partial BOOLEAN)')
            con.execute('INSERT INTO fixture VALUES(0,2026,1,1,1,1,1,1,?,?,?,?,true)', [variance, lo, hi, flag])
            con.table('fixture').write_parquet(str(p / 'grid_monthly_total.parquet'))
            con.close()
            m = copy.deepcopy(META)
            m['observedUntil'] = 2025
            run = audit.Audit(tmp, date(2026, 1, 14))
            run.monthly_totals['2026-01'] = [1, 1, 1., variance]
            run.parquet(m)
            return next(c for c in run.checks if c['id'].endswith('grid_monthly_total.parquet.content'))

    def test_valid_predictive_interval(self):
        # Ordering is necessary; bracketing the fitted mean is not required.
        self.assertEqual(self.inspect(lo=2., hi=3.)['status'], 'pass')

    def test_reversed_quantiles(self):
        c = self.inspect(lo=3., hi=2.)
        self.assertEqual(c['evidence']['invalid']['interval'], 1)
        self.assertEqual(c['status'], 'error')

    def test_negative_variance(self):
        self.assertEqual(self.inspect(variance=-1.)['status'], 'error')

    def test_missing_modeled_interval(self):
        self.assertEqual(self.inspect(lo=None)['evidence']['invalid']['source_nulls'], 1)

    def test_inconsistent_source(self):
        self.assertEqual(self.inspect(flag='observed_modis')['evidence']['invalid']['source'], 1)


if __name__ == '__main__':
    unittest.main()
