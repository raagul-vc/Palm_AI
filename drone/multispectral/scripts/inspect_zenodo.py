import urllib.request
import json
import sys

def main():
    record_id = "16743974"
    urls = [
        f"https://zenodo.org/api/records/{record_id}",
        # Zenodo DOI might redirect to a concept ID or specific record ID
    ]
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    # Also resolve DOI if needed
    doi_url = "https://doi.org/10.5281/zenodo.16743974"
    req_doi = urllib.request.Request(doi_url, headers=headers)
    try:
        with urllib.request.urlopen(req_doi) as resp:
            actual_url = resp.geturl()
            print("Resolved DOI URL:", actual_url)
            rec_from_url = actual_url.rstrip('/').split('/')[-1]
            if rec_from_url != record_id and rec_from_url.isdigit():
                urls.insert(0, f"https://zenodo.org/api/records/{rec_from_url}")
    except Exception as e:
        print("DOI resolution notice:", e)

    data = None
    for url in urls:
        print("Querying:", url)
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                print("Successfully retrieved record!")
                break
        except Exception as e:
            print(f"Failed {url}: {e}")

    if not data:
        print("Could not retrieve Zenodo record.")
        return

    print("=" * 80)
    print("RECORD METADATA")
    print("=" * 80)
    print("ID:", data.get("id"))
    print("DOI:", data.get("doi"))
    metadata = data.get("metadata", {})
    print("Title:", metadata.get("title"))
    print("Publication Date:", metadata.get("publication_date"))
    print("Description snippet:", metadata.get("description", "")[:300])

    print("=" * 80)
    print("FILES LIST")
    print("=" * 80)
    files = data.get("files", [])
    print(f"Total files listed: {len(files)}")
    total_size = sum(f.get("size", 0) for f in files)
    print(f"Total dataset size: {total_size / (1024**3):.2f} GB ({total_size / (1024**2):.2f} MB)")
    print("-" * 80)
    for i, f in enumerate(files, 1):
        key = f.get("key") or f.get("filename")
        size = f.get("size", 0)
        size_mb = size / (1024**2)
        size_gb = size / (1024**3)
        checksum = f.get("checksum")
        links = f.get("links", {})
        download_url = links.get("self") or links.get("content")
        print(f"[{i}] File Name: {key}")
        print(f"    Size: {size:,} bytes ({size_mb:,.2f} MB / {size_gb:.2f} GB)")
        print(f"    Format: {key.split('.')[-1] if '.' in key else 'unknown'}")
        print(f"    Checksum: {checksum}")
        print(f"    Download URL: {download_url}")
        print("-" * 80)

if __name__ == "__main__":
    main()
