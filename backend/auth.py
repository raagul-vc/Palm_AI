"""
PALM AI Enterprise Authentication & Role-Based Access Control (RBAC)
Server-side token verification, session lifecycle, role enforcement,
and multi-tenant estate/block permission isolation.
"""

from functools import wraps
import json
import secrets
from datetime import datetime, timezone, timedelta
from flask import request, jsonify, g
from backend.database import get_db_connection, verify_password, hash_password


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def authenticate_user(email: str, password: str, ip_address: str = None) -> tuple[dict | None, str | None, str | None]:
    """
    Authenticates email and password.
    Returns (user_dict, session_token, error_message).
    """
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT * FROM users WHERE email = ? AND is_active = 1;", (email.strip().lower(),))
    user_row = cur.fetchone()

    if not user_row:
        conn.close()
        return None, None, "Invalid email or password."

    if not verify_password(password, user_row["password_hash"], user_row["salt"]):
        # Log failed attempt
        cur.execute("""
            INSERT INTO audit_events (user_id, event_type, details, ip_address, timestamp)
            VALUES (?, 'LOGIN_FAILED', 'Failed password verification', ?, ?);
        """, (user_row["id"], ip_address, utc_now_iso()))
        conn.commit()
        conn.close()
        return None, None, "Invalid email or password."

    # Create new session token (valid for 7 days)
    token = secrets.token_urlsafe(32)
    created_at = datetime.now(timezone.utc)
    expires_at = created_at + timedelta(days=7)

    cur.execute("""
        INSERT INTO sessions (token, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?);
    """, (token, user_row["id"], created_at.isoformat(), expires_at.isoformat()))

    # Update last login
    cur.execute("UPDATE users SET last_login = ? WHERE id = ?;", (created_at.isoformat(), user_row["id"]))

    # Audit login success
    cur.execute("""
        INSERT INTO audit_events (user_id, event_type, details, ip_address, timestamp)
        VALUES (?, 'LOGIN_SUCCESS', 'User successfully logged in', ?, ?);
    """, (user_row["id"], ip_address, created_at.isoformat()))

    conn.commit()

    user_dict = {
        "id": user_row["id"],
        "email": user_row["email"],
        "full_name": user_row["full_name"],
        "role": user_row["role"],
        "estate_permissions": json.loads(user_row["estate_permissions"]),
        "block_permissions": json.loads(user_row["block_permissions"]),
        "created_at": user_row["created_at"],
        "last_login": created_at.isoformat()
    }

    conn.close()
    return user_dict, token, None


def get_user_from_token(token: str) -> dict | None:
    """Retrieves active user dict from valid session token."""
    if not token:
        return None

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT s.expires_at, u.*
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND u.is_active = 1;
    """, (token,))
    row = cur.fetchone()
    conn.close()

    if not row:
        return None

    # Check expiration
    expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        return None

    return {
        "id": row["id"],
        "email": row["email"],
        "full_name": row["full_name"],
        "role": row["role"],
        "estate_permissions": json.loads(row["estate_permissions"]),
        "block_permissions": json.loads(row["block_permissions"])
    }


def logout_user(token: str) -> bool:
    """Invalidates session token and logs out user."""
    if not token:
        return False
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT user_id FROM sessions WHERE token = ?;", (token,))
    row = cur.fetchone()
    if row:
        user_id = row["user_id"]
        cur.execute("DELETE FROM sessions WHERE token = ?;", (token,))
        cur.execute("""
            INSERT INTO audit_events (user_id, event_type, details, timestamp)
            VALUES (?, 'LOGOUT', 'User logged out', ?);
        """, (user_id, utc_now_iso()))
        conn.commit()
    conn.close()
    return True


def extract_token_from_request() -> str | None:
    """Extracts bearer token from headers or query parameters."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip()
    # Fallback to custom header or query param
    return request.headers.get("X-Palm-Session-Token") or request.args.get("auth_token")


def check_estate_access(user: dict, estate_name: str) -> bool:
    """Checks if user has permission to access the given estate."""
    if not user or not estate_name:
        return False
    perms = user.get("estate_permissions", [])
    return "*" in perms or estate_name in perms


def check_block_access(user: dict, block_id: str) -> bool:
    """Checks if user has permission to access the given block."""
    if not user or not block_id:
        return False
    # Admins and Managers have estate-wide access to all blocks
    if user.get("role") in ("ADMIN", "MANAGER"):
        return True
    perms = user.get("block_permissions", [])
    return "*" in perms or block_id.upper() in [p.upper() for p in perms]


def require_auth(f):
    """Decorator requiring a valid active session token."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = extract_token_from_request()
        user = get_user_from_token(token)
        if not user:
            return jsonify({
                "error": "Unauthorized: Valid session token required. Please log in.",
                "code": "AUTH_REQUIRED"
            }), 401
        g.current_user = user
        return f(*args, **kwargs)
    return decorated


def optional_auth(f):
    """Attaches current_user to g if valid session exists, but does not block."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = extract_token_from_request()
        g.current_user = get_user_from_token(token) if token else None
        return f(*args, **kwargs)
    return decorated


def require_role(allowed_roles: list[str]):
    """Decorator requiring specific role(s) (e.g. ['ADMIN', 'MANAGER'])."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            token = extract_token_from_request()
            user = get_user_from_token(token)
            if not user:
                return jsonify({
                    "error": "Unauthorized: Session token required.",
                    "code": "AUTH_REQUIRED"
                }), 401
            if user["role"] not in allowed_roles:
                return jsonify({
                    "error": f"Forbidden: This action requires role in {allowed_roles}. Current role: {user['role']}.",
                    "code": "ROLE_UNAUTHORIZED"
                }), 403
            g.current_user = user
            return f(*args, **kwargs)
        return decorated
    return decorator
