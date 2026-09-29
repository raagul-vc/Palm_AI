from pathlib import Path
import pandas as pd
import numpy as np
import joblib

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


# =========================================================
# 1. PATHS
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent

DATA_FILE = BASE_DIR / "data" / "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv"
MODEL_DIR = BASE_DIR / "models"

MODEL_DIR.mkdir(exist_ok=True)


# =========================================================
# 2. LOAD DATA
# =========================================================

print("\nLoading dataset...")
print(DATA_FILE)

df = pd.read_csv(DATA_FILE)

print("\nDataset shape:", df.shape)
print("\nColumns:")
for col in df.columns:
    print(" -", col)


# =========================================================
# 3. BASIC CLEANING
# =========================================================

df = df.copy()

# Remove completely empty columns
df = df.dropna(axis=1, how="all")

# Remove duplicate rows
df = df.drop_duplicates()

print("\nAfter cleaning:", df.shape)


# =========================================================
# 4. TARGET DETECTION
# =========================================================

possible_targets = [
    "Productivity_t_Ha",
    "FFB_Production_t",
    "FFB_Production_kg"
]

target = None

for col in possible_targets:
    if col in df.columns:
        target = col
        break

if target is None:
    raise ValueError(
        "Target column not found. Expected one of: "
        + str(possible_targets)
    )

print("\nTarget:", target)


# =========================================================
# 5. REMOVE TARGET-MISSING ROWS
# =========================================================

df = df.dropna(subset=[target])

# TBM rows have zero yield by design, before commercial harvest begins.
# Keep them in the source dataset but exclude them from a yield model.
if "Plant_Status" in df.columns:
    df = df[df["Plant_Status"].astype(str).str.upper() != "TBM"].copy()

# Convert target to numeric
df[target] = pd.to_numeric(df[target], errors="coerce")

df = df.dropna(subset=[target])

print("Rows available for training:", len(df))


# =========================================================
# 6. REMOVE DATA-LEAKAGE / ID COLUMNS
# =========================================================

drop_columns = [
    target,

    # Production values that directly reveal the target
    "FFB_Production_kg",
    "FFB_Production_t",

    # Pure identifiers
    "Division_ID",
    "Block_ID"
]

drop_columns = [
    col for col in drop_columns
    if col in df.columns
]

X = df.drop(columns=drop_columns)
y = df[target]


# =========================================================
# 7. REMOVE EXTREMELY HIGH-CARDINALITY COLUMNS
# =========================================================

for col in list(X.columns):

    if X[col].dtype == "object":

        unique_ratio = X[col].nunique(dropna=True) / len(X)

        if unique_ratio > 0.50:
            print("Dropping high-cardinality column:", col)
            X = X.drop(columns=[col])


# =========================================================
# 8. IDENTIFY NUMERIC / CATEGORICAL FEATURES
# =========================================================

numeric_features = X.select_dtypes(
    include=["int64", "int32", "float64", "float32"]
).columns.tolist()

categorical_features = X.select_dtypes(
    include=["object", "category", "bool"]
).columns.tolist()

print("\nNumeric features:")
print(numeric_features)

print("\nCategorical features:")
print(categorical_features)


# =========================================================
# 9. PREPROCESSING
# =========================================================

numeric_pipeline = Pipeline(
    steps=[
        ("imputer", SimpleImputer(strategy="median"))
    ]
)

categorical_pipeline = Pipeline(
    steps=[
        (
            "imputer",
            SimpleImputer(strategy="most_frequent")
        ),
        (
            "encoder",
            OneHotEncoder(
                handle_unknown="ignore",
                sparse_output=False
            )
        )
    ]
)

preprocessor = ColumnTransformer(
    transformers=[
        (
            "numeric",
            numeric_pipeline,
            numeric_features
        ),
        (
            "categorical",
            categorical_pipeline,
            categorical_features
        )
    ],
    remainder="drop"
)


# =========================================================
# 10. MODEL
# =========================================================

model = RandomForestRegressor(
    n_estimators=300,
    max_depth=18,
    min_samples_leaf=2,
    random_state=42,
    n_jobs=1
)


# =========================================================
# 11. COMPLETE PIPELINE
# =========================================================

pipeline = Pipeline(
    steps=[
        ("preprocessor", preprocessor),
        ("model", model)
    ]
)


# =========================================================
# 12. TRAIN / TEST SPLIT
# =========================================================

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42
)

print("\nTraining rows:", len(X_train))
print("Testing rows :", len(X_test))


# =========================================================
# 13. TRAIN
# =========================================================

print("\nTraining model...")

pipeline.fit(X_train, y_train)


# =========================================================
# 14. PREDICTION
# =========================================================

predictions = pipeline.predict(X_test)


# =========================================================
# 15. EVALUATION
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
print("MODEL PERFORMANCE")
print("===================================")

print(f"MAE  : {mae:.4f}")
print(f"RMSE : {rmse:.4f}")
print(f"R²   : {r2:.4f}")


# =========================================================
# 16. SAVE MODEL
# =========================================================

model_path = MODEL_DIR / "yield_forecast_model.pkl"

joblib.dump(
    pipeline,
    model_path
)

print("\nModel saved successfully:")
print(model_path)


# =========================================================
# 17. SAVE TEST PREDICTIONS
# =========================================================

results = pd.DataFrame({
    "Actual": y_test.values,
    "Predicted": predictions
})

results["Error"] = (
    results["Actual"] -
    results["Predicted"]
)

results_path = (
    BASE_DIR /
    "outputs" /
    "yield_model_predictions.csv"
)

results_path.parent.mkdir(
    exist_ok=True
)

results.to_csv(
    results_path,
    index=False
)

print("\nPrediction results saved:")
print(results_path)

print("\nMODEL TRAINING COMPLETE.")
