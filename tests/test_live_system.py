import urllib.request
import json
import os

API_BASE = os.environ.get('PALM_AI_TEST_API_BASE', 'http://127.0.0.1:5000').rstrip('/')
FRONTEND_URL = os.environ.get('PALM_AI_TEST_FRONTEND_URL', 'http://localhost:5173/')

def test_endpoint(url):
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as resp:
            data = resp.read()
            return resp.status, len(data), resp.headers.get('Content-Type')
    except Exception as e:
        return 'ERROR', str(e), None

print("=== 1. FRONTEND SERVER ===")
status, size, ct = test_endpoint(FRONTEND_URL)
print(f"Vite ({FRONTEND_URL}): Status {status}, Size {size} bytes, Type {ct}")

print("\n=== 2. ALL 20 BACKEND ENDPOINTS ===")
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
    '/api/data-quality'
]

all_pass = True
for ep in endpoints:
    st, sz, ct = test_endpoint(API_BASE + ep)
    pass_flag = (st == 200 and sz > 0)
    if not pass_flag:
        all_pass = False
    print(f"  {ep:<26} -> Status {st}, Size {sz:>7} bytes  [{'PASS' if pass_flag else 'FAIL'}]")

print("\n=== 3. BLOCK FILTERING & ISOLATION AUDIT ===")
for b in ['B001', 'B002', 'B008', 'B012', 'B042']:
    with urllib.request.urlopen(f'{API_BASE}/api/nutrients?block_id={b}') as resp:
        nut_rows = json.loads(resp.read().decode())
        block_nut = nut_rows[0] if nut_rows else {}
        print(f"  [{b}] Nutrients: {len(nut_rows)} rows | N: {block_nut.get('N_pct'):.3f}%, P: {block_nut.get('P_pct'):.3f}%, K: {block_nut.get('K_pct'):.3f}% (Block_ID={block_nut.get('Block_ID')})")

    with urllib.request.urlopen(f'{API_BASE}/api/dris?block_id={b}') as resp:
        dris_rows = json.loads(resp.read().decode())
        if dris_rows:
            d = dris_rows[0]
            print(f"  [{b}] DRIS Surveyed: {len(dris_rows)} rows | Limitation: {d.get('Potential_Limiting_Nutrients')}, Prescription: {d.get('Prescription_Recommendation')}")
        else:
            print(f"  [{b}] DRIS Unsurveyed: 0 rows -> Handled gracefully as 'DRIS data not available for this block'")

    with urllib.request.urlopen(f'{API_BASE}/api/productivity?block_id={b}') as resp:
        prod_rows = json.loads(resp.read().decode())
        print(f"  [{b}] Productivity: {len(prod_rows)} yearly rows | Latest Yield: {prod_rows[-1].get('Productivity_t_Ha')} t/ha ({prod_rows[-1].get('Year')})")

    with urllib.request.urlopen(f'{API_BASE}/api/harvest-production?block_id={b}') as resp:
        harvest_rows = json.loads(resp.read().decode())
        isolated = all(row.get('Block_ID') == b for row in harvest_rows)
        if not harvest_rows or not isolated:
            all_pass = False
        total_2024 = sum(row['FFB_Production_t'] for row in harvest_rows if row['Year'] == 2024)
        print(f"  [{b}] Harvest: {len(harvest_rows)} monthly rows | 2024 FFB: {total_2024:.3f} t | Block isolation: {'PASS' if isolated else 'FAIL'}")

print("\n=== 4. SUMMARY AUDIT RESULT ===")
print("All 20 Endpoints and block checks Passed:", all_pass)
