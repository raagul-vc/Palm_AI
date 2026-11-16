"""
PALM AI Enterprise Database Engine & Persistence Layer
Dual-database persistent store supporting both PostgreSQL (via psycopg v3)
and SQLite for multi-user authentication, roles, field task lifecycle,
inspection submissions, and audit logging.
"""

import sqlite3
import hashlib
import secrets
import json
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse

try:
    import psycopg
    from psycopg.rows import dict_row
    HAS_PSYCOPG = True
except ImportError:
    HAS_PSYCOPG = False

BASE_DIR = Path(__file__).resolve().parent.parent


def get_db_url() -> str | None:
    """Returns normalized DATABASE_URL or None if not configured."""
    raw = (os.environ.get("DATABASE_URL") or os.environ.get("PALM_AI_DATABASE_URL") or "").strip()
    if not raw:
        return None

    # Strip leading shell/env assignment if present (e.g. DATABASE_URL="postgresql://...")
    if raw.startswith("DATABASE_URL="):
        raw = raw[len("DATABASE_URL="):].strip()

    # Strip psql CLI wrapper if copied directly from Neon psql tab (e.g. psql 'postgresql://...')
    if raw.startswith("psql "):
        raw = raw[5:].strip()

    # Strip surrounding single or double quotes or semicolons
    raw = raw.strip("\"'`;")

    # Normalize legacy postgres:// to postgresql://
    if raw.startswith("postgres://"):
        raw = raw.replace("postgres://", "postgresql://", 1)

    if not (raw.startswith("postgresql://") or raw.startswith("postgres://")):
        return None

    return raw


def is_postgres() -> bool:
    """Checks whether PostgreSQL is configured via DATABASE_URL."""
    url = get_db_url()
    if not url:
        return False
    return url.startswith("postgresql://") or url.startswith("postgres://")


def get_db_type() -> str:
    """Returns 'postgres' if configured, otherwise 'sqlite'."""
    return "postgres" if is_postgres() else "sqlite"


def mask_database_url(url: str | None = None) -> str:
    """Masks database credentials for safe logging without exposing secrets."""
    target = url or os.environ.get("DATABASE_URL", "")
    if not target:
        return "sqlite://local"
    try:
        p = urlparse(target)
        if p.password:
            masked_netloc = f"{p.username}:***@{p.hostname}"
            if p.port:
                masked_netloc += f":{p.port}"
            return p._replace(netloc=masked_netloc).geturl()
    except Exception:
        pass
    return "postgresql://***:***@***/"


_RESOLVED_DB_PATH = None


def get_db_path() -> Path:
    """Returns SQLite database file path (when SQLite is active)."""
    env_path = os.environ.get("PALM_AI_DB_PATH")
    if env_path:
        return Path(env_path)

    global _RESOLVED_DB_PATH
    if _RESOLVED_DB_PATH is not None:
        return _RESOLVED_DB_PATH

    default_dir = BASE_DIR / "data"
    try:
        default_dir.mkdir(parents=True, exist_ok=True)
        _RESOLVED_DB_PATH = default_dir / "palm_ai.db"
        return _RESOLVED_DB_PATH
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


def safe_json_loads(val, default=None):
    """Safely deserializes JSON string or returns already-parsed dict/list."""
    if val is None:
        return default
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return default


class DualCursorWrapper:
    """Cursor wrapper that normalizes parameter placeholders and row access."""
    def __init__(self, raw_cursor, is_pg=False):
        self._cur = raw_cursor
        self._is_pg = is_pg

    def execute(self, query: str, params=None):
        if self._is_pg and params is not None:
            # PostgreSQL psycopg uses '%s' placeholders instead of SQLite's '?'
            query = query.replace("?", "%s")
        if params is not None:
            return self._cur.execute(query, params)
        return self._cur.execute(query)

    def executemany(self, query: str, seq_of_params):
        if self._is_pg:
            query = query.replace("?", "%s")
        return self._cur.executemany(query, seq_of_params)

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    def fetchmany(self, size=None):
        if size is not None:
            return self._cur.fetchmany(size)
        return self._cur.fetchmany()

    @property
    def rowcount(self):
        return self._cur.rowcount

    @property
    def description(self):
        return self._cur.description

    def close(self):
        return self._cur.close()

    def __iter__(self):
        return iter(self._cur)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class DualConnectionWrapper:
    """Connection wrapper providing uniform commit, rollback, cursor, and execute methods."""
    def __init__(self, raw_conn, is_pg=False):
        self._conn = raw_conn
        self._is_pg = is_pg

    def cursor(self):
        return DualCursorWrapper(self._conn.cursor(), is_pg=self._is_pg)

    def commit(self):
        return self._conn.commit()

    def rollback(self):
        return self._conn.rollback()

    def close(self):
        return self._conn.close()

    def execute(self, query: str, params=None):
        cur = self.cursor()
        cur.execute(query, params)
        return cur

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self._conn.rollback()
        else:
            self._conn.commit()
        self.close()


def get_db_connection(timeout: float = 10.0):
    """
    Returns a unified database connection.
    If DATABASE_URL is set, connects to PostgreSQL via psycopg v3 with dict_row factory.
    Otherwise, returns local SQLite connection with sqlite3.Row factory and WAL mode.
    """
    if is_postgres():
        if not HAS_PSYCOPG:
            raise RuntimeError(
                "psycopg is required for PostgreSQL connections. Install via pip install 'psycopg[binary]>=3.1.18'."
            )
        url = get_db_url()
        try:
            raw_conn = psycopg.connect(url, row_factory=dict_row, connect_timeout=max(1, int(timeout)))
            return DualConnectionWrapper(raw_conn, is_pg=True)
        except Exception as e:
            masked = mask_database_url(url)
            raise RuntimeError(f"Failed to connect to PostgreSQL at {masked}: {type(e).__name__}")
    else:
        target_path = get_db_path()
        target_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(target_path), timeout=timeout)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        try:
            conn.execute("PRAGMA journal_mode = WAL;")
        except Exception:
            pass
        return DualConnectionWrapper(conn, is_pg=False)


def check_db_health(timeout: float = 3.0) -> dict:
    """
    Safely probes database connectivity without leaking credentials, connection string, or host details.
    Returns:
        {
            "connected": bool,
            "engine": "PostgreSQL" | "SQLite",
            "status": "connected" | "disconnected"
        }
    """
    engine_name = "PostgreSQL" if is_postgres() else "SQLite"
    try:
        conn = get_db_connection(timeout=timeout)
        cur = conn.cursor()
        cur.execute("SELECT 1;")
        cur.fetchone()
        conn.close()
        return {
            "connected": True,
            "engine": engine_name,
            "status": "connected"
        }
    except Exception:
        return {
            "connected": False,
            "engine": engine_name,
            "status": "disconnected"
        }


def init_db():
    """Initializes tables, indexes, and safe migrations for either PostgreSQL or SQLite."""
    conn = get_db_connection()
    cur = conn.cursor()
    is_pg = is_postgres()

    # Define primary key auto-increment syntax
    serial_pk = "SERIAL PRIMARY KEY" if is_pg else "INTEGER PRIMARY KEY AUTOINCREMENT"

    # 1. USERS TABLE
    cur.execute(f"""
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
            last_login TEXT,
            updated_at TEXT
        );
    """)

    # 2. SESSIONS TABLE
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
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
            assigned_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            assigned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
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
            updated_at TEXT NOT NULL
        );
    """)

    # 4. TASK AUDIT LOG
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS task_audit_log (
            id {serial_pk},
            task_id TEXT NOT NULL REFERENCES field_tasks(task_id) ON DELETE CASCADE,
            user_id TEXT,
            action TEXT NOT NULL,
            previous_status TEXT,
            new_status TEXT,
            details TEXT,
            timestamp TEXT NOT NULL
        );
    """)

    # 5. SYSTEM AUDIT EVENTS
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS audit_events (
            id {serial_pk},
            user_id TEXT,
            event_type TEXT NOT NULL,
            estate_id TEXT,
            block_id TEXT,
            ip_address TEXT,
            details TEXT,
            timestamp TEXT NOT NULL
        );
    """)

    # INDEXES (ANSI standard CREATE INDEX IF NOT EXISTS)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_tasks_block ON field_tasks(block_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status ON field_tasks(status);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON field_tasks(assigned_to_user_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);")

    # Safe Idempotent Schema Migrations
    if is_pg:
        # PostgreSQL supports ADD COLUMN IF NOT EXISTS
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TEXT;")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TEXT;")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 1;")
        cur.execute("ALTER TABLE field_tasks ADD COLUMN IF NOT EXISTS evidence_summary TEXT NOT NULL DEFAULT '{}';")
        cur.execute("ALTER TABLE field_tasks ADD COLUMN IF NOT EXISTS checklist TEXT NOT NULL DEFAULT '[]';")
        cur.execute("ALTER TABLE field_tasks ADD COLUMN IF NOT EXISTS required_evidence TEXT NOT NULL DEFAULT '[]';")
    else:
        # SQLite: inspect table_info to avoid duplicate column errors
        cur.execute("PRAGMA table_info(users);")
        user_cols = {row["name"] for row in cur.fetchall()}
        if "updated_at" not in user_cols:
            cur.execute("ALTER TABLE users ADD COLUMN updated_at TEXT;")
        if "last_login" not in user_cols:
            cur.execute("ALTER TABLE users ADD COLUMN last_login TEXT;")
        if "is_active" not in user_cols:
            cur.execute("ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;")

        cur.execute("PRAGMA table_info(field_tasks);")
        task_cols = {row["name"] for row in cur.fetchall()}
        if "evidence_summary" not in task_cols:
            cur.execute("ALTER TABLE field_tasks ADD COLUMN evidence_summary TEXT NOT NULL DEFAULT '{}';")
        if "checklist" not in task_cols:
            cur.execute("ALTER TABLE field_tasks ADD COLUMN checklist TEXT NOT NULL DEFAULT '[]';")
        if "required_evidence" not in task_cols:
            cur.execute("ALTER TABLE field_tasks ADD COLUMN required_evidence TEXT NOT NULL DEFAULT '[]';")

    conn.commit()
    conn.close()


def seed_default_data():
    """Seeds default enterprise accounts and initial real-grounded field directives."""
    init_db()
    conn = get_db_connection()
    cur = conn.cursor()

    now = datetime.now(timezone.utc).isoformat()

    is_prod = os.environ.get("PALM_AI_ENV", "").lower() == "production" or os.environ.get("RENDER", "").lower() == "true"
    enable_demo = os.environ.get("PALM_AI_ENABLE_DEMO_ACCOUNTS", "false" if is_prod else "true").lower() in ("true", "1", "yes")
    default_active = 1 if enable_demo else 0

    # Default Accounts (disabled by default in production unless PALM_AI_ENABLE_DEMO_ACCOUNTS=true)
    seed_users = [
        {
            "id": "USR-ADMIN-01",
            "email": "admin@palmai.com",
            "password": "AdminPassword2026!",
            "full_name": "Chief Plantation Administrator",
            "role": "ADMIN",
            "estate_permissions": ["*"],
            "block_permissions": ["*"],
            "is_active": default_active
        },
        {
            "id": "USR-MGR-01",
            "email": "manager@palmai.com",
            "password": "ManagerPassword2026!",
            "full_name": "Estate Agronomy Operations Manager",
            "role": "MANAGER",
            "estate_permissions": ["North Estate (PT Palm Indo)"],
            "block_permissions": ["*"],
            "is_active": default_active
        },
        {
            "id": "USR-WRK-01",
            "email": "worker@palmai.com",
            "password": "WorkerPassword2026!",
            "full_name": "Senior Field Inspector Ahmad",
            "role": "WORKER",
            "estate_permissions": ["North Estate (PT Palm Indo)"],
            "block_permissions": ["B001", "B005", "B012", "B019", "B020", "B028", "B030", "B031"],
            "is_active": default_active
        },
        {
            "id": "USR-WRK-02",
            "email": "inspector.budi@palmai.com",
            "password": "WorkerPassword2026!",
            "full_name": "Field Agronomist Budi",
            "role": "WORKER",
            "estate_permissions": ["North Estate (PT Palm Indo)"],
            "block_permissions": ["*"],
            "is_active": default_active
        }
    ]

    for u in seed_users:
        cur.execute("SELECT id FROM users WHERE email = ?;", (u["email"],))
        existing = cur.fetchone()
        if not existing:
            p_hash, salt = hash_password(u["password"])
            cur.execute("""
                INSERT INTO users (id, email, password_hash, salt, full_name, role, estate_permissions, block_permissions, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                u["id"],
                u["email"],
                p_hash,
                salt,
                u["full_name"],
                u["role"],
                json.dumps(u["estate_permissions"]),
                json.dumps(u["block_permissions"]),
                u.get("is_active", 1),
                now
            ))

    # Environment-based Initial Admin Provisioning (One-Time Bootstrap only)
    # Strictly checks that 0 active ADMINs exist before provisioning.
    # Never overwrites or resets an existing active admin password.
    env_admin_email = os.environ.get("PALM_AI_ADMIN_EMAIL", "").strip().lower()
    env_admin_pass = os.environ.get("PALM_AI_ADMIN_PASSWORD", "")
    if env_admin_email and env_admin_pass:
        cur.execute("SELECT COUNT(*) as cnt FROM users WHERE role = 'ADMIN' AND is_active = 1;")
        row = cur.fetchone()
        active_cnt = (row.get("cnt") if isinstance(row, dict) else row["cnt"]) if row else 0
        if active_cnt == 0:
            cur.execute("SELECT id, is_active FROM users WHERE email = ?;", (env_admin_email,))
            existing_user = cur.fetchone()
            p_hash, salt = hash_password(env_admin_pass)
            if existing_user and existing_user["is_active"] == 0:
                cur.execute("""
                    UPDATE users
                    SET password_hash = ?, salt = ?, role = 'ADMIN', is_active = 1, updated_at = ?
                    WHERE id = ?;
                """, (p_hash, salt, now, existing_user["id"]))
            elif not existing_user:
                new_adm_id = f"USR-ADM-{secrets.token_hex(2).upper()}"
                cur.execute("""
                    INSERT INTO users (id, email, password_hash, salt, full_name, role, estate_permissions, block_permissions, is_active, created_at)
                    VALUES (?, ?, ?, ?, 'Enterprise Administrator', 'ADMIN', '["*"]', '["*"]', 1, ?);
                """, (new_adm_id, env_admin_email, p_hash, salt, now))
            cur.execute("""
                INSERT INTO audit_events (user_id, event_type, details, timestamp)
                VALUES ('SYSTEM', 'BOOTSTRAP_ADMIN_PROVISIONED', 'Initial admin account provisioned via secure environment bootstrap', ?);
            """, (now,))

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
    row = cur.fetchone()
    count_val = (row.get("count") if isinstance(row, dict) else row["count"]) if row else 0
    if count_val == 0:
        cur.execute("""
            INSERT INTO audit_events (user_id, event_type, estate_id, details, timestamp)
            VALUES (?, ?, ?, ?, ?);
        """, ("USR-ADMIN-01", "SYSTEM_STARTUP", "North Estate (PT Palm Indo)", "PALM AI Enterprise Operational Database Initialized", now))

    conn.commit()
    conn.close()


if __name__ == "__main__":
    seed_default_data()
    print(f"Database ({get_db_type().upper()}) initialized and seeded successfully.")
