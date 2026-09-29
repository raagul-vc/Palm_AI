from flask import Flask, jsonify, make_response, request
from flask_cors import CORS
import pandas as pd
import numpy as np
from functools import lru_cache
from pathlib import Path
import os

app = Flask(__name__)
cors_origins = [origin.strip() for origin in os.environ.get("PALM_AI_CORS_ORIGINS", "").split(",") if origin.strip()]
if cors_origins:
    CORS(app, origins=cors_origins, expose_headers=["X-Data-Availability", "X-Data-Reason"])

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "outputs"


def load_csv(filename):
    path = OUTPUT_DIR / filename

    if not path.exists():
        return None

    return pd.read_csv(path)


def filter_block(df):
    """Filter a dataframe by Block_ID if requested via query parameter."""
    if df is None or not isinstance(df, pd.DataFrame):
        return df
    block_filter = request.args.get("block_id") or request.args.get("Block_ID")
    if block_filter and "Block_ID" in df.columns:
        return df[df["Block_ID"].astype(str).str.strip().str.upper() == block_filter.strip().upper()]
    return df


def dataframe_records(df):
    """Return strict-JSON-safe records, converting NaN/NaT values to null."""
    if df is None:
        return []
    safe_df = df.astype(object).where(pd.notna(df), None)
    return safe_df.to_dict(orient="records")


def unavailable_records(reason):
    """Represent a missing optional source without failing other dashboard data."""
    response = make_response(jsonify([]), 200)
    response.headers["X-Data-Availability"] = "unavailable"
    response.headers["X-Data-Reason"] = reason
    return response


def unavailable_object(payload, reason):
    """Keep object endpoint schemas stable when optional outputs are absent."""
    response = make_response(jsonify(payload), 200)
    response.headers["X-Data-Availability"] = "unavailable"
    response.headers["X-Data-Reason"] = reason
    return response


@app.route("/api/health")
def health():
    return jsonify({
        "status": "online",
        "message": "Palm AI API is running",
        "sources": {
            "risk": (OUTPUT_DIR / "block_health_risk.csv").exists(),
            "multi_source_risk": (OUTPUT_DIR / "multi_source_block_risk.csv").exists(),
            "nutrients": (OUTPUT_DIR / "block_nutrient_diagnostics.csv").exists(),
            "dris": (OUTPUT_DIR / "dris_prescription_analysis.csv").exists(),
            "weather": (OUTPUT_DIR / "block_weather_impact.csv").exists(),
            "master_observations": (DATA_DIR / "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv").exists(),
            "yield_model": (BASE_DIR / "models" / "yield_forecast_model.pkl").exists(),
        }
    })


@app.route("/api/risk")
def risk_data():

    filename = "block_health_risk.csv"

    df = load_csv(filename)

    if df is None:
        return unavailable_records(f"Optional output {filename} is not present")

    return jsonify(dataframe_records(filter_block(df)))


@app.route("/api/nutrients")
def nutrient_data():

    filename = "block_nutrient_diagnostics.csv"

    df = load_csv(filename)

    if df is None:
        return unavailable_records(f"Optional output {filename} is not present")

    return jsonify(dataframe_records(filter_block(df)))


@app.route("/api/weather")
def weather_data():

    filename = "block_weather_impact.csv"

    df = load_csv(filename)

    if df is None:
        return unavailable_records(f"Optional output {filename} is not present")

    return jsonify(dataframe_records(filter_block(df)))


@app.route("/api/dris")
def dris_data():

    filename = "dris_prescription_analysis.csv"

    df = load_csv(filename)

    if df is None:
        return unavailable_records(f"Optional output {filename} is not present")

    return jsonify(dataframe_records(filter_block(df)))


@app.route("/api/multi-source-risk")
def multi_source_risk_data():
    filename = "multi_source_block_risk.csv"
    df = load_csv(filename)

    if df is None:
        return unavailable_records(f"Optional output {filename} is not present")

    return jsonify(dataframe_records(filter_block(df)))


@app.route("/api/productivity")
def productivity_data():
    """Return annual sums of monthly per-hectare productivity by block."""
    filename = "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv"
    path = DATA_DIR / filename

    if not path.exists():
        return unavailable_records(f"Optional source {filename} is not present")

    try:
        df = pd.read_csv(path, usecols=["Year", "Block_ID", "Plant_Status", "Productivity_t_Ha"])
    except (ValueError, pd.errors.ParserError) as error:
        return jsonify({"error": f"Unable to read productivity data: {error}"}), 500

    df["Year"] = pd.to_numeric(df["Year"], errors="coerce")
    df["Productivity_t_Ha"] = pd.to_numeric(df["Productivity_t_Ha"], errors="coerce")
    df = df.dropna(subset=["Year", "Productivity_t_Ha"])

    if df.empty:
        return jsonify([])

    grouped = (
        df.groupby(["Year", "Block_ID"], dropna=False)
        .agg(
            Productivity_t_Ha=("Productivity_t_Ha", "sum"),
            Observations=("Productivity_t_Ha", "count"),
            Plant_Status=("Plant_Status", "last"),
        )
        .reset_index()
    )
    grouped["Year"] = grouped["Year"].astype(int)
    grouped = filter_block(grouped)
    return jsonify(dataframe_records(grouped.sort_values(["Year", "Block_ID"])))


@app.route("/api/weather-correlation")
def weather_correlation_data():
    filename = "weather_productivity_correlation.csv"
    df = load_csv(filename)

    if df is None:
        return unavailable_records(f"Optional output {filename} is not present")

    return jsonify(dataframe_records(df))


@app.route("/api/model-validation")
def model_validation_data():
    metrics_name = "time_based_validation_metrics.csv"
    yearly_name = "time_based_validation_summary.csv"
    metrics = load_csv(metrics_name)
    yearly = load_csv(yearly_name)

    missing = [name for name, frame in ((metrics_name, metrics), (yearly_name, yearly)) if frame is None]
    if missing:
        return unavailable_object({"metrics": [], "yearly": [], "feature_importance": []}, f"Optional validation output(s) missing: {', '.join(missing)}")

    feature_importance = []
    model_path = BASE_DIR / "models" / "yield_forecast_model.pkl"
    if model_path.exists():
        try:
            import joblib

            pipeline = joblib.load(model_path)
            preprocessor = pipeline.named_steps["preprocessor"]
            estimator = pipeline.named_steps["model"]
            names = preprocessor.get_feature_names_out()
            feature_importance = [
                {"Feature": str(names[index]).replace("numeric__", "").replace("categorical__", ""),
                 "Importance": float(estimator.feature_importances_[index])}
                for index in np.argsort(estimator.feature_importances_)[::-1][:12]
            ]
        except (OSError, ValueError, KeyError, AttributeError, ImportError) as error:
            app.logger.warning("Unable to load feature importance: %s", error)

    return jsonify({
        "metrics": dataframe_records(metrics),
        "yearly": dataframe_records(yearly),
        "feature_importance": feature_importance,
    })


@app.route("/api/production")
def production_data():
    """Return actual annual FFB production totals from monthly observations."""
    filename = "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv"
    path = DATA_DIR / filename
    if not path.exists():
        return unavailable_records(f"Optional source {filename} is not present")
    try:
        df = pd.read_csv(path, usecols=["Year", "FFB_Production_t"])
        df["Year"] = pd.to_numeric(df["Year"], errors="coerce")
        df["FFB_Production_t"] = pd.to_numeric(df["FFB_Production_t"], errors="coerce")
        df = df.dropna(subset=["Year", "FFB_Production_t"])
        yearly = df.groupby("Year", as_index=False)["FFB_Production_t"].sum()
        yearly["Year"] = yearly["Year"].astype(int)
        return jsonify(dataframe_records(yearly.sort_values("Year")))
    except (ValueError, pd.errors.ParserError) as error:
        return jsonify({"error": f"Unable to read production data: {error}"}), 500


@app.route("/api/harvest-production")
def harvest_production_data():
    """Return observed monthly FFB production, grouped by year and block."""
    filename = "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv"
    path = DATA_DIR / filename
    if not path.exists():
        return unavailable_records(f"Optional source {filename} is not present")
    try:
        columns = ["Year", "Month_Number", "Month", "Block_ID", "FFB_Production_t"]
        df = pd.read_csv(path, usecols=columns)
        df["Year"] = pd.to_numeric(df["Year"], errors="coerce")
        df["Month_Number"] = pd.to_numeric(df["Month_Number"], errors="coerce")
        df["FFB_Production_t"] = pd.to_numeric(df["FFB_Production_t"], errors="coerce")
        df = df.dropna(subset=["Year", "Month_Number", "Block_ID", "FFB_Production_t"])
        monthly = (
            df.groupby(["Year", "Month_Number", "Month", "Block_ID"], as_index=False, dropna=False)
            ["FFB_Production_t"].sum()
        )
        monthly["Year"] = monthly["Year"].astype(int)
        monthly["Month_Number"] = monthly["Month_Number"].astype(int)
        monthly = filter_block(monthly)
        return jsonify(dataframe_records(monthly.sort_values(["Year", "Month_Number", "Block_ID"])))
    except (ValueError, pd.errors.ParserError) as error:
        return jsonify({"error": f"Unable to read harvest production data: {error}"}), 500


@lru_cache(maxsize=1)
def _build_yield_forecast():
    """Load the saved forecast projection; never generate replacement values."""
    saved_path = OUTPUT_DIR / "yield_forecast_cache.csv"
    if not saved_path.exists():
        raise FileNotFoundError("Saved forecast output is unavailable")
    return dataframe_records(pd.read_csv(saved_path))


@app.route("/api/yield-forecast")
def yield_forecast_data():
    try:
        data = _build_yield_forecast()
        block_filter = request.args.get("block_id") or request.args.get("Block_ID")
        if block_filter:
            data = [r for r in data if str(r.get("Block_ID", "")).strip().upper() == block_filter.strip().upper()]
        return jsonify(data)
    except FileNotFoundError as error:
        return unavailable_records(str(error))
    except (ValueError, KeyError, OSError, ImportError) as error:
        app.logger.exception("Unable to build yield forecast")
        return jsonify({"error": f"Unable to build yield forecast: {error}"}), 500


@app.route("/api/age-seed")
def age_seed_data():
    path = DATA_DIR / "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv"
    if not path.exists():
        return unavailable_records(f"Optional source {path.name} is not present")
    df = pd.read_csv(path, usecols=["Year", "Block_ID", "Plant_Age_Years", "Seed_Type", "Plant_Status", "Productivity_t_Ha"])
    for column in ["Year", "Plant_Age_Years", "Productivity_t_Ha"]:
        df[column] = pd.to_numeric(df[column], errors="coerce")
    df = df.dropna(subset=["Year", "Block_ID", "Plant_Age_Years", "Productivity_t_Ha"])
    df = df[df["Plant_Status"].astype(str).str.upper() != "TBM"]
    annual = df.groupby(["Year", "Block_ID", "Plant_Age_Years", "Seed_Type"], as_index=False)["Productivity_t_Ha"].sum()
    curve = annual.groupby(["Plant_Age_Years", "Seed_Type"], as_index=False).agg(
        Productivity_t_Ha=("Productivity_t_Ha", "mean"), Block_Years=("Block_ID", "count")
    )
    return jsonify(dataframe_records(curve.sort_values(["Plant_Age_Years", "Seed_Type"])))


@app.route("/api/seasonality")
def seasonality_data():
    path = DATA_DIR / "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv"
    if not path.exists():
        return unavailable_records(f"Optional source {path.name} is not present")
    df = pd.read_csv(path, usecols=["Month_Number", "Month", "Plant_Status", "Productivity_t_Ha"])
    df["Month_Number"] = pd.to_numeric(df["Month_Number"], errors="coerce")
    df["Productivity_t_Ha"] = pd.to_numeric(df["Productivity_t_Ha"], errors="coerce")
    df = df.dropna(subset=["Month_Number", "Productivity_t_Ha"])
    df = df[df["Plant_Status"].astype(str).str.upper() != "TBM"]
    monthly = df.groupby(["Month_Number", "Month"], as_index=False)["Productivity_t_Ha"].mean()
    # Each month mean is compared with the mean of all mature-block monthly
    # observations, so 1.0 represents the overall historical monthly average.
    overall_mean = df["Productivity_t_Ha"].mean()
    monthly["Relative_Index"] = monthly["Productivity_t_Ha"] / overall_mean if overall_mean else np.nan
    return jsonify(dataframe_records(monthly.sort_values("Month_Number")))


@app.route("/api/soil")
def soil_data():
    path = DATA_DIR / "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv"
    if not path.exists():
        return unavailable_records(f"Optional source {path.name} is not present")
    columns = [
        "Block_ID", "Year", "pH_H2O", "C_Organic_pct", "P_Available_ppm",
        "K_exch_me_100g", "Mg_exch_me_100g", "Base_Saturation_pct",
        "Sand_pct", "Clay_pct", "Soil_Data_Available",
    ]
    df = pd.read_csv(path, usecols=columns)
    sampled = df[ df["Soil_Data_Available"].astype(str).str.lower().isin(["true", "1", "yes"]) ].copy()
    sample_values = [column for column in columns if column not in ["Block_ID", "Year", "Soil_Data_Available"]]
    sampled = sampled.drop_duplicates(["Block_ID", "Year", *sample_values])
    sampled = sampled.rename(columns={"Year": "Sample_Year"})
    sampled = filter_block(sampled)
    return jsonify(dataframe_records(sampled.sort_values(["Sample_Year", "Block_ID"])))


@app.route("/api/nutrient-reference")
def nutrient_reference_data():
    filename = "nutrient_reference_ranges.csv"
    df = load_csv(filename)
    if df is None:
        return unavailable_records(f"Optional output {filename} is not present")
    diagnostics = load_csv("block_nutrient_diagnostics.csv")
    if diagnostics is not None:
        for row_index, row in df.iterrows():
            status_column = f"{row['Nutrient']}_Status"
            if status_column not in diagnostics:
                df.loc[row_index, ["Low_Blocks", "Valid_Blocks", "Missing_Blocks", "Total_Blocks"]] = [None] * 4
                continue
            statuses = diagnostics[status_column].fillna("NO_DATA").astype(str).str.upper()
            valid = statuses.isin(["LOW", "NORMAL", "HIGH"])
            df.loc[row_index, "Low_Blocks"] = int(statuses.eq("LOW").sum())
            df.loc[row_index, "Valid_Blocks"] = int(valid.sum())
            df.loc[row_index, "Missing_Blocks"] = int((~valid).sum())
            df.loc[row_index, "Total_Blocks"] = int(len(diagnostics))
    return jsonify(dataframe_records(df))


@app.route("/api/data-quality")
def data_quality_data():
    path = DATA_DIR / "Palm_AI_Master_FFB_Leaf_Soil_Weather.csv"
    if not path.exists():
        return unavailable_object({"findings": [], "soil_sample_count": 0, "period_start": None, "period_end": None}, f"Optional source {path.name} is not present")
    df = pd.read_csv(path)
    df["Year"] = pd.to_numeric(df["Year"], errors="coerce")
    df["Month_Number"] = pd.to_numeric(df["Month_Number"], errors="coerce")
    product = pd.to_numeric(df["Productivity_t_Ha"], errors="coerce")
    leaf = df[df["Leaf_Data_Available"].astype(str).str.lower().isin(["true", "1", "yes"])].copy()
    nutrient_columns = ["N_pct", "P_pct", "K_pct", "Ca_pct", "Mg_pct", "B_ppm"]
    leaf_samples = leaf.drop_duplicates(["Block_ID", "Sampling_Year_leaf", *nutrient_columns])
    soil = df[df["Soil_Data_Available"].astype(str).str.lower().isin(["true", "1", "yes"])].copy()
    soil_samples = soil.drop_duplicates(["Block_ID", "Year", "pH_H2O", "C_Organic_pct", "P_Available_ppm", "Base_Saturation_pct"])
    invalid_soil = pd.to_numeric(soil["Base_Saturation_pct"], errors="coerce") > 100
    leaf_years = pd.to_numeric(leaf["Sampling_Year_leaf"], errors="coerce").dropna()
    year_months = df[["Year", "Month_Number"]].dropna().drop_duplicates()
    immature = df["Plant_Status"].astype(str).str.upper() == "TBM"
    planting_year = pd.to_numeric(df["Planting_Year"], errors="coerce")
    plant_age = pd.to_numeric(df["Plant_Age_Years"], errors="coerce")
    age_checkable = ~immature & df["Year"].notna() & planting_year.notna() & plant_age.notna()
    age_mismatches = int((age_checkable & plant_age.ne(df["Year"] - planting_year)).sum())
    duplicate_rows = int(df.duplicated().sum())
    missing_blocks = int(df["Block_ID"].isna().sum())
    missing_years = int(df["Year"].isna().sum())
    missing_months = int(df["Month_Number"].isna().sum())
    invalid_productivity = int((df["Productivity_t_Ha"].notna() & product.isna()).sum())
    numeric_productivity = product.dropna()
    negative_productivity = int(numeric_productivity.lt(0).sum())
    production_t = pd.to_numeric(df["FFB_Production_t"], errors="coerce")
    production_kg = pd.to_numeric(df["FFB_Production_kg"], errors="coerce")
    conversion_error = (production_t - production_kg / 1000).abs()
    unit_mismatch = int((production_t.notna() & production_kg.notna() & conversion_error.gt(0.00051)).sum())
    invalid_area = pd.to_numeric(df["Area_Ha"], errors="coerce").le(0)
    productivity_unit_error = int((
        product.notna() & production_t.notna() & ~invalid_area
        & (product - production_t / pd.to_numeric(df["Area_Ha"], errors="coerce")).abs().gt(0.001)
    ).sum())
    negative_production = int(production_t.lt(0).sum())
    negative_age = int(plant_age.lt(0).sum())
    expected_statuses = {"TBM", "TM-UTAMA", "TM-TUA", "TM-1", "TM-2", "TM-3"}
    observed_statuses = set(df["Plant_Status"].dropna().astype(str).str.upper())
    unexpected_statuses = sorted(observed_statuses - expected_statuses)
    df["Productivity_t_Ha"] = product
    block_series = df[df["Year"] == df["Year"].max()].groupby(["Block_ID", "Month_Number"])["Productivity_t_Ha"].sum().unstack("Month_Number")
    series_groups = {}
    for block_id, values in block_series.iterrows():
        key = tuple(values.fillna(0).round(10).tolist())
        series_groups.setdefault(key, []).append(str(block_id))
    duplicate_series = [sorted(ids) for ids in series_groups.values() if len(ids) > 1]
    findings = [
        {"label": "Master observations", "value": f"{len(df):,}", "detail": f"{df['Block_ID'].nunique()} blocks across {len(year_months)} observed year/month combinations."},
        {"label": "Immature rows", "value": f"{int(immature.sum()):,}", "detail": f"{int((immature & product.eq(0)).sum()):,} TBM rows have zero productivity; the training pipeline excludes TBM records."},
        {"label": "Plant age check", "value": f"{age_mismatches} mature-row mismatches", "detail": "Checked against observation year minus planting year. Pre-planting TBM rows use age zero and are excluded from age/seed curves."},
        {"label": "Leaf observations", "value": f"{len(leaf):,} source rows", "detail": f"Sampling spans {int(leaf_years.min()) if len(leaf_years) else 'N/A'} through {int(leaf_years.max()) if len(leaf_years) else 'N/A'} and represents {len(leaf_samples):,} distinct block/sample-year value records. Leaf values repeat across monthly master rows. Boron is missing in {int(leaf['B_ppm'].isna().sum()):,} source rows ({int(leaf_samples['B_ppm'].isna().sum())} distinct sample records). Duplicate measurements within a block/year are averaged; the latest valid sample year is selected."},
        {"label": "Soil samples", "value": f"{len(soil_samples):,}", "detail": f"{len(soil)} source rows reduce to {len(soil_samples)} distinct block/year samples; {int(invalid_soil.sum())} repeated rows have base saturation above 100%."},
        {"label": "Integrity checks", "value": f"{duplicate_rows} exact duplicate rows", "detail": f"Missing Block_ID: {missing_blocks}; missing year/month: {missing_years}/{missing_months}; invalid productivity: {invalid_productivity}; negative productivity/production/age: {negative_productivity}/{negative_production}/{negative_age}; FFB kg-to-tonnes mismatches beyond rounding tolerance: {unit_mismatch}; productivity/FFB unit mismatches: {productivity_unit_error}; unexpected Plant_Status values: {', '.join(unexpected_statuses) if unexpected_statuses else 'none'}."},
        {"label": "Identical latest-year series", "value": f"{len(duplicate_series)} groups", "detail": "; ".join(", ".join(group) for group in duplicate_series) if duplicate_series else "No identical block series found in the latest year."},
        {"label": "Month labels", "value": "Source names retained", "detail": "Month names in the source are Indonesian; the API also exposes numeric month values."},
    ]
    return jsonify({"findings": findings, "soil_sample_count": int(len(soil_samples)), "period_start": int(df["Year"].min()), "period_end": int(df["Year"].max()), "leaf_period_start": int(leaf_years.min()) if len(leaf_years) else None, "leaf_period_end": int(leaf_years.max()) if len(leaf_years) else None})



@app.route("/api/dris-reference")
def dris_reference_data():
    filename = "dris_index_reference_used.csv"
    df = load_csv(filename)
    if df is None:
        return unavailable_records(f"Optional output {filename} is not present")
    return jsonify(dataframe_records(df))


@app.route("/api/fertilizer-plan")
def fertilizer_plan_data():
    return unavailable_object(
        {"plan": [], "correlations": []},
        "No verified fertilizer application plan or saved nutrient correlation output is available.",
    )


@app.route("/api/monthly-weather")
def monthly_weather_data():
    path = DATA_DIR / "NASA_POWER_Monthly_Weather_Clean.csv"
    if not path.exists():
        return unavailable_records("NASA POWER monthly weather dataset not found")
    df = pd.read_csv(path)
    return jsonify(dataframe_records(df))


if __name__ == "__main__":
    app.run(
        host=os.environ.get("PALM_AI_HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "5000")),
        debug=False,
    )
