from pathlib import Path
import pandas as pd
import numpy as np

BASE_DIR = Path(__file__).resolve().parent.parent

DATA_FILE = (
    BASE_DIR
    / "data"
    / "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv"
)

OUTPUT_DIR = BASE_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

print("\n===================================")
print("WEATHER IMPACT ANALYSIS")
print("===================================")

df = pd.read_csv(DATA_FILE)

weather_cols = [
    "Rainfall_mm_day",
    "Temperature_C",
    "Relative_Humidity_pct",
    "Wind_Speed_m_s",
    "Solar_Radiation_MJ_m2_day"
]

available = [
    c for c in weather_cols
    if c in df.columns
]

print("Weather columns found:")
print(available)

# Numeric conversion
for col in available:
    df[col] = pd.to_numeric(
        df[col],
        errors="coerce"
    )

df["Productivity_t_Ha"] = pd.to_numeric(
    df["Productivity_t_Ha"],
    errors="coerce"
)

df["Year"] = pd.to_numeric(
    df["Year"],
    errors="coerce"
)

# ---------------------------------------------------------
# Correlation with productivity
# ---------------------------------------------------------

correlation_rows = []

for col in available:

    valid = df[
        [col, "Productivity_t_Ha"]
    ].dropna()

    if len(valid) < 3:
        correlation = np.nan
    else:
        correlation = valid[
            col
        ].corr(
            valid["Productivity_t_Ha"]
        )

    correlation_rows.append({
        "Weather_Variable": col,
        "Correlation_with_Productivity": correlation,
        "Observations": len(valid)
    })

correlation_df = pd.DataFrame(
    correlation_rows
)

# ---------------------------------------------------------
# Weather stress indicators
#
# Dataset-distribution based.
# These are indicators, NOT agronomic optimum claims.
# ---------------------------------------------------------

for col in available:

    q25 = df[col].quantile(0.25)
    q75 = df[col].quantile(0.75)

    stress_col = col + "_Stress"

    def classify(value):

        if pd.isna(value):
            return "NO_DATA"

        if value < q25:
            return "LOW"

        if value > q75:
            return "HIGH"

        return "NORMAL"

    df[stress_col] = df[col].apply(
        classify
    )

# ---------------------------------------------------------
# Block-level latest weather
# ---------------------------------------------------------

latest_year = int(
    df["Year"].max()
)

latest = df[
    df["Year"] == latest_year
].copy()

block_weather = (
    latest
    .groupby("Block_ID")[available]
    .mean()
    .reset_index()
)

# ---------------------------------------------------------
# Block weather stress count
# ---------------------------------------------------------

stress_columns = []

for col in available:

    stress_col = col + "_Stress"

    if stress_col not in latest.columns:
        continue

    stress_columns.append(
        stress_col
    )

stress_latest = (
    latest
    .groupby("Block_ID")[stress_columns]
    .agg(
        lambda x:
        (x == "HIGH").sum()
        +
        (x == "LOW").sum()
    )
    .reset_index()
)

stress_latest[
    "Weather_Stress_Count"
] = stress_latest[
    stress_columns
].sum(axis=1)

stress_latest = stress_latest[
    [
        "Block_ID",
        "Weather_Stress_Count"
    ]
]

block_weather = block_weather.merge(
    stress_latest,
    on="Block_ID",
    how="left"
)

# ---------------------------------------------------------
# Weather concern
# ---------------------------------------------------------

def concern(count):

    if count >= 3:
        return "HIGH"

    if count >= 1:
        return "MEDIUM"

    return "LOW"

block_weather[
    "Weather_Concern"
] = block_weather[
    "Weather_Stress_Count"
].apply(
    concern
)

# ---------------------------------------------------------
# Save correlation
# ---------------------------------------------------------

correlation_file = (
    OUTPUT_DIR
    / "weather_productivity_correlation.csv"
)

correlation_df.to_csv(
    correlation_file,
    index=False
)

# ---------------------------------------------------------
# Save block weather
# ---------------------------------------------------------

block_file = (
    OUTPUT_DIR
    / "block_weather_impact.csv"
)

block_weather.to_csv(
    block_file,
    index=False
)

# ---------------------------------------------------------
# Display
# ---------------------------------------------------------

print("\n===================================")
print("WEATHER / PRODUCTIVITY CORRELATION")
print("===================================")

print(
    correlation_df.to_string(
        index=False
    )
)

print("\n===================================")
print("LATEST BLOCK WEATHER")
print("===================================")

print(
    block_weather
    .sort_values(
        "Weather_Stress_Count",
        ascending=False
    )
    .head(15)
    .to_string(index=False)
)

print("\n===================================")
print("FILES SAVED")
print("===================================")

print(correlation_file)
print(block_file)

print("\nWEATHER IMPACT ANALYSIS COMPLETE.")