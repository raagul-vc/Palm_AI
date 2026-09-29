from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / "data" / "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv"
OUTPUT_DIR = BASE_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

df = pd.read_csv(DATA_FILE)
for column in ["Year", "Month_Number", "Productivity_t_Ha"]:
    df[column] = pd.to_numeric(df[column], errors="coerce")
df = df.dropna(subset=["Year", "Block_ID", "Productivity_t_Ha"])
df["Year"] = df["Year"].astype(int)
latest_year = int(df["Year"].max())

# The source is monthly t/ha. Annual block yield is the sum of its monthly values.
annual = (
    df.groupby(["Year", "Block_ID"], as_index=False)
    .agg(
        Annual_Yield_t_Ha=("Productivity_t_Ha", "sum"),
        Plant_Age_Years=("Plant_Age_Years", "mean"),
    )
)
latest_yield = annual[annual["Year"] == latest_year].copy()
latest_attrs = (
    df[df["Year"] == latest_year]
    .sort_values(["Block_ID", "Month_Number"])
    .groupby("Block_ID", as_index=False)
    .tail(1)
)
attribute_columns = [
    column for column in [
        "Block_ID", "Area_Ha", "Productive_Palms",
        "Palms_per_Ha", "Planting_Year", "Seed_Type", "Plant_Status",
    ] if column in latest_attrs.columns
]
block_yield = latest_yield.merge(
    latest_attrs[attribute_columns], on="Block_ID", how="left", validate="one_to_one"
)
block_yield = block_yield.rename(columns={"Annual_Yield_t_Ha": "Actual_Yield_t_Ha"})


def expected_yield(row):
    age = row["Plant_Age_Years"]
    peers = block_yield[
        block_yield["Plant_Age_Years"].between(age - 2, age + 2)
        & (block_yield["Block_ID"] != row["Block_ID"])
    ]
    return peers["Actual_Yield_t_Ha"].median() if len(peers) >= 3 else pd.NA


def expected_peer_count(row):
    age = row["Plant_Age_Years"]
    return int((
        block_yield["Plant_Age_Years"].between(age - 2, age + 2)
        & (block_yield["Block_ID"] != row["Block_ID"])
    ).sum())


block_yield["Expected_Yield_t_Ha"] = block_yield.apply(expected_yield, axis=1)
block_yield["Expected_Peer_Count"] = block_yield.apply(expected_peer_count, axis=1)
block_yield["Productivity_Deviation_pct"] = (
    (block_yield["Actual_Yield_t_Ha"] - block_yield["Expected_Yield_t_Ha"])
    / block_yield["Expected_Yield_t_Ha"].replace(0, pd.NA)
    * 100
)
block_yield["Yield_Gap_pct"] = (-block_yield["Productivity_Deviation_pct"]).clip(lower=0)


def calculate_risk(gap):
    if pd.isna(gap):
        return pd.NA
    if gap >= 30:
        return 90
    if gap >= 20:
        return 75
    if gap >= 10:
        return 60
    if gap >= 5:
        return 40
    return 20


def risk_level(score):
    if pd.isna(score):
        return "UNKNOWN"
    if score >= 70:
        return "HIGH"
    if score >= 40:
        return "MEDIUM"
    return "LOW"


block_yield["Risk_Score"] = block_yield["Yield_Gap_pct"].apply(calculate_risk)
block_yield["Risk_Level"] = block_yield["Risk_Score"].apply(risk_level)
block_yield["Latest_Year"] = latest_year
block_yield = block_yield.sort_values("Risk_Score", ascending=False)
block_yield.to_csv(OUTPUT_DIR / "block_health_risk.csv", index=False)

print(f"Block health complete. Annual t/ha through {latest_year}; {len(block_yield)} blocks analysed.")
