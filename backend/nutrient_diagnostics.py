from pathlib import Path
import pandas as pd
import numpy as np

# =========================================================
# PATHS
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent

DATA_FILE = (
    BASE_DIR
    / "data"
    / "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv"
)

OUTPUT_DIR = BASE_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)


# =========================================================
# LOAD DATA
# =========================================================

print("\n===================================")
print("NUTRIENT DIAGNOSTICS")
print("===================================")

df = pd.read_csv(DATA_FILE)

print("Dataset shape:", df.shape)


# =========================================================
# NUTRIENT COLUMNS
# =========================================================

nutrients = [
    "N_pct",
    "P_pct",
    "K_pct",
    "Ca_pct",
    "Mg_pct",
    "B_ppm"
]

available = [
    col for col in nutrients
    if col in df.columns
]

print("\nAvailable nutrient columns:")
print(available)


# =========================================================
# CLEAN NUTRIENT VALUES
# =========================================================

for nutrient in available:
    df[nutrient] = pd.to_numeric(
        df[nutrient],
        errors="coerce"
    )


# =========================================================
# LATEST OBSERVED LEAF SAMPLE PER BLOCK
# =========================================================

df["Sampling_Year_leaf"] = pd.to_numeric(
    df["Sampling_Year_leaf"], errors="coerce"
)
leaf_mask = df["Leaf_Data_Available"].astype(str).str.strip().str.lower().isin(["true", "1", "yes"])
leaf_rows = df[leaf_mask & df[available].notna().any(axis=1)].copy()
leaf_sample_observations = leaf_rows.drop_duplicates(
    subset=["Block_ID", "Sampling_Year_leaf", *available]
)

if leaf_rows.empty:
    latest_leaf = pd.DataFrame(columns=["Block_ID", "Leaf_Sampling_Year", *available])
else:
    by_sample = (
        leaf_sample_observations.groupby(["Block_ID", "Sampling_Year_leaf"], as_index=False)[available]
        .mean()
    )
    latest_year_by_block = by_sample.groupby("Block_ID")["Sampling_Year_leaf"].max()
    latest_leaf = by_sample.merge(
        latest_year_by_block.rename("Leaf_Sampling_Year").reset_index(),
        left_on=["Block_ID", "Sampling_Year_leaf"],
        right_on=["Block_ID", "Leaf_Sampling_Year"],
        how="inner",
    ).drop(columns="Sampling_Year_leaf")

blocks = df[["Block_ID"]].dropna().drop_duplicates()
block_nutrients = blocks.merge(latest_leaf, on="Block_ID", how="left", validate="one_to_one")
print("Latest leaf sample year:", block_nutrients["Leaf_Sampling_Year"].max())


# =========================================================
# DATASET-BASED REFERENCE RANGES
#
# IMPORTANT:
# We use ALL available years because the latest year
# may not contain nutrient observations for every block.
# =========================================================

reference = {}

print("\n===================================")
print("NUTRIENT OBSERVATION COUNTS")
print("===================================")

for nutrient in available:

    values = leaf_sample_observations[nutrient].dropna()

    if len(values) == 0:
        print(
            f"{nutrient}: NO VALID DATA"
        )
        continue

    reference[nutrient] = {
        "low": values.quantile(0.25, interpolation="linear"),
        "high": values.quantile(0.75, interpolation="linear"),
        "method": "linear interpolation on distinct available block/sample-year observations",
    }

    print(
        f"{nutrient}: "
        f"{len(values)} valid block/sample observations"
    )


# =========================================================
# NUTRIENT CLASSIFICATION
# =========================================================

def classify(value, low, high):

    if pd.isna(value):
        return "NO_DATA"

    if value < low:
        return "LOW"

    if value > high:
        return "HIGH"

    return "NORMAL"


# =========================================================
# CREATE STATUS COLUMNS
# =========================================================

status_columns = []

for nutrient in available:

    # Prevent KeyError if a nutrient has no valid data
    if nutrient not in reference:
        continue

    low = reference[nutrient]["low"]
    high = reference[nutrient]["high"]

    status_column = nutrient + "_Status"

    block_nutrients[status_column] = (
        block_nutrients[nutrient]
        .apply(
            lambda x: classify(
                x,
                low,
                high
            )
        )
    )

    status_columns.append(
        status_column
    )


# =========================================================
# COUNT LOW / HIGH NUTRIENTS
# =========================================================

if status_columns:

    block_nutrients["Low_Nutrient_Count"] = (
        block_nutrients[status_columns]
        .eq("LOW")
        .sum(axis=1)
    )

    block_nutrients["High_Nutrient_Count"] = (
        block_nutrients[status_columns]
        .eq("HIGH")
        .sum(axis=1)
    )

else:

    block_nutrients["Low_Nutrient_Count"] = 0

    block_nutrients["High_Nutrient_Count"] = 0

block_nutrients["Available_Nutrient_Count"] = (
    block_nutrients[status_columns].isin(["LOW", "NORMAL", "HIGH"]).sum(axis=1)
    if status_columns else 0
)

nutrient_labels = {
    "N_pct": "N", "P_pct": "P", "K_pct": "K",
    "Mg_pct": "Mg", "Ca_pct": "Ca", "B_ppm": "B",
}
block_nutrients["Low_Nutrients"] = block_nutrients.apply(
    lambda row: "N/A" if row["Available_Nutrient_Count"] == 0 else ", ".join(
        nutrient_labels.get(column.removesuffix("_Status"), column)
        for column in status_columns if row[column] == "LOW"
    ) or "None below threshold",
    axis=1,
)
block_nutrients["Data_Status"] = block_nutrients["Available_Nutrient_Count"].map(
    lambda count: "No valid leaf sample" if count == 0
    else f"Partial nutrient panel ({int(count)} of {len(available)} measured)" if count < len(available)
    else f"Full nutrient panel ({len(available)} measured)"
)


# =========================================================
# NUTRIENT CONCERN LEVEL
# =========================================================

def concern_level(row):

    low_count = row["Low_Nutrient_Count"]
    if row["Available_Nutrient_Count"] < 3:
        return "LIMITED DATA"

    if low_count >= 3:
        return "HIGH"

    if low_count >= 1:
        return "MEDIUM"

    return "LOW"


block_nutrients["Nutrient_Concern"] = (
    block_nutrients.apply(
        concern_level,
        axis=1
    )
)


# =========================================================
# REFERENCE RANGE OUTPUT
# =========================================================

reference_rows = []

for nutrient, values in reference.items():

    reference_rows.append({
        "Nutrient": nutrient,
        "Low_Reference_Q25": values["low"],
        "High_Reference_Q75": values["high"],
        "Threshold_Method": values["method"]
    })

reference_df = pd.DataFrame(
    reference_rows
)


# =========================================================
# SAVE BLOCK DIAGNOSTICS
# =========================================================

block_output = (
    OUTPUT_DIR
    / "block_nutrient_diagnostics.csv"
)

block_nutrients.to_csv(
    block_output,
    index=False
)


# =========================================================
# SAVE REFERENCE RANGES
# =========================================================

reference_output = (
    OUTPUT_DIR
    / "nutrient_reference_ranges.csv"
)

reference_df.to_csv(
    reference_output,
    index=False
)


# =========================================================
# DISPLAY RESULTS
# =========================================================

print("\n===================================")
print("NUTRIENT REFERENCE RANGES")
print("===================================")

if len(reference_df) > 0:

    print(
        reference_df.to_string(
            index=False
        )
    )

else:

    print("No valid nutrient reference data.")


print("\n===================================")
print("BLOCK NUTRIENT SUMMARY")
print("===================================")


display_columns = (
    ["Block_ID"]
    + available
    + status_columns
    + [
        "Low_Nutrient_Count",
        "High_Nutrient_Count",
        "Available_Nutrient_Count",
        "Low_Nutrients",
        "Data_Status",
        "Nutrient_Concern"
    ]
)

print(
    block_nutrients[
        display_columns
    ]
    .head(15)
    .to_string(index=False)
)


# =========================================================
# SUMMARY
# =========================================================

print("\n===================================")
print("NUTRIENT CONCERN SUMMARY")
print("===================================")

print(
    block_nutrients[
        "Nutrient_Concern"
    ]
    .value_counts()
    .to_string()
)


# =========================================================
# FILES
# =========================================================

print("\n===================================")
print("FILES SAVED")
print("===================================")

print(block_output)
print(reference_output)

print("\nNUTRIENT DIAGNOSTICS COMPLETE.")
