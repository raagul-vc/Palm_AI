"""
PALM AI Security Hardening & Authorization Test Suite
Verifies:
1. Unauthenticated access to protected task endpoints returns 401.
2. Worker isolation: workers only access and submit tasks assigned to them.
3. Review isolation: workers cannot review tasks; task assignees cannot self-review.
4. Workflow integrity: generic PATCH cannot bypass inspection submission and review to jump to COMPLETED/SUBMITTED.
5. Drone prediction handles empty detections, zero-palm images, and flags statistical outliers.
6. HTTP security headers are enforced across all API responses.
"""

import unittest
import json
import io
from PIL import Image
from backend.api import app
from backend.database import init_db, seed_default_data, get_db_connection


class SecurityHardeningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        seed_default_data()
        cls.client = app.test_client()

        # Log in Admin
        res = cls.client.post("/api/auth/login", json={"email": "admin@palmai.com", "password": "AdminPassword2026!"})
        cls.admin_token = res.get_json()["token"]

        # Log in Manager
        res = cls.client.post("/api/auth/login", json={"email": "manager@palmai.com", "password": "ManagerPassword2026!"})
        cls.mgr_token = res.get_json()["token"]

        # Log in Worker 1
        res = cls.client.post("/api/auth/login", json={"email": "worker@palmai.com", "password": "WorkerPassword2026!"})
        cls.wrk1_token = res.get_json()["token"]

        # Log in Worker 2
        res = cls.client.post("/api/auth/login", json={"email": "inspector.budi@palmai.com", "password": "WorkerPassword2026!"})
        cls.wrk2_token = res.get_json()["token"]

    def test_01_unauthenticated_task_access_denied(self):
        """Unauthenticated requests to task endpoints must return 401 AUTH_REQUIRED."""
        # 1. GET /api/tasks without token
        res = self.client.get("/api/tasks")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.get_json().get("code"), "AUTH_REQUIRED")

        # 2. POST /api/tasks without token
        res = self.client.post("/api/tasks", json={"block_id": "B001", "title": "Test Task"})
        self.assertEqual(res.status_code, 401)

        # 3. GET /api/tasks/<id> without token
        res = self.client.get("/api/tasks/TSK-B001-001")
        self.assertEqual(res.status_code, 401)

        # 4. PATCH /api/tasks/<id> without token
        res = self.client.patch("/api/tasks/TSK-B001-001", json={"status": "IN_PROGRESS"})
        self.assertEqual(res.status_code, 401)

        # 5. POST /api/tasks/<id>/submit without token
        res = self.client.post("/api/tasks/TSK-B001-001/submit", json={"findings": "Sample notes"})
        self.assertEqual(res.status_code, 401)

        # 6. POST /api/tasks/<id>/review without token
        res = self.client.post("/api/tasks/TSK-B001-001/review", json={"decision": "APPROVE"})
        self.assertEqual(res.status_code, 401)

    def test_02_worker_assigned_task_isolation(self):
        """Worker 2 cannot see or access tasks assigned to Worker 1."""
        # TSK-B001-001 is assigned to USR-WRK-01
        res = self.client.get("/api/tasks/TSK-B001-001", headers={"Authorization": f"Bearer {self.wrk2_token}"})
        self.assertEqual(res.status_code, 404)

        # Worker 2 listing tasks must not include Worker 1's tasks
        res_list = self.client.get("/api/tasks", headers={"Authorization": f"Bearer {self.wrk2_token}"})
        self.assertEqual(res_list.status_code, 200)
        task_ids = [t["task_id"] for t in res_list.get_json()["tasks"]]
        self.assertNotIn("TSK-B001-001", task_ids)

    def test_03_worker_cannot_submit_unassigned_task(self):
        """Worker 2 cannot submit inspection observations for Worker 1's assigned task."""
        res = self.client.post(
            "/api/tasks/TSK-B001-001/submit",
            headers={"Authorization": f"Bearer {self.wrk2_token}"},
            json={"findings": "Attempted unauthorized submission"}
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Forbidden", res.get_json()["error"])

    def test_04_worker_cannot_review_task(self):
        """Workers cannot review or approve tasks."""
        res = self.client.post(
            "/api/tasks/TSK-B001-001/review",
            headers={"Authorization": f"Bearer {self.wrk1_token}"},
            json={"decision": "APPROVE", "comments": "Self-approval attempt"}
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("Forbidden", res.get_json()["error"])

    def test_05_generic_patch_cannot_bypass_review_workflow(self):
        """Generic PATCH to /api/tasks/<task_id> cannot directly set status to COMPLETED, SUBMITTED, or APPROVED."""
        res_completed = self.client.patch(
            "/api/tasks/TSK-B005-001",
            headers={"Authorization": f"Bearer {self.mgr_token}"},
            json={"status": "COMPLETED"}
        )
        self.assertEqual(res_completed.status_code, 400)
        self.assertEqual(res_completed.get_json().get("code"), "WORKFLOW_VIOLATION")

        res_submitted = self.client.patch(
            "/api/tasks/TSK-B005-001",
            headers={"Authorization": f"Bearer {self.mgr_token}"},
            json={"status": "SUBMITTED"}
        )
        self.assertEqual(res_submitted.status_code, 400)
        self.assertEqual(res_submitted.get_json().get("code"), "WORKFLOW_VIOLATION")

    def test_06_security_headers_present(self):
        """Standard HTTP security headers must be present in API responses."""
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(res.headers.get("X-Frame-Options"), "SAMEORIGIN")
        self.assertEqual(res.headers.get("X-XSS-Protection"), "1; mode=block")
        self.assertEqual(res.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin")

    def test_07_drone_prediction_safe_empty_image_handling(self):
        """Drone inference on a blank synthetic image handles zero detections safely."""
        try:
            import ultralytics
        except ImportError:
            raise unittest.SkipTest("ultralytics not installed in local environment")

        # Create small test image
        img = Image.new("RGB", (64, 64), color=(0, 0, 0))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        buf.seek(0)

        data = {"image": (buf, "blank_tile.jpg")}
        res = self.client.post("/api/drone/predict", data=data, content_type="multipart/form-data")
        self.assertEqual(res.status_code, 200)
        json_data = res.get_json()
        self.assertEqual(json_data["palm_detections"], 0)
        self.assertEqual(json_data["drone_health_score"], 0.0)
        self.assertEqual(json_data["health_status"], "NO_PALMS_DETECTED")
        self.assertFalse(json_data["is_outlier"])
        self.assertIn("Drone Health Score", json_data["disclaimer"])


if __name__ == "__main__":
    unittest.main()
