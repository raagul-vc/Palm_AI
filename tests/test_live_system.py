import unittest
import urllib.request
import json
import os

API_BASE = os.environ.get('PALM_AI_TEST_API_BASE', 'http://127.0.0.1:5000').rstrip('/')
FRONTEND_URL = os.environ.get('PALM_AI_TEST_FRONTEND_URL', 'http://localhost:5173/')

def probe_endpoint(url, timeout=10.0):
    last_err = None
    for _ in range(3):
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
                return resp.status, len(data), resp.headers.get('Content-Type')
        except Exception as e:
            last_err = e
            import time
            time.sleep(0.5)
    return 'ERROR', str(last_err), None

def is_backend_live():
    status, _, _ = probe_endpoint(f"{API_BASE}/api/health", timeout=0.8)
    return status == 200

class LiveSystemSmokeTests(unittest.TestCase):
    """
    Live system integration smoke test suite.
    Skips cleanly if the background server process is not active during unit test discovery.
    """
    @classmethod
    def setUpClass(cls):
        if not is_backend_live():
            raise unittest.SkipTest(f"Live backend server not running at {API_BASE}; skipping network integration smoke tests.")

    def test_live_backend_endpoints(self):
        endpoints = [
            '/api/health',
            '/api/risk',
            '/api/multi-source-risk',
            '/api/nutrients',
            '/api/nutrient-reference',
            '/api/dris',
            '/api/dris-reference',
            '/api/weather',
            '/api/weather-correlation',
            '/api/monthly-weather',
            '/api/productivity',
            '/api/production',
            '/api/harvest-production',
            '/api/yield-forecast',
            '/api/model-validation',
            '/api/fertilizer-plan',
            '/api/age-seed',
            '/api/seasonality',
            '/api/soil',
            '/api/data-quality',
            '/api/dataset-compatibility',
            '/api/multi-source/summary',
            '/api/multi-source/evidence',
            '/api/drone/summary',
            '/api/multispectral/summary'
        ]
        for ep in endpoints:
            st, sz, ct = probe_endpoint(API_BASE + ep)
            self.assertEqual(st, 200, f"Endpoint {ep} failed with status {st}")
            self.assertGreater(sz, 0, f"Endpoint {ep} returned empty payload")

    def test_live_block_isolation(self):
        for b in ['B001', 'B002', 'B008', 'B012', 'B042']:
            with urllib.request.urlopen(f'{API_BASE}/api/nutrients?block_id={b}', timeout=2.0) as resp:
                nut_rows = json.loads(resp.read().decode())
                self.assertTrue(all(r.get('Block_ID') == b for r in nut_rows))

            with urllib.request.urlopen(f'{API_BASE}/api/productivity?block_id={b}', timeout=2.0) as resp:
                prod_rows = json.loads(resp.read().decode())
                self.assertTrue(all(r.get('Block_ID') == b for r in prod_rows))

if __name__ == '__main__':
    print("=== LIVE INTEGRATION SMOKE RUNNER ===")
    if not is_backend_live():
        print(f"Backend at {API_BASE} is not running. Start with 'python backend/api.py' to run live probes.")
    else:
        unittest.main()
