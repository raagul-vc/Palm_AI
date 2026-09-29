from pathlib import Path
import pandas as pd
import numpy as np
import joblib
from sklearn.base import clone

from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


# =========================================================
# PATHS
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent

DATA_FILE = BASE_DIR / "data" / "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv"
MODEL_FILE = BASE_DIR / "models" / "yield_forecast_model.pkl"
OUTPUT_DIR = BASE_DIR / "outputs"

OUTPUT_DIR.mkdir(exist_ok=True)


# =========================================================
# LOAD DATA
# =========================================================

print("\nLoading master dataset...")

df = pd.read_csv(DATA_FILE)

print("Dataset shape:", df.shape)


# =========================================================
# CHECK REQUIRED COLUMNS
# =========================================================

required = [
    "Year",
    "Productivity_t_Ha"
]

for col in required:
    if col not in df.columns:
        raise ValueError(f"Missing required column: {col}")


# =========================================================
# CLEAN
# =========================================================

df["Year"] = pd.to_numeric(df["Year"], errors="coerce")
df["Productivity_t_Ha"] = pd.to_numeric(
    df["Productivity_t_Ha"],
    errors="coerce"
)

df = df.dropna(
    subset=["Year", "Productivity_t_Ha"]
)

if "Plant_Status" in df.columns:
    df = df[df["Plant_Status"].astype(str).str.upper() != "TBM"].copy()

df["Year"] = df["Year"].astype(int)


# =========================================================
# LOAD TRAINED PIPELINE
# =========================================================

print("\nLoading trained model...")

pipeline_template = joblib.load(MODEL_FILE)

print("Model loaded successfully.")


# =========================================================
# FUTURE-STYLE SPLIT
#
# Train : 2012 - 2022
# Test  : 2023 - 2024
# =========================================================

train_df = df[
    (df["Year"] >= 2012) &
    (df["Year"] <= 2022)
].copy()

test_df = df[
    (df["Year"] >= 2023) &
    (df["Year"] <= 2024)
].copy()


print("\n===================================")
print("TIME-BASED VALIDATION")
print("===================================")

print("Training period : 2012 - 2022")
print("Testing period  : 2023 - 2024")

print("\nTraining rows:", len(train_df))
print("Testing rows :", len(test_df))


# =========================================================
# CREATE FEATURES
# =========================================================

target = "Productivity_t_Ha"

drop_columns = [
    target,
    "FFB_Production_kg",
    "FFB_Production_t",
    "Division_ID",
    "Block_ID"
]

drop_columns = [
    col for col in drop_columns
    if col in df.columns
]


X_train = train_df.drop(
    columns=drop_columns
)
X_test = test_df.drop(
    columns=drop_columns
)

y_train = train_df[target]
y_test = test_df[target]

# Fit a fresh copy only on the historical window so future-year results are
# genuinely out of time. The production model artifact remains unchanged.
pipeline = clone(pipeline_template).set_params(model__n_jobs=1)
pipeline.fit(X_train, y_train)


# =========================================================
# PREDICT
# =========================================================

print("\nGenerating predictions...")

predictions = pipeline.predict(X_test)


# =========================================================
# METRICS
# =========================================================

mae = mean_absolute_error(
    y_test,
    predictions
)

rmse = np.sqrt(
    mean_squared_error(
        y_test,
        predictions
    )
)

r2 = r2_score(
    y_test,
    predictions
)


print("\n===================================")
print("FUTURE-STYLE MODEL PERFORMANCE")
print("===================================")

print(f"MAE  : {mae:.4f}")
print(f"RMSE : {rmse:.4f}")
print(f"R²   : {r2:.4f}")


# =========================================================
# YEAR-WISE PERFORMANCE
# =========================================================

results = test_df[
    ["Year"]
].copy()

results["Actual"] = y_test.values
results["Predicted"] = predictions

results["Absolute_Error"] = (
    results["Actual"] -
    results["Predicted"]
).abs()

results["Percentage_Error"] = (
    results["Absolute_Error"] /
    results["Actual"].replace(0, np.nan)
) * 100


print("\n===================================")
print("YEAR-WISE PERFORMANCE")
print("===================================")

year_summary = (
    results
    .groupby("Year")
    .agg(
        Actual_Mean=("Actual", "mean"),
        Predicted_Mean=("Predicted", "mean"),
        MAE=("Absolute_Error", "mean"),
        MAPE=("Percentage_Error", "mean")
    )
    .reset_index()
)

print(year_summary.to_string(index=False))


# =========================================================
# SAVE RESULTS
# =========================================================

results_file = (
    OUTPUT_DIR /
    "time_based_validation_predictions.csv"
)

results.to_csv(
    results_file,
    index=False
)

summary_file = (
    OUTPUT_DIR /
    "time_based_validation_summary.csv"
)

year_summary.to_csv(
    summary_file,
    index=False
)


# =========================================================
# SAVE METRICS
# =========================================================

metrics = pd.DataFrame({
    "Metric": [
        "MAE",
        "RMSE",
        "R2"
    ],
    "Value": [
        mae,
        rmse,
        r2
    ]
})

metrics_file = (
    OUTPUT_DIR /
    "time_based_validation_metrics.csv"
)

metrics.to_csv(
    metrics_file,
    index=False
)


print("\n===================================")
print("FILES SAVED")
print("===================================")

print(results_file)
print(summary_file)
print(metrics_file)

print("\nTIME-BASED VALIDATION COMPLETE.")
