import json
from pathlib import Path
import tempfile
import unittest
import duckdb
from firefly_analytics.data_adapter import from_parquet


class MissingAdapterTests(unittest.TestCase):
    def test_null_and_zero_in_parquet_remain_distinct(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            out=root/"harmonization/output"
            meta=root/"public/data/brazil"
            out.mkdir(parents=True)
            meta.mkdir(parents=True)
            (out/"harmonization_params.json").write_text(json.dumps(dict(common_error_c=.213,cell_deg=.25,series_end="2023-03",observed_until=2025)))
            (meta/"meta.json").write_text(json.dumps(dict(firstDay="2023-01-01",lastDay="2023-03-31")))
            with duckdb.connect() as con:
                con.execute("CREATE TABLE sample(cell_id INT,lat DOUBLE,lon DOUBLE,year INT,month INT,n_harmonized DOUBLE,var_harmonized DOUBLE,source_flag VARCHAR,is_partial BOOLEAN)")
                con.execute("INSERT INTO sample VALUES (1,-18.375,-57.375,2023,1,3,NULL,'observed_modis',false),(1,-18.375,-57.375,2023,2,NULL,NULL,'observed_modis',false),(1,-18.375,-57.375,2023,3,0,NULL,'observed_modis',false)")
                con.table("sample").write_parquet(str(out/"grid_monthly_total.parquet"))
            geometry={"type":"Polygon","coordinates":[[[-57.5,-18.5],[-57.25,-18.5],[-57.25,-18.25],[-57.5,-18.25],[-57.5,-18.5]]]}
            series=from_parquet(root,"synthetic-parquet-test",geometry)
            self.assertIsNone(series.months[1].value)
            self.assertEqual(series.months[2].value,0)
            self.assertIn("invalid_or_missing_values",series.months[1].flags)
