"""
PALM AI Enterprise Database Engine & Persistence Layer
SQLite-backed persistent store for multi-user authentication, roles,
field task lifecycle, inspection submissions, and audit logging.
"""

import sqlite3
import hashlib
import secrets
import json
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

def get_db_path() -> Path:
    env_path = os.environ.get("PALM_AI_DB_PATH")
    if env_path:
        return Path(env_path)
    default_dir = BASE_DIR / "data"
    try:
        default_dir.mkdir(parents=True, exist_ok=True)
        probe = default_dir / ".probe_write"
        probe.touch()
        probe.unlink()
        return default_dir / "palm_ai.db"
    except Exception:
        fallback_dir = Path("/tmp")
        fallback_dir.mkdir(parents=True, exist_ok=True)
        return fallback_dir / "palm_ai.db"

DB_PATH = get_db_path()


def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    """Secure password hashing using PBKDF2-HMAC-SHA256."""
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations=100_000
    )
    return key.hex(), salt


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    """Verifies a password against the stored PBKDF2 hash."""
    expected_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(expected_hash, password_hash)


def get_db_connection() -> sqlite3.Connection:
    """Returns a SQLite connection with Row factory enabled."""
    target_path = get_db_path()
    target_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(target_path), timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
    except Exception:
        pass
    return conn


def init_db():
    """Initializes tables, indexes, and default schema."""
    conn = get_db_connection()
    cur = conn.cursor()

    # 1. USERS TABLE
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('ADMIN', 'MANAGER', 'WORKER')),
            estate_permissions TEXT NOT NULL DEFAULT '["*"]',
            block_permissions TEXT NOT NULL DEFAULT '["*"]',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            last_login TEXT
        );
    """)

    # 2. SESSIONS TABLE
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    """)

    # 3. FIELD TASKS TABLE
    cur.execute("""
        CREATE TABLE IF NOT EXISTS field_tasks (
            task_id TEXT PRIMARY KEY,
            estate_id TEXT NOT NULL,
            block_id TEXT NOT NULL,
            title TEXT NOT NULL,
            source_issue TEXT NOT NULL,
            evidence_summary TEXT NOT NULL DEFAULT '{}',
            assigned_to_user_id TEXT,
            assigned_by_user_id TEXT,
            priority TEXT NOT NULL CHECK(priority IN ('CRITICAL', 'ELEVATED', 'ROUTINE')),
            due_date TEXT,
            checklist TEXT NOT NULL DEFAULT '[]',
            required_evidence TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL CHECK(status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'RETURNED', 'COMPLETED')),
            worker_findings TEXT,
            worker_followup_notes TEXT,
            worker_inspection_date TEXT,
            worker_attachment_path TEXT,
            submitted_at TEXT,
            manager_review_comments TEXT,
            reviewed_at TEXT,
            reviewed_by_user_id TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY(assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        );
    """)

    # 4. TASK AUDIT LOG
    cur.execute("""
        CREATE TABLE IF NOT EXISTS task_audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            user_id TEXT,
            action TEXT NOT NULL,
            previous_status TEXT,
            new_status TEXT,
            details TEXT,
            timestamp TEXT NOT NULL,
            FOREIGN KEY(task_id) REFERENCES field_tasks(task_id) ON DELETE CASCADE
        );
    """)

    # 5. SYSTEM AUDIT EVENTS
    cur.execute("""
        CREATE TABLE IF NOT EXISTS audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            event_type TEXT NOT NULL,
            estate_id TEXT,
            block_id TEXT,
            ip_address TEXT,
            details TEXT,
            timestamp TEXT NOT NULL
        );
    """)

    # INDEXES
    cur.execute("CREATE INDEX IF NOT EXISTS idx_tasks_block ON field_tasks(block_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status ON field_tasks(status);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON field_tasks(assigned_to_user_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);")

    conn.commit()
    conn.close()


def seed_default_data():
    """Seeds default enterprise accounts and initial real-grounded field directives."""
    init_db()
    conn = get_db_connection()
    cur = conn.cursor()

    now = datetime.now(timezone.utc).isoformat()

    # Default Accounts
    seed_users = [
        {
            "id": "USR-ADMIN-01",
            "email": "admin@palmai.com",
            "password": "AdminPassword2026!",
            "full_name": "Chief Plantation Administrator",
            "role": "ADMIN",
            "estate_permissions": ["*"],
            "block_permissions": ["*"]
        },
        {
            "id": "USR-MGR-01",
            "email": "manager@palmai.com",
            "password": "ManagerPassword2026!",
            "full_name": "Estate Agronomy Operations Manager",
            "role": "MANAGER",
            "estate_permissions": ["North Estate (PT Palm Indo)"],
            "block_permissions": ["*"]
        },
        {
            "id": "USR-WRK-01",
            "email": "worker@palmai.com",
            "password": "WorkerPassword2026!",
            "full_name": "Senior Field Inspector Ahmad",
            "role": "WORKER",
            "estate_permissions": ["North Estate (PT Palm Indo)"],
            "block_permissions": ["B001", "B005", "B012", "B019", "B020", "B028", "B030", "B031"]
        },
        {
            "id": "USR-WRK-02",
            "email": "inspector.budi@palmai.com",
            "password": "WorkerPassword2026!",
            "full_name": "Field Agronomist Budi",
            "role": "WORKER",
            "estate_permissions": ["North Estate (PT Palm Indo)"],
            "block_permissions": ["*"]
        }
    ]

    for u in seed_users:
        cur.execute("SELECT id FROM users WHERE email = ?;", (u["email"],))
        existing = cur.fetchone()
        if not existing:
            p_hash, salt = hash_password(u["password"])
            cur.execute("""
                INSERT INTO users (id, email, password_hash, salt, full_name, role, estate_permissions, block_permissions, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                u["id"],
                u["email"],
                p_hash,
                salt,
                u["full_name"],
                u["role"],
                json.dumps(u["estate_permissions"]),
                json.dumps(u["block_permissions"]),
                now
            ))

    # Seed Initial Evidence-Grounded Operational Field Tasks
    seed_tasks = [
        {
            "task_id": "TSK-B001-001",
            "estate_id": "North Estate (PT Palm Indo)",
            "block_id": "B001",
            "title": "B001 Urgent Foliar Deficiency & Yield Verification",
            "source_issue": "Nutrient Imbalance & Severe Yield Gap (-48.2%)",
            "evidence_summary": {
                "screening_score": 70.0,
                "risk_level": "HIGH",
                "actual_yield": 10.66,
                "expected_yield": 20.58,
                "yield_gap_pct": -48.2,
                "nutrient_concern": "Critical Nitrogen & Potassium Deficit (N=2.31%, K=0.72%, Mg=0.18%)",
                "dris_primary": "P"
            },
            "assigned_to_user_id": "USR-WRK-01",
            "assigned_by_user_id": "USR-MGR-01",
            "priority": "CRITICAL",
            "due_date": (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d"),
            "checklist": [
                "Inspect Frond 17 sampling trees for chlorosis and orange spotting",
                "Check perimeter drainage ditches for localized waterlogging or root suffocation",
                "Verify harvest count tally at FFB weighbridge collection point",
                "Collect supplementary Frond 17 tissue samples from flagged sub-blocks"
            ],
            "required_evidence": [
                "Photographic evidence of frond canopy chlorosis",
                "Weighbridge batch ticket verification number",
                "Soil moisture probe reading at 30cm depth"
            ],
            "status": "ASSIGNED",
            "worker_findings": None,
            "worker_followup_notes": None,
            "worker_inspection_date": None,
            "worker_attachment_path": None,
            "submitted_at": None,
            "manager_review_comments": None,
            "reviewed_at": None,
            "reviewed_by_user_id": None,
            "completed_at": None,
            "created_at": now,
            "updated_at": now
        },
        {
            "task_id": "TSK-B005-001",
            "estate_id": "North Estate (PT Palm Indo)",
            "block_id": "B005",
            "title": "B005 Yield Lag & Phosphate Deficiency Inspection",
            "source_issue": "Yield risk (11.02 t/ha vs 17.63 t/ha benchmark); Foliar P Limitation",
            "evidence_summary": {
                "screening_score": 53.8,
                "risk_level": "MEDIUM",
                "actual_yield": 11.02,
                "expected_yield": 17.63,
                "yield_gap_pct": -37.5,
                "nutrient_concern": "Moderate N and P deficiency",
                "dris_primary": "P"
            },
            "assigned_to_user_id": "USR-WRK-01",
            "assigned_by_user_id": "USR-MGR-01",
            "priority": "ELEVATED",
            "due_date": (datetime.now(timezone.utc) + timedelta(days=4)).strftime("%Y-%m-%d"),
            "checklist": [
                "Verify Rock Phosphate broadcasting compliance in palm circles",
                "Inspect weed competition in harvesting paths",
                "Check bunch bunch count on 20 sample palms"
            ],
            "required_evidence": [
                "Fertilizer application marker check",
                "Frond length measurement report"
            ],
            "status": "OPEN",
            "worker_findings": None,
            "worker_followup_notes": None,
            "worker_inspection_date": None,
            "worker_attachment_path": None,
            "submitted_at": None,
            "manager_review_comments": None,
            "reviewed_at": None,
            "reviewed_by_user_id": None,
            "completed_at": None,
            "created_at": now,
            "updated_at": now
        },
        {
            "task_id": "TSK-B012-001",
            "estate_id": "North Estate (PT Palm Indo)",
            "block_id": "B012",
            "title": "B012 Routine Vegetative Frond & Soil Verification",
            "source_issue": "High Productivity Verification (21.54 t/ha) — Routine Maintenance Audit",
            "evidence_summary": {
                "screening_score": 34.6,
                "risk_level": "LOW",
                "actual_yield": 21.54,
                "expected_yield": 22.10,
                "yield_gap_pct": -2.5,
                "nutrient_concern": "Healthy vegetative range; minor Ca variance",
                "dris_primary": "None"
            },
            "assigned_to_user_id": "USR-WRK-01",
            "assigned_by_user_id": "USR-MGR-01",
            "priority": "ROUTINE",
            "due_date": (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d"),
            "checklist": [
                "Quarterly FFB bunch weight verification",
                "Inspect canopy coverage for routine maintenance"
            ],
            "required_evidence": [
                "Signed field inspector log sheet"
            ],
            "status": "COMPLETED",
            "worker_findings": "Frond 17 sampling confirmed healthy canopy. No Ganoderma or bagworm detected. Harvest interval compliant at 8 days.",
            "worker_followup_notes": "Maintain current standard NPK application schedule. Re-sample soil in Q3.",
            "worker_inspection_date": (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%d"),
            "worker_attachment_path": None,
            "submitted_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
            "manager_review_comments": "Verified and approved. Yield performance benchmark confirmed.",
            "reviewed_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
            "reviewed_by_user_id": "USR-MGR-01",
            "completed_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
            "created_at": now,
            "updated_at": now
        }
    ]

    for t in seed_tasks:
        cur.execute("SELECT task_id FROM field_tasks WHERE task_id = ?;", (t["task_id"],))
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO field_tasks (
                    task_id, estate_id, block_id, title, source_issue, evidence_summary,
                    assigned_to_user_id, assigned_by_user_id, priority, due_date,
                    checklist, required_evidence, status, worker_findings, worker_followup_notes,
                    worker_inspection_date, worker_attachment_path, submitted_at,
                    manager_review_comments, reviewed_at, reviewed_by_user_id, completed_at,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                t["task_id"],
                t["estate_id"],
                t["block_id"],
                t["title"],
                t["source_issue"],
                json.dumps(t["evidence_summary"]),
                t["assigned_to_user_id"],
                t["assigned_by_user_id"],
                t["priority"],
                t["due_date"],
                json.dumps(t["checklist"]),
                json.dumps(t["required_evidence"]),
                t["status"],
                t["worker_findings"],
                t["worker_followup_notes"],
                t["worker_inspection_date"],
                t["worker_attachment_path"],
                t["submitted_at"],
                t["manager_review_comments"],
                t["reviewed_at"],
                t["reviewed_by_user_id"],
                t["completed_at"],
                t["created_at"],
                t["updated_at"]
            ))

            cur.execute("""
                INSERT INTO task_audit_log (task_id, user_id, action, previous_status, new_status, details, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?);
            """, (
                t["task_id"],
                t["assigned_by_user_id"],
                "TASK_INITIALIZED",
                None,
                t["status"],
                f"Task initialized with priority {t['priority']}",
                now
            ))

    # Seed Initial System Audit Events
    cur.execute("SELECT COUNT(*) as count FROM audit_events;")
    if cur.fetchone()["count"] == 0:
        cur.execute("""
            INSERT INTO audit_events (user_id, event_type, estate_id, details, timestamp)
            VALUES (?, ?, ?, ?, ?);
        """, ("USR-ADMIN-01", "SYSTEM_STARTUP", "North Estate (PT Palm Indo)", "PALM AI Enterprise Operational Database Initialized", now))

    conn.commit()
    conn.close()


if __name__ == "__main__":
    seed_default_data()
    print("Database initialized and seeded successfully.")
