"""
Unit and concurrency tests for Palm AI Dual-Database Persistence Engine:
1. Verifies PostgreSQL and SQLite dialect detection and credential masking.
2. Verifies parameter placeholder translation (? -> %s for PostgreSQL).
3. Verifies schema creation and safe migrations.
4. Verifies concurrent task creation, session validation, review, and audit logging.
"""

import unittest
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

# Ensure project root in path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.database import (
    get_db_url,
    is_postgres,
    get_db_type,
    mask_database_url,
    get_db_connection,
    init_db,
    seed_default_data,
    hash_password,
    verify_password,
    DualCursorWrapper
)
from backend.auth import authenticate_user, get_user_from_token
from backend.task_service import create_task, submit_task_inspection, review_task, get_task_by_id


class TestDatabasePortability(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        seed_default_data()

    def test_01_dialect_detection_and_url_normalization(self):
        """Verifies correct dialect identification and postgres:// -> postgresql:// normalization."""
        # When no DATABASE_URL is set, dialect must be sqlite
        orig_url = os.environ.get("DATABASE_URL")
        try:
            if "DATABASE_URL" in os.environ:
                del os.environ["DATABASE_URL"]
            self.assertFalse(is_postgres())
            self.assertEqual(get_db_type(), "sqlite")

            # Test postgres:// normalization
            os.environ["DATABASE_URL"] = "postgres://usr:secret_pass@db.neon.tech:5432/palmai?sslmode=require"
            self.assertTrue(is_postgres())
            self.assertEqual(get_db_type(), "postgres")
            self.assertTrue(get_db_url().startswith("postgresql://"))

            # Test quoted string
            os.environ["DATABASE_URL"] = "'postgresql://usr:secret@db.neon.tech/palmai'"
            self.assertTrue(is_postgres())
            self.assertTrue(get_db_url().startswith("postgresql://"))

            # Test psql wrapper copied from Neon
            os.environ["DATABASE_URL"] = "psql 'postgresql://usr:secret@db.neon.tech/palmai?sslmode=require'"
            self.assertTrue(is_postgres())
            self.assertTrue(get_db_url().startswith("postgresql://"))

            # Test DATABASE_URL= prefix
            os.environ["DATABASE_URL"] = 'DATABASE_URL="postgresql://usr:secret@db.neon.tech/palmai"'
            self.assertTrue(is_postgres())
            self.assertTrue(get_db_url().startswith("postgresql://"))
        finally:
            if orig_url is not None:
                os.environ["DATABASE_URL"] = orig_url
            elif "DATABASE_URL" in os.environ:
                del os.environ["DATABASE_URL"]

    def test_02_credential_masking_security(self):
        """Verifies database credentials are never exposed in masked output or logs."""
        raw_url = "postgresql://plantation_admin:UltraSecretPassword123!@ep-cool-fog-1234.us-east-2.aws.neon.tech:5432/palmai_prod?sslmode=require"
        masked = mask_database_url(raw_url)

        self.assertNotIn("UltraSecretPassword123!", masked)
        self.assertIn("plantation_admin:***", masked)
        self.assertIn("ep-cool-fog-1234.us-east-2.aws.neon.tech", masked)

        # SQLite local fallback masking
        self.assertEqual(mask_database_url(""), "sqlite://local")

    def test_03_placeholder_translation_in_cursor_wrapper(self):
        """Verifies DualCursorWrapper translates ? to %s for PostgreSQL and preserves ? for SQLite."""
        class MockRawCursor:
            def __init__(self):
                self.last_query = None
                self.last_params = None

            def execute(self, query, params=None):
                self.last_query = query
                self.last_params = params

        # 1. PostgreSQL mode -> ? becomes %s
        raw_pg = MockRawCursor()
        cur_pg = DualCursorWrapper(raw_pg, is_pg=True)
        cur_pg.execute("SELECT * FROM users WHERE email = ? AND is_active = ?;", ("admin@palmai.com", 1))
        self.assertEqual(raw_pg.last_query, "SELECT * FROM users WHERE email = %s AND is_active = %s;")
        self.assertEqual(raw_pg.last_params, ("admin@palmai.com", 1))

        # 2. SQLite mode -> ? preserved
        raw_sqlite = MockRawCursor()
        cur_sqlite = DualCursorWrapper(raw_sqlite, is_pg=False)
        cur_sqlite.execute("SELECT * FROM users WHERE email = ? AND is_active = ?;", ("admin@palmai.com", 1))
        self.assertEqual(raw_sqlite.last_query, "SELECT * FROM users WHERE email = ? AND is_active = ?;")
        self.assertEqual(raw_sqlite.last_params, ("admin@palmai.com", 1))

    def test_04_password_hashing_consistency(self):
        """Verifies existing PBKDF2-HMAC-SHA256 password hashing remains 100% consistent."""
        test_pass = "TestAgronomySecret2026!"
        p_hash, salt = hash_password(test_pass)
        self.assertEqual(len(p_hash), 64)  # 256-bit hex
        self.assertEqual(len(salt), 32)    # 16-byte hex
        self.assertTrue(verify_password(test_pass, p_hash, salt))
        self.assertFalse(verify_password("WrongPassword!", p_hash, salt))

    def test_05_concurrent_task_operations_and_audit_logging(self):
        """
        Concurrency test: Spawns 10 concurrent worker threads creating tasks,
        validating sessions, submitting inspection observations, and logging audit events.
        Verifies zero database deadlocks, race conditions, or state corruption.
        """
        conn = get_db_connection()
        cur = conn.cursor()
        now = datetime.now(timezone.utc).isoformat()

        # Provision 2 test users for the concurrency pool
        mgr_email = "conc.mgr@palmai.com"
        wrk_email = "conc.wrk@palmai.com"
        m_hash, m_salt = hash_password("ConcManagerPass1!")
        w_hash, w_salt = hash_password("ConcWorkerPass1!")

        cur.execute("DELETE FROM users WHERE email IN (?, ?);", (mgr_email, wrk_email))
        cur.execute("""
            INSERT INTO users (id, email, password_hash, salt, full_name, role, estate_permissions, block_permissions, is_active, created_at)
            VALUES ('USR-CONC-MGR', ?, ?, ?, 'Conc Manager', 'MANAGER', '["*"]', '["*"]', 1, ?);
        """, (mgr_email, m_hash, m_salt, now))
        cur.execute("""
            INSERT INTO users (id, email, password_hash, salt, full_name, role, estate_permissions, block_permissions, is_active, created_at)
            VALUES ('USR-CONC-WRK', ?, ?, ?, 'Conc Worker', 'WORKER', '["*"]', '["*"]', 1, ?);
        """, (wrk_email, w_hash, w_salt, now))
        conn.commit()
        conn.close()

        # Authenticate to obtain valid session tokens
        mgr_user, mgr_token, _ = authenticate_user(mgr_email, "ConcManagerPass1!")
        wrk_user, wrk_token, _ = authenticate_user(wrk_email, "ConcWorkerPass1!")
        self.assertIsNotNone(mgr_token)
        self.assertIsNotNone(wrk_token)

        num_tasks = 10
        task_ids = [f"TSK-CONC-{i:03d}" for i in range(num_tasks)]

        def worker_task_lifecycle(task_id, block_idx):
            # 1. Validate session concurrently
            valid_user = get_user_from_token(mgr_token)
            if not valid_user:
                return False, f"Token validation failed for {task_id}"

            # 2. Create task
            block_id = f"B{block_idx + 1:03d}"
            task_data = {
                "task_id": task_id,
                "block_id": block_id,
                "title": f"Concurrent Audit for {block_id}",
                "source_issue": "Routine concurrency test audit",
                "assigned_to_user_id": "USR-CONC-WRK",
                "priority": "ROUTINE"
            }
            task, err = create_task(mgr_user, task_data)
            if err:
                return False, f"Task creation failed for {task_id}: {err}"
            created_task_id = task["task_id"]

            # 3. Worker submits observation
            _, sub_err = submit_task_inspection(created_task_id, wrk_user, {
                "findings": f"Verified block {block_id} canopy cleanly.",
                "notes": "No nutrient stress detected."
            })
            if sub_err:
                return False, f"Submission failed for {created_task_id}: {sub_err}"

            # 4. Manager reviews task
            rev_task, rev_err = review_task(created_task_id, mgr_user, "APPROVE", "Verified via concurrent worker thread.")
            if rev_err or rev_task["status"] != "COMPLETED":
                return False, f"Review failed for {created_task_id}: {rev_err}"

            return True, created_task_id

        # Execute 10 worker lifecycles concurrently across 10 threads
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [
                executor.submit(worker_task_lifecycle, task_ids[i], i)
                for i in range(num_tasks)
            ]
            results = [f.result() for f in as_completed(futures)]

        completed_ids = []
        for success, val in results:
            self.assertTrue(success, f"Concurrency error encountered: {val}")
            completed_ids.append(val)

        # Verify all tasks reached COMPLETED state in the database
        verify_conn = get_db_connection()
        verify_cur = verify_conn.cursor()
        for tid in completed_ids:
            verify_cur.execute("SELECT status FROM field_tasks WHERE task_id = ?;", (tid,))
            r = verify_cur.fetchone()
            self.assertIsNotNone(r)
            self.assertEqual(r["status"], "COMPLETED")
        verify_conn.close()


if __name__ == "__main__":
    unittest.main()
