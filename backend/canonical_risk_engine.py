from pathlib import Path
import json
import pandas as pd
import numpy as np

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

MASTER_FILE = DATA_DIR / "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv"
YIELD_RISK_FILE = OUTPUT_DIR / "block_health_risk.csv"
NUTRIENT_FILE = OUTPUT_DIR / "block_nutrient_diagnostics.csv"
DRIS_FILE = OUTPUT_DIR / "dris_prescription_analysis.csv"
MULTI_RISK_FILE = OUTPUT_DIR / "multi_source_block_risk.csv"


def build_canonical_block_risk_dataset():
    """Build the canonical block-level risk dataset for all Palm Plantation blocks.
    
    Adheres strictly to the Decoupled Multi-Pillar Risk Architecture:
    - Palm Agronomic: Core block-level risk modeling source
    - Weather: Marked as 'Unavailable / Not integrated' for block discrimination
    - Soil: Reported as measured observations where available (7 blocks); no blind imputation
    - RGB Drone & Multispectral: Marked as 'unmapped' (independent demonstration modules)
    """
    master = pd.read_csv(MASTER_FILE)
    yield_risk = pd.read_csv(YIELD_RISK_FILE)
    nutrient = pd.read_csv(NUTRIENT_FILE)
    dris = pd.read_csv(DRIS_FILE)
    multi_risk = pd.read_csv(MULTI_RISK_FILE)

    master["Year"] = pd.to_numeric(master["Year"], errors="coerce")
    latest_year = int(master["Year"].max())
    m_latest = master[master["Year"] == latest_year].copy()

    # Annual FFB and Productivity
    ffb_ann = m_latest.groupby("Block_ID")["FFB_Production_t"].sum()
    ffb_max = m_latest.groupby("Block_ID")["FFB_Production_t"].max()
    ffb_mean = m_latest.groupby("Block_ID")["FFB_Production_t"].mean()
    prod_ann = m_latest.groupby("Block_ID")["Productivity_t_Ha"].sum()
    div_map = m_latest.groupby("Block_ID")["Division_ID"].last().to_dict()
    latest_month_map = m_latest.groupby("Block_ID")["Month_Number"].max().to_dict()

    # Latest block physical attributes
    last_attrs = m_latest.sort_values(["Block_ID", "Month_Number"]).groupby("Block_ID").last()

    # Soil samples: extract distinct historical sample per block where Soil_Data_Available == True
    soil_df = master[master["Soil_Data_Available"].astype(str).str.lower().isin(["true", "1", "yes"])].copy()
    soil_by_block = {}
    for bid, grp in soil_df.groupby("Block_ID"):
        latest_soil = grp.sort_values("Year").iloc[-1]
        soil_by_block[bid] = {
            "status": "observed",
            "sample_year": int(latest_soil["Year"]),
            "pH_H2O": round(float(latest_soil["pH_H2O"]), 2) if pd.notna(latest_soil.get("pH_H2O")) else None,
            "C_Organic_pct": round(float(latest_soil["C_Organic_pct"]), 2) if pd.notna(latest_soil.get("C_Organic_pct")) else None,
            "P_Available_ppm": round(float(latest_soil["P_Available_ppm"]), 2) if pd.notna(latest_soil.get("P_Available_ppm")) else None,
            "K_exch_me_100g": round(float(latest_soil["K_exch_me_100g"]), 3) if pd.notna(latest_soil.get("K_exch_me_100g")) else None,
            "Mg_exch_me_100g": round(float(latest_soil["Mg_exch_me_100g"]), 3) if pd.notna(latest_soil.get("Mg_exch_me_100g")) else None,
            "Base_Saturation_pct": round(float(latest_soil["Base_Saturation_pct"]), 1) if pd.notna(latest_soil.get("Base_Saturation_pct")) else None,
            "Sand_pct": round(float(latest_soil["Sand_pct"]), 1) if pd.notna(latest_soil.get("Sand_pct")) else None,
            "Clay_pct": round(float(latest_soil["Clay_pct"]), 1) if pd.notna(latest_soil.get("Clay_pct")) else None,
            "note": "Measured field sample from historical soil survey"
        }

    # Foliar nutrient lookup by block
    nutrient_by_block = {}
    for _, row in nutrient.iterrows():
        bid = str(row["Block_ID"]).strip().upper()
        nutrient_by_block[bid] = {
            "status": "observed" if pd.notna(row.get("Leaf_Sampling_Year")) else "unavailable",
            "sample_year": int(row["Leaf_Sampling_Year"]) if pd.notna(row.get("Leaf_Sampling_Year")) else None,
            "panel": {
                "N_pct": round(float(row["N_pct"]), 3) if pd.notna(row.get("N_pct")) else None,
                "P_pct": round(float(row["P_pct"]), 3) if pd.notna(row.get("P_pct")) else None,
                "K_pct": round(float(row["K_pct"]), 3) if pd.notna(row.get("K_pct")) else None,
                "Ca_pct": round(float(row["Ca_pct"]), 3) if pd.notna(row.get("Ca_pct")) else None,
                "Mg_pct": round(float(row["Mg_pct"]), 3) if pd.notna(row.get("Mg_pct")) else None,
                "B_ppm": round(float(row["B_ppm"]), 2) if pd.notna(row.get("B_ppm")) else None,
            },
            "low_nutrients": str(row.get("Low_Nutrients", "")).split(", ") if pd.notna(row.get("Low_Nutrients")) and row.get("Low_Nutrients") != "None below threshold" else [],
            "low_count": int(row["Low_Nutrient_Count"]) if pd.notna(row.get("Low_Nutrient_Count")) else 0,
            "high_count": int(row["High_Nutrient_Count"]) if pd.notna(row.get("High_Nutrient_Count")) else 0,
            "available_count": int(row["Available_Nutrient_Count"]) if pd.notna(row.get("Available_Nutrient_Count")) else 0,
            "data_status": str(row.get("Data_Status", "No valid leaf sample")),
            "concern": str(row.get("Nutrient_Concern", "UNKNOWN")),
        }

    # DRIS lookup by block (latest sample year)
    dris_latest = dris.copy()
    if "Year" in dris_latest.columns:
        dris_latest["Year"] = pd.to_numeric(dris_latest["Year"], errors="coerce")
        dris_latest = dris_latest.sort_values(["Year", "Block_ID"])
    dris_by_block = {}
    for bid, grp in dris_latest.groupby("Block_ID"):
        last_dris = grp.iloc[-1]
        lim_str = str(last_dris.get("Potential_Limiting_Nutrients", "")).strip()
        exc_str = str(last_dris.get("Potential_Excess_Nutrients", "")).strip()
        dris_by_block[str(bid).strip().upper()] = {
            "status": "observed",
            "sample_year": int(last_dris["Year"]) if pd.notna(last_dris.get("Year")) else None,
            "limiting_nutrients": [v.strip() for v in lim_str.split(",") if v.strip() and v.strip() != "NONE"] if lim_str else [],
            "excess_nutrients": [v.strip() for v in exc_str.split(",") if v.strip() and v.strip() != "NONE"] if exc_str else [],
            "prescription": str(last_dris.get("Prescription_Recommendation", "No prescription"))
        }

    # Yield risk lookup by block
    yield_by_block = {}
    for _, row in yield_risk.iterrows():
        bid = str(row["Block_ID"]).strip().upper()
        yield_by_block[bid] = {
            "actual_yield_t_ha": round(float(row["Actual_Yield_t_Ha"]), 3) if pd.notna(row.get("Actual_Yield_t_Ha")) else None,
            "expected_yield_t_ha": round(float(row["Expected_Yield_t_Ha"]), 3) if pd.notna(row.get("Expected_Yield_t_Ha")) else None,
            "expected_peer_count": int(row["Expected_Peer_Count"]) if pd.notna(row.get("Expected_Peer_Count")) else 0,
            "productivity_deviation_pct": round(float(row["Productivity_Deviation_pct"]), 2) if pd.notna(row.get("Productivity_Deviation_pct")) else None,
            "yield_gap_pct": round(float(row["Yield_Gap_pct"]), 2) if pd.notna(row.get("Yield_Gap_pct")) else None,
            "yield_risk_score": round(float(row["Risk_Score"]), 1) if pd.notna(row.get("Risk_Score")) else None,
            "yield_risk_level": str(row.get("Risk_Level", "UNKNOWN"))
        }

    # Build canonical records indexed by Block_ID
    canonical_dict = {}
    all_blocks = sorted(master["Block_ID"].dropna().unique().tolist())

    for bid in all_blocks:
        bid_str = str(bid).strip().upper()
        y_info = yield_by_block.get(bid_str, {})
        n_info = nutrient_by_block.get(bid_str, {})
        d_info = dris_by_block.get(bid_str, {
            "status": "unavailable",
            "sample_year": None,
            "limiting_nutrients": [],
            "excess_nutrients": [],
            "prescription": "DRIS survey not conducted for this block"
        })
        s_info = soil_by_block.get(bid, {
            "status": "unavailable",
            "sample_year": None,
            "note": "Soil sampling not conducted for this block; sparse survey restricted to 7 blocks in estate"
        })

        # Match row in multi_source_block_risk.csv
        m_row = multi_risk[multi_risk["Block_ID"].astype(str).str.strip().str.upper() == bid_str]
        m_row = m_row.iloc[0] if len(m_row) > 0 else {}

        prod_t_ha = prod_ann.get(bid, y_info.get("actual_yield_t_ha"))
        ffb_t = ffb_ann.get(bid, None)
        max_ffb = ffb_max.get(bid, None)
        mean_ffb = ffb_mean.get(bid, None)
        y_risk_comp = m_row.get("Yield_Risk_Component") if pd.notna(m_row.get("Yield_Risk_Component")) else None
        nut_risk_comp = m_row.get("Nutrient_Risk_Component") if pd.notna(m_row.get("Nutrient_Risk_Component")) else None
        dris_risk_comp = m_row.get("DRIS_Risk_Component") if pd.notna(m_row.get("DRIS_Risk_Component")) else None
        overall_score = float(m_row.get("Multi_Source_Risk_Score", 0.0)) if pd.notna(m_row.get("Multi_Source_Risk_Score")) else 0.0
        overall_level = str(m_row.get("Multi_Source_Risk_Level", "UNKNOWN"))

        # Professor requirement: High Production threshold is Maximum FFB production for each Block + Year
        if y_risk_comp is not None:
            high_prod_prob = round(1.0 - (float(y_risk_comp) / 100.0), 2)
        elif max_ffb is not None and max_ffb > 0 and mean_ffb is not None:
            high_prod_prob = round(min(1.0, float(mean_ffb) / float(max_ffb)), 2)
        else:
            high_prod_prob = 0.50

        high_prod_class = "High" if high_prod_prob >= 0.50 else "Not High"

        attr_row = last_attrs.loc[bid] if bid in last_attrs.index else {}
        plant_age = float(attr_row.get("Plant_Age_Years")) if pd.notna(attr_row.get("Plant_Age_Years")) else None
        palms_per_ha = float(attr_row.get("Palms_per_Ha")) if pd.notna(attr_row.get("Palms_per_Ha")) else None
        area_ha = float(attr_row.get("Area_Ha")) if pd.notna(attr_row.get("Area_Ha")) else None
        plant_status = str(attr_row.get("Plant_Status", "UNKNOWN"))
        seed_type = str(attr_row.get("Seed_Type", "UNKNOWN"))

        record = {
            "Block_ID": bid,
            "Division_ID": div_map.get(bid, "Division_A"),
            "Year": latest_year,
            "Month": int(latest_month_map.get(bid, 12)),
            "identity": {
                "Block_ID": bid,
                "Division_ID": div_map.get(bid, "Division_A"),
                "Year": latest_year,
                "Month": int(latest_month_map.get(bid, 12)),
            },
            "production_evidence": {
                "Productivity_t_Ha": round(float(prod_t_ha), 3) if pd.notna(prod_t_ha) else None,
                "FFB_Production_t": round(float(ffb_t), 3) if pd.notna(ffb_t) else None,
                "Productivity_deviation": y_info.get("productivity_deviation_pct"),
                "High_Production_threshold_t": round(float(max_ffb), 3) if pd.notna(max_ffb) else None,
                "High_Production_probability": high_prod_prob,
                "High_Production_class": high_prod_class,
                "peer_cohort_size": y_info.get("expected_peer_count", 0),
                "target_definition": "Maximum FFB production for Block + Year represents the High Production threshold"
            },
            "agronomic_evidence": {
                "Plant_Age_Years": plant_age,
                "Palms_per_Ha": palms_per_ha,
                "Area_Ha": area_ha,
                "Plant_Status": plant_status,
                "Seed_Type": seed_type,
                "leaf_nutrients": n_info,
                "soil_indicators": s_info,
                "dris_indicators": d_info
            },
            "weather_evidence": {
                "status": "Unavailable / Not integrated",
                "reason": "Estate-level weather station measurements repeat identically across all 42 blocks; offers zero block-level spatial discrimination.",
                "block_discriminating": False,
                "estate_annual_rainfall_mm": 281.09,
                "estate_mean_temperature_c": 27.4
            },
            "risk_components": {
                "production_risk": round(float(y_risk_comp), 1) if y_risk_comp is not None else None,
                "nutrient_risk": round(float(nut_risk_comp), 1) if nut_risk_comp is not None else None,
                "dris_risk": round(float(dris_risk_comp), 1) if dris_risk_comp is not None else None,
                "soil_risk": None,
                "weather_risk": None
            },
            "overall_risk_score": overall_score,
            "risk_level": overall_level,
            "effective_weights": {
                "production_pct": float(m_row.get("Effective_Yield_Weight_pct", 0.0)) if pd.notna(m_row.get("Effective_Yield_Weight_pct")) else 0.0,
                "nutrient_pct": float(m_row.get("Effective_Nutrient_Weight_pct", 0.0)) if pd.notna(m_row.get("Effective_Nutrient_Weight_pct")) else 0.0,
                "dris_pct": float(m_row.get("Effective_DRIS_Weight_pct", 0.0)) if pd.notna(m_row.get("Effective_DRIS_Weight_pct")) else 0.0,
                "soil_pct": 0.0,
                "weather_pct": 0.0
            },
            "evidence_status": {
                "palm": "available",
                "rgb_drone": "unmapped",
                "multispectral": "unmapped"
            },
            "contributing_indicators": str(m_row.get("Main_Contributing_Indicators", "No major contributing indicator")),
            "recommended_action": str(m_row.get("Recommended_Action", "Continue routine monitoring"))
        }

        canonical_dict[bid_str] = record

    return canonical_dict


def generate_and_save_canonical_risk():
    dataset = build_canonical_block_risk_dataset()
    output_path = OUTPUT_DIR / "canonical_block_risk.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2)
    print(f"Saved canonical block risk dataset ({len(dataset)} blocks) to {output_path}")
    return dataset


if __name__ == "__main__":
    generate_and_save_canonical_risk()
