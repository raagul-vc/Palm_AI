"""
PALM AI Enterprise Automated Verification Test Suite
Tests for:
1. Server-side token authentication & RBAC authorization
2. Worker permission isolation and cross-role denial
3. Full task lifecycle workflow (OPEN -> ASSIGNED -> SUBMITTED -> COMPLETED)
4. Empirical Tree Inventory readiness and unmapped disclosure
5. Drone & Multispectral pipeline status & isolation
"""

import unittest
import json
from backend.api import app
from backend.database import init_db, seed_default_data, get_db_connection


class EnterprisePlatformTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        init_db()
        seed_default_data()
        cls.client = app.test_client()

    def test_01_authentication_and_session_tokens(self):
        """Test authentication for Admin, Manager, and Worker accounts."""
        # 1. Invalid credentials
        res = self.client.post("/api/auth/login", json={"email": "admin@palmai.com", "password": "WrongPassword"})
        self.assertEqual(res.status_code, 401)
        self.assertIn("error", res.get_json())

        # 2. Valid Admin Login
        res_admin = self.client.post("/api/auth/login", json={"email": "admin@palmai.com", "password": "AdminPassword2026!"})
        self.assertEqual(res_admin.status_code, 200)
        data_admin = res_admin.get_json()
        self.assertIn("token", data_admin)
        self.assertEqual(data_admin["user"]["role"], "ADMIN")

        # 3. Valid Manager Login
        res_mgr = self.client.post("/api/auth/login", json={"email": "manager@palmai.com", "password": "ManagerPassword2026!"})
        self.assertEqual(res_mgr.status_code, 200)
        self.assertEqual(res_mgr.get_json()["user"]["role"], "MANAGER")

        # 4. Valid Worker Login
        res_wrk = self.client.post("/api/auth/login", json={"email": "worker@palmai.com", "password": "WorkerPassword2026!"})
        self.assertEqual(res_wrk.status_code, 200)
        self.assertEqual(res_wrk.get_json()["user"]["role"], "WORKER")

        # 5. Auth Me Endpoint
        token = res_admin.get_json()["token"]
        res_me = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res_me.status_code, 200)
        self.assertEqual(res_me.get_json()["user"]["email"], "admin@palmai.com")

        # 6. Logout
        res_logout = self.client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res_logout.status_code, 200)

        # 7. Invalidation check
        res_me_after = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res_me_after.status_code, 401)

    def test_02_role_based_authorization_and_denial(self):
        """Test that Workers cannot access Manager/Admin APIs."""
        # Login as Worker
        res_wrk = self.client.post("/api/auth/login", json={"email": "worker@palmai.com", "password": "WorkerPassword2026!"})
        wrk_token = res_wrk.get_json()["token"]

        # Worker cannot view audit logs
        res_audit = self.client.get("/api/audit-logs", headers={"Authorization": f"Bearer {wrk_token}"})
        self.assertEqual(res_audit.status_code, 403)

        # Worker cannot create tasks
        res_create = self.client.post("/api/tasks", headers={"Authorization": f"Bearer {wrk_token}"}, json={
            "block_id": "B002",
            "title": "Unauthorized Worker Task"
        })
        self.assertEqual(res_create.status_code, 403)

        # Worker cannot create new users
        res_user_create = self.client.post("/api/auth/users", headers={"Authorization": f"Bearer {wrk_token}"}, json={
            "email": "hacker@palmai.com",
            "password": "Password123!",
            "full_name": "Injected User",
            "role": "ADMIN"
        })
        self.assertEqual(res_user_create.status_code, 403)

        # Admin CAN access audit logs
        res_admin = self.client.post("/api/auth/login", json={"email": "admin@palmai.com", "password": "AdminPassword2026!"})
        admin_token = res_admin.get_json()["token"]
        res_audit_admin = self.client.get("/api/audit-logs", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(res_audit_admin.status_code, 200)
        self.assertIn("audit_logs", res_audit_admin.get_json())

    def test_03_field_task_lifecycle_workflow(self):
        """Test full task workflow: Create -> Assign -> Submit -> Review -> Complete."""
        # 1. Manager Login
        res_mgr = self.client.post("/api/auth/login", json={"email": "manager@palmai.com", "password": "ManagerPassword2026!"})
        mgr_token = res_mgr.get_json()["token"]

        # 2. Manager creates task for Block B005
        res_create = self.client.post("/api/tasks", headers={"Authorization": f"Bearer {mgr_token}"}, json={
            "estate_id": "North Estate (PT Palm Indo)",
            "block_id": "B005",
            "title": "B005 Phosphate Broadcast Verification",
            "source_issue": "Yield lag (-37.5%) and foliar P deficiency",
            "priority": "ELEVATED",
            "assigned_to_user_id": "USR-WRK-01",
            "checklist": ["Inspect circle weeding", "Verify rock phosphate bags"],
            "required_evidence": ["Field supervisor signature"]
        })
        self.assertEqual(res_create.status_code, 201)
        task_data = res_create.get_json()["task"]
        task_id = task_data["task_id"]
        self.assertEqual(task_data["status"], "ASSIGNED")
        self.assertEqual(task_data["block_id"], "B005")

        # 3. Worker logs in and submits inspection findings
        res_wrk = self.client.post("/api/auth/login", json={"email": "worker@palmai.com", "password": "WorkerPassword2026!"})
        wrk_token = res_wrk.get_json()["token"]

        res_submit = self.client.post(f"/api/tasks/{task_id}/submit", headers={"Authorization": f"Bearer {wrk_token}"}, json={
            "findings": "Rock phosphate application verified across 24 ha. Weeding compliant.",
            "followup_notes": "Re-check frond color in next monthly round.",
            "inspection_date": "2026-10-27"
        })
        self.assertEqual(res_submit.status_code, 200)
        sub_task = res_submit.get_json()["task"]
        self.assertEqual(sub_task["status"], "SUBMITTED")
        self.assertEqual(sub_task["worker_findings"], "Rock phosphate application verified across 24 ha. Weeding compliant.")

        # 4. Manager reviews and approves task
        res_review = self.client.post(f"/api/tasks/{task_id}/review", headers={"Authorization": f"Bearer {mgr_token}"}, json={
            "decision": "APPROVE",
            "comments": "Field inspection confirmed compliant. Closing directive."
        })
        self.assertEqual(res_review.status_code, 200)
        completed_task = res_review.get_json()["task"]
        self.assertEqual(completed_task["status"], "COMPLETED")
        self.assertIsNotNone(completed_task["completed_at"])

        # 5. Audit trail includes all actions
        res_detail = self.client.get(f"/api/tasks/{task_id}", headers={"Authorization": f"Bearer {mgr_token}"})
        self.assertEqual(res_detail.status_code, 200)
        audit_trail = res_detail.get_json()["task"]["audit_trail"]
        actions = [a["action"] for a in audit_trail]
        self.assertIn("TASK_CREATED", actions)
        self.assertIn("INSPECTION_SUBMITTED", actions)
        self.assertIn("REVIEW_APPROVED", actions)

    def test_04_tree_inventory_unavailable_and_readiness(self):
        """Test tree inventory API returns transparent UNAVAILABLE status and zero fabricated tree counts."""
        res = self.client.get("/api/tree-inventory")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()

        self.assertEqual(data["inventory_status"], "UNAVAILABLE")
        self.assertIsNone(data["verified_tree_inventory_count"])
        self.assertEqual(data["total_operational_blocks"], 42)
        self.assertAlmostEqual(data["verified_estate_area_ha"], 920.0, places=1)
        self.assertEqual(data["inventory_readiness_score"], 35.0)
        self.assertIn("missing_requirements", data)

        # Block specific check
        res_b = self.client.get("/api/tree-inventory/B001")
        self.assertEqual(res_b.status_code, 200)
        b_data = res_b.get_json()
        self.assertEqual(b_data["block_id"], "B001")
        self.assertEqual(b_data["observed_area_ha"], 19.0)
        self.assertEqual(b_data["planting_year"], 2000)
        self.assertIsNone(b_data["verified_tree_count"])
        self.assertEqual(b_data["inventory_status"], "UNAVAILABLE")

    def test_05_drone_and_multispectral_pipeline_disclosures(self):
        """Test pipeline endpoints declare unmapped and benchmark isolation truthfully."""
        res_drone = self.client.get("/api/drone/pipeline")
        self.assertEqual(res_drone.status_code, 200)
        drone_data = res_drone.get_json()
        self.assertEqual(drone_data["geospatial_mapping_status"], "UNMAPPED")
        self.assertIn("UNMAPPED", drone_data["geospatial_mapping_disclosure"])

        res_multi = self.client.get("/api/multispectral/pipeline")
        self.assertEqual(res_multi.status_code, 200)
        multi_data = res_multi.get_json()
        self.assertEqual(multi_data["provenance_disclosure"]["operational_isolation_status"], "ISOLATED")
        self.assertFalse(multi_data["provenance_disclosure"]["is_oil_palm"])
        self.assertIn("German Beech Forest", multi_data["provenance_disclosure"]["dataset_origin"])


if __name__ == "__main__":
    unittest.main()
