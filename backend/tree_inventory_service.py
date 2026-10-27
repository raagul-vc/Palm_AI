"""
PALM AI Tree Inventory & Remote-Sensing Readiness Service
Provides transparent, data-grounded tree inventory metrics and readiness schemas.
Empirically discloses that individual palm crown centroid inventory is currently
UNAVAILABLE in source records, and prevents fabricated tree counts.
"""

from pathlib import Path
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
BLOCK_CHAR_CSV = BASE_DIR / "data" / "raw_source" / "block_characteristics.csv"

# Commercial Oil Palm Standard agronomic spacing benchmark:
# 9.0m equilateral triangular spacing = 136 - 143 palms / hectare
THEORETICAL_DENSITY_PER_HA = 136.0


def load_block_characteristics() -> pd.DataFrame:
    """Loads validated block characteristics."""
    if not BLOCK_CHAR_CSV.is_file():
        return pd.DataFrame()
    return pd.read_csv(BLOCK_CHAR_CSV)


def get_estate_tree_inventory_summary() -> dict:
    """
    Returns estate-wide tree inventory readiness summary.
    Discloses that verified unique tree count is currently unavailable.
    """
    df = load_block_characteristics()
    if df.empty:
        return {
            "inventory_status": "UNAVAILABLE",
            "error": "Block characteristics dataset unavailable."
        }

    total_blocks = len(df["Block_ID"].unique())
    total_area_ha = float(df["Observed_Area_Ha"].sum())

    # Theoretical capacity estimate (strictly labelled as theoretical benchmark, NOT verified trees)
    theoretical_capacity = round(total_area_ha * THEORETICAL_DENSITY_PER_HA)

    return {
        "estate_name": "North Estate (PT Palm Indo)",
        "total_operational_blocks": total_blocks,
        "verified_estate_area_ha": total_area_ha,
        "verified_tree_inventory_count": None,
        "inventory_status": "UNAVAILABLE",
        "inventory_status_label": "Tree Inventory Unavailable — Georeferenced Crown Centroids Pending",
        "inventory_readiness_score": 35.0,
        "readiness_breakdown": {
            "block_boundaries_available": True,
            "planting_years_available": True,
            "seed_type_available": True,
            "georeferenced_crown_centroids": False,
            "lidar_canopy_point_cloud": False,
            "field_tree_census_tags": False
        },
        "missing_requirements": [
            "High-resolution georeferenced aerial orthomosaic (<3cm GSD)",
            "Deep-learning individual palm crown segmentation polygons (GeoJSON)",
            "Ground-truth field tree census and missing-palm GPS survey points"
        ],
        "theoretical_density_benchmark_palms_per_ha": THEORETICAL_DENSITY_PER_HA,
        "theoretical_estate_capacity_palms": theoretical_capacity,
        "data_provenance": "Empirical ground truth from block_characteristics.csv (Division A, 42 blocks). No fabricated individual palm IDs."
    }


def get_block_tree_inventory(block_id: str) -> dict | None:
    """Returns block-specific tree inventory status and characteristics."""
    df = load_block_characteristics()
    if df.empty:
        return None

    bid = str(block_id or "").strip().upper()
    block_row = df[df["Block_ID"].astype(str).str.upper() == bid]

    if block_row.empty:
        return None

    row = block_row.iloc[0]
    area_ha = float(row["Observed_Area_Ha"])
    planting_year = int(row["Observed_Planting_Years"])
    seed_type = str(row["Observed_Seed_Types"])

    theoretical_palms = round(area_ha * THEORETICAL_DENSITY_PER_HA)

    return {
        "block_id": bid,
        "division": str(row["Division_ID"]),
        "observed_area_ha": area_ha,
        "planting_year": planting_year,
        "seed_type": seed_type,
        "verified_tree_count": None,
        "productive_palms_count": None,
        "dead_missing_palms_count": None,
        "inventory_status": "UNAVAILABLE",
        "inventory_status_label": "Individual palm census unavailable for this block",
        "inventory_readiness_score": 35.0,
        "theoretical_capacity_palms": theoretical_palms,
        "standard_density_benchmark": THEORETICAL_DENSITY_PER_HA,
        "missing_data": [
            "Individual crown centroid coordinates (lat/lon)",
            "Validation of productive vs non-bearing palms",
            "Confirmed field mortality/replanting census"
        ],
        "future_schema_support": {
            "entity": "TreeObservation",
            "fields": ["tree_id", "block_id", "latitude", "longitude", "crown_diameter_m", "health_status", "last_inspected"]
        }
    }
