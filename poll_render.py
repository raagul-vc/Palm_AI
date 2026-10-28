import urllib.request
import time
import sys

url = 'https://palm-ai-9fbi.onrender.com/'
print("Beginning poll for Render deployment...")

for attempt in range(1, 30):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=12) as resp:
            content = resp.read().decode('utf-8', errors='ignore')
            found_marker = None
            for line in content.splitlines():
                if 'palm-ai-build' in line:
                    found_marker = line.strip()
                    break
            print(f"[Attempt {attempt}] Status: {resp.status}, Marker: {found_marker}", flush=True)
            if found_marker and 'v2.9-estate-dashboard-polished' in found_marker:
                print("SUCCESS: Deployed commit is live with marker v2.9-estate-dashboard-polished!", flush=True)
                sys.exit(0)
    except Exception as e:
        print(f"[Attempt {attempt}] Connection: {e}")
    time.sleep(8)

print("Exceeded maximum attempts.")
sys.exit(1)
