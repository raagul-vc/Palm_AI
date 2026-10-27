from flask import Flask, abort, jsonify, make_response, request, send_from_directory
from flask_cors import CORS
import json
import pandas as pd
import numpy as np
from functools import lru_cache
from pathlib import Path
import os
import io
import base64

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIST_DIR = BASE_DIR / "frontend" / "dist"

app = Flask(__name__, static_folder=None)
cors_origins = [origin.strip() for origin in os.environ.get("PALM_AI_CORS_ORIGINS", "").split(",") if origin.strip()]
if cors_origins:
    CORS(app, origins=cors_origins, expose_headers=["X-Data-Availability", "X-Data-Reason"])
else:
    CORS(app, expose_headers=["X-Data-Availability", "X-Data-Reason"])

DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "outputs"


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    """Serve the built React app and fall back to it for client-side routes."""
    if path == "api" or path.startswith("api/"):
        abort(404)
    if not FRONTEND_DIST_DIR.is_dir():
        return "Frontend build not found. Build it with npm --prefix frontend run build.", 503
    candidate = FRONTEND_DIST_DIR / path
    if path and candidate.is_file():
        return send_from_directory(FRONTEND_DIST_DIR, path)
    return send_from_directory(FRONTEND_DIST_DIR, "index.html")


@app.errorhandler(404)
def handle_404(e):
    if request.path.startswith("/api"):
        return jsonify({"error": f"API endpoint not found: {request.path}"}), 404
    return e


@app.errorhandler(405)
def handle_405(e):
    if request.path.startswith("/api"):
        return jsonify({"error": f"HTTP method {request.method} is not allowed for {request.path}"}), 405
    return e


@app.errorhandler(500)
def handle_500(e):
    if request.path.startswith("/api"):
        return jsonify({"error": "Internal server error on API endpoint."}), 500
    return e


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


def load_canonical_risk():
    cache_file = OUTPUT_DIR / "canonical_block_risk.json"
    if not cache_file.exists():
        try:
            from backend.canonical_risk_engine import generate_and_save_canonical_risk
            return generate_and_save_canonical_risk()
        except Exception as exc:
            app.logger.warning("Failed to generate canonical risk: %s", exc)
            return {}
    try:
        with open(cache_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        app.logger.warning("Failed to load canonical risk: %s", exc)
        return {}


@app.route("/api/risk/summary")
def risk_summary():
    canonical = load_canonical_risk()
    if not canonical:
        return unavailable_object({}, "Canonical risk data unavailable")

    scores = [b["overall_risk_score"] for b in canonical.values() if b.get("overall_risk_score") is not None]
    levels = [b.get("risk_level") for b in canonical.values()]
    prod_risks = [b["risk_components"]["production_risk"] for b in canonical.values() if b["risk_components"].get("production_risk") is not None]
    nut_risks = [b["risk_components"]["nutrient_risk"] for b in canonical.values() if b["risk_components"].get("nutrient_risk") is not None]
    dris_risks = [b["risk_components"]["dris_risk"] for b in canonical.values() if b["risk_components"].get("dris_risk") is not None]

    total = len(canonical)
    high_cnt = levels.count("HIGH")
    med_cnt = levels.count("MEDIUM")
    low_cnt = levels.count("LOW")

    dris_obs_count = sum(1 for b in canonical.values() if b["agronomic_evidence"]["dris_indicators"]["status"] == "observed")
    soil_obs_count = sum(1 for b in canonical.values() if b["agronomic_evidence"]["soil_indicators"]["status"] == "observed")

    summary_payload = {
        "total_blocks": total,
        "year": 2024,
        "score_statistics": {
            "mean": round(float(np.mean(scores)), 2) if scores else 0.0,
            "median": round(float(np.median(scores)), 2) if scores else 0.0,
            "min": round(float(np.min(scores)), 2) if scores else 0.0,
            "max": round(float(np.max(scores)), 2) if scores else 0.0,
        },
        "risk_level_counts": {
            "HIGH": high_cnt,
            "MEDIUM": med_cnt,
            "LOW": low_cnt,
        },
        "risk_level_percentages": {
            "HIGH": round(high_cnt / total * 100, 1) if total else 0.0,
            "MEDIUM": round(med_cnt / total * 100, 1) if total else 0.0,
            "LOW": round(low_cnt / total * 100, 1) if total else 0.0,
        },
        "component_averages": {
            "production_risk_mean": round(float(np.mean(prod_risks)), 1) if prod_risks else None,
            "nutrient_risk_mean": round(float(np.mean(nut_risks)), 1) if nut_risks else None,
            "dris_risk_mean": round(float(np.mean(dris_risks)), 1) if dris_risks else None,
        },
        "evidence_coverage": {
            "palm_agronomic": f"{total} / {total} blocks (100% available)",
            "rgb_drone": f"0 / {total} blocks (unmapped - MOPAD Site 2 independent module)",
            "multispectral": f"0 / {total} blocks (unmapped - MSUAV500K independent module)",
            "leaf_nutrients_observed": f"{total} / {total} blocks",
            "dris_observed": f"{dris_obs_count} / {total} blocks",
            "soil_observed": f"{soil_obs_count} / {total} blocks",
            "weather_block_discriminating": f"0 / {total} blocks (estate repetition; excluded from risk score)",
        },
        "blocks": [
            {
                "Block_ID": b["Block_ID"],
                "Division_ID": b["Division_ID"],
                "overall_risk_score": b["overall_risk_score"],
                "risk_level": b["risk_level"],
                "production_risk": b["risk_components"]["production_risk"],
                "nutrient_risk": b["risk_components"]["nutrient_risk"],
                "dris_risk": b["risk_components"]["dris_risk"],
                "soil_status": b["agronomic_evidence"]["soil_indicators"]["status"],
                "evidence_status": b["evidence_status"],
                "recommended_action": b["recommended_action"],
            }
            for b in canonical.values()
        ],
    }
    return jsonify(summary_payload)


@app.route("/api/risk/<block_id>")
def block_risk_detail(block_id):
    canonical = load_canonical_risk()
    norm_id = str(block_id).strip().upper()
    if norm_id in canonical:
        return jsonify(canonical[norm_id])
    return jsonify({
        "error": f"Block '{block_id}' not found in plantation records",
        "status": 404
    }), 404


@app.route("/api/evidence-registry")
def evidence_registry_data():
    reg_file = OUTPUT_DIR / "multi_source_evidence_registry.json"
    if not reg_file.exists():
        return unavailable_object({}, "Evidence registry output is not present")
    with open(reg_file, "r", encoding="utf-8") as f:
        return jsonify(json.load(f))


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


_cached_feature_importance = None


@app.route("/api/model-validation")
def model_validation_data():
    global _cached_feature_importance
    metrics_name = "time_based_validation_metrics.csv"
    yearly_name = "time_based_validation_summary.csv"
    metrics = load_csv(metrics_name)
    yearly = load_csv(yearly_name)

    missing = [name for name, frame in ((metrics_name, metrics), (yearly_name, yearly)) if frame is None]
    if missing:
        return unavailable_object({"metrics": [], "yearly": [], "feature_importance": []}, f"Optional validation output(s) missing: {', '.join(missing)}")

    if _cached_feature_importance is None:
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
        _cached_feature_importance = feature_importance

    return jsonify({
        "metrics": dataframe_records(metrics),
        "yearly": dataframe_records(yearly),
        "feature_importance": _cached_feature_importance,
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


# -------------------------------------------------------------------------
# DRONE HEALTH INSIGHTS API (RGB UAV Standalone Module)
# -------------------------------------------------------------------------
DRONE_DIR = BASE_DIR / "drone"
DRONE_OUTPUTS_DIR = DRONE_DIR / "outputs"
DRONE_VIZ_DIR = DRONE_OUTPUTS_DIR / "drone_health_validation"


def load_drone_csv(filename):
    path = DRONE_OUTPUTS_DIR / filename
    if not path.exists():
        return None
    return pd.read_csv(path)


@app.route("/api/drone/summary")
def drone_summary_data():
    """Return high-level summary of the validated 500-image Drone Health Analysis."""
    features_df = load_drone_csv("drone_image_health_features.csv")
    outliers_df = load_drone_csv("drone_health_outlier_images.csv")
    report_file = DRONE_OUTPUTS_DIR / "drone_health_validation_report.json"

    if features_df is None:
        return unavailable_object({}, "Drone health feature dataset is not available")

    report_data = {}
    if report_file.exists():
        try:
            with open(report_file, "r", encoding="utf-8") as f:
                report_data = json.load(f)
        except Exception:
            report_data = {}

    scores = pd.to_numeric(features_df["drone_health_score"], errors="coerce").dropna()
    total_palms = int(features_df["palm_detections"].sum())
    total_healthy = int(features_df["healthy_count"].sum())
    total_dead = int(features_df["dead_count"].sum())
    total_small = int(features_df["small_count"].sum())
    total_yellow = int(features_df["yellow_count"].sum())
    total_grass = int(features_df["grass_count"].sum())
    total_detections = int(features_df["total_detections"].sum())

    healthy_pct = round((total_healthy / total_palms) * 100.0, 4) if total_palms > 0 else 0.0
    dead_pct = round((total_dead / total_palms) * 100.0, 4) if total_palms > 0 else 0.0
    small_pct = round((total_small / total_palms) * 100.0, 4) if total_palms > 0 else 0.0
    yellow_pct = round((total_yellow / total_palms) * 100.0, 4) if total_palms > 0 else 0.0
    grass_pct = round((total_grass / total_detections) * 100.0, 4) if total_detections > 0 else 0.0
    non_healthy_pct = round(100.0 - healthy_pct, 4)

    high_c = int((scores >= 80.0).sum())
    mod_c = int(((scores >= 60.0) & (scores < 80.0)).sum())
    low_c = int((scores < 60.0).sum())

    low_det_count = int((features_df["palm_detections"] < 50.0).sum())
    zero_det_count = int((features_df["palm_detections"] == 0).sum())
    health_outlier_count = int((features_df["drone_health_score"] < 28.34).sum())
    density_outlier_count = int((features_df["palm_detections"] >= 107.0).sum())
    total_outliers_flagged = len(outliers_df) if outliers_df is not None else 89

    summary = {
        "image_count": len(features_df),
        "mean_health_score": round(float(scores.mean()), 2) if len(scores) else 0.0,
        "median_health_score": round(float(scores.median()), 2) if len(scores) else 0.0,
        "min_health_score": round(float(scores.min()), 2) if len(scores) else 0.0,
        "max_health_score": round(float(scores.max()), 2) if len(scores) else 0.0,
        "total_detections": total_detections,
        "total_palm_detections": total_palms,
        "healthy_percentage": healthy_pct,
        "non_healthy_percentage": non_healthy_pct,
        "dead_percentage": dead_pct,
        "small_percentage": small_pct,
        "yellow_percentage": yellow_pct,
        "grass_percentage": grass_pct,
        "zero_detection_count": zero_det_count,
        "low_detection_count": low_det_count,
        "health_outlier_count": health_outlier_count,
        "density_outlier_count": density_outlier_count,
        "total_outliers_flagged": total_outliers_flagged,
        "baseline_confidence": 0.25,
        "recommended_confidence": 0.25,
        "block_mapping": "unavailable",
        "block_mapping_details": "MOPAD Site 2 benchmark tiles operate on canvas pixel coordinates; no georeferenced GIS shapefiles or plantation Block_IDs exist. No synthetic spatial mapping fabricated.",
        "health_categories": {
            "definition": "Project analysis operational categories; NOT clinically/agronomically validated disease thresholds.",
            "HIGH": {"label": "High Health", "criteria": "Score >= 80%", "count": high_c, "percentage": round(high_c / len(scores) * 100, 1)},
            "MODERATE": {"label": "Moderate Health", "criteria": "60% <= Score < 80%", "count": mod_c, "percentage": round(mod_c / len(scores) * 100, 1)},
            "LOW": {"label": "Low Health", "criteria": "Score < 60%", "count": low_c, "percentage": round(low_c / len(scores) * 100, 1)}
        },
        "disclaimer": "Drone Health Score is a model-derived image-level indicator. It is not a validated disease diagnosis and is not mapped to Palm Plantation Block_ID."
    }
    return jsonify(summary)


@app.route("/api/drone/images")
def drone_images_data():
    """Return image-level drone health records with optional filtering and pagination."""
    df = load_drone_csv("drone_image_health_features.csv")
    if df is None:
        return unavailable_records("Drone health features CSV is not present")

    # Add health category
    scores = pd.to_numeric(df["drone_health_score"], errors="coerce")
    categories = []
    for s in scores:
        if pd.isna(s):
            categories.append("UNKNOWN")
        elif s >= 80.0:
            categories.append("HIGH")
        elif s >= 60.0:
            categories.append("MODERATE")
        else:
            categories.append("LOW")
    df["health_category"] = categories

    # Mark outliers if outlier dataset exists
    outliers_df = load_drone_csv("drone_health_outlier_images.csv")
    if outliers_df is not None and "image_filename" in outliers_df.columns:
        outlier_map = dict(zip(outliers_df["image_filename"], outliers_df["outlier_categories"]))
        df["is_outlier"] = df["image_filename"].isin(outlier_map)
        df["outlier_categories"] = df["image_filename"].map(outlier_map).fillna("")
    else:
        df["is_outlier"] = False
        df["outlier_categories"] = ""

    # Ensure no Block_ID is present or fabricated
    df["block_mapping"] = "unavailable"

    # Optional filter: health_category
    cat_filter = request.args.get("health_category")
    if cat_filter:
        df = df[df["health_category"].str.upper() == cat_filter.strip().upper()]

    # Optional filter: outlier_only
    outlier_only = request.args.get("outlier_only")
    if outlier_only and outlier_only.lower() in ["true", "1", "yes"]:
        df = df[df["is_outlier"]]

    # Sorting
    sort_by = request.args.get("sort_by")
    if sort_by == "score_asc":
        df = df.sort_values("drone_health_score", ascending=True)
    elif sort_by == "score_desc":
        df = df.sort_values("drone_health_score", ascending=False)
    elif sort_by == "detections_asc":
        df = df.sort_values("palm_detections", ascending=True)
    elif sort_by == "detections_desc":
        df = df.sort_values("palm_detections", ascending=False)
    else:
        df = df.sort_values("image_filename", ascending=True)

    # Pagination: limit & offset
    limit = request.args.get("limit")
    offset = request.args.get("offset")
    total_matching = len(df)
    
    if offset:
        try:
            df = df.iloc[int(offset):]
        except (ValueError, TypeError):
            pass

    if limit:
        try:
            df = df.iloc[:int(limit)]
        except (ValueError, TypeError):
            pass

    records = dataframe_records(df)
    return jsonify(records)


@app.route("/api/drone/validation")
def drone_validation_data():
    """Return threshold sensitivity experiment and stability metrics."""
    thresh_df = load_drone_csv("drone_health_threshold_validation.csv")
    rob_df = load_drone_csv("drone_health_score_robustness.csv")
    conf_df = load_drone_csv("drone_detection_confidence_summary.csv")
    report_file = DRONE_OUTPUTS_DIR / "drone_health_validation_report.json"

    report_json = {}
    if report_file.exists():
        try:
            with open(report_file, "r", encoding="utf-8") as f:
                report_json = json.load(f)
        except Exception:
            report_json = {}

    if thresh_df is None or rob_df is None:
        return unavailable_object({}, "Drone validation outputs are missing")

    payload = {
        "baseline_confidence": 0.25,
        "recommended_confidence": 0.25,
        "recommendation_status": "Retain 0.25 baseline (highly robust; 98.8% category stability at 0.40; r=0.9994)",
        "threshold_experiment": dataframe_records(thresh_df),
        "score_robustness": dataframe_records(rob_df),
        "detection_confidence_summary": dataframe_records(conf_df) if conf_df is not None else [],
        "report_summary": {
            "validation_metadata": report_json.get("validation_metadata", {}),
            "audit_findings": report_json.get("audit_findings", {}),
            "recommendations": report_json.get("recommendations", {}),
            "limitations": report_json.get("limitations", [])
        }
    }
    return jsonify(payload)


@app.route("/api/drone/outliers")
def drone_outliers_data():
    """Return statistical quality and canopy density outlier images with transparent rule details."""
    outliers_df = load_drone_csv("drone_health_outlier_images.csv")
    if outliers_df is None:
        return unavailable_records("Drone outlier dataset is not present")

    outliers_df["block_mapping"] = "unavailable"

    cat_filter = request.args.get("category") or request.args.get("type")
    if cat_filter:
        pattern = cat_filter.strip().lower()
        outliers_df = outliers_df[outliers_df["outlier_categories"].str.lower().str.contains(pattern)]

    limit = request.args.get("limit")
    if limit:
        try:
            outliers_df = outliers_df.iloc[:int(limit)]
        except (ValueError, TypeError):
            pass

    records = dataframe_records(outliers_df)
    return jsonify(records)


@app.route("/api/drone/visualizations")
def drone_visualizations_manifest():
    """Return metadata list of pre-generated validation charts."""
    charts = [
        {
            "id": "1_health_score_by_confidence_threshold",
            "filename": "1_health_score_by_confidence_threshold.png",
            "title": "Health Score Distribution Across Thresholds",
            "description": "Boxplots and mean/median score trajectory showing stability from conf=0.25 through 0.75.",
            "url": "/api/drone/visualizations/1_health_score_by_confidence_threshold.png"
        },
        {
            "id": "2_health_score_correlation_across_thresholds",
            "filename": "2_health_score_correlation_across_thresholds.png",
            "title": "Cross-Threshold Score Correlation vs Baseline",
            "description": "Scatter correlations and regression trends demonstrating near-unity correlation (r=0.9994 at 0.40).",
            "url": "/api/drone/visualizations/2_health_score_correlation_across_thresholds.png"
        },
        {
            "id": "3_healthy_pct_by_confidence_threshold",
            "filename": "3_healthy_pct_by_confidence_threshold.png",
            "title": "Healthy Palm % Stability Across Thresholds",
            "description": "Aggregate and image-level Healthy % across thresholds, tracking consistent crown classification.",
            "url": "/api/drone/visualizations/3_healthy_pct_by_confidence_threshold.png"
        },
        {
            "id": "4_non_healthy_pct_by_confidence_threshold",
            "filename": "4_non_healthy_pct_by_confidence_threshold.png",
            "title": "Non-Healthy Palm Composition Breakdown",
            "description": "Detailed breakdown of Small, Yellow (chlorotic), and Dead palm percentages.",
            "url": "/api/drone/visualizations/4_non_healthy_pct_by_confidence_threshold.png"
        },
        {
            "id": "5_distribution_of_health_score_changes",
            "filename": "5_distribution_of_health_score_changes.png",
            "title": "Distribution of Score Shift (\u0394 Score)",
            "description": "Histograms of image-level score deltas relative to baseline (conf=0.25).",
            "url": "/api/drone/visualizations/5_distribution_of_health_score_changes.png"
        },
        {
            "id": "6_detection_count_vs_health_score",
            "filename": "6_detection_count_vs_health_score.png",
            "title": "Palm Detection Count vs Health Score",
            "description": "Scatter distribution highlighting density fences, replanted immature blocks, and border tiles.",
            "url": "/api/drone/visualizations/6_detection_count_vs_health_score.png"
        }
    ]
    available = [c for c in charts if (DRONE_VIZ_DIR / c["filename"]).exists()]
    return jsonify(available)


@app.route("/api/drone/visualizations/<path:filename>")
def serve_drone_visualization(filename):
    """Safely serve pre-generated validation chart PNGs."""
    if not DRONE_VIZ_DIR.is_dir():
        abort(404)
    candidate = DRONE_VIZ_DIR / filename
    if not candidate.is_file():
        abort(404)
    return send_from_directory(DRONE_VIZ_DIR, filename)


# Reusable YOLO model instance cache
_drone_yolo_model = None


def get_drone_yolo_model():
    """Lazily load and cache the Drone YOLO11n model instance in memory."""
    global _drone_yolo_model
    if _drone_yolo_model is not None:
        return _drone_yolo_model
    model_path = DRONE_DIR / "models" / "palm_yolo_best.pt"
    if not model_path.exists():
        app.logger.error("Drone model checkpoint not found at %s", model_path)
        return None
    try:
        from ultralytics import YOLO
        _drone_yolo_model = YOLO(str(model_path))
        return _drone_yolo_model
    except Exception as e:
        app.logger.exception("Failed to initialize Drone YOLO model: %s", e)
        return None


MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB limit
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


@app.route("/api/drone/predict", methods=["GET", "POST"])
def predict_drone_image():
    """Run live single-image palm crown detection using the trained YOLO11n model.
    
    Accepts multipart/form-data upload with field 'image' or 'file'.
    Returns bounding boxes, class counts, confidence scores, and an in-memory annotated base64 image.
    Strictly read-only and in-memory: does not overwrite existing dataset or validation files.
    """
    if request.method == "GET":
        return jsonify({
            "endpoint": "/api/drone/predict",
            "method": "POST",
            "description": "Upload an aerial survey RGB image (multipart/form-data with field 'image' or 'file') to run live YOLO11n canopy detection.",
            "allowed_extensions": sorted(list(ALLOWED_IMAGE_EXTENSIONS)),
            "max_file_size_bytes": MAX_IMAGE_UPLOAD_BYTES,
            "max_file_size_mb": 10,
            "parameters": {
                "image": "File (JPG, JPEG, PNG, WebP, TIFF)",
                "conf": "Float confidence threshold between 0.05 and 0.95 (default 0.25)"
            },
            "status": "ready"
        }), 200

    file = request.files.get("image") or request.files.get("file")
    if not file or not file.filename:
        return jsonify({
            "error": "No image file provided. Please submit an image in multipart/form-data under 'image' or 'file'."
        }), 400

    filename = file.filename
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({
            "error": f"Unsupported file extension '{ext}'. Supported formats: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}"
        }), 400

    try:
        file_bytes = file.read()
    except Exception as e:
        return jsonify({"error": f"Unable to read uploaded file stream: {e}"}), 400

    if len(file_bytes) == 0:
        return jsonify({"error": "Uploaded file is empty (0 bytes)."}), 400

    if len(file_bytes) > MAX_IMAGE_UPLOAD_BYTES:
        return jsonify({
            "error": f"Uploaded file size ({len(file_bytes) / (1024 * 1024):.2f} MB) exceeds the 10 MB limit."
        }), 400

    try:
        from PIL import Image
        pil_img = Image.open(io.BytesIO(file_bytes))
        pil_img.verify()
        pil_img = Image.open(io.BytesIO(file_bytes))
        orig_width, orig_height = pil_img.size
        pil_img = pil_img.convert("RGB")
    except Exception as e:
        return jsonify({"error": f"Invalid or unreadable image file: {e}"}), 400

    if orig_width < 16 or orig_height < 16:
        return jsonify({
            "error": f"Image dimensions ({orig_width}x{orig_height}) are too small (minimum 16x16 pixels required)."
        }), 400

    # Downscale safely if image exceeds 2048x2048 to prevent memory spikes on free-tier containers
    max_dim = max(orig_width, orig_height)
    if max_dim > 2048:
        scale = 2048.0 / max_dim
        new_w = max(16, int(round(orig_width * scale)))
        new_h = max(16, int(round(orig_height * scale)))
        pil_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    conf_param = request.form.get("conf") or request.args.get("conf") or "0.25"
    try:
        conf_val = float(conf_param)
        conf_val = max(0.05, min(0.95, conf_val))
    except ValueError:
        conf_val = 0.25

    model = get_drone_yolo_model()
    if model is None:
        return jsonify({
            "error": "Drone AI inference engine is unavailable. Ensure drone/models/palm_yolo_best.pt exists and Ultralytics/PyTorch is installed."
        }), 503

    try:
        results = model.predict(
            source=pil_img,
            imgsz=1024,
            conf=conf_val,
            iou=0.7,
            device="cpu",
            save=False,
            verbose=False
        )
        res = results[0]
    except Exception as e:
        app.logger.exception("Inference failed during Drone prediction: %s", e)
        return jsonify({"error": f"Inference execution failed: {e}"}), 500

    boxes_obj = res.boxes
    detections = []
    class_counts = {"Healthy": 0, "Small": 0, "Yellow": 0, "Dead": 0, "Grass": 0}

    if boxes_obj is not None and len(boxes_obj) > 0:
        cls_ids = boxes_obj.cls.cpu().numpy().astype(int)
        confs = boxes_obj.conf.cpu().numpy().astype(float)
        xyxy = boxes_obj.xyxy.cpu().numpy().astype(float)

        for i in range(len(cls_ids)):
            cid = int(cls_ids[i])
            cname = model.names.get(cid, str(cid))
            conf = float(confs[i])
            box = [round(float(coord), 1) for coord in xyxy[i]]

            if cname in class_counts:
                class_counts[cname] += 1
            else:
                class_counts[cname] = 1

            detections.append({
                "class_id": cid,
                "class_name": cname,
                "confidence": round(conf, 4),
                "bbox": box
            })

    total_detections = len(detections)
    palm_detections = (
        class_counts.get("Healthy", 0) +
        class_counts.get("Small", 0) +
        class_counts.get("Yellow", 0) +
        class_counts.get("Dead", 0)
    )
    healthy_count = class_counts.get("Healthy", 0)
    drone_health_score = round((healthy_count / palm_detections) * 100.0, 2) if palm_detections > 0 else 0.0

    try:
        plotted_bgr = res.plot()
        annotated_pil = Image.fromarray(plotted_bgr[:, :, ::-1])
        buf = io.BytesIO()
        annotated_pil.save(buf, format="JPEG", quality=85)
        encoded_image = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception as e:
        app.logger.warning("Could not generate plotted annotated image: %s", e)
        encoded_image = None

    return jsonify({
        "filename": filename,
        "dimensions": {"width": orig_width, "height": orig_height},
        "confidence_threshold": conf_val,
        "total_detections": total_detections,
        "palm_detections": palm_detections,
        "drone_health_score": drone_health_score,
        "healthy_count": healthy_count,
        "small_count": class_counts.get("Small", 0),
        "yellow_count": class_counts.get("Yellow", 0),
        "dead_count": class_counts.get("Dead", 0),
        "grass_count": class_counts.get("Grass", 0),
        "class_counts": class_counts,
        "detections": detections,
        "annotated_image": encoded_image,
        "model_info": {
            "name": "YOLO11n (palm_yolo_best.pt)",
            "classes": ["Dead", "Healthy", "Grass", "Small", "Yellow"],
            "dataset_origin": "MOPAD Site 2 benchmark"
        },
        "disclaimer": "Drone Health Score is a model-derived image-level indicator. It is not a validated disease diagnosis and is not mapped to Palm Plantation Block_ID."
    })



# -------------------------------------------------------------------------
# Standalone Multispectral Health Analysis Endpoints (MicaSense Altum UAV)
# -------------------------------------------------------------------------
MULTISPECTRAL_OUTPUTS_DIR = DRONE_DIR / "multispectral" / "outputs"
MULTISPECTRAL_VIZ_DIR = MULTISPECTRAL_OUTPUTS_DIR / "visualizations"


def load_multispectral_csv(filename):
    path = MULTISPECTRAL_OUTPUTS_DIR / filename
    if not path.exists():
        return None
    return pd.read_csv(path)


@app.route("/api/multispectral/summary")
def multispectral_summary_data():
    """Return high-level summary of the validated 34-tile Multispectral Health Analysis."""
    features_df = load_multispectral_csv("multispectral_tile_health_features.csv")
    summary_file = MULTISPECTRAL_OUTPUTS_DIR / "multispectral_tile_health_features_summary.json"

    if features_df is None:
        return unavailable_object({}, "Multispectral tile health features dataset is not available")

    summary_data = {}
    if summary_file.exists():
        try:
            with open(summary_file, "r", encoding="utf-8") as f:
                summary_data = json.load(f)
        except Exception:
            summary_data = {}

    agg = summary_data.get("aggregate_health_metrics", {})
    counts = summary_data.get("vigour_category_counts", {})

    mhs_series = pd.to_numeric(features_df["multispectral_health_score"], errors="coerce").dropna()
    ndvi_series = pd.to_numeric(features_df["canopy_ndvi_mean"], errors="coerce").dropna()
    ndre_series = pd.to_numeric(features_df["canopy_ndre_mean"], errors="coerce").dropna()
    canopy_series = pd.to_numeric(features_df["canopy_cover_percentage"], errors="coerce").dropna()

    high_count = int(counts.get("High Vigour Canopy", (features_df["vigour_category"] == "High Vigour Canopy").sum()))
    mod_count = int(counts.get("Moderate Vigour Canopy", (features_df["vigour_category"] == "Moderate Vigour Canopy").sum()))
    bg_count = int(counts.get("Non-Canopy / Water / Background", (features_df["vigour_category"] == "Non-Canopy / Water / Background").sum()))
    tile_count = len(features_df)

    summary_resp = {
        "tile_count": tile_count,
        "mean_ndvi": round(float(agg.get("mean_canopy_ndvi_in_vegetated_tiles", ndvi_series.mean())), 4),
        "median_ndvi": round(float(features_df["canopy_ndvi_median"].median()), 4),
        "mean_ndre": round(float(agg.get("mean_canopy_ndre_in_vegetated_tiles", ndre_series.mean())), 4),
        "median_ndre": round(float(features_df["canopy_ndre_median"].median()), 4),
        "mean_canopy_cover": round(float(agg.get("mean_canopy_cover_percentage", canopy_series.mean())), 2),
        "median_canopy_cover": round(float(canopy_series.median()), 2),
        "mean_mhs": round(float(agg.get("mean_multispectral_health_score", mhs_series.mean())), 2),
        "median_mhs": round(float(agg.get("median_multispectral_health_score", mhs_series.median())), 2),
        "min_mhs": round(float(agg.get("min_multispectral_health_score", mhs_series.min())), 2),
        "max_mhs": round(float(agg.get("max_multispectral_health_score", mhs_series.max())), 2),
        "std_mhs": round(float(agg.get("std_multispectral_health_score", mhs_series.std())), 2),
        "mean_canopy_uniformity": round(float(agg.get("mean_canopy_uniformity_score", 90.48)), 2),
        "high_vigour_count": high_count,
        "moderate_vigour_count": mod_count,
        "background_count": bg_count,
        "categories": {
            "definition": "Project analysis operational categories; NOT agronomically validated disease or nutrient diagnoses.",
            "HIGH": {
                "label": "High Vigour Canopy",
                "criteria": "Score >= 80% with high canopy cover",
                "count": high_count,
                "percentage": round((high_count / tile_count) * 100.0, 1) if tile_count else 0.0
            },
            "MODERATE": {
                "label": "Moderate Vigour Canopy",
                "criteria": "60% <= Score < 80% or transitional canopy cover",
                "count": mod_count,
                "percentage": round((mod_count / tile_count) * 100.0, 1) if tile_count else 0.0
            },
            "BACKGROUND": {
                "label": "Non-Canopy / Water / Background",
                "criteria": "Score < 60% or non-vegetated background",
                "count": bg_count,
                "percentage": round((bg_count / tile_count) * 100.0, 1) if tile_count else 0.0
            }
        },
        "dataset_provenance": "MSUAV500K Benchmark (Hullerbusch Beech Forest, Germany)",
        "provenance_details": "Zenodo Record 16743975 / DOI 10.5281/zenodo.16743974; collected over Hullerbusch Beech Forest in Mecklenburg-Vorpommern, Germany (~53.3° N, 13.2° E). Used as an algorithmic benchmark for 5-band calibrated multispectral index processing.",
        "land_cover_type": "Temperate Deciduous Beech Forest (Benchmark Only - NOT Oil Palm)",
        "oil_palm_applicability": "Non-oil-palm technical benchmark demonstration; evaluates spectral index mechanics (NDVI, NDRE) but cannot diagnose oil palm health or diseases.",
        "sensor_platform": "MicaSense Altum UAV Multispectral (5 calibrated bands: Blue, Green, Red, RedEdge, NIR)",
        "resolution": "512x512 pixels per tile",
        "total_pixels_evaluated": 8912896,
        "block_mapping": "unavailable",
        "block_mapping_status": "unmapped",
        "block_mapping_details": "MSUAV500K Zenodo benchmark tiles operate on local raster coordinates; no georeferenced GIS shapefiles or plantation Block_IDs exist. Unmapped to B001–B042; no synthetic spatial mapping fabricated.",
        "disclaimer": "Multispectral Health Score is a tile-level spectral indicator derived from calibrated European beech-forest UAV imagery (MSUAV500K). It is not oil-palm plantation data, is not a validated disease diagnosis, and is not mapped to Palm Plantation Block_ID.",
        "coverage": {
            "total_tiles": tile_count,
            "evaluated_pixels": 8912896,
            "mapped_blocks": 0,
            "mapping_status": "unmapped",
            "risk_contribution_pct": 0.0
        },
        "gis_readiness_checklist": [
            {
                "id": "boundaries",
                "item": "Plantation Block Boundaries",
                "requirement": "Authoritative vector polygon boundaries (ESRI Shapefile / GeoJSON) for all 42 operational blocks (B001–B042).",
                "status": "MISSING / REQUIRED",
                "ready": False
            },
            {
                "id": "crs",
                "item": "Coordinate Reference System (CRS)",
                "requirement": "Standard projected spatial reference system (e.g. WGS84 UTM Zone / EPSG code) for both vector GIS layers and UAV flight surveys.",
                "status": "MISSING / REQUIRED",
                "ready": False
            },
            {
                "id": "georeferenced_imagery",
                "item": "Georeferenced Oil-Palm Imagery",
                "requirement": "Calibrated multi-band orthomosaics with sub-meter geospatial accuracy and embedded Ground Control Points (GCPs) flown over the oil-palm plantation.",
                "status": "MISSING / REQUIRED",
                "ready": False
            },
            {
                "id": "timestamps",
                "item": "Flight Telemetry & Synchronized Timestamps",
                "requirement": "UAV flight mission logs with GPS positioning and acquisition timestamps synchronized with monthly FFB harvesting and annual Frond 17 foliar sampling rounds.",
                "status": "MISSING / REQUIRED",
                "ready": False
            },
            {
                "id": "block_identifiers",
                "item": "Verified Block Identifier Lookup",
                "requirement": "Verified spatial join or lookup table linking UAV image footprints/rasters directly to operational plantation block IDs B001–B042.",
                "status": "MISSING / REQUIRED",
                "ready": False
            }
        ]
    }
    return jsonify(summary_resp)


@app.route("/api/multispectral/tiles")
def multispectral_tiles_data():
    """Return tile-level multispectral health feature records with optional filtering and sorting."""
    df = load_multispectral_csv("multispectral_tile_health_features.csv")
    if df is None:
        return unavailable_records("Multispectral tile health features CSV is not present")

    df["block_mapping"] = "unavailable"

    cat_filter = request.args.get("health_category") or request.args.get("vigour_category")
    if cat_filter:
        cf = cat_filter.strip().upper()
        if cf == "HIGH":
            df = df[df["vigour_category"].str.upper().str.contains("HIGH")]
        elif cf == "MODERATE":
            df = df[df["vigour_category"].str.upper().str.contains("MODERATE")]
        elif cf in ["BACKGROUND", "NON-CANOPY", "LOW"]:
            df = df[df["vigour_category"].str.upper().str.contains("NON-CANOPY|BACKGROUND")]
        else:
            df = df[df["vigour_category"].str.upper() == cat_filter.strip().upper()]

    sort_by = request.args.get("sort_by")
    if sort_by == "mhs_desc":
        df = df.sort_values("multispectral_health_score", ascending=False)
    elif sort_by == "mhs_asc":
        df = df.sort_values("multispectral_health_score", ascending=True)
    elif sort_by == "ndvi_desc":
        df = df.sort_values("canopy_ndvi_mean", ascending=False)
    elif sort_by == "ndvi_asc":
        df = df.sort_values("canopy_ndvi_mean", ascending=True)
    elif sort_by == "ndre_desc":
        df = df.sort_values("canopy_ndre_mean", ascending=False)
    elif sort_by == "ndre_asc":
        df = df.sort_values("canopy_ndre_mean", ascending=True)
    elif sort_by == "canopy_desc":
        df = df.sort_values("canopy_cover_percentage", ascending=False)
    elif sort_by == "canopy_asc":
        df = df.sort_values("canopy_cover_percentage", ascending=True)
    elif sort_by == "tile_id_desc":
        df = df.sort_values("tile_id", ascending=False)
    else:
        df = df.sort_values("tile_id", ascending=True)

    offset = request.args.get("offset")
    if offset:
        try:
            df = df.iloc[int(offset):]
        except (ValueError, TypeError):
            pass

    limit = request.args.get("limit")
    if limit:
        try:
            df = df.iloc[:int(limit)]
        except (ValueError, TypeError):
            pass

    records = dataframe_records(df)
    return jsonify(records)


@app.route("/api/multispectral/indices")
def multispectral_indices_data():
    """Return tile-level NDVI/NDRE statistics from calibrated 5-band imagery."""
    df = load_multispectral_csv("multispectral_vegetation_indices.csv")
    if df is None:
        return unavailable_records("Multispectral vegetation indices CSV is not present")

    df["block_mapping"] = "unavailable"

    sort_by = request.args.get("sort_by")
    if sort_by == "ndvi_desc":
        df = df.sort_values("ndvi_mean", ascending=False)
    elif sort_by == "ndvi_asc":
        df = df.sort_values("ndvi_mean", ascending=True)
    elif sort_by == "ndre_desc":
        df = df.sort_values("ndre_mean", ascending=False)
    elif sort_by == "ndre_asc":
        df = df.sort_values("ndre_mean", ascending=True)
    else:
        df = df.sort_values("tile_id", ascending=True)

    offset = request.args.get("offset")
    if offset:
        try:
            df = df.iloc[int(offset):]
        except (ValueError, TypeError):
            pass

    limit = request.args.get("limit")
    if limit:
        try:
            df = df.iloc[:int(limit)]
        except (ValueError, TypeError):
            pass

    records = dataframe_records(df)
    return jsonify(records)


@app.route("/api/multispectral/visualizations")
def multispectral_visualizations_manifest():
    """Return manifest of available verified multispectral visualization charts."""
    charts = [
        {
            "id": "ndvi_ndre_spatial_maps",
            "filename": "ndvi_ndre_spatial_maps.png",
            "title": "Calibrated NDVI & NDRE Spatial Reflectance Maps",
            "description": "Spatial raster heatmaps across all 34 tiles comparing NDVI canopy vigor with NDRE red-edge chlorophyll transition.",
            "url": "/api/multispectral/visualizations/ndvi_ndre_spatial_maps.png"
        },
        {
            "id": "ndvi_ndre_distributions",
            "filename": "ndvi_ndre_distributions.png",
            "title": "Pixel-Level NDVI and NDRE Distribution Curves",
            "description": "Kernel density and histograms comparing distribution profiles of NDVI and NDRE across the 8.9M evaluated pixels.",
            "url": "/api/multispectral/visualizations/ndvi_ndre_distributions.png"
        },
        {
            "id": "tile_health_comparison",
            "filename": "tile_health_comparison.png",
            "title": "Tile Health & Canopy Cover Comparison",
            "description": "Comparative bar breakdown of canopy cover percentage and vegetation vigor classification across each tile.",
            "url": "/api/multispectral/visualizations/tile_health_comparison.png"
        },
        {
            "id": "canopy_health_score_distribution",
            "filename": "canopy_health_score_distribution.png",
            "title": "Multispectral Health Score (MHS) Distribution",
            "description": "Distribution of composite Multispectral Health Scores showing the 92.00% mean and 96.64% median.",
            "url": "/api/multispectral/visualizations/canopy_health_score_distribution.png"
        },
        {
            "id": "canopy_strata_breakdown",
            "filename": "canopy_strata_breakdown.png",
            "title": "Canopy Strata & Background Composition",
            "description": "Stacked proportion of high-vigor canopy, moderate-vigor canopy, depressed canopy, bare soil, and shadow/water.",
            "url": "/api/multispectral/visualizations/canopy_strata_breakdown.png"
        },
        {
            "id": "canopy_ndvi_vs_ndre_scatter",
            "filename": "canopy_ndvi_vs_ndre_scatter.png",
            "title": "Canopy NDVI vs NDRE Correlation Landscape",
            "description": "Tile-level scatter plot of canopy NDVI vs NDRE illustrating the non-linear saturation dynamic in dense foliage.",
            "url": "/api/multispectral/visualizations/canopy_ndvi_vs_ndre_scatter.png"
        },
        {
            "id": "canopy_heterogeneity_vs_vigour",
            "filename": "canopy_heterogeneity_vs_vigour.png",
            "title": "Canopy Heterogeneity vs Health Vigor",
            "description": "Uniformity score versus Multispectral Health Score highlighting canopy variance across flight lines.",
            "url": "/api/multispectral/visualizations/canopy_heterogeneity_vs_vigour.png"
        }
    ]
    available = [c for c in charts if (MULTISPECTRAL_VIZ_DIR / c["filename"]).exists()]
    return jsonify(available)


@app.route("/api/multispectral/visualizations/<path:filename>")
def serve_multispectral_visualization(filename):
    """Safely serve pre-generated multispectral visualization PNGs."""
    if not MULTISPECTRAL_VIZ_DIR.is_dir():
        abort(404)
    candidate = MULTISPECTRAL_VIZ_DIR / filename
    if not candidate.is_file():
        abort(404)
    return send_from_directory(MULTISPECTRAL_VIZ_DIR, filename)



# -------------------------------------------------------------------------
# Final Multi-Source Evidence Consolidation Endpoints
# -------------------------------------------------------------------------
EVIDENCE_REGISTRY_FILE = OUTPUT_DIR / "multi_source_evidence_registry.json"


@app.route("/api/multi-source/summary")
def multi_source_summary_data():
    """Return consolidated high-level status of the three independent evidence pillars."""
    summary = {
        "palm": {
            "status": "available",
            "level": "block",
            "block_count": 42,
            "description": "42 plantation blocks with monthly yield, foliar nutrients, and DRIS diagnostic observations.",
            "provenance": "Oil Palm Plantation Division A (Native Operational System)",
            "land_cover": "Commercial Oil Palm Plantation (Elaeis guineensis)",
            "period": "2012–2024",
            "block_mapping": "native",
            "block_mapping_status": "mapped",
            "risk_engine": "canonical",
            "risk_role": "Core Canonical Risk Model (100%)",
            "risk_contribution_pct": 100.0,
            "primary_indicators": ["Productivity_t_Ha", "FFB_Production_t", "Yield_Gap_pct", "Foliar_Nutrients", "DRIS_Indices"]
        },
        "rgb_drone": {
            "status": "available",
            "level": "image",
            "image_count": 500,
            "total_palms_detected": 43599,
            "provenance": "MOPAD Site 2 Benchmark (Oil Palm Canopy Aerial RGB)",
            "land_cover": "Oil Palm Canopy (Visual Aerial RGB Benchmark)",
            "health_score_available": True,
            "mean_health_score": 75.81,
            "median_health_score": 89.19,
            "block_mapping": "unavailable",
            "block_mapping_status": "unmapped",
            "risk_role": "Independent Visual Evidence (0% of Canonical Risk)",
            "risk_contribution_pct": 0.0,
            "primary_indicators": ["Healthy_Palms", "Small_Palms", "Yellow_Palms", "Dead_Palms", "Drone_Health_Score"]
        },
        "multispectral": {
            "status": "available",
            "level": "tile",
            "tile_count": 34,
            "provenance": "MSUAV500K Benchmark (Hullerbusch Beech Forest, Germany — Zenodo Record 16743975)",
            "land_cover": "Temperate Deciduous Beech Forest (German Benchmark — NOT Oil Palm)",
            "is_oil_palm_data": False,
            "ndvi_available": True,
            "ndre_available": True,
            "mhs_available": True,
            "mean_mhs": 92.00,
            "mean_ndvi": 0.8977,
            "mean_ndre": 0.5129,
            "mean_canopy_cover": 93.62,
            "block_mapping": "unavailable",
            "block_mapping_status": "unmapped",
            "risk_role": "Independent Spectral Benchmark (0% of Canonical Risk)",
            "risk_contribution_pct": 0.0,
            "primary_indicators": ["Canopy_NDVI", "Canopy_NDRE", "Canopy_Cover_pct", "Canopy_Uniformity", "MHS_Score"]
        },
        "coverage_matrix": {
            "agronomic_blocks": {
                "source": "Palm Agronomic Records",
                "total_units": 42,
                "unit_type": "Blocks (B001–B042)",
                "mapped_units": 42,
                "unmapped_units": 0,
                "mapping_status": "VERIFIED_MAPPED",
                "provenance": "Native Oil Palm Plantation (Division A, 2012–2024)",
                "risk_contribution_pct": 100.0,
                "risk_status": "ACTIVE_CANONICAL"
            },
            "drone_imagery": {
                "source": "RGB Drone Imagery",
                "total_units": 500,
                "unit_type": "Aerial Images (43,599 Palms)",
                "mapped_units": 0,
                "unmapped_units": 500,
                "mapping_status": "UNMAPPED_BENCHMARK",
                "provenance": "MOPAD Site 2 Benchmark",
                "risk_contribution_pct": 0.0,
                "risk_status": "ISOLATED_INDEPENDENT"
            },
            "multispectral_tiles": {
                "source": "Multispectral UAV Rasters",
                "total_units": 34,
                "unit_type": "Calibrated GeoTIFF Tiles (8.91M Pixels)",
                "mapped_units": 0,
                "unmapped_units": 34,
                "mapping_status": "UNMAPPED_BENCHMARK",
                "provenance": "MSUAV500K Beech Forest Benchmark (Hullerbusch, Germany)",
                "risk_contribution_pct": 0.0,
                "risk_status": "ISOLATED_INDEPENDENT"
            }
        },
        "fusion_status": {
            "direct_row_level_fusion": False,
            "spatial_fusion": False,
            "risk_score_fusion": False,
            "reason": "No validated spatial linkage between UAV imagery and plantation Block_ID is available. MSUAV500K multispectral data is a German beech-forest benchmark."
        },
        "gis_readiness_checklist": [
            {
                "id": "boundaries",
                "item": "Plantation Block Boundaries",
                "requirement": "Authoritative vector polygon boundaries (ESRI Shapefile / GeoJSON) for all 42 operational blocks (B001–B042).",
                "status": "MISSING / REQUIRED",
                "ready": False
            },
            {
                "id": "crs",
                "item": "Coordinate Reference System (CRS)",
                "requirement": "Standard projected spatial reference system (e.g. WGS84 UTM Zone / EPSG code) for both vector GIS layers and UAV flight surveys.",
                "status": "MISSING / REQUIRED",
                "ready": False
            },
            {
                "id": "georeferenced_imagery",
                "item": "Georeferenced Oil-Palm Imagery",
                "requirement": "Calibrated multi-band orthomosaics with sub-meter geospatial accuracy and embedded Ground Control Points (GCPs) flown over the oil-palm plantation.",
                "status": "MISSING / REQUIRED",
                "ready": False
            },
            {
                "id": "timestamps",
                "item": "Flight Telemetry & Synchronized Timestamps",
                "requirement": "UAV flight mission logs with GPS positioning and acquisition timestamps synchronized with monthly FFB harvesting and annual Frond 17 foliar sampling rounds.",
                "status": "MISSING / REQUIRED",
                "ready": False
            },
            {
                "id": "block_identifiers",
                "item": "Verified Block Identifier Lookup",
                "requirement": "Verified spatial join or lookup table linking UAV image footprints/rasters directly to operational plantation block IDs B001–B042.",
                "status": "MISSING / REQUIRED",
                "ready": False
            }
        ],
        "future_requirements": [
            "Estate Block GIS boundaries",
            "Georeferenced UAV orthomosaics",
            "Synchronized UAV telemetry or acquisition timestamps"
        ]
    }
    return jsonify(summary)


@app.route("/api/multi-source/evidence")
def multi_source_evidence_data():
    """Return compact evidence registry matrix for executive scientific consolidation."""
    matrix = {
        "architecture": "Decoupled Multi-Pillar Evidence Architecture",
        "evidence_sources": [
            {
                "source_id": "palm",
                "name": "Palm Agronomic Evidence",
                "granularity": "Block",
                "coverage": "42 Plantation Blocks (2012–2024)",
                "provenance": "Oil Palm Plantation Division A (Native Records 2012–2024)",
                "provenance_badge": "Native Plantation Data",
                "is_oil_palm_data": True,
                "main_indicators": "FFB, Productivity, Nutrients, DRIS",
                "indicators_list": ["FFB Production", "Actual vs Expected Productivity", "Foliar Nutrients (N, P, K, Ca, Mg, B)", "DRIS Indices"],
                "block_mapping": "Available",
                "mapping_status": "mapped",
                "participates_in_canonical_risk": True,
                "risk_role": "Core Canonical Risk Model (100%)",
                "risk_weight_pct": 100.0,
                "status": "AVAILABLE"
            },
            {
                "source_id": "rgb_drone",
                "name": "RGB Drone Evidence",
                "granularity": "Image",
                "coverage": "500 Survey Images (MOPAD Site 2)",
                "provenance": "MOPAD Site 2 Benchmark (Oil Palm Canopy RGB)",
                "provenance_badge": "RGB Benchmark",
                "is_oil_palm_data": True,
                "main_indicators": "Healthy, Small, Yellow, Dead, Drone Health Score",
                "indicators_list": ["YOLO11n Palm Detections", "Canopy Mortality / Stunting", "Drone Health Score"],
                "block_mapping": "Unavailable",
                "mapping_status": "unmapped",
                "participates_in_canonical_risk": False,
                "risk_role": "Independent Visual Evidence (0%)",
                "risk_weight_pct": 0.0,
                "status": "AVAILABLE"
            },
            {
                "source_id": "multispectral",
                "name": "Multispectral UAV Evidence (MSUAV500K Benchmark)",
                "granularity": "Tile",
                "coverage": "34 Calibrated 5-Band GeoTIFFs (Hullerbusch, Germany)",
                "provenance": "MSUAV500K Benchmark (Hullerbusch Beech Forest, Germany — Zenodo Record 16743975)",
                "provenance_badge": "German Beech Forest Benchmark",
                "is_oil_palm_data": False,
                "land_cover": "Temperate Deciduous Beech Forest (NOT Oil Palm)",
                "main_indicators": "NDVI, NDRE, Canopy Cover, MHS",
                "indicators_list": ["Calibrated NDVI", "Calibrated NDRE", "Canopy Coverage %", "Canopy Uniformity", "Multispectral Health Score (MHS)"],
                "block_mapping": "Unavailable",
                "mapping_status": "unmapped",
                "participates_in_canonical_risk": False,
                "risk_role": "Independent Spectral Benchmark (0%)",
                "risk_weight_pct": 0.0,
                "status": "AVAILABLE"
            }
        ],
        "coverage_summary": {
            "agronomic_blocks": {"total": 42, "mapped": 42, "unmapped": 0, "status": "VERIFIED_MAPPED", "risk_contribution_pct": 100.0},
            "drone_imagery": {"total_images": 500, "mapped": 0, "unmapped": 500, "status": "UNMAPPED_BENCHMARK", "risk_contribution_pct": 0.0},
            "multispectral_tiles": {"total_tiles": 34, "mapped": 0, "unmapped": 34, "status": "UNMAPPED_BENCHMARK", "risk_contribution_pct": 0.0}
        },
        "gis_readiness_checklist": [
            {
                "id": "boundaries",
                "item": "Plantation Block Boundaries",
                "requirement": "Authoritative vector polygon boundaries (ESRI Shapefile / GeoJSON) for all 42 operational blocks (B001–B042).",
                "status": "MISSING / REQUIRED",
                "ready": False
            },
            {
                "id": "crs",
                "item": "Coordinate Reference System (CRS)",
                "requirement": "Standard projected spatial reference system (e.g. WGS84 UTM Zone / EPSG code) for both vector GIS layers and UAV flight surveys.",
                "status": "MISSING / REQUIRED",
                "ready": False
            },
            {
                "id": "georeferenced_imagery",
                "item": "Georeferenced Oil-Palm Imagery",
                "requirement": "Calibrated multi-band orthomosaics with sub-meter geospatial accuracy and embedded Ground Control Points (GCPs) flown over the oil-palm plantation.",
                "status": "MISSING / REQUIRED",
                "ready": False
            },
            {
                "id": "timestamps",
                "item": "Flight Telemetry & Synchronized Timestamps",
                "requirement": "UAV flight mission logs with GPS positioning and acquisition timestamps synchronized with monthly FFB harvesting and annual Frond 17 foliar sampling rounds.",
                "status": "MISSING / REQUIRED",
                "ready": False
            },
            {
                "id": "block_identifiers",
                "item": "Verified Block Identifier Lookup",
                "requirement": "Verified spatial join or lookup table linking UAV image footprints/rasters directly to operational plantation block IDs B001–B042.",
                "status": "MISSING / REQUIRED",
                "ready": False
            }
        ],
        "fusion_status": {
            "direct_row_level_fusion": False,
            "spatial_fusion": False,
            "risk_score_fusion": False,
            "reason": "No validated spatial linkage between UAV imagery and plantation Block_ID is available. MSUAV500K multispectral data is a German beech-forest benchmark."
        },
        "scientific_disclaimer": "Current UAV datasets cannot be spatially assigned to Palm Plantation Block_ID because validated GIS boundaries, standardized CRS, and georeferenced cross-source linkage are unavailable. Existing MSUAV500K multispectral data is a scientific benchmark collected over a German beech forest in Hullerbusch (Zenodo Record 16743975), not oil-palm plantation data. Therefore, RGB and multispectral evidence is presented independently and is not included in the canonical Palm block-risk score (0% weight). Canonical block risk is driven 100% by verified agronomic evidence."
    }
    return jsonify(matrix)


@app.route("/api/dataset-compatibility")
def dataset_compatibility():
    """Return comprehensive multi-source dataset audit and compatibility report."""
    report_file = OUTPUT_DIR / "dataset_compatibility_report.json"
    if report_file.exists():
        try:
            with open(report_file, "r", encoding="utf-8") as f:
                return jsonify(json.load(f)), 200
        except Exception as e:
            app.logger.warning("Failed to read dataset compatibility report: %s", e)
    return jsonify({
        "status": "unavailable",
        "message": "Dataset compatibility report is being compiled or not generated yet."
    }), 200


@app.route("/api/recommendations/<block_id>", methods=["GET", "POST"])
def block_recommendations(block_id):
    """Generate secure, evidence-grounded agronomic recommendations for a specific block.
    
    Adheres strictly to the scientific boundary guidelines:
    - Grounded 100% on verified block observations (yield, foliar panel, DRIS, soil).
    - If OPENAI_API_KEY is configured in the environment, synthesizes via OpenAI with timeout and cost controls.
    - If OPENAI_API_KEY is not configured or fails/times out, seamlessly uses the deterministic rule engine.
    - Clearly distinguishes observed facts, model predictions, and AI-generated suggestions.
    - Never invents diseases, unmeasured deficiencies, or chemical dosages.
    - Preserves canonical screening scores as the immutable source of truth.
    - If evidence is insufficient, explicitly returns an insufficient-evidence response.
    """
    canonical = load_canonical_risk()
    norm_id = str(block_id).strip().upper()
    if norm_id not in canonical:
        return jsonify({
            "error": f"Block '{block_id}' not found in plantation records",
            "status": 404
        }), 404

    b = canonical[norm_id]
    prod = b.get("production_evidence", {})
    agron = b.get("agronomic_evidence", {})
    leaf = agron.get("leaf_nutrients", {})
    dris = agron.get("dris_indicators", {})
    soil = agron.get("soil_indicators", {})
    weather = b.get("weather_evidence", {})
    risk_level = b.get("risk_level", "LOW")
    risk_score = b.get("overall_risk_score", 0.0)

    actual_yield = prod.get("Productivity_t_Ha") or prod.get("actual_yield_t_ha")
    expected_yield = prod.get("High_Production_threshold_t") or prod.get("expected_yield_t_ha")
    yield_gap = prod.get("Productivity_deviation") or prod.get("yield_gap_pct")
    plant_age = agron.get("Plant_Age_Years", 12)
    seed_type = agron.get("Seed_Type", "DxP Tenera")

    panel = leaf.get("panel", {})
    low_nutrients = leaf.get("low_nutrients", [])
    leaf_year = leaf.get("sample_year", 2024)

    limiting = dris.get("limiting_nutrients", [])
    excess = dris.get("excess_nutrients", [])
    prescription = dris.get("prescription", "Maintain balanced fertilizer application.")

    actual_str = f"{actual_yield:.2f} t/ha" if actual_yield is not None else "Unrecorded"
    expected_str = f"{expected_yield:.2f} t/ha" if expected_yield is not None else "Cohort baseline"
    gap_str = f"{yield_gap:+.1f}%" if yield_gap is not None else "N/A"
    score_val = float(risk_score) if risk_score is not None else 0.0

    # Explicit Insufficient Evidence Evaluation:
    # If a block has no recorded yield AND fewer than 3 measured nutrients, evidence is insufficient.
    if actual_yield is None and len(panel) < 3:
        return jsonify({
            "block_id": norm_id,
            "risk_level": "UNKNOWN",
            "risk_score": None,
            "source": "deterministic_engine",
            "model": "canonical_agronomic_rules",
            "is_ai_generated": False,
            "insufficient_evidence": True,
            "insufficient_evidence_reason": f"Block {norm_id} lacks minimum empirical telemetry (no recorded harvest yield and fewer than 3 foliar nutrients) to formulate an agronomic recommendation.",
            "note": "Insufficient field telemetry. Ground measurement required.",
            "observed_facts": [
                f"2024 FFB Yield: Unrecorded",
                f"Foliar Nutrients: {len(panel)} measured (minimum 3 required for screening)",
                f"Soil Status: {str(soil.get('status', 'unavailable')).title()}"
            ],
            "model_predictions": [
                "Screening Score: Unavailable (insufficient data)",
                "Risk Band: UNKNOWN"
            ],
            "recommendation": {
                "priority": "Routine",
                "urgency": "Deferred pending measurement",
                "main_contributing_indicators": "Data insufficiency",
                "observed_finding": f"Block {norm_id} lacks sufficient empirical observations for agronomic diagnosis.",
                "agronomic_rationale": "Field recommendations require verified yield scale records or multi-nutrient foliar laboratory assays.",
                "recommended_action": "Schedule comprehensive baseline field census, bunch count, and Frond 17 tissue sampling.",
                "validation_protocol": "Establish baseline harvest scale and laboratory foliar sampling protocols.",
                "data_coverage_limitations": ["Insufficient field telemetry for diagnostic analysis."]
            },
            "evidence_grounding": []
        }), 200

    # 1. Compile immutable observed facts
    observed_facts = [
        f"2024 FFB Yield: {actual_str}",
        f"Foliar Assay ({leaf_year}): N={panel.get('N_pct', 'N/A')}%, P={panel.get('P_pct', 'N/A')}%, K={panel.get('K_pct', 'N/A')}%, Ca={panel.get('Ca_pct', 'N/A')}%, Mg={panel.get('Mg_pct', 'N/A')}%, B={panel.get('B_ppm', 'N/A')} ppm",
        f"Foliar Deficiencies: {', '.join(low_nutrients) if low_nutrients else 'None below standard reference thresholds'}",
        f"DRIS Nutritional Imbalance: Limiting={', '.join(limiting) if limiting else 'None'}, Excess={', '.join(excess) if excess else 'None'}",
        f"Soil Status: {str(soil.get('status', 'unavailable')).title()} ({soil.get('note', 'No soil survey recorded for this block')})",
        f"Estate Weather Context: Rainfall {weather.get('Rainfall_mm_day', 'N/A')} mm/day, Temp {weather.get('Temperature_C', 'N/A')} °C (Excluded from block score)",
    ]

    # 2. Compile model predictions
    model_predictions = [
        f"Canonical Screening Score: {score_val:.1f} / 100",
        f"Screening Risk Band: {risk_level} (Low <40, Medium 40–<70, High ≥70)",
        f"Age-Peer Cohort Expected Yield: {expected_str} (Yield Gap: {gap_str})",
        f"High Production Probability: {prod.get('High_Production_probability', 0.50):.2f}",
    ]

    evidence_grounding = [
        {"layer": "Production / FFB", "source": "outputs/block_health_risk.csv", "year": 2024, "status": "Observed"},
        {"layer": "Foliar Tissue", "source": "outputs/block_nutrient_diagnostics.csv", "year": leaf_year, "status": "Observed"},
        {"layer": "DRIS Prescription", "source": "outputs/dris_prescription_analysis.csv", "year": dris.get("sample_year", 2024), "status": "Diagnostic"},
        {"layer": "Multi-Source Canonical", "source": "outputs/multi_source_block_risk.csv", "year": 2024, "status": "Screening Model"},
    ]

    # 3. Determine priority and urgency
    priority = "Critical" if risk_level == "HIGH" else "Moderate" if risk_level == "MEDIUM" else "Routine"
    urgency = "Immediate (Within 48 hours)" if priority == "Critical" else "Elevated (Within 14 days)" if priority == "Moderate" else "Routine (Scheduled Quarterly Review)"
    main_indicators = b.get("risk_contributor") or (f"Yield gap: {gap_str}" if yield_gap is not None else "Balanced cohort trend")

    # 4. Data Coverage Limitations
    limitations = []
    if panel.get("B_ppm") is None or panel.get("B_ppm") == "" or panel.get("B_ppm") == "N/A":
        limitations.append("Boron (B) foliar measurement unrecorded for this sample round.")
    if soil.get("status") != "observed":
        limitations.append("No block-specific soil sample; estate chemical soil survey covered 7 index blocks only.")
    limitations.append("Weather observations are estate-wide station averages; excluded from block discrimination.")
    limitations.append("Drone RGB and multispectral UAV imagery are unmapped research benchmarks; excluded from block score.")

    # 5. Supporting observations dictionary
    supporting_observations = {
        "yield_observation": {
            "actual_yield_t_ha": actual_yield,
            "expected_yield_t_ha": expected_yield,
            "yield_gap_pct": yield_gap,
            "observation_year": 2024,
            "source": "outputs/block_health_risk.csv"
        },
        "foliar_observation": {
            "sample_year": leaf_year,
            "panel": panel,
            "low_nutrients": low_nutrients,
            "source": "outputs/block_nutrient_diagnostics.csv"
        },
        "dris_observation": {
            "sample_year": dris.get("sample_year", 2024),
            "limiting_nutrients": limiting,
            "excess_nutrients": excess,
            "prescription": prescription,
            "source": "outputs/dris_prescription_analysis.csv"
        },
        "soil_observation": {
            "status": str(soil.get("status", "unavailable")),
            "note": soil.get("note", "No soil survey recorded for this block"),
            "sample_year": soil.get("sample_year"),
            "source": "data/raw_source/soil_sampling_event.csv"
        },
        "weather_context": {
            "rainfall_mm_day": weather.get("Rainfall_mm_day"),
            "temperature_c": weather.get("Temperature_C"),
            "status": "Contextual estate-level average (excluded from block score)"
        }
    }

    # 6. Check for OpenAI API Key
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    ai_generated = False
    source_name = "deterministic_engine"
    model_name = "canonical_agronomic_rules"
    note = "Deterministic agronomic engine active. Set OPENAI_API_KEY in the server environment to enable live LLM synthesis."

    finding = ""
    rationale = ""
    action = ""
    validation = ""

    if openai_key:
        try:
            import urllib.request
            import urllib.error

            system_prompt = (
                "You are an enterprise commercial oil-palm agronomist assistant. Ground your response STRICTLY "
                "on the verified facts provided below. Do NOT invent diseases (e.g. Ganoderma, bud rot), unmeasured deficiencies, "
                "proprietary chemical doses, or imaginary field measurements. If data is sparse or unavailable (e.g. soil tests), "
                "explicitly state that field verification or sampling is required first. Keep response concise, manager-friendly, "
                "and actionable. Return exactly 4 clear lines prefixed with:\n"
                "FINDING: <1-2 sentences on observed condition>\n"
                "RATIONALE: <1-2 sentences on agronomic cause grounded in data>\n"
                "ACTION: <1-2 sentences on recommended immediate next step>\n"
                "VALIDATION: <1 sentence on follow-up verification measurement>"
            )

            user_prompt = (
                f"Block: {norm_id}\n"
                f"Risk Level: {risk_level} (Score: {score_val:.1f}/100)\n"
                f"Planted: {b.get('identity', {}).get('Planting_Year', 2012)} ({plant_age} yrs, {seed_type})\n"
                f"Observed Yield: {actual_str} (Gap: {gap_str} vs Expected: {expected_str})\n"
                f"Foliar Nutrients: {panel}\n"
                f"Deficient Nutrients: {low_nutrients}\n"
                f"DRIS Limiting: {limiting}, Excess: {excess}\n"
                f"DRIS Prescription: {prescription}\n"
                f"Soil Status: {soil.get('status')} - {soil.get('note')}\n"
            )

            req_payload = json.dumps({
                "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.2,
                "max_tokens": 300,
            }).encode("utf-8")

            req = urllib.request.Request(
                "https://api.openai.com/v1/chat/completions",
                data=req_payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {openai_key}"
                },
                method="POST"
            )

            with urllib.request.urlopen(req, timeout=8.0) as resp:
                if resp.status == 200:
                    api_data = json.loads(resp.read().decode("utf-8"))
                    content = api_data["choices"][0]["message"]["content"].strip()
                    lines = content.splitlines()
                    for line in lines:
                        if line.startswith("FINDING:"):
                            finding = line.replace("FINDING:", "").strip()
                        elif line.startswith("RATIONALE:"):
                            rationale = line.replace("RATIONALE:", "").strip()
                        elif line.startswith("ACTION:"):
                            action = line.replace("ACTION:", "").strip()
                        elif line.startswith("VALIDATION:"):
                            validation = line.replace("VALIDATION:", "").strip()

                    if finding and action:
                        ai_generated = True
                        source_name = "openai"
                        model_name = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
                        note = "AI synthesis generated via OpenAI API and strictly grounded on verified block telemetry."
        except Exception as exc:
            app.logger.warning("OpenAI API call failed or timed out: %s. Using deterministic fallback.", exc)

    # Deterministic fallback synthesis if OpenAI was not used or failed
    if not ai_generated:
        if risk_level == "HIGH":
            gap_display = f"{abs(yield_gap):.1f}% below expectation" if yield_gap is not None else "severe productivity deficit"
            finding = f"Block {norm_id} is operating in high-priority lag with canonical risk score {score_val:.1f}/100 and yield {gap_display}."
            lim_str = f"DRIS identifies {', '.join(limiting)} limitation." if limiting else "Productivity gap is the primary constraint."
            rationale = f"Observed production of {actual_str} correlates with nutritional stress. {lim_str} {prescription}"
            action = f"Convene joint agronomy audit for Block {norm_id}. Review weed circle cleanliness, check field drainage channels, and execute prescribed foliar balancing: {prescription}."
            validation = "Target quarterly bunch census count and conduct Frond 17 foliar re-sampling at 60–90 days."
        elif risk_level == "MEDIUM":
            finding = f"Block {norm_id} shows moderate variance with canonical risk score {score_val:.1f}/100 and yield of {actual_str}."
            rationale = f"Foliar diagnostic flags {', '.join(low_nutrients) if low_nutrients else 'mild imbalance'}. {prescription}"
            action = f"Verify field application logs for Block {norm_id} and schedule spot canopy greenness inspection. Follow recommendation: {prescription}."
            validation = "Monitor monthly bunch delivery weights across the upcoming harvest rounds."
        else:
            finding = f"Block {norm_id} is operating within normal operational parameters (Risk Score: {score_val:.1f}/100, Yield: {actual_str})."
            rationale = "Nutritional ratios and yield trends align with age-cohort expectations with no critical limiting constraints."
            action = "Maintain scheduled routine maintenance, weed circle upkeep, and standard fertilizer broadcast rounds."
            validation = "Routine annual foliar assay and standard monthly yield tracking."

    return jsonify({
        "block_id": norm_id,
        "risk_level": risk_level,
        "risk_score": risk_score,
        "source": source_name,
        "model": model_name,
        "is_ai_generated": ai_generated,
        "insufficient_evidence": False,
        "note": note,
        "observed_facts": observed_facts,
        "model_predictions": model_predictions,
        "recommendation": {
            "priority": priority,
            "urgency": urgency,
            "main_contributing_indicators": main_indicators,
            "observed_finding": finding,
            "agronomic_rationale": rationale,
            "recommended_action": action,
            "validation_protocol": validation,
            "data_coverage_limitations": limitations
        },
        "supporting_observations": supporting_observations,
        "data_coverage_limitations": limitations,
        "evidence_grounding": evidence_grounding
    })


if __name__ == "__main__":

    app.run(
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "5000")),
        debug=False,
    )
