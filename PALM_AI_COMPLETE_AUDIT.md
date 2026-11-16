# PALM AI â€“ Comprehensive Technical Audit Report

**System Name**: Palm AI (Plantation Intelligence Platform)
**Repository**: https://github.com/raagul-vc/Palm_AI
**Current Branch**: `main`
**Audit Date**: November 16, 2026
**Auditor**: Antigravity Technical Audit & Production Engineering Team
**Audit Classification**: Full System Technical Audit (Pre-Production Hardening)

---

## 1. Executive Summary

A comprehensive, end-to-end technical audit was conducted on the Palm AI repository. The platform provides commercial plantation intelligence across 42 operational oil palm blocks (B001â€“B042), integrating historical FFB production (2012â€“2024), foliar nutrient laboratory assays, DRIS nutritional indices, soil surveys, estate weather telemetry, machine learning yield forecasts, and independent UAV demonstration modules (RGB Drone YOLO11n and MicaSense Altum multispectral benchmark).

The audit verified that the core scientific foundationsâ€”specifically the **Decoupled Multi-Source Evidence Architecture**â€”are mathematically sound and preserve rigorous scientific integrity. Several critical security vulnerabilities, workflow bypasses, deployment configuration issues, and frontend lint warnings were identified and analyzed.

---

## 2. Existing Functionality Audit

### 2.1 Frontend React Application (`frontend/src/`)
* **Framework**: React 19.2.8 + Vite 8.3.0 + Recharts 3.10.1 + Lucide React 1.48.0.
* **Component Inventory**:
  * `App.jsx`: Root controller managing top-level views (`estates`, `blocks`, `field-actions`, `multi-source`, `drone-health`, `multispectral`), global session state, and dataset ingestion.
  * `EstateCommandCenter.jsx`: High-level operational command deck for Division A (42 blocks), risk distribution KPIs (1 High, 6 Medium, 35 Low), productivity metrics, and estate directives.
  * `UnifiedBlockIntelligence.jsx`: All-in-one comprehensive block intelligence screen displaying 7 synchronized analysis sections for the selected block (B001â€“B042).
  * `FieldActionCenter.jsx`: Ground inspection resolution center tracking agronomic directives and field inspector findings.
  * `MultiSourceEvidencePage.jsx`: Evidence registry transparently displaying provenance and coupling status of the 3 evidence pillars.
  * `DroneHealthPage.jsx`: RGB aerial survey viewer featuring YOLO11n crown detection, class distribution, outlier analysis, and interactive inference.
  * `MultispectralHealthPage.jsx`: 5-band Altum GeoTIFF raster viewer computing NDVI/NDRE canopy vigour and heterogeneity.
  * `LoginPortal.jsx` & `AuthManager.jsx`: Enterprise RBAC authentication and role management.
  * `RoleDashboard.jsx`: Role-specific action deck.

### 2.2 Flask Backend APIs (`backend/api.py`)
* **Framework**: Flask 3.1.3 + Gunicorn 26.2.0 + Flask-CORS 6.0.5.
* **Endpoints**: 50+ REST endpoints serving JSON data, model forecasts, CSV-backed metrics, and live PyTorch/YOLO inference.
* **Data Serialization**: Pandas/NumPy missing values strictly serialized as JSON `null` rather than nonstandard `NaN` tokens.

### 2.3 Database & Persistence Layer (`backend/database.py`)
* **Storage Engine**: SQLite3 (`data/palm_ai.db`).
* **Schema**:
  * `users`: PBKDF2-HMAC-SHA256 password hash, unique salt, role (`ADMIN`, `MANAGER`, `WORKER`), estate/block permissions, active status.
  * `sessions`: Token-based sessions with 7-day expiration.
  * `field_tasks`: Operational directives, status lifecycle, checklist, evidence requirements, worker findings, manager reviews.
  * `task_audit_log`: Immutable timeline of all task state transitions.
  * `audit_events`: System-level authentication and security logging.

### 2.4 Risk Calculation Engine (`backend/canonical_risk_engine.py`, `backend/multi_source_risk.py`)
* **Formula**:
  $$\text{Multi-Source Risk Score} = \frac{\sum (\text{Component}_i \times \text{Weight}_i)}{\sum \text{Available Weights}}$$
  * Base weights: Yield Risk = 40%, Foliar Nutrient Risk = 25%, DRIS Imbalance Risk = 15%.
  * Dynamic weight renormalization ensures scores remain strictly within $[0, 100]$.
  * Risk categories: HIGH ($\ge 70$), MEDIUM ($40 - <70$), LOW ($< 40$).
* **Evidence Policies**:
  * Weather is estate-wide; excluded from block risk discrimination (weight = 0%).
  * Soil is sparse (7 of 42 blocks); reported as observed where available and unavailable for the other 35 blocks without blind imputation.
  * UAV benchmarks (Pillars 2 & 3) contribute 0% weight to block risk.

### 2.5 Machine Learning Yield Forecasting (`models/yield_forecast_model.pkl`)
* **Model**: Scikit-Learn Random Forest regressor (39.5 MB).
* **Serving**: Served via cache `outputs/yield_forecast_cache.csv` for 2025â€“2026 block yield projections.
* **Validation**: Time-based backtest on held-out 2023â€“2024 production data.

### 2.6 Drone AI / YOLO11n Module (`drone/`)
* **Model**: Ultralytics YOLO11n (`drone/models/palm_yolo_best.pt`, 50 epochs, mAP50 = 0.9799).
* **Classes**: Dead, Healthy, Grass, Small, Yellow.
* **Drone Health Score**:
  $$\text{DHS} = \frac{\text{Healthy Palm Detections}}{\text{Total Palm Detections}} \times 100$$
* **Statistical Outliers**: 89 images identified by IQR lower fence ($< 28.34\%$).

### 2.7 Multispectral Analysis Module (`drone/multispectral/`)
* **Source**: MSUAV500K Altum 5-band benchmark (Hullerbusch, Germany).
* **Indices**:
  $$\text{NDVI} = \frac{\text{NIR} - \text{Red}}{\text{NIR} + \text{Red}}, \quad \text{NDRE} = \frac{\text{NIR} - \text{RedEdge}}{\text{NIR} + \text{RedEdge}}$$
* **Pure Canopy Mask**: $\text{NDVI} \ge 0.30$.

---

## 3. Confirmed Bugs & Root Cause Analysis

### BUG-01: Mock User Fallback in Task Management Endpoints
* **Severity**: High (Security Vulnerability)
* **Affected File**: `backend/api.py` (lines 1913â€“2035)
* **Root Cause**: `@optional_auth` was applied to `/api/tasks`, `/api/tasks/<task_id>`, `/api/tasks/<task_id>/submit`, and `/api/tasks/<task_id>/review`. When unauthenticated (`g.current_user is None`), the code defaulted to an artificial `USR-ANON` with `role: MANAGER` and wildcard `["*"]` permissions.
* **Impact**: Unauthenticated users could view and create field tasks, and unauthorized users could simulate worker submissions and manager approvals without providing credentials.

### BUG-02: Worker Wildcard Permission Bypass
* **Severity**: High (Authorization Flaw)
* **Affected File**: `backend/task_service.py` (line 40)
* **Root Cause**: In `list_tasks`, the SQL builder contained:
  ```python
  if "*" in allowed_blocks:
      query += " AND (t.assigned_to_user_id = ? OR 1=1)"
  ```
  The clause `OR 1=1` completely neutralized task scoping, allowing any worker with a wildcard in permissions to view all tasks in the estate.
* **Impact**: Violates operational worker isolation where workers must only view tasks assigned to them.

### BUG-03: Generic Task Update Bypass of Review Workflow
* **Severity**: Medium (State Machine Integrity)
* **Affected File**: `backend/api.py` (line 1974)
* **Root Cause**: `PATCH /api/tasks/<task_id>` allowed arbitrary updates to `status`, enabling a client to set `status = 'COMPLETED'` directly without submitting field findings or going through manager review.
* **Impact**: Bypassed audit trail and manager sign-off controls.

### BUG-04: Missing Assignee Check on Inspection Submission
* **Severity**: Medium (Authorization Flaw)
* **Affected File**: `backend/task_service.py` (line 270)
* **Root Cause**: `submit_task_inspection` verified that the task existed, but did not verify whether the submitting user was the worker assigned to that task.
* **Impact**: Any authenticated worker could submit findings on behalf of another worker.

### BUG-05: Missing Self-Review Prevention
* **Severity**: Medium (Separation of Duties)
* **Affected File**: `backend/task_service.py` (line 310)
* **Root Cause**: `review_task` did not check if the reviewer was also the assigned worker on the task.
* **Impact**: If a user held both roles or was assigned a field task, they could approve their own work.

### BUG-06: Hardcoded Port in Dockerfile Command
* **Severity**: Medium (Deployment Blocker on Render)
* **Affected File**: `Dockerfile` (line 36)
* **Root Cause**: `CMD ["python", "-m", "gunicorn", "backend.api:app", "--bind", "0.0.0.0:10000", ...]` used exec form with a hardcoded port. Render dynamically assigns a port via the `$PORT` environment variable. In exec form, `$PORT` is not expanded.
* **Impact**: On platforms where Render assigns a port other than 10000, container health checks fail and deployment stalls.

### BUG-07: Missing HTTP Security Headers
* **Severity**: Low (Security Best Practice)
* **Affected File**: `backend/api.py`
* **Root Cause**: Responses lacked standard security headers (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`).
* **Impact**: Potential vulnerability to MIME-sniffing and clickjacking.

### BUG-08: Zero-Palms and Outlier Handling in Live Drone Inference
* **Severity**: Low (Robustness)
* **Affected File**: `backend/api.py` (line 1101)
* **Root Cause**: When an uploaded survey tile contained zero palm detections, the endpoint returned `drone_health_score = 0.0` without clarifying that no palms were detected. In addition, single-image inference lacked outlier flagging based on baseline statistical thresholds ($< 28.34\%$).
* **Impact**: Users could confuse zero palm crowns with 100% diseased crowns.

### BUG-09: Unused Variables and Lint Warnings in Frontend
* **Severity**: Low (Code Quality)
* **Affected Files**: `frontend/src/RoleDashboard.jsx`, `frontend/src/LoginPortal.jsx`, `frontend/src/UnifiedBlockIntelligence.jsx`
* **Root Cause**: 110 oxlint warnings regarding unused Lucide icons, unused destructured parameters, and unused state declarations (`nutrientRadarData`, `actualArea`, `recError`).
* **Impact**: Cluttered codebase and unnecessary bundle overhead.

---

## 4. Scientific & Data Integrity Audit

| Verification Item | Specification Requirement | Audit Finding | Status |
| :--- | :--- | :--- | :--- |
| **Operational Blocks** | 42 blocks (B001â€“B042) | Master dataset contains exactly 42 blocks, B001 to B042. | **PASS** |
| **Monthly Records** | 6,552 records (2012â€“2024) | Exactly 6,552 rows across 13 years (156 months $\times$ 42 blocks). | **PASS** |
| **Duplicate Monthly Records** | 0 duplicate records | `duplicated(subset=['Block_ID', 'Year', 'Month_Number']) == 0`. | **PASS** |
| **Leaf Sampling Events** | 256 events (2015â€“2022) | Verified 256 events in `leaf_sampling_event.csv` and 293 block/sample-year combinations. | **PASS** |
| **Soil Sampling Coverage** | Exactly 7 blocks | Observed field soil samples exist for B004, B006, B008, B015, B026, B031, B041. 35 blocks marked Unavailable. | **PASS** |
| **Missing Boron (B)** | NaN preserved; not 0 | 11 blocks lack Boron measurements; stored as NaN / null; never converted to 0.0. | **PASS** |
| **Weather Independence** | Excluded from block risk | NASA POWER weather is estate-wide; weight = 0% in block risk. | **PASS** |
| **Risk Score Boundaries** | Strictly $[0, 100]$ | All 42 block scores bounded in $[0, 100]$. Fleet counts: 1 High, 6 Medium, 35 Low. | **PASS** |
| **RGB Drone Isolation** | MOPAD Site 2 benchmark | Unmapped to block IDs (0% weight). Clearly labeled as independent demonstration. | **PASS** |
| **Multispectral Provenance** | Hullerbusch Beech Forest | Unmapped to block IDs (0% weight). Labeled as "Technical Benchmark / Demonstration Only â€“ German Beech Forest Dataset". | **PASS** |

---

## 5. Deployment Audit (`render.yaml`, `Dockerfile`)

* **Multi-stage Docker Build**: Node 22 Alpine builds Vite frontend; Python 3.13-slim runs Gunicorn WSGI.
* **Render Root Directory**: `.`, Dockerfile at `./Dockerfile`.
* **Health Check**: `/api/health` returns HTTP 200 with service health status.
* **Non-root Execution**: Runs as non-root `appuser` (UID 10001).
* **Database Persistence**: SQLite database stored at `data/palm_ai.db`. Render persistent disk mounting documented and supported via `PALM_AI_DB_PATH`.

---

## 6. Audit Conclusion

All 9 confirmed bugs and vulnerabilities have been isolated and remediated. The existing architecture, datasets, models, and UI features remain intact and backward-compatible. Automated tests have been expanded to verify all security, data integrity, and workflow constraints.
