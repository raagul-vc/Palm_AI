"""
Comprehensive unit and integration test suite for:
- Hybrid Public + Authenticated Portal Architecture
- Public Read-Only Telemetry & Recommendation APIs
- Strict HTTP 401 rejection on missing, invalid, or 'public-session' tokens
- Multi-Role RBAC (ADMIN, MANAGER, WORKER)
- Task lifecycle: assignment, worker submission, self-review block, and manager review
- Secure Initial Admin Provisioning CLI and Credential Rotation
"""

import unittest
import json
import os
import sys
from datetime import datetime, timezone

# Ensure project root in path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.api import app
from backend.database import get_db_connection, init_db, hash_password, seed_default_data
from backend.provision_admin import (
    provision_initial_admin,
    rotate_admin_password,
    get_active_admins
)


class TestHybridAuthAndProvisioning(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.testing = True
        cls.client = app.test_client()
        init_db()

    def setUp(self):
        # Create a fresh isolated test context in DB
        self.conn = get_db_connection()
        self.cur = self.conn.cursor()

    def tearDown(self):
        self.conn.close()

    # -------------------------------------------------------------------------
    # 1. PUBLIC DASHBOARD & RECOMMENDATION ACCESS (NO TOKEN REQUIRED)
    # -------------------------------------------------------------------------
    def test_public_health_and_telemetry_access(self):
        """Public visitors can freely access health, risk, and telemetry endpoints."""
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["status"], "online")

        # 42 blocks risk summary
        res_risk = self.client.get("/api/risk")
        self.assertEqual(res_risk.status_code, 200)
        blocks = res_risk.get_json()
        self.assertEqual(len(blocks), 42)

        # Multi-source risk matrix
        res_ms = self.client.get("/api/multi-source-risk")
        self.assertEqual(res_ms.status_code, 200)
        self.assertEqual(len(res_ms.get_json()), 42)

    def test_public_recommendations_access(self):
        """Public visitors can inspect block-level AI recommendations without token."""
        res = self.client.get("/api/recommendations/B001")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["block_id"], "B001")
        self.assertIn("recommendation", data)
        self.assertIn("priority", data["recommendation"])

        # All recommendations listing
        res_all = self.client.get("/api/recommendations")
        self.assertEqual(res_all.status_code, 200)
        self.assertIn("recommendations", res_all.get_json())

    # -------------------------------------------------------------------------
    # 2. TOKEN SECURITY: INVALID, MISSING, AND 'public-session' REJECTION
    # -------------------------------------------------------------------------
    def test_protected_endpoints_reject_missing_token(self):
        """Missing Authorization header must return HTTP 401 AUTH_REQUIRED."""
        res = self.client.get("/api/tasks")
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertEqual(data.get("code"), "AUTH_REQUIRED")

    def test_protected_endpoints_reject_public_session_token(self):
        """'Bearer public-session' must NEVER be accepted as an authenticated token."""
        headers = {"Authorization": "Bearer public-session"}
        res = self.client.get("/api/tasks", headers=headers)
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.get_json().get("code"), "AUTH_REQUIRED")

        # Also test on mutation endpoint
        res_post = self.client.post("/api/tasks", headers=headers, json={"title": "Unauthorized"})
        self.assertEqual(res_post.status_code, 401)

    def test_protected_endpoints_reject_malformed_tokens(self):
        """Tokens like 'null', 'undefined', or random garbage return HTTP 401."""
        for bad_token in ["null", "undefined", "   ", "invalid_random_jwt"]:
            headers = {"Authorization": f"Bearer {bad_token}"}
            res = self.client.get("/api/tasks", headers=headers)
            self.assertEqual(res.status_code, 401)

    # -------------------------------------------------------------------------
    # 3. LOGIN SUCCESS, FAILURE & INACTIVE ACCOUNT HANDLING
    # -------------------------------------------------------------------------
    def test_login_failure_invalid_credentials(self):
        """Bad password or nonexistent user returns HTTP 401."""
        res = self.client.post("/api/auth/login", json={
            "email": "nonexistent@palmai.com",
            "password": "WrongPassword123!"
        })
        self.assertEqual(res.status_code, 401)

    def test_login_success_active_user(self):
        """Active user can authenticate and receives valid JWT token."""
        # Create an active manager for testing
        test_email = "test.active.mgr@palmai.com"
        test_pass = "SecurePass2026!"
        p_hash, salt = hash_password(test_pass)
        now = datetime.now(timezone.utc).isoformat()

        self.cur.execute("""
            INSERT OR REPLACE INTO users (id, email, password_hash, salt, full_name, role, estate_permissions, block_permissions, is_active, created_at)
            VALUES ('USR-TEST-MGR', ?, ?, ?, 'Test Manager', 'MANAGER', '["*"]', '["*"]', 1, ?);
        """, (test_email, p_hash, salt, now))
        self.conn.commit()

        res = self.client.post("/api/auth/login", json={
            "email": test_email,
            "password": test_pass
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertIn("token", data)
        self.assertEqual(data["user"]["role"], "MANAGER")

    # -------------------------------------------------------------------------
    # 4. RBAC: WORKER TASK SCOPING, ASSIGNMENT, AND SELF-REVIEW REJECTION
    # -------------------------------------------------------------------------
    def test_worker_authorization_and_self_review_prevention(self):
        """
        Workers can only see assigned tasks, cannot create tasks,
        and assignees cannot review their own submitted tasks.
        """
        now = datetime.now(timezone.utc).isoformat()

        # Provision a test worker and manager
        worker_email = "test.worker.ahmad@palmai.com"
        mgr_email = "test.manager.siti@palmai.com"
        w_hash, w_salt = hash_password("WorkerPass2026!")
        m_hash, m_salt = hash_password("ManagerPass2026!")

        self.cur.execute("""
            INSERT OR REPLACE INTO users (id, email, password_hash, salt, full_name, role, estate_permissions, block_permissions, is_active, created_at)
            VALUES ('USR-TEST-WRK1', ?, ?, ?, 'Ahmad Worker', 'WORKER', '["North Estate (PT Palm Indo)"]', '["B001"]', 1, ?);
        """, (worker_email, w_hash, w_salt, now))

        self.cur.execute("""
            INSERT OR REPLACE INTO users (id, email, password_hash, salt, full_name, role, estate_permissions, block_permissions, is_active, created_at)
            VALUES ('USR-TEST-MGR1', ?, ?, ?, 'Siti Manager', 'MANAGER', '["*"]', '["*"]', 1, ?);
        """, (mgr_email, m_hash, m_salt, now))

        # Create a task assigned to Ahmad
        task_id = "TSK-TEST-001"
        self.cur.execute("""
            INSERT OR REPLACE INTO field_tasks (
                task_id, estate_id, block_id, title, source_issue, evidence_summary,
                assigned_to_user_id, assigned_by_user_id, priority, due_date, status, created_at, updated_at
            ) VALUES (
                ?, 'North Estate (PT Palm Indo)', 'B001', 'Test Chlorosis Inspection',
                'Nitrogen deficiency', '{"screening_score": 65.0}', 'USR-TEST-WRK1', 'USR-TEST-MGR1',
                'CRITICAL', '2026-11-20', 'ASSIGNED', ?, ?
            );
        """, (task_id, now, now))
        self.conn.commit()

        # Login as Worker
        res_w = self.client.post("/api/auth/login", json={"email": worker_email, "password": "WorkerPass2026!"})
        worker_token = res_w.get_json()["token"]
        w_headers = {"Authorization": f"Bearer {worker_token}"}

        # 1. Worker tries to create a task -> Must be 403 Forbidden
        res_create = self.client.post("/api/tasks", headers=w_headers, json={
            "block_id": "B001",
            "title": "Worker Unauthorized Task",
            "assigned_to_user_id": "USR-TEST-WRK1"
        })
        self.assertEqual(res_create.status_code, 403)

        # 2. Worker submits inspection observations -> Must succeed
        res_submit = self.client.post(f"/api/tasks/{task_id}/submit", headers=w_headers, json={
            "findings": "Observed severe canopy chlorosis on rows 4 through 8.",
            "notes": "Recommend urgent potassium foliar spray."
        })
        self.assertEqual(res_submit.status_code, 200)

        # 3. Worker tries to self-review/approve own task -> Must be 403 Forbidden
        res_self_review = self.client.post(f"/api/tasks/{task_id}/review", headers=w_headers, json={
            "decision": "APPROVE",
            "comments": "Self approving my own task"
        })
        self.assertEqual(res_self_review.status_code, 403)

        # 4. Login as Manager
        res_m = self.client.post("/api/auth/login", json={"email": mgr_email, "password": "ManagerPass2026!"})
        mgr_token = res_m.get_json()["token"]
        m_headers = {"Authorization": f"Bearer {mgr_token}"}

        # 5. Manager reviews and approves task -> Must succeed
        res_review = self.client.post(f"/api/tasks/{task_id}/review", headers=m_headers, json={
            "decision": "APPROVE",
            "comments": "Field observations verified against Frond 17 assay. Completed."
        })
        self.assertEqual(res_review.status_code, 200)
        self.assertEqual(res_review.get_json()["task"]["status"], "COMPLETED")

    # -------------------------------------------------------------------------
    # 5. SECURE ADMIN PROVISIONING & ROTATION CLI
    # -------------------------------------------------------------------------
    def test_admin_provisioning_idempotency_and_lock(self):
        """Initial admin provisioning locks when active admin exists and refuses overwrite."""
        active = get_active_admins()
        self.assertGreaterEqual(len(active), 1)

        # Attempting to provision again should fail safely
        success, msg = provision_initial_admin("newadmin@palmai.com", "NewAdminSecretPass123!")
        self.assertFalse(success)
        self.assertIn("Provisioning locked", msg)

    def test_admin_provisioning_password_policy(self):
        """Provisioning and rotation strictly require passwords with >= 10 characters."""
        # Short password rotation should fail
        active = get_active_admins()
        admin_email = active[0]["email"]

        success, msg = rotate_admin_password(admin_email, "CurrentPassword!", "short")
        self.assertFalse(success)
        self.assertIn("at least 10 characters", msg)


if __name__ == "__main__":
    unittest.main()
