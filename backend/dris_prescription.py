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


# =========================================================
# FILES
# =========================================================

MASTER_FILE = (
    DATA_DIR /
    "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv"
)

DRIS_REFERENCE_FILE = (
    DATA_DIR /
    "DRIS_Nutrient_Reference_3700.csv"
)

DRIS_SUMMARY_FILE = (
    DATA_DIR /
    "DRIS_Reference_Summary.csv"
)

DRIS_GRID_FILE = (
    DATA_DIR /
    "DRIS_IDW_Grid_3700.csv"
)


# =========================================================
# LOAD
# =========================================================

print("\n===================================")
print("DRIS PRESCRIPTION ENGINE")
print("===================================")

inputs = pd.read_csv(MASTER_FILE)
dris_reference = pd.read_csv(DRIS_REFERENCE_FILE)
dris_summary = pd.read_csv(DRIS_SUMMARY_FILE)
dris_grid = pd.read_csv(DRIS_GRID_FILE)

print("\nInput shape:", inputs.shape)
print("DRIS reference shape:", dris_reference.shape)
print("DRIS summary shape:", dris_summary.shape)
print("DRIS grid shape:", dris_grid.shape)


# =========================================================
# REQUIRED NUTRIENTS
# =========================================================

nutrients = [
    "N",
    "P",
    "K",
    "Ca",
    "Mg"
]

nutrient_columns = [
    "N_pct",
    "P_pct",
    "K_pct",
    "Ca_pct",
    "Mg_pct"
]


# =========================================================
# CLEAN NUMERIC DATA
# =========================================================

for col in nutrient_columns:

    if col in inputs.columns:

        inputs[col] = pd.to_numeric(
            inputs[col],
            errors="coerce"
        )

inputs = inputs.dropna(subset=nutrient_columns).copy()
if "Sampling_Year_leaf" in inputs.columns:
    sample_year = pd.to_numeric(inputs["Sampling_Year_leaf"], errors="coerce")
    calendar_year = pd.to_numeric(inputs.get("Year"), errors="coerce")
    inputs["Year"] = sample_year.fillna(calendar_year)


# =========================================================
# CHECK DRIS INDEX DATA
# =========================================================

dris_index_columns = [
    "Index_N",
    "Index_P",
    "Index_K",
    "Index_Ca",
    "Index_Mg"
]

available_dris_indices = [
    col
    for col in dris_index_columns
    if col in dris_reference.columns
]

print("\nDRIS index columns found:")
print(available_dris_indices)


# =========================================================
# REFERENCE DRIS INDEX
#
# Use DRIS_Reference_Summary where available.
# =========================================================

summary_indices = {}

if (
    "Nutrient" in dris_summary.columns
    and "DRIS_Index_Mean" in dris_summary.columns
):

    for _, row in dris_summary.iterrows():

        nutrient = str(
            row["Nutrient"]
        ).strip()

        value = pd.to_numeric(
            row["DRIS_Index_Mean"],
            errors="coerce"
        )

        if pd.notna(value):

            summary_indices[
                nutrient
            ] = float(value)


print("\nReference DRIS indices:")

for nutrient, value in summary_indices.items():

    print(
        f"{nutrient}: {value:.4f}"
    )


# =========================================================
# GET DRIS INDEX FROM REFERENCE FILE
# =========================================================

reference_index_means = {}

for nutrient in nutrients:

    col = "Index_" + nutrient

    if col in dris_reference.columns:

        values = pd.to_numeric(
            dris_reference[col],
            errors="coerce"
        ).dropna()

        if len(values) > 0:

            reference_index_means[
                nutrient
            ] = values.mean()


# =========================================================
# INDEX INTERPRETATION
#
# Smaller absolute DRIS index = more balanced.
# Larger absolute index = greater imbalance.
# =========================================================

def classify_dris(index_value):

    if pd.isna(index_value):
        return "NO_DATA"

    absolute_value = abs(index_value)

    if absolute_value <= 10:
        return "BALANCED"

    if absolute_value <= 20:
        return "MODERATE_IMBALANCE"

    return "HIGH_IMBALANCE"


# =========================================================
# LIMITING NUTRIENT
#
# Most negative index = relative deficiency
# Most positive index = relative excess
# =========================================================

def get_limiting_nutrient(row):

    values = {}

    for nutrient in nutrients:

        col = "DRIS_Index_" + nutrient

        if col in row.index:

            value = row[col]

            if pd.notna(value):

                values[nutrient] = value

    if not values:
        return "NO_DATA"

    return min(
        values,
        key=values.get
    )


def get_excess_nutrient(row):

    values = {}

    for nutrient in nutrients:

        col = "DRIS_Index_" + nutrient

        if col in row.index:

            value = row[col]

            if pd.notna(value):

                values[nutrient] = value

    if not values:
        return "NO_DATA"

    return max(
        values,
        key=values.get
    )


# =========================================================
# BUILD BLOCK INPUT
# =========================================================

group_columns = [
    "Block_ID"
]

if "Year" in inputs.columns:
    group_columns.insert(0, "Year")

if "Division_ID" in inputs.columns:
    group_columns.insert(1, "Division_ID")


available_input_columns = [
    col
    for col in nutrient_columns
    if col in inputs.columns
]


block_data = (
    inputs
    .groupby(group_columns)[available_input_columns]
    .mean()
    .reset_index()
)


# =========================================================
# CREATE RELATIVE NUTRIENT BALANCE
#
# This is NOT a fertilizer dose.
# It is a diagnostic score.
# =========================================================

for nutrient, col in zip(
    nutrients,
    nutrient_columns
):

    if col not in block_data.columns:
        continue

    reference_value = (
        block_data[col]
        .median()
    )

    if (
        pd.isna(reference_value)
        or reference_value == 0
    ):
        block_data[
            "Relative_" + nutrient
        ] = np.nan

    else:

        block_data[
            "Relative_" + nutrient
        ] = (
            block_data[col]
            / reference_value
        )


# =========================================================
# DIAGNOSTIC STATUS
# =========================================================

for nutrient, col in zip(
    nutrients,
    nutrient_columns
):

    if col not in block_data.columns:
        continue

    median_value = (
        block_data[col]
        .median()
    )

    status_col = (
        nutrient +
        "_Diagnostic_Status"
    )

    def diagnostic(value):

        if pd.isna(value):
            return "NO_DATA"

        if pd.isna(median_value):
            return "NO_REFERENCE"

        ratio = value / median_value

        if ratio < 0.80:
            return "LOW"

        if ratio > 1.20:
            return "HIGH"

        return "NORMAL"

    block_data[status_col] = (
        block_data[col]
        .apply(diagnostic)
    )


# =========================================================
# CREATE DRIS-BASED REFERENCE TABLE
# =========================================================

dris_rows = []

for nutrient in nutrients:

    index_col = "Index_" + nutrient

    if index_col in dris_reference.columns:

        values = pd.to_numeric(
            dris_reference[index_col],
            errors="coerce"
        ).dropna()

        if len(values) > 0:

            dris_rows.append({
                "Nutrient": nutrient,
                "DRIS_Index_Mean": values.mean(),
                "DRIS_Index_Median": values.median(),
                "DRIS_Index_Min": values.min(),
                "DRIS_Index_Max": values.max()
            })


dris_reference_table = pd.DataFrame(
    dris_rows
)


# =========================================================
# PRESCRIPTION PRIORITY
# =========================================================

def priority_from_status(status):

    if status == "LOW":
        return "CORRECTION_REQUIRED"

    if status == "HIGH":
        return "EXCESS_CHECK_REQUIRED"

    if status == "NORMAL":
        return "NO_IMMEDIATE_CORRECTION"

    return "INSUFFICIENT_DATA"


for nutrient in nutrients:

    status_col = (
        nutrient +
        "_Diagnostic_Status"
    )

    if status_col in block_data.columns:

        block_data[
            nutrient +
            "_Recommendation"
        ] = (
            block_data[status_col]
            .apply(priority_from_status)
        )


# =========================================================
# LIMITING / EXCESS NUTRIENT
# =========================================================

status_columns = [
    col
    for col in block_data.columns
    if col.endswith(
        "_Diagnostic_Status"
    )
]

def limiting_from_status(row):

    low = []

    for nutrient in nutrients:

        col = (
            nutrient +
            "_Diagnostic_Status"
        )

        if (
            col in row.index
            and row[col] == "LOW"
        ):
            low.append(nutrient)

    if low:
        return ", ".join(low)

    return "NONE"


block_data[
    "Potential_Limiting_Nutrients"
] = block_data.apply(
    limiting_from_status,
    axis=1
)


def excess_from_status(row):

    high = []

    for nutrient in nutrients:

        col = (
            nutrient +
            "_Diagnostic_Status"
        )

        if (
            col in row.index
            and row[col] == "HIGH"
        ):
            high.append(nutrient)

    if high:
        return ", ".join(high)

    return "NONE"


block_data[
    "Potential_Excess_Nutrients"
] = block_data.apply(
    excess_from_status,
    axis=1
)


# =========================================================
# FINAL PRESCRIPTION MESSAGE
#
# Diagnostic recommendation only.
# No invented fertilizer quantity.
# =========================================================

def recommendation(row):

    limiting = row[
        "Potential_Limiting_Nutrients"
    ]

    excess = row[
        "Potential_Excess_Nutrients"
    ]

    messages = []

    if limiting != "NONE":

        messages.append(
            "Review nutrient correction for "
            + limiting
        )

    if excess != "NONE":

        messages.append(
            "Review possible excess of "
            + excess
        )

    if not messages:

        return (
            "No immediate nutrient correction "
            "indicated by current diagnostic data"
        )

    return " | ".join(messages)


block_data[
    "Prescription_Recommendation"
] = block_data.apply(
    recommendation,
    axis=1
)


# =========================================================
# CALCULATE DRIS INDICES FROM REFERENCE PAIR NORMS
# =========================================================

ratio_pairs = [
    ("N", "P", "N_pct", "P_pct", "Standart N_P"),
    ("N", "K", "N_pct", "K_pct", "Standart NK"),
    ("N", "Ca", "N_pct", "Ca_pct", "Standart NCa"),
    ("N", "Mg", "N_pct", "Mg_pct", "Standart NMg"),
    ("K", "P", "K_pct", "P_pct", "Standart PK"),
    ("P", "Mg", "P_pct", "Mg_pct", "Standart PMg"),
    ("K", "Ca", "K_pct", "Ca_pct", "Standart KCa"),
    ("K", "Mg", "K_pct", "Mg_pct", "Standart KMg"),
    ("Ca", "P", "Ca_pct", "P_pct", "Standart Pca"),
    ("Ca", "Mg", "Ca_pct", "Mg_pct", "Standart CaMg"),
]

index_components = {nutrient: [] for nutrient in nutrients}

for numerator, denominator, numerator_col, denominator_col, norm_col in ratio_pairs:
    if norm_col not in dris_reference.columns:
        continue

    reference_norm = pd.to_numeric(dris_reference[norm_col], errors="coerce").median()
    if pd.isna(reference_norm) or reference_norm <= 0:
        continue

    ratio = block_data[numerator_col].div(block_data[denominator_col].where(block_data[denominator_col] > 0))
    function = ratio.div(reference_norm).sub(1)
    index_components[numerator].append(function)
    index_components[denominator].append(-function)

for nutrient in nutrients:
    if index_components[nutrient]:
        block_data["DRIS_Index_" + nutrient] = pd.concat(index_components[nutrient], axis=1).mean(axis=1)
    else:
        block_data["DRIS_Index_" + nutrient] = np.nan


def most_imbalanced(row, direction):
    values = {
        nutrient: row["DRIS_Index_" + nutrient]
        for nutrient in nutrients
        if pd.notna(row["DRIS_Index_" + nutrient])
        and (row["DRIS_Index_" + nutrient] < 0 if direction == "negative" else row["DRIS_Index_" + nutrient] > 0)
    }
    if not values:
        return "NONE"
    return min(values, key=values.get) if direction == "negative" else max(values, key=values.get)


block_data["Potential_Limiting_Nutrients"] = block_data.apply(
    lambda row: most_imbalanced(row, "negative"), axis=1
)
block_data["Potential_Excess_Nutrients"] = block_data.apply(
    lambda row: most_imbalanced(row, "positive"), axis=1
)


def dris_recommendation(row):
    limiting = row["Potential_Limiting_Nutrients"]
    excess = row["Potential_Excess_Nutrients"]
    messages = []
    if limiting != "NONE":
        messages.append("Review relative nutrient balance for " + limiting)
    if excess != "NONE":
        messages.append("Review possible relative excess of " + excess)
    if not messages:
        return "No relative nutrient imbalance indicated by the available DRIS data"
    return " | ".join(messages)


block_data["Prescription_Recommendation"] = block_data.apply(dris_recommendation, axis=1)


# =========================================================
# SAVE
# =========================================================

output_file = (
    OUTPUT_DIR /
    "dris_prescription_analysis.csv"
)

block_data.to_csv(
    output_file,
    index=False
)


reference_output = (
    OUTPUT_DIR /
    "dris_index_reference_used.csv"
)

dris_reference_table.to_csv(
    reference_output,
    index=False
)


# =========================================================
# DISPLAY
# =========================================================

print("\n===================================")
print("DRIS DIAGNOSTIC SUMMARY")
print("===================================")

display_columns = [
    "Block_ID"
]

if "Year" in block_data.columns:
    display_columns.insert(
        0,
        "Year"
    )

display_columns += [
    "Potential_Limiting_Nutrients",
    "Potential_Excess_Nutrients",
    "Prescription_Recommendation"
]

print(
    block_data[
        display_columns
    ]
    .head(15)
    .to_string(index=False)
)


print("\n===================================")
print("FILES SAVED")
print("===================================")

print(output_file)
print(reference_output)

print("\nDRIS PRESCRIPTION ANALYSIS COMPLETE.")