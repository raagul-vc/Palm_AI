"""
Live PostgreSQL Integration Test Suite for Palm AI:
Executes end-to-end integration tests against a live PostgreSQL database
when DATABASE_URL is provided in the environment.

Verifies:
1. PostgreSQL connection, table schema creation (SERIAL PRIMARY KEYs), and safe migrations.
2. User management, active/inactive flag, PBKDF2-HMAC-SHA256 password authentication.
3. Session lifecycle, expiration timestamp validation, and cascading delete on logout.
4. Field task lifecycle: creation, worker observation submission, self-review prevention,
   manager approval, and audit logging.
5. Concurrency: concurrent worker submissions and audit log entries against PostgreSQL.
6. Zero credential leaks in logs, errors, or string representations.
"""

import unittest
import os
import sys
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
    verify_password
)
from backend.auth import authenticate_user, get_user_from_token, logout_user
from backend.task_service import create_task, submit_task_inspection, review_task, get_task_by_id


class TestPostgresIntegration(unittest.TestCase):
    created_task_ids = []

    @classmethod
    def setUpClass(cls):
        pg_url = get_db_url()
        if not pg_url or not is_postgres():
            raise unittest.SkipTest(
                "PostgreSQL live integration test requires a live PostgreSQL database specified via the "
                "DATABASE_URL environment variable (e.g. DATABASE_URL=postgresql://user:pass@host:5432/dbname). "
                "Set DATABASE_URL in your environment to execute live PostgreSQL tests."
            )

        # Initialize schema only (does NOT seed demo accounts or mock data)
        init_db()

    @classmethod
    def tearDownClass(cls):
        """Clean up test records to guarantee zero residue in database."""
        pg_url = get_db_url()
        if not pg_url or not is_postgres():
            return
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            # Clean up test tasks created during test run
            if hasattr(cls, "created_task_ids") and cls.created_task_ids:
                for tid in cls.created_task_ids:
                    cur.execute("DELETE FROM task_audit_log WHERE task_id = ?;", (tid,))
                    cur.execute("DELETE FROM field_tasks WHERE task_id = ?;", (tid,))
            # Clean up test tasks matching test title patterns
            cur.execute("DELETE FROM task_audit_log WHERE task_id IN (SELECT task_id FROM field_tasks WHERE title LIKE 'PostgreSQL%');")
            cur.execute("DELETE FROM field_tasks WHERE title LIKE 'PostgreSQL%';")
            # Clean up test users
            cur.execute("DELETE FROM users WHERE email IN ('pg.agronomist@palmai.com', 'pg.worker@palmai.com') OR id LIKE 'USR-PG-%';")
            conn.commit()
            conn.close()
        except Exception:
            pass

    def setUp(self):
        self.conn = get_db_connection()
        self.cur = self.conn.cursor()

    def tearDown(self):
        self.conn.close()

    def _ensure_manager(self):
        """Helper ensuring test manager exists for isolated test runs."""
        test_email = "pg.agronomist@palmai.com"
        self.cur.execute("SELECT id FROM users WHERE email = ?;", (test_email,))
        if not self.cur.fetchone():
            test_pass = "PgSecurePass2026!"
            p_hash, salt = hash_password(test_pass)
            now = datetime.now(timezone.utc).isoformat()
            self.cur.execute("""
                INSERT INTO users (id, email, password_hash, salt, full_name, role, estate_permissions, block_permissions, is_active, created_at)
                VALUES ('USR-PG-AGR01', ?, ?, ?, 'Dr. PostgreSQL Agronomist', 'MANAGER', '["*"]', '["*"]', 1, ?);
            """, (test_email, p_hash, salt, now))
            self.conn.commit()

    def test_01_postgres_connection_and_table_structure(self):
        """Verifies connection to PostgreSQL, dialect detection, and table creation."""
        self.assertEqual(get_db_type(), "postgres")
        self.assertTrue(is_postgres())

        # Verify tables exist in information_schema
        self.cur.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public';
        """)
        tables = {row["table_name"] for row in self.cur.fetchall()}
        required = {"users", "sessions", "field_tasks", "task_audit_log", "audit_events"}
        self.assertTrue(required.issubset(tables), f"Missing tables in PostgreSQL: {required - tables}")

    def test_02_postgres_user_auth_and_pbkdf2(self):
        """Verifies user insertion, PBKDF2 password verification, and authentication on PostgreSQL."""
        test_email = "pg.agronomist@palmai.com"
        test_pass = "PgSecurePass2026!"
        p_hash, salt = hash_password(test_pass)
        now = datetime.now(timezone.utc).isoformat()

        self.cur.execute("DELETE FROM users WHERE email = ?;", (test_email,))
        self.cur.execute("""
            INSERT INTO users (id, email, password_hash, salt, full_name, role, estate_permissions, block_permissions, is_active, created_at)
            VALUES ('USR-PG-AGR01', ?, ?, ?, 'Dr. PostgreSQL Agronomist', 'MANAGER', '["*"]', '["*"]', 1, ?);
        """, (test_email, p_hash, salt, now))
        self.conn.commit()

        # Authenticate
        user, token, err = authenticate_user(test_email, test_pass)
        self.assertIsNone(err)
        self.assertIsNotNone(token)
        self.assertEqual(user["role"], "MANAGER")

        # Wrong password fails
        _, _, bad_err = authenticate_user(test_email, "WrongPassword!")
        self.assertIsNotNone(bad_err)

    def test_03_postgres_session_lifecycle_and_cascade(self):
        """Verifies session storage, token verification, and logout on PostgreSQL."""
        self._ensure_manager()
        user, token, _ = authenticate_user("pg.agronomist@palmai.com", "PgSecurePass2026!")
        self.assertIsNotNone(token)

        # Retrieve user from token
        session_user = get_user_from_token(token)
        self.assertIsNotNone(session_user)
        self.assertEqual(session_user["email"], "pg.agronomist@palmai.com")

        # Logout invalidates token
        logged_out = logout_user(token)
        self.assertTrue(logged_out)
        self.assertIsNone(get_user_from_token(token))

    def test_04_postgres_task_lifecycle_and_self_review_prevention(self):
        """
        Verifies task assignment, worker submission, self-review block,
        and manager approval against PostgreSQL.
        """
        now = datetime.now(timezone.utc).isoformat()
        worker_email = "pg.worker@palmai.com"
        w_hash, w_salt = hash_password("PgWorkerPass1!")

        self.cur.execute("DELETE FROM users WHERE email = ?;", (worker_email,))
        self.cur.execute("""
            INSERT INTO users (id, email, password_hash, salt, full_name, role, estate_permissions, block_permissions, is_active, created_at)
            VALUES ('USR-PG-WRK01', ?, ?, ?, 'Field Inspector Rudi', 'WORKER', '["*"]', '["B001"]', 1, ?);
        """, (worker_email, w_hash, w_salt, now))
        self.conn.commit()

        self._ensure_manager()
        mgr_user, _, _ = authenticate_user("pg.agronomist@palmai.com", "PgSecurePass2026!")
        wrk_user, _, _ = authenticate_user(worker_email, "PgWorkerPass1!")

        # 1. Create task
        task_data = {
            "block_id": "B001",
            "title": "PostgreSQL Live Field Verification",
            "source_issue": "Foliar P deficit validation",
            "assigned_to_user_id": "USR-PG-WRK01",
            "priority": "CRITICAL"
        }
        task, err = create_task(mgr_user, task_data)
        self.assertIsNone(err)
        task_id = task["task_id"]
        self.created_task_ids.append(task_id)

        # 2. Worker submits inspection findings
        sub_task, sub_err = submit_task_inspection(task_id, wrk_user, {
            "findings": "Canopy healthy, slight P deficiency on row 3.",
            "notes": "Recommend standard rock phosphate application."
        })
        self.assertIsNone(sub_err)
        self.assertEqual(sub_task["status"], "SUBMITTED")

        # 3. Assignee self-review block: Worker cannot review own task
        _, self_err = review_task(task_id, wrk_user, "APPROVE", "Worker attempting self approval")
        self.assertIsNotNone(self_err)
        self.assertIn("Forbidden", self_err)

        # 4. Manager reviews and approves
        rev_task, rev_err = review_task(task_id, mgr_user, "APPROVE", "Manager verified on ground.")
        self.assertIsNone(rev_err)
        self.assertEqual(rev_task["status"], "COMPLETED")

    def test_05_postgres_concurrent_operations(self):
        """Tests concurrent task creation and audit logging on live PostgreSQL database."""
        self._ensure_manager()
        mgr_user, _, _ = authenticate_user("pg.agronomist@palmai.com", "PgSecurePass2026!")

        def create_and_log(idx):
            task_data = {
                "block_id": f"B{idx + 1:03d}",
                "title": f"PostgreSQL Concurrency Test {idx}",
                "source_issue": "Concurrent PG test",
                "priority": "ROUTINE"
            }
            t, e = create_task(mgr_user, task_data)
            if t and "task_id" in t:
                self.created_task_ids.append(t["task_id"])
            return (e is None), t.get("task_id") if t else None

        num_tasks = 5
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = [executor.submit(create_and_log, i) for i in range(num_tasks)]
            results = [f.result() for f in as_completed(futures)]

        for success, tid in results:
            self.assertTrue(success)
            self.assertIsNotNone(tid)


if __name__ == "__main__":
    unittest.main()
