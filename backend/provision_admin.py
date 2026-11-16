"""
PALM AI Secure Initial Administrator Provisioning & Credential Rotation CLI

Provides:
1. Interactive, zero-exposure terminal provisioning using getpass (passwords
   are never echoed, never stored in shell history, and never visible in process tables).
2. One-time initial provisioning lock: strictly verifies zero active ADMINs exist
   before executing initial bootstrap, preventing accidental overwrites or hijacking.
3. Explicit authenticated rotation (--rotate) requiring verification of current credentials.
4. Non-interactive headless container bootstrap using environment variables
   PALM_AI_ADMIN_EMAIL and PALM_AI_ADMIN_PASSWORD.
5. Strict audit logging and PBKDF2-HMAC-SHA256 password hashing.
"""

import sys
import os
import argparse
import getpass
import json
import secrets
from datetime import datetime, timezone
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.database import get_db_connection, hash_password, verify_password, init_db


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_active_admins() -> list[dict]:
    """Returns list of currently active admin accounts."""
    init_db()
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, email, full_name, role, is_active, created_at
        FROM users
        WHERE role = 'ADMIN' AND is_active = 1;
    """)
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def provision_initial_admin(email: str, password: str, full_name: str = "Plantation Administrator") -> tuple[bool, str]:
    """
    Provisions the initial active administrator.
    Fails safely if an active admin already exists.
    """
    init_db()
    active_admins = get_active_admins()
    if active_admins:
        admin_emails = ", ".join(a["email"] for a in active_admins)
        return False, f"Provisioning locked: {len(active_admins)} active admin account(s) already exist ({admin_emails}). Use --rotate to change credentials."

    email = email.strip().lower()
    if not email or "@" not in email:
        return False, "Invalid email address format."

    if len(password) < 10:
        return False, "Password must be at least 10 characters in length."

    conn = get_db_connection()
    cur = conn.cursor()
    now = utc_now_iso()

    cur.execute("SELECT id, is_active FROM users WHERE email = ?;", (email,))
    existing = cur.fetchone()

    p_hash, salt = hash_password(password)

    if existing:
        user_id = existing["id"]
        cur.execute("""
            UPDATE users
            SET password_hash = ?,
                salt = ?,
                role = 'ADMIN',
                full_name = ?,
                estate_permissions = '["*"]',
                block_permissions = '["*"]',
                is_active = 1,
                updated_at = ?
            WHERE id = ?;
        """, (p_hash, salt, full_name, now, user_id))
    else:
        user_id = f"USR-ADM-{secrets.token_hex(2).upper()}"
        cur.execute("""
            INSERT INTO users (id, email, password_hash, salt, full_name, role, estate_permissions, block_permissions, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, 'ADMIN', '["*"]', '["*"]', 1, ?);
        """, (user_id, email, p_hash, salt, full_name, now))

    cur.execute("""
        INSERT INTO audit_events (user_id, event_type, details, timestamp)
        VALUES (?, 'ADMIN_PROVISIONED', 'Initial administrator provisioned via secure CLI', ?);
    """, (user_id, now))

    conn.commit()
    conn.close()

    return True, f"Successfully provisioned initial ADMIN account: {email} (User ID: {user_id})"


def rotate_admin_password(email: str, current_pass: str, new_pass: str) -> tuple[bool, str]:
    """
    Safely rotates an existing administrator password after authenticating current credentials.
    """
    init_db()
    email = email.strip().lower()
    if not email:
        return False, "Email address required."

    if len(new_pass) < 10:
        return False, "New password must be at least 10 characters in length."

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT id, password_hash, salt, role, is_active FROM users WHERE email = ?;", (email,))
    user = cur.fetchone()

    if not user or user["role"] != "ADMIN" or not user["is_active"]:
        conn.close()
        return False, "Active administrator account not found."

    if not verify_password(current_pass, user["password_hash"], user["salt"]):
        conn.close()
        return False, "Current password verification failed. Rotation aborted."

    p_hash, salt = hash_password(new_pass)
    now = utc_now_iso()

    cur.execute("""
        UPDATE users
        SET password_hash = ?, salt = ?, updated_at = ?
        WHERE id = ?;
    """, (p_hash, salt, now, user["id"]))

    # Invalidate existing active sessions for this admin upon password rotation
    cur.execute("DELETE FROM sessions WHERE user_id = ?;", (user["id"],))

    cur.execute("""
        INSERT INTO audit_events (user_id, event_type, details, timestamp)
        VALUES (?, 'ADMIN_PASSWORD_ROTATED', 'Administrator password rotated and active sessions invalidated', ?);
    """, (user["id"], now))

    conn.commit()
    conn.close()

    return True, f"Successfully rotated credentials for administrator {email}. All prior sessions invalidated."


def run_interactive():
    print("=" * 70)
    print("  PALM AI SECURE ADMINISTRATOR PROVISIONING")
    print("=" * 70)

    active_admins = get_active_admins()
    if active_admins:
        print("\n[SECURITY NOTICE] Active administrator(s) already exist:")
        for adm in active_admins:
            print(f"  • {adm['email']} (ID: {adm['id']}, Created: {adm.get('created_at', 'N/A')})")
        print("\nOne-time provisioning is locked to prevent unauthorized credential reset.")
        print("To change an existing administrator password, run with --rotate.")
        sys.exit(0)

    print("\nNo active administrator found. Initializing primary ADMIN account...\n")
    email_input = input("Enter Administrator Email [default: admin@palmai.com]: ").strip()
    email = email_input if email_input else "admin@palmai.com"

    name_input = input("Enter Full Name [default: Plantation Administrator]: ").strip()
    full_name = name_input if name_input else "Plantation Administrator"

    password = getpass.getpass("Enter Administrator Password (min 10 characters): ")
    if len(password) < 10:
        print("\n[ERROR] Password must be at least 10 characters.")
        sys.exit(1)

    confirm = getpass.getpass("Confirm Administrator Password: ")
    if password != confirm:
        print("\n[ERROR] Passwords do not match.")
        sys.exit(1)

    success, msg = provision_initial_admin(email, password, full_name)
    if success:
        print(f"\n[SUCCESS] {msg}")
    else:
        print(f"\n[FAILED] {msg}")
        sys.exit(1)


def run_interactive_rotate():
    print("=" * 70)
    print("  PALM AI ADMINISTRATOR CREDENTIAL ROTATION")
    print("=" * 70)

    email = input("\nEnter Administrator Email: ").strip().lower()
    current_pass = getpass.getpass("Enter CURRENT Administrator Password: ")
    new_pass = getpass.getpass("Enter NEW Administrator Password (min 10 characters): ")
    confirm_pass = getpass.getpass("Confirm NEW Administrator Password: ")

    if new_pass != confirm_pass:
        print("\n[ERROR] Passwords do not match.")
        sys.exit(1)

    success, msg = rotate_admin_password(email, current_pass, new_pass)
    if success:
        print(f"\n[SUCCESS] {msg}")
    else:
        print(f"\n[FAILED] {msg}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="PALM AI Secure Admin Provisioning CLI")
    parser.add_argument("--rotate", action="store_true", help="Rotate credentials for an existing administrator")
    parser.add_argument("--non-interactive", action="store_true", help="Bootstrap using PALM_AI_ADMIN_EMAIL and PALM_AI_ADMIN_PASSWORD environment variables")
    parser.add_argument("--check", action="store_true", help="Check if an active administrator is already provisioned")
    args = parser.parse_args()

    if args.check:
        admins = get_active_admins()
        if admins:
            print(f"ACTIVE_ADMINS_EXIST: {len(admins)}")
            for a in admins:
                print(f"  - {a['email']} ({a['id']})")
        else:
            print("NO_ACTIVE_ADMINS")
        return

    if args.rotate:
        run_interactive_rotate()
        return

    if args.non_interactive:
        email = os.environ.get("PALM_AI_ADMIN_EMAIL", "").strip()
        password = os.environ.get("PALM_AI_ADMIN_PASSWORD", "")
        name = os.environ.get("PALM_AI_ADMIN_NAME", "Plantation Administrator")
        if not email or not password:
            print("[ERROR] PALM_AI_ADMIN_EMAIL and PALM_AI_ADMIN_PASSWORD environment variables required for --non-interactive.")
            sys.exit(1)
        success, msg = provision_initial_admin(email, password, name)
        if success:
            print(f"[SUCCESS] {msg}")
        else:
            print(f"[NOTICE] {msg}")
        return

    # Default to interactive
    run_interactive()


if __name__ == "__main__":
    main()
