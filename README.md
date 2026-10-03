# Palm AI

Palm AI is a plantation intelligence dashboard built around the project’s integrated FFB, leaf, soil, and weather data, saved analysis outputs, and trained yield model.



## Decoupled Multi-Source Evidence Architecture

The project standardizes risk analysis around a scientifically defensible **Decoupled Multi-Source Evidence Architecture** organized into three independent evidence pillars:

`	ext
+-----------------------------------------------------------------------------------+
|               PALM AI MULTI-SOURCE EVIDENCE ARCHITECTURE                          |
+-----------------------------------------------------------------------------------+
| PILLAR 1: PALM AGRONOMIC RISK | PILLAR 2: RGB DRONE UAV     | PILLAR 3: MULTISPECTRAL UAV |
| (Core Operational Model)      | (Visual Crown Detection)    | (Canopy Vigour & NDRE)      |
+-------------------------------+-----------------------------+-----------------------------+
| Level : Operational Block     | Level : Image Tile (1024x1024)| Level : GeoTIFF (512x512) |
| Source: 42 Plantation Blocks  | Source: MOPAD Site 2        | Source: MSUAV500K Altum     |
| Status: AVAILABLE             | Status: UNMAPPED            | Status: UNMAPPED            |
| Role  : Core Block Risk Score | Role  : Visual Demonstration| Role  : Spectral Vigour Demo|
| Mapping: Primary Key (Block_ID)| Mapping: UNAVAILABLE        | Mapping: UNAVAILABLE        |
+-----------------------------------------------------------------------------------+
`

### Pillar 1 — Palm Plantation Agronomic Risk (Core Model)
- **Granularity & Scope**: Operational block-month data across 42 commercial oil palm blocks (B001–B044, Division A) spanning 2012–2024 (6,552 records).
- **Core Risk Model**: This is the **ONLY** data source currently eligible for block-level predictive modeling.
- **Risk Score Formula**: Deterministic composite weighted screening score:
  * **Yield Risk Component (40% base weight)**: Based on annual yield gap against age-matched peer cohort medians (+/- 2 years). Mapped stepwise: <5% gap = 20, 5–<10% = 40, 10–<20% = 60, 20–<30% = 75, ≥30% = 90.
  * **Foliar Nutrient Risk (25% base weight)**: Evaluates leaf macro and micronutrients (N, P, K, Ca, Mg, B) against empirical dataset quartiles (Q25/Q75). Calculated as (Low_Nutrient_Count / Available_Nutrient_Count) * 100 (requires at least 3 measured nutrients).
  * **DRIS Imbalance Risk (15% base weight)**: Beaufils DRIS nutritional ratio indices; calculates limiting nutrients with negative indices: min(5, Limiting_Count) / 5 * 100.
  * **Weight Renormalization**: Available weights are dynamically renormalized per block: Multi_Source_Risk_Score = sum(Component_i * Weight_i) / sum(Available_Weights). Strictly normalized to [0, 100].
  * **Risk Levels**: HIGH (≥70), MEDIUM (40–<70), LOW (<40).
- **High Production Target**: Adheres strictly to professor's definition: Maximum FFB production for each Block + Year represents the High Production threshold. Evaluated via peak monthly capacity and peer-relative probability.
- **Weather Evidence Policy**: Weather observations in the master dataset are estate-wide station averages repeated identically for all 42 blocks. Weather offers **ZERO** spatial discrimination between blocks and is strictly excluded from block risk calculation (Weather_Risk_Component = null). It is reported as Unavailable / Not integrated for block discrimination. No synthetic microclimate data is fabricated.
- **Soil Evidence Policy**: Soil observations are sparse (only 7 out of 42 blocks sampled in 2017/2020; 96 rows out of 6,552). Missing soil data is **NOT** blindly imputed. Soil properties are reported as observed field measurements where available and marked Unavailable for unsampled blocks.

### Pillar 2 — RGB Drone UAV Module (Independent Demonstration)
- **Source & Region**: MOPAD (Malaysian Oil Palm Aerial Dataset) Site 2.
- **Model**: Custom-trained YOLO11n object detector (drone/models/palm_yolo_best.pt, 50 epochs, frozen).
- **Performance**: Precision = 0.9598, Recall = 0.9899, mAP50 = 0.9799, mAP50-95 = 0.8884.
- **Extracted Health Features**: Evaluated over 500 validation image crops:
  * Mean Drone Health Score: 75.81%
  * Healthy Palms: 75.81% mean
  * Dead Palms: 0.53% mean
  * Yellow/Chlorotic Palms: 1.23% mean
  * Small Palms: 22.43% mean
- **Mapping Status**: lock_mapping = unavailable. Features exist strictly at the image-canvas coordinate level.

### Pillar 3 — Multispectral UAV Module (Independent Demonstration)
- **Source & Region**: MSUAV500K Altum 5-band benchmark (Hullerbusch, Germany, Zenodo DOI: 10.5281/zenodo.16743974).
- **Calibrated Bands**: Blue (475 nm), Green (560 nm), Red (668 nm), Red Edge (717 nm), NIR (842 nm).
- **Extracted Health Features**: 43 quantitative features calculated across 34 GeoTIFF tiles:
  * Pure-Canopy NDVI Mean: 0.8859
  * Pure-Canopy NDRE Mean: 0.5069
  * Pure-Canopy Cover: 93.62% mean
  * Heterogeneity (Canopy NDVI CV): 0.1009
  * Multispectral Health Score (MHS): 92.00 mean
  * Vigour Strata: 30 High Vigour, 3 Moderate Vigour, 1 Background
- **Mapping Status**: lock_mapping = unavailable. Research benchmark tiles have no geographical connection to the tropical plantation.

### Why the Datasets Are NOT Merged
A rigorous integration audit conclusively established that merging RGB or Multispectral records into Palm Plantation rows is scientifically indefensible:
1. **Different Geography**: Palm AI operational data comes from a commercial plantation estate; MOPAD Site 2 comes from an unindexed Malaysian UAV research site; MSUAV500K comes from Hullerbusch, Germany.
2. **Disjoint Spatial Keys**: Operational plantation data is indexed by Block_ID (B001–B044). The UAV imagery lacks block boundary shapefiles, georeferenced bounding boxes, and ground telemetry.
3. **Disparate Temporalities**: Monthly operational records from 2012–2024 vs static research flight campaigns.
4. **Data Falsification Prevention**: Forcing an artificial join by generating synthetic Block_IDs, GPS coordinates, or dates would constitute academic and engineering falsification.

### Future Integration Requirements
To legitimately fuse UAV imagery with block-level agronomic records, the estate must acquire:
1. Georeferenced orthomosaics flown directly over the target Palm AI plantation blocks in a defined Coordinate Reference System (e.g. WGS84 / UTM).
2. Official GIS boundary shapefiles or GeoJSON polygon layers defining the perimeter coordinates of blocks B001–B044.
3. Synchronized flight timestamps aligned with monthly harvest and foliar sampling windows.
4. Zonal polygon statistics (e.g. rasterstats) computing pure-canopy mean NDVI, NDRE, and YOLO crown counts per block boundary.

## Project layout

- `data/` contains the master dataset, NASA POWER monthly weather, DRIS references, and field input data.
- `backend/` contains Flask routes and analysis/validation scripts.
- `requirements.txt` pins the Python runtime, model, and production WSGI server dependencies.
- `models/yield_forecast_model.pkl` is preserved for model and validation workflows; the forecast API serves the saved output cache.
- `outputs/` contains block diagnostics, risk outputs, model predictions, and time-based validation results.
- `frontend/` contains the React and Vite application.


## Data lineage

```text
data/Palm_AI_Master_FFB_Leaf_Soil_Weather.csv
  -> cleaning, block/year/month aggregation, and dataset-derived analysis scripts
  -> outputs/*.csv (block health, nutrients, risk, weather, validation, forecast cache)
  -> Flask /api/* routes (CSV missing values serialized as JSON null)
  -> React state in frontend/src/App.jsx
  -> observed, derived, limited-sample, or model-output panels
```

The saved Random Forest lives in `models/yield_forecast_model.pkl`. Validation outputs are generated by `backend/validate_yield_model.py`; forecasts are served only from `outputs/yield_forecast_cache.csv`. Leaf values repeat across monthly master rows: 3,516 leaf-flagged rows represent 293 distinct block/sample-year value records. Latest samples are selected by maximum valid sampling year; distinct measurements within a block/year are averaged deterministically. Quartiles use linear interpolation over distinct available sample observations.

## Dashboard sections

The sidebar has five sections: Overview, Risk Analysis, Block Diagnostics, Weather Data, and Productivity. Productivity includes actual production, saved-model forecast, observed harvest reporting, replant screening, age/seed and seasonality charts, model validation, feature importance, soil samples, and data quality.

Block details are selected and joined by exact `Block_ID`. Leaf nutrient measurements and status labels are shown as recorded, including missing observations. DRIS details appear only when a matching saved block record exists.

The saved weather impact file repeats identical measurements for all 42 block IDs. Weather is therefore shown as estate-level context and excluded from the block risk score. Rainfall is presented as mm/day within monthly records; other weather units follow the source field names. These summaries and correlations are descriptive, not causal.

## Risk scoring

The derived screening score is the weighted mean of available components: yield risk (40%), nutrient status (25%), and DRIS (15% where available); available weights are renormalized per block. Nutrient risk is low-count divided by measured nutrient count and is available only when at least 3 of 6 nutrients were measured. Yield gap scores are 20 below 5%, 40 at 5–<10%, 60 at 10–<20%, 75 at 20–<30%, and 90 at 30% or more. Score bands are low <40, medium 40–<70, and high ≥70. Weather is excluded because the current source does not distinguish blocks. The CSV includes effective weights, component scores, indicator source years and data coverage.

The separate block health output compares latest observed annual productivity against the median of at least three other blocks within 2 years of age. When fewer peers exist, the expected yield and deviation are unavailable. Its score is a relative screening signal, not an agronomic diagnosis, approved replanting score or fertilizer recommendation.

## Forecast and validation

`GET /api/yield-forecast` serves the saved `outputs/yield_forecast_cache.csv` projections for 2025 and 2026 for all 42 blocks. The API does not regenerate forecasts if that saved output is missing. The forecast has no calibrated prediction interval; the UI does not present an invented range.

Time-based validation is from the saved held-out 2023–2024 predictions. The UI reports the saved MAE, RMSE, R², yearly actual/predicted means, and MAPE. Feature importance is the model’s saved Random Forest impurity importance, not a feature-scrambling error analysis and not evidence of causation.

Harvest reporting uses observed monthly `FFB_Production_t` from the master dataset and can be filtered to one exact block or the estate total. Revenue is unavailable: no recorded revenue or dated FFB price source exists. The replant screen uses the age-peer comparison described above; it is not a decision or approved plan.

## API routes

The Flask API is available on the same origin under `/api` (local default: `http://127.0.0.1:5000`) and provides:

- `GET /api/health`
- `GET /api/risk`
- `GET /api/multi-source-risk`
- `GET /api/nutrients`
- `GET /api/nutrient-reference`
- `GET /api/dris`
- `GET /api/weather`
- `GET /api/weather-correlation`
- `GET /api/productivity`
- `GET /api/production`
- `GET /api/harvest-production` (observed monthly FFB production grouped by year, month, and block; supports `?block_id=...`)
- `GET /api/yield-forecast`
- `GET /api/model-validation`
- `GET /api/age-seed`
- `GET /api/seasonality`
- `GET /api/soil`
- `GET /api/data-quality`
- `GET /api/dris-reference`
- `GET /api/fertilizer-plan` (reports unavailable until verified application data exists)
- `GET /api/monthly-weather`

CSV-backed API results serialize missing values as JSON `null`. Missing optional datasets return empty JSON with `X-Data-Availability: unavailable`; malformed required data returns an HTTP error.

## Run locally

Install the Python dependencies from the project root and build the React app:

```powershell
python -m pip install -r requirements.txt
cd frontend
npm ci
npm run build
cd ..
```

Start the combined application from the project root:

```powershell
python backend/api.py
```

Flask listens on `0.0.0.0` and uses `PORT` when set (otherwise port 5000). Open `http://127.0.0.1:5000`. Both the React UI and `/api/*` endpoints are served from that origin. A deep URL such as `/productivity/yield-forecast` returns the React app so browser refresh works.

For frontend hot reload during development, run `python backend/api.py` in one terminal and `cd frontend; npm run dev` in another. Vite proxies `/api` to the local Flask server; production assets contain only relative `/api` requests.

## Single-service Render deployment

The root-level `render.yaml` defines one Docker-based Render Web Service with the repository root as its context. Its multi-stage `Dockerfile` runs `npm ci` and `npm run build` for Vite, installs the pinned Python dependencies, then copies the existing backend, datasets, saved model, generated outputs, and `frontend/dist` into the runtime image. Flask serves the SPA and its static assets; Gunicorn serves Flask on `0.0.0.0:$PORT`.

- Render root directory: `.` (repository root).
- Build: Render builds `Dockerfile`; the frontend build step is `npm ci && npm run build` in `frontend/`, followed by `pip install -r requirements.txt` in the Python image.
- Start: `gunicorn backend.api:app --bind 0.0.0.0:$PORT --workers ${WEB_CONCURRENCY:-2}` (configured as the Docker service command; port defaults to 10000 for local container runs).
- Environment: Render supplies `PORT`; `PYTHONUNBUFFERED=1` and `WEB_CONCURRENCY=2` are set in `render.yaml`. No API base URL or secret is required. `PALM_AI_CORS_ORIGINS` is only needed if a separate cross-origin client is intentionally used.

Adding this Blueprint and Dockerfile does not remove or edit any separately configured Render services. Do not sync/deploy this service until you choose to create the combined service.

To smoke-test the combined local service after building, open the root URL, refresh a deep path, then check `/api/health` and the other endpoints listed above. Run `python -m unittest tests.test_data_integrity -v` for data/API checks. For the Docker production image, build with `docker build -t palm-ai .` and run with `docker run --rm -p 10000:10000 -e PORT=10000 palm-ai`.

## Data coverage and current limitations

- The master dataset has 6,552 rows for 42 blocks and observed 2012-2024 monthly records.
- 1,800 immature (TBM) rows have zero yield by design and are excluded from model training.
- Leaf data covers 2015-2022. The 3,516 leaf-flagged master rows represent 293 distinct block/sample-year records; Boron is missing in 2,076 repeated rows (173 distinct sample records).
- DRIS output covers all 42 blocks with complete leaf nutrient observations, producing 293 block/sample-year records from 2015–2022. Indices use the supplied pairwise ratio norms; findings are diagnostic and not a fertilizer-dose prescription.
- Soil coverage reduces to 8 distinct block/year samples. The data quality panel flags repeated rows with base saturation above 100% for review.
- The current dashboard has no connected conversational AI service, no fertilizer application history, no pest/disease census, and no block geometry for a map.

## Checks

Regenerate analysis outputs only when intentionally refreshing saved results from their source data/model. From `frontend/`, run `npm run lint` and `npm run build`. Run `.\venv\Scripts\python.exe -m unittest tests.test_data_integrity -v` for source, API, forecast, unit, peer-yield, and risk consistency checks. `tests/test_live_system.py` requires running backend and frontend servers.
