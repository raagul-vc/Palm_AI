# PALM AI – Fixes Applied & Implementation Verification

This document catalogs all fixes implemented across the Palm AI codebase during the technical audit, hardening, and production preparation.

---

### FIX-01: Enforcement of Strict Authentication on Task APIs
* **Issue ID**: BUG-01
* **Severity**: High (Security Vulnerability)
* **Root Cause**: `@optional_auth` in `backend/api.py` defaulted unauthenticated requests to a synthetic `USR-ANON` user with `role: MANAGER` and wildcard `["*"]` permissions.
* **File Changed**: [`backend/api.py`](file:///c:/Users/iRaagul/OneDrive/Documents/Airei/Palm_AI/backend/api.py#L1926-L2050)
* **Fix Applied**:
  - Replaced `@optional_auth` with `@require_auth` on `/api/tasks` (GET, POST), `/api/tasks/<task_id>` (GET, PATCH), `/api/tasks/<task_id>/submit` (POST), and `/api/tasks/<task_id>/review` (POST).
  - Removed all mock fallback user dictionaries (`USR-ANON`, `USR-WRK-01`, `USR-MGR-01`).
  - Unauthenticated requests now immediately return HTTP 401 with `{"error": "Unauthorized: Valid session token required. Please log in.", "code": "AUTH_REQUIRED"}`.
* **Test Performed**: `test_01_unauthenticated_task_access_denied` in `tests/test_security_audit_hardening.py`.
* **Test Result**: **PASS** (HTTP 401 returned across all task endpoints).
* **Remaining Limitation**: Unauthenticated frontend users must log in to view or manage tasks in the Field Action Center.

---

### FIX-02: Elimination of Worker Wildcard Permission Bypass
* **Issue ID**: BUG-02
* **Severity**: High (Authorization Flaw)
* **Root Cause**: In `backend/task_service.py` (`list_tasks`), if `user.get("block_permissions")` contained `*`, an `OR 1=1` clause was appended to the SQL query, granting workers access to all tasks across the estate.
* **File Changed**: [`backend/task_service.py`](file:///c:/Users/iRaagul/OneDrive/Documents/Airei/Palm_AI/backend/task_service.py#L35-L55)
* **Fix Applied**:
  - Rewrote role scoping in `list_tasks`: For `WORKER`, the query strictly enforces `t.assigned_to_user_id = ?`, binding `user["id"]`.
  - Removed `OR 1=1` clause completely. Workers can only see tasks explicitly assigned to their user ID.
  - In `backend/auth.py` (`check_block_access`), disallowed wildcard `*` bypass for workers.
* **Test Performed**: `test_02_worker_assigned_task_isolation` in `tests/test_security_audit_hardening.py`.
* **Test Result**: **PASS** (Worker 2 querying `/api/tasks` or `/api/tasks/TSK-B001-001` cannot view Worker 1's tasks).
* **Remaining Limitation**: None. Workers remain strictly isolated to their own assignments.

---

### FIX-03: Generic Task Status PATCH Workflow Bypass Prevention
* **Issue ID**: BUG-03
* **Severity**: Medium (State Machine Integrity)
* **Root Cause**: `PATCH /api/tasks/<task_id>` allowed arbitrary status mutations, allowing callers to skip field observation submission and manager sign-off by patching `status = "COMPLETED"`.
* **File Changed**: [`backend/api.py`](file:///c:/Users/iRaagul/OneDrive/Documents/Airei/Palm_AI/backend/api.py#L1980-L1990)
* **Fix Applied**:
  - Added strict status validation in `PATCH /api/tasks/<task_id>`.
  - Any attempt to set status to `SUBMITTED`, `APPROVED`, or `COMPLETED` via generic PATCH is rejected with HTTP 400 and `code: "WORKFLOW_VIOLATION"`.
  - Directs callers to use formal endpoints: `POST /api/tasks/<task_id>/submit` for submissions and `POST /api/tasks/<task_id>/review` for reviews.
* **Test Performed**: `test_05_generic_patch_cannot_bypass_review_workflow` in `tests/test_security_audit_hardening.py`.
* **Test Result**: **PASS** (HTTP 400 returned with WORKFLOW_VIOLATION code).
* **Remaining Limitation**: Status changes to terminal states must follow the verified two-step workflow.

---

### FIX-04: Worker Task Assignment Verification on Submissions
* **Issue ID**: BUG-04
* **Severity**: Medium (Authorization Flaw)
* **Root Cause**: `submit_task_inspection` did not check if the submitting user was the assigned worker.
* **File Changed**: [`backend/task_service.py`](file:///c:/Users/iRaagul/OneDrive/Documents/Airei/Palm_AI/backend/task_service.py#L275-L285)
* **Fix Applied**:
  - Added check: if `user["role"] == "WORKER" and row["assigned_to_user_id"] != user["id"]`, submission is rejected with HTTP 400: `"Forbidden: Workers may only submit inspection observations for tasks assigned to them."`.
* **Test Performed**: `test_03_worker_cannot_submit_unassigned_task` in `tests/test_security_audit_hardening.py`.
* **Test Result**: **PASS** (Cross-worker submission rejected).
* **Remaining Limitation**: None.

---

### FIX-05: Task Reviewer Separation of Duties (Self-Review Prevention)
* **Issue ID**: BUG-05
* **Severity**: Medium (Separation of Duties)
* **Root Cause**: `review_task` allowed any user with manager role to approve tasks, even if they were the assignee who submitted the task.
* **File Changed**: [`backend/task_service.py`](file:///c:/Users/iRaagul/OneDrive/Documents/Airei/Palm_AI/backend/task_service.py#L318-L330)
* **Fix Applied**:
  - Enforced that `user["role"]` must be in `("ADMIN", "MANAGER")`.
  - Added validation: if `row["assigned_to_user_id"] == user["id"]`, review is rejected with: `"Forbidden: Task assignee cannot review or approve their own assigned task."`.
* **Test Performed**: `test_04_worker_cannot_review_task` in `tests/test_security_audit_hardening.py` and unit checks.
* **Test Result**: **PASS**.
* **Remaining Limitation**: In single-manager estates, another supervisor or admin must review tasks assigned to the manager.

---

### FIX-06: Production Dynamic Port Binding in Dockerfile
* **Issue ID**: BUG-06
* **Severity**: Medium (Deployment Blocker)
* **Root Cause**: `Dockerfile` used exec form `CMD ["python", "-m", "gunicorn", "backend.api:app", "--bind", "0.0.0.0:10000", ...]` which ignored Render's dynamic `$PORT` environment variable.
* **File Changed**: [`Dockerfile`](file:///c:/Users/iRaagul/OneDrive/Documents/Airei/Palm_AI/Dockerfile#L35-L36)
* **Fix Applied**:
  - Updated CMD to shell form:
    ```dockerfile
    CMD ["sh", "-c", "exec python -m gunicorn backend.api:app --bind 0.0.0.0:${PORT:-10000} --workers ${WEB_CONCURRENCY:-1} --threads 4 --timeout 120"]
    ```
  - Dynamically evaluates `$PORT` and `$WEB_CONCURRENCY` at runtime while defaulting safely to port 10000 for local Docker testing.
* **Test Performed**: Tested container startup command and Render environment parsing.
* **Test Result**: **PASS**.
* **Remaining Limitation**: Container image must have `sh` available (present in `python:3.13-slim`).

---

### FIX-07: Production Demo Accounts Security Policy
* **Issue ID**: Security Hardening Rule 8
* **Severity**: Medium (Production Security)
* **Root Cause**: Default accounts (`admin@palmai.com`, `manager@palmai.com`, `worker@palmai.com`) were seeded as active in all environments.
* **File Changed**: [`backend/database.py`](file:///c:/Users/iRaagul/OneDrive/Documents/Airei/Palm_AI/backend/database.py#L180-L240)
* **Fix Applied**:
  - Checked `PALM_AI_ENV == "production"` or `RENDER == "true"`.
  - In production mode, default demo accounts are set `is_active = 0` (disabled) by default.
  - To enable them for staging or demonstration, administrators must explicitly set `PALM_AI_ENABLE_DEMO_ACCOUNTS=true` in Render environment variables.
* **Test Performed**: Verified `seed_default_data()` logic under simulated production and development flags.
* **Test Result**: **PASS**.
* **Remaining Limitation**: Production administrators must provision initial accounts or enable demo accounts via environment variables during initial evaluation.

---

### FIX-08: HTTP Security Headers Enforcement
* **Issue ID**: BUG-07
* **Severity**: Low (Security Best Practice)
* **Root Cause**: Flask responses lacked standard protective security headers.
* **File Changed**: [`backend/api.py`](file:///c:/Users/iRaagul/OneDrive/Documents/Airei/Palm_AI/backend/api.py#L88-L98)
* **Fix Applied**:
  - Added `@app.after_request` handler:
    ```python
    @app.after_request
    def add_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response
    ```
* **Test Performed**: `test_06_security_headers_present` in `tests/test_security_audit_hardening.py`.
* **Test Result**: **PASS** (All 4 headers verified).
* **Remaining Limitation**: None.

---

### FIX-09: Robust Drone AI Zero-Palm and Outlier Inference Handling
* **Issue ID**: BUG-08
* **Severity**: Low (Robustness)
* **Root Cause**: Single-image YOLO inference did not distinguish zero detected palms from zero healthy palms, and did not evaluate single uploads against the IQR baseline outlier threshold ($< 28.34\%$).
* **File Changed**: [`backend/api.py`](file:///c:/Users/iRaagul/OneDrive/Documents/Airei/Palm_AI/backend/api.py#L1093-L1145)
* **Fix Applied**:
  - Set `health_status = "NO_PALMS_DETECTED"` when `palm_detections == 0`.
  - Added statistical outlier detection: if `palm_detections > 0` and `drone_health_score < 28.34`, sets `is_outlier = True` and `outlier_warning = "Statistical density/boundary outlier (< 28.34% baseline threshold); not clinically confirmed disease."`.
* **Test Performed**: `test_07_drone_prediction_safe_empty_image_handling` in `tests/test_security_audit_hardening.py`.
* **Test Result**: **PASS**.
* **Remaining Limitation**: Drone inference remains image-level and unmapped to plantation block IDs.

---

### FIX-10: Multispectral Provenance Labeling Standardization
* **Issue ID**: Phase 4 Compliance
* **Severity**: Low (Provenance Compliance)
* **Root Cause**: The multispectral view lacked the exact required string `"Technical Benchmark / Demonstration Only – German Beech Forest Dataset"`.
* **File Changed**: [`frontend/src/MultispectralHealthPage.jsx`](file:///c:/Users/iRaagul/OneDrive/Documents/Airei/Palm_AI/frontend/src/MultispectralHealthPage.jsx#L130-L145)
* **Fix Applied**:
  - Updated the top provenance banner and operational tags to display the exact required title: `"Technical Benchmark / Demonstration Only – German Beech Forest Dataset"`.
* **Test Performed**: Verified frontend source and built bundle.
* **Test Result**: **PASS**.
* **Remaining Limitation**: Altum benchmark tiles remain strictly decoupled with 0% influence on block risk.

---

### FIX-11: Frontend Code Cleanup & Lint Warnings Reduction
* **Issue ID**: BUG-09
* **Severity**: Low (Code Quality)
* **Root Cause**: Unused icon imports, destructured parameters, and unused variables (`nutrientRadarData`, `actualArea`, `recError`).
* **Files Changed**:
  - [`frontend/src/RoleDashboard.jsx`](file:///c:/Users/iRaagul/OneDrive/Documents/Airei/Palm_AI/frontend/src/RoleDashboard.jsx)
  - [`frontend/src/LoginPortal.jsx`](file:///c:/Users/iRaagul/OneDrive/Documents/Airei/Palm_AI/frontend/src/LoginPortal.jsx)
  - [`frontend/src/UnifiedBlockIntelligence.jsx`](file:///c:/Users/iRaagul/OneDrive/Documents/Airei/Palm_AI/frontend/src/UnifiedBlockIntelligence.jsx)
* **Fix Applied**:
  - Removed unused imports and unrendered variables.
  - Prefixed unused props with `_`.
  - Verified `oxlint` found **0 errors**.
  - Verified `npm run build` completes cleanly in 1.62s.
* **Test Performed**: `npm run lint` and `npm run build`.
* **Test Result**: **PASS**.
* **Remaining Limitation**: None.
