import os
import unittest
from unittest.mock import patch
from firefly_analytics.render_start import main


class RenderStartupTests(unittest.TestCase):
    def test_refuses_public_unauthenticated_deployment(self):
        with patch.dict(os.environ, {'ANALYTICS_API_TOKEN': ''}):
            with self.assertRaises(SystemExit):
                main()

    def test_uses_render_port_and_one_worker(self):
        with patch.dict(os.environ, {'ANALYTICS_API_TOKEN': 'test-only', 'PORT': '12345'}):
            with patch('firefly_analytics.render_start.uvicorn.run') as run:
                main()
                run.assert_called_once_with('firefly_analytics.service:app', host='0.0.0.0', port=12345, workers=1)
