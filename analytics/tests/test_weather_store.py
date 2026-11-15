import base64
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock
from firefly_analytics import weather_store as store


class WeatherRefreshTests(unittest.TestCase):
    def bundle(self, data=b'netcdf-test'):
        return json.dumps({'schema_version':'1.0.0', 'metadata':{'source_id':'nasa_gfwed_geos5',
            'synthetic':False,'sha256':hashlib.sha256(data).hexdigest(),'source_files':[{'url':'source'}]},
            'netcdf_base64':base64.b64encode(data).decode()}).encode()

    def test_transport_corruption_and_unmarked_sources_rejected(self):
        for change in ({'netcdf_base64':base64.b64encode(b'corrupt').decode()}, {'schema_version':'wrong'}):
            value=json.loads(self.bundle());value.update(change)
            with self.assertRaises(ValueError):store.decode_bundle(json.dumps(value).encode())
        value=json.loads(self.bundle());value['metadata']['synthetic']=True
        with self.assertRaises(ValueError):store.decode_bundle(json.dumps(value).encode())

    def test_failed_refresh_preserves_previous_product_and_is_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            fallback=Path(directory)/'bundled.nc'; previous=Path(directory)/'previous.nc'
            with patch.dict('os.environ',{'FIREFLY_FWI_REFRESH_URL':'https://example.invalid/bundle'}), \
                 patch.object(store,'_checked',0), patch.object(store,'_current',previous), \
                 patch.object(store.time,'monotonic',return_value=10), \
                 patch.object(store.urllib.request,'urlopen',side_effect=OSError('offline')) as fetch:
                self.assertEqual(store.current_product(fallback)[0],previous)
                self.assertEqual(store.current_product(fallback)[0],previous)
                self.assertEqual(fetch.call_count,1)

    def test_verified_refresh_replaces_product_only_after_reader_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            response=MagicMock();response.__enter__.return_value.read.return_value=self.bundle()
            with patch.dict('os.environ',{'FIREFLY_FWI_REFRESH_URL':'https://example.invalid/bundle'}), \
                 patch.object(store,'_checked',0), patch.object(store,'_current',None), \
                 patch.object(store.tempfile,'gettempdir',return_value=directory), \
                 patch.object(store.urllib.request,'urlopen',return_value=response), \
                 patch('firefly_analytics.fwi_grid.read_netcdf',return_value={'status':'available'}):
                path,metadata=store.current_product(Path(directory)/'bundled.nc')
                self.assertEqual(path.read_bytes(),b'netcdf-test')
                self.assertEqual(json.loads(metadata.read_text())['synthetic'],False)

    def test_expired_download_is_not_installed(self):
        response=MagicMock();response.__enter__.return_value.read.return_value=self.bundle()
        with patch.dict('os.environ',{'FIREFLY_FWI_REFRESH_URL':'https://example.invalid/bundle'}), \
             patch.object(store,'_checked',0),patch.object(store,'_current',None), \
             patch.object(store.urllib.request,'urlopen',return_value=response), \
             patch('firefly_analytics.fwi_grid.read_netcdf',return_value={'status':'unavailable'}):
            path=Path('bundled.nc')
            self.assertEqual(store.current_product(path)[0],path)
