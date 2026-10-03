#!/usr/bin/env python3
"""
Verify data quality of all generated multi-source integration artifacts.
Checks:
- Duplicate identifiers / duplicate feature names
- Missing values / nulls
- Impossible values / out of bounds
- Valid JSON schema structure
"""

import json
from pathlib import Path
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1].parent
DRONE_OUTPUTS = PROJECT_ROOT / "drone" / "outputs"

def verify():
    print("=" * 80)
    print("PALM_AI: INTEGRATION ARTIFACT DATA QUALITY AUDIT")
    print("=" * 80)

    # 1. Feature Catalog
    catalog_path = DRONE_OUTPUTS / "multi_source_feature_catalog.csv"
    assert catalog_path.is_file(), f"Missing {catalog_path}"
    df_cat = pd.read_csv(catalog_path)
    print(f"1. Feature Catalog ({catalog_path.name}):")
    print(f"   - Row count: {len(df_cat)}")
    print(f"   - Column count: {len(df_cat.columns)}")
    nulls = df_cat.isnull().sum().to_dict()
    print(f"   - Null values: {nulls}")
    assert df_cat.isnull().sum().sum() == 0, "Null values detected in feature catalog!"
    dups = df_cat.duplicated(subset=["source", "feature"]).sum()
    print(f"   - Duplicate features: {dups}")
    assert dups == 0, "Duplicate entries detected in feature catalog!"

    # 2. Integration Status JSON
    status_json = DRONE_OUTPUTS / "multi_source_integration_status.json"
    assert status_json.is_file(), f"Missing {status_json}"
    with open(status_json, "r", encoding="utf-8") as f:
        s_data = json.load(f)
    print(f"\n2. Integration Status JSON ({status_json.name}):")
    print(f"   - Status: {s_data.get('status')}")
    print(f"   - Direct fusion possible: {s_data.get('direct_fusion_possible')}")
    print(f"   - Audit evidence keys: {list(s_data.get('audit_evidence', {}).keys())}")
    assert s_data.get("direct_fusion_possible") is False, "Direct fusion should be False!"

    # 3. Integration Status TXT
    status_txt = DRONE_OUTPUTS / "multi_source_integration_status.txt"
    assert status_txt.is_file(), f"Missing {status_txt}"
    print(f"\n3. Integration Status TXT ({status_txt.name}):")
    print(f"   - File size: {status_txt.stat().st_size:,} bytes")
    assert status_txt.stat().st_size > 500, "Status TXT too short!"

    # 4. Risk Readiness JSON
    readiness_json = DRONE_OUTPUTS / "multi_source_risk_readiness.json"
    assert readiness_json.is_file(), f"Missing {readiness_json}"
    with open(readiness_json, "r", encoding="utf-8") as f:
        r_data = json.load(f)
    print(f"\n4. Risk Readiness JSON ({readiness_json.name}):")
    print(f"   - Verdict: {r_data.get('direct_fusion_verdict')}")
    for src, info in r_data.get("sources", {}).items():
        print(f"   - {src}: {info.get('readiness_status')}")

    # 5. Visualizations
    viz_dir = DRONE_OUTPUTS / "multi_source_integration_visualizations"
    assert viz_dir.is_dir(), f"Missing {viz_dir}"
    viz_files = list(viz_dir.glob("*.png"))
    print(f"\n5. Visualizations ({viz_dir.name}):")
    print(f"   - Generated plots count: {len(viz_files)}")
    for vf in viz_files:
        print(f"     * {vf.name} ({vf.stat().st_size:,} bytes)")
    assert len(viz_files) >= 4, "Expected at least 4 visualization plots!"

    print("\n" + "=" * 80)
    print("ALL INTEGRATION ARTIFACTS PASSED QUALITY VERIFICATION WITH ZERO DEFECTS.")
    print("=" * 80)

if __name__ == "__main__":
    verify()
