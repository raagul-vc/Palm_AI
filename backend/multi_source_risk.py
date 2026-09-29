from pathlib import Path
import pandas as pd
import numpy as np

# =========================================================
# PATHS
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent

DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "outputs"

OUTPUT_DIR.mkdir(exist_ok=True)

MASTER_FILE = DATA_DIR / "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv"

YIELD_RISK_FILE = OUTPUT_DIR / "block_health_risk.csv"
NUTRIENT_FILE = OUTPUT_DIR / "block_nutrient_diagnostics.csv"
DRIS_FILE = OUTPUT_DIR / "dris_prescription_analysis.csv"
WEATHER_FILE = OUTPUT_DIR / "block_weather_impact.csv"


# =========================================================
# LOAD
# =========================================================

print("\n===================================")
print("MULTI-SOURCE RISK ENGINE")
print("===================================")

master = pd.read_csv(MASTER_FILE)

yield_risk = pd.read_csv(YIELD_RISK_FILE)
nutrient = pd.read_csv(NUTRIENT_FILE)
dris = pd.read_csv(DRIS_FILE)
weather = pd.read_csv(WEATHER_FILE)

print("Master:", master.shape)
print("Yield risk:", yield_risk.shape)
print("Nutrient:", nutrient.shape)
print("DRIS:", dris.shape)
print("Weather:", weather.shape)


# =========================================================
# LATEST YEAR
# =========================================================

master["Year"] = pd.to_numeric(
    master["Year"],
    errors="coerce"
)

latest_year = int(master["Year"].max())

print("\nLatest year:", latest_year)


# =========================================================
# LATEST BLOCK BASE
# =========================================================

latest = master[
    master["Year"] == latest_year
].copy()

block_base = (
    latest
    .groupby("Block_ID")
    .agg(
        Actual_Productivity=(
            "Productivity_t_Ha",
            "sum"
        )
    )
    .reset_index()
)


# =========================================================
# MERGE SOURCES
# =========================================================

risk = block_base.copy()


# ---------- Yield Risk ----------

yield_cols = [
    "Block_ID",
    "Historical_Avg_Productivity",
    "Productivity_Deviation_pct",
    "Risk_Score",
    "Risk_Level"
]

available_yield_cols = [
    c for c in yield_cols
    if c in yield_risk.columns
]

yield_risk_small = (
    yield_risk[
        available_yield_cols
    ]
    .drop_duplicates("Block_ID")
)

risk = risk.merge(
    yield_risk_small,
    on="Block_ID",
    how="left"
)


# ---------- Nutrient ----------

nutrient_cols = [
    "Block_ID",
    "Leaf_Sampling_Year",
    "Available_Nutrient_Count",
    "Low_Nutrient_Count",
    "High_Nutrient_Count",
    "Nutrient_Concern"
]

available_nutrient_cols = [
    c for c in nutrient_cols
    if c in nutrient.columns
]

nutrient_small = (
    nutrient[
        available_nutrient_cols
    ]
    .drop_duplicates("Block_ID")
)

risk = risk.merge(
    nutrient_small,
    on="Block_ID",
    how="left"
)
risk["Latest_Observed_Year"] = latest_year


# ---------- DRIS ----------

dris_cols = [
    "Block_ID",
    "Year",
    "Potential_Limiting_Nutrients",
    "Potential_Excess_Nutrients",
    "Prescription_Recommendation"
]

available_dris_cols = [
    c for c in dris_cols
    if c in dris.columns
]

dris_latest = dris.copy()
if "Year" in dris_latest.columns:
    dris_latest["Year"] = pd.to_numeric(dris_latest["Year"], errors="coerce")
    dris_latest = dris_latest.sort_values(["Year", "Block_ID"])
dris_small = dris_latest[available_dris_cols].drop_duplicates("Block_ID", keep="last")
dris_small = dris_small.rename(columns={"Year": "DRIS_Sample_Year"})

risk = risk.merge(
    dris_small,
    on="Block_ID",
    how="left"
)


# ---------- Weather ----------

weather_cols = [
    "Block_ID",
    "Weather_Stress_Count",
    "Weather_Concern"
]

available_weather_cols = [
    c for c in weather_cols
    if c in weather.columns
]

weather_small = (
    weather[
        available_weather_cols
    ]
    .drop_duplicates("Block_ID")
)

risk = risk.merge(
    weather_small,
    on="Block_ID",
    how="left"
)


# =========================================================
# NUMERIC CLEANING
# =========================================================

numeric_cols = [
    "Actual_Productivity",
    "Historical_Avg_Productivity",
    "Productivity_Deviation_pct",
    "Risk_Score",
    "Low_Nutrient_Count",
    "High_Nutrient_Count",
    "Weather_Stress_Count"
]

for col in numeric_cols:

    if col in risk.columns:

        risk[col] = pd.to_numeric(
            risk[col],
            errors="coerce"
        )


# =========================================================
# NORMALIZED SOURCE SCORES
# =========================================================

# Yield score
if "Risk_Score" in risk.columns:

    risk["Yield_Risk_Component"] = (
        risk["Risk_Score"]
        .clip(0, 100)
    )

else:

    risk["Yield_Risk_Component"] = np.nan


# Nutrient score
risk["Nutrient_Risk_Component"] = (
    risk["Low_Nutrient_Count"]
    / risk["Available_Nutrient_Count"].replace(0, np.nan)
    * 100
)
risk.loc[risk["Available_Nutrient_Count"].fillna(0) < 3, "Nutrient_Risk_Component"] = np.nan


# Weather values in block_weather_impact.csv are identical across all blocks.
# Treat them as estate context, not as a block-level discriminator or score input.
risk["Weather_Risk_Component"] = np.nan
risk["Weather_Component_Status"] = (
    "Estate-level values repeated for all blocks; excluded from block risk score"
)


# DRIS score
#
# Negative/positive DRIS imbalance is treated
# as a diagnostic signal. We derive a simple
# block-level signal from nutrient concern,
# rather than inventing fertilizer doses.
# =========================================================

risk["DRIS_Risk_Component"] = np.nan

if "Potential_Limiting_Nutrients" in risk.columns:

    limiting_count = (
        risk[
            "Potential_Limiting_Nutrients"
        ]
        .fillna("NONE")
        .apply(
            lambda x:
            0 if x == "NONE"
            else len(
                [
                    v
                    for v in str(x).split(",")
                    if v.strip()
                ]
            )
        )
    )

    risk["DRIS_Risk_Component"] = (
        limiting_count
        .clip(0, 5)
        / 5
        * 100
    )

    risk.loc[risk["Potential_Limiting_Nutrients"].isna(), "DRIS_Risk_Component"] = np.nan


# =========================================================
# FINAL WEIGHTED RISK SCORE
#
# Base weights among block-discriminating sources:
# Yield = 40%, nutrient = 25%, DRIS = 15% where a block DRIS row exists.
# Available weights are renormalized per block; weather is excluded because
# the source file repeats one estate-level value for every block.
# =========================================================
base_weights = {
    "Yield_Risk_Component": 0.40,
    "Nutrient_Risk_Component": 0.25,
    "DRIS_Risk_Component": 0.15,
}
valid_weight = pd.Series(0.0, index=risk.index)
weighted_score = pd.Series(0.0, index=risk.index)
for component, weight in base_weights.items():
    available = risk[component].notna()
    valid_weight += available.astype(float) * weight
    weighted_score += risk[component].fillna(0) * weight
    risk[f"Effective_{component.removesuffix('_Risk_Component')}_Weight_pct"] = (
        available.astype(float) * weight
    )
risk["Multi_Source_Risk_Score"] = (
    (weighted_score / valid_weight.replace(0, np.nan)).clip(0, 100).round(2)
)
for component in base_weights:
    weight_column = f"Effective_{component.removesuffix('_Risk_Component')}_Weight_pct"
    risk[weight_column] = (risk[weight_column] / valid_weight.replace(0, np.nan) * 100).round(1)


# =========================================================
# RISK LEVEL
# =========================================================

def risk_level(score):

    if pd.isna(score):
        return "UNKNOWN"

    if score >= 70:
        return "HIGH"

    if score >= 40:
        return "MEDIUM"

    return "LOW"


risk["Multi_Source_Risk_Level"] = (
    risk["Multi_Source_Risk_Score"]
    .apply(risk_level)
)


# =========================================================
# MAIN CONTRIBUTING INDICATORS
# =========================================================

def contributing_indicators(row):

    indicators = []

    if row.get(
        "Yield_Risk_Component",
        0
    ) >= 50:

        indicators.append(
            "Yield risk"
        )

    if row.get(
        "Nutrient_Risk_Component",
        0
    ) >= 40:

        indicators.append(
            "Nutrient imbalance"
        )

    if row.get(
        "DRIS_Risk_Component",
        0
    ) >= 40:

        indicators.append(
            "DRIS nutrient imbalance"
        )

    if not indicators:

        indicators.append(
            "No major contributing indicator"
        )

    return "; ".join(indicators)


risk["Main_Contributing_Indicators"] = (
    risk.apply(
        contributing_indicators,
        axis=1
    )
)


# =========================================================
# ACTION
# =========================================================

def action(row):

    level = row[
        "Multi_Source_Risk_Level"
    ]

    if level == "HIGH":

        return (
            "Priority field inspection; review block-specific yield and nutrient indicators"
        )

    if level == "MEDIUM":

        return (
            "Monitor block and review "
            "identified contributing indicators"
        )

    if level == "LOW":

        return (
            "Continue routine monitoring"
        )

    return "Insufficient data"


risk["Recommended_Action"] = (
    risk.apply(
        action,
        axis=1
    )
)


# =========================================================
# SORT
# =========================================================

risk = risk.sort_values(
    "Multi_Source_Risk_Score",
    ascending=False
)


# =========================================================
# SAVE
# =========================================================

output_file = (
    OUTPUT_DIR /
    "multi_source_block_risk.csv"
)

risk.to_csv(
    output_file,
    index=False
)


# =========================================================
# DISPLAY
# =========================================================

display_columns = [
    "Block_ID",
    "Actual_Productivity",
    "Yield_Risk_Component",
    "Nutrient_Risk_Component",
    "Weather_Risk_Component",
    "DRIS_Risk_Component",
    "Multi_Source_Risk_Score",
    "Multi_Source_Risk_Level",
    "Main_Contributing_Indicators",
    "Recommended_Action"
]

display_columns = [
    c for c in display_columns
    if c in risk.columns
]

print("\n===================================")
print("FINAL MULTI-SOURCE BLOCK RISK")
print("===================================")

print(
    risk[
        display_columns
    ]
    .head(20)
    .to_string(index=False)
)


# =========================================================
# RISK SUMMARY
# =========================================================

print("\n===================================")
print("RISK LEVEL SUMMARY")
print("===================================")

print(
    risk[
        "Multi_Source_Risk_Level"
    ]
    .value_counts()
    .to_string()
)


print("\n===================================")
print("FILES SAVED")
print("===================================")

print(output_file)

print("\nMULTI-SOURCE RISK ENGINE COMPLETE.")
