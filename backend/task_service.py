"""
PALM AI Enterprise Field Operations & Task Service
Manages real task lifecycle:
OPEN -> ASSIGNED -> IN_PROGRESS -> SUBMITTED -> APPROVED / RETURNED -> COMPLETED
with immutable audit trail, worker observation submissions, and manager review.
"""

import json
from datetime import datetime, timezone
import secrets
from backend.database import get_db_connection


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_tasks(user: dict, estate_id: str = None, block_id: str = None, status: str = None, priority: str = None) -> list[dict]:
    """Lists tasks filtered by user role and query parameters."""
    conn = get_db_connection()
    cur = conn.cursor()

    query = """
        SELECT t.*,
               u_assignee.full_name as assignee_name,
               u_assignee.email as assignee_email,
               u_creator.full_name as creator_name
        FROM field_tasks t
        LEFT JOIN users u_assignee ON t.assigned_to_user_id = u_assignee.id
        LEFT JOIN users u_creator ON t.assigned_by_user_id = u_creator.id
        WHERE 1=1
    """
    params = []

    # Role-based scoping
    if user["role"] == "WORKER":
        # Workers can only see tasks explicitly assigned to them OR within their permitted blocks
        allowed_blocks = user.get("block_permissions", [])
        if "*" in allowed_blocks:
            query += " AND (t.assigned_to_user_id = ? OR 1=1)"
            params.append(user["id"])
        else:
            placeholders = ",".join("?" for _ in allowed_blocks)
            query += f" AND (t.assigned_to_user_id = ? OR t.block_id IN ({placeholders}))"
            params.append(user["id"])
            params.extend([b.upper() for b in allowed_blocks])
    else:
        # Managers & Admins: scope to authorized estates
        allowed_estates = user.get("estate_permissions", [])
        if "*" not in allowed_estates:
            placeholders = ",".join("?" for _ in allowed_estates)
            query += f" AND t.estate_id IN ({placeholders})"
            params.extend(allowed_estates)

    if estate_id:
        query += " AND t.estate_id = ?"
        params.append(estate_id)

    if block_id:
        query += " AND UPPER(t.block_id) = ?"
        params.append(block_id.upper())

    if status:
        query += " AND t.status = ?"
        params.append(status.upper())

    if priority:
        query += " AND t.priority = ?"
        params.append(priority.upper())

    query += " ORDER BY CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'ELEVATED' THEN 2 ELSE 3 END, created_at DESC;"

    cur.execute(query, params)
    rows = cur.fetchall()
    conn.close()

    tasks = []
    for r in rows:
        tasks.append({
            "task_id": r["task_id"],
            "estate_id": r["estate_id"],
            "block_id": r["block_id"],
            "title": r["title"],
            "source_issue": r["source_issue"],
            "evidence_summary": json.loads(r["evidence_summary"] or "{}"),
            "assigned_to_user_id": r["assigned_to_user_id"],
            "assignee_name": r["assignee_name"] or "Unassigned",
            "assignee_email": r["assignee_email"],
            "assigned_by_user_id": r["assigned_by_user_id"],
            "creator_name": r["creator_name"],
            "priority": r["priority"],
            "due_date": r["due_date"],
            "checklist": json.loads(r["checklist"] or "[]"),
            "required_evidence": json.loads(r["required_evidence"] or "[]"),
            "status": r["status"],
            "worker_findings": r["worker_findings"],
            "worker_followup_notes": r["worker_followup_notes"],
            "worker_inspection_date": r["worker_inspection_date"],
            "worker_attachment_path": r["worker_attachment_path"],
            "submitted_at": r["submitted_at"],
            "manager_review_comments": r["manager_review_comments"],
            "reviewed_at": r["reviewed_at"],
            "completed_at": r["completed_at"],
            "created_at": r["created_at"],
            "updated_at": r["updated_at"]
        })
    return tasks


def get_task_by_id(task_id: str, user: dict) -> dict | None:
    """Gets task details with full audit log."""
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT t.*,
               u_assignee.full_name as assignee_name,
               u_assignee.email as assignee_email,
               u_creator.full_name as creator_name,
               u_reviewer.full_name as reviewer_name
        FROM field_tasks t
        LEFT JOIN users u_assignee ON t.assigned_to_user_id = u_assignee.id
        LEFT JOIN users u_creator ON t.assigned_by_user_id = u_creator.id
        LEFT JOIN users u_reviewer ON t.reviewed_by_user_id = u_reviewer.id
        WHERE t.task_id = ?;
    """, (task_id,))
    r = cur.fetchone()

    if not r:
        conn.close()
        return None

    # Check permission
    if user["role"] == "WORKER":
        allowed_blocks = user.get("block_permissions", [])
        if "*" not in allowed_blocks and r["block_id"].upper() not in [b.upper() for b in allowed_blocks] and r["assigned_to_user_id"] != user["id"]:
            conn.close()
            return None

    # Fetch audit log
    cur.execute("""
        SELECT a.*, u.full_name as actor_name, u.role as actor_role
        FROM task_audit_log a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.task_id = ?
        ORDER BY a.id ASC;
    """, (task_id,))
    audit_rows = cur.fetchall()
    conn.close()

    audit_trail = []
    for a in audit_rows:
        audit_trail.append({
            "id": a["id"],
            "action": a["action"],
            "actor_name": a["actor_name"] or "System",
            "actor_role": a["actor_role"],
            "previous_status": a["previous_status"],
            "new_status": a["new_status"],
            "details": a["details"],
            "timestamp": a["timestamp"]
        })

    return {
        "task_id": r["task_id"],
        "estate_id": r["estate_id"],
        "block_id": r["block_id"],
        "title": r["title"],
        "source_issue": r["source_issue"],
        "evidence_summary": json.loads(r["evidence_summary"] or "{}"),
        "assigned_to_user_id": r["assigned_to_user_id"],
        "assignee_name": r["assignee_name"] or "Unassigned",
        "assignee_email": r["assignee_email"],
        "assigned_by_user_id": r["assigned_by_user_id"],
        "creator_name": r["creator_name"],
        "reviewer_name": r["reviewer_name"],
        "priority": r["priority"],
        "due_date": r["due_date"],
        "checklist": json.loads(r["checklist"] or "[]"),
        "required_evidence": json.loads(r["required_evidence"] or "[]"),
        "status": r["status"],
        "worker_findings": r["worker_findings"],
        "worker_followup_notes": r["worker_followup_notes"],
        "worker_inspection_date": r["worker_inspection_date"],
        "worker_attachment_path": r["worker_attachment_path"],
        "submitted_at": r["submitted_at"],
        "manager_review_comments": r["manager_review_comments"],
        "reviewed_at": r["reviewed_at"],
        "completed_at": r["completed_at"],
        "created_at": r["created_at"],
        "updated_at": r["updated_at"],
        "audit_trail": audit_trail
    }


def create_task(user: dict, data: dict) -> tuple[dict | None, str | None]:
    """Creates a new field inspection task (Manager or Admin)."""
    block_id = str(data.get("block_id", "")).strip().upper()
    estate_id = data.get("estate_id", "North Estate (PT Palm Indo)")
    title = data.get("title", f"Inspection for Block {block_id}")
    source_issue = data.get("source_issue", "Grounded agronomic field check")
    priority = data.get("priority", "ROUTINE").upper()
    due_date = data.get("due_date")
    checklist = data.get("checklist", [])
    required_evidence = data.get("required_evidence", [])
    assigned_to = data.get("assigned_to_user_id")

    if not block_id:
        return None, "Block ID is required."
    if priority not in ("CRITICAL", "ELEVATED", "ROUTINE"):
        return None, "Priority must be CRITICAL, ELEVATED, or ROUTINE."

    task_id = f"TSK-{block_id}-{secrets.token_hex(3).upper()}"
    status = "ASSIGNED" if assigned_to else "OPEN"
    now = utc_now_iso()

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO field_tasks (
            task_id, estate_id, block_id, title, source_issue, evidence_summary,
            assigned_to_user_id, assigned_by_user_id, priority, due_date,
            checklist, required_evidence, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, (
        task_id,
        estate_id,
        block_id,
        title,
        source_issue,
        json.dumps(data.get("evidence_summary", {})),
        assigned_to,
        user["id"],
        priority,
        due_date,
        json.dumps(checklist),
        json.dumps(required_evidence),
        status,
        now,
        now
    ))

    # Audit log
    cur.execute("""
        INSERT INTO task_audit_log (task_id, user_id, action, previous_status, new_status, details, timestamp)
        VALUES (?, ?, 'TASK_CREATED', NULL, ?, ?, ?);
    """, (task_id, user["id"], status, f"Task created by {user['full_name']} ({user['role']})", now))

    conn.commit()
    conn.close()

    return get_task_by_id(task_id, user), None


def submit_task_inspection(task_id: str, user: dict, data: dict) -> tuple[dict | None, str | None]:
    """Worker records observations and submits task for manager review."""
    findings = data.get("findings", "").strip()
    notes = data.get("followup_notes", "").strip()
    inspection_date = data.get("inspection_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    attachment_path = data.get("attachment_path")

    if not findings:
        return None, "Inspection findings cannot be empty."

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT status, assigned_to_user_id FROM field_tasks WHERE task_id = ?;", (task_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        return None, "Task not found."

    prev_status = row["status"]
    now = utc_now_iso()

    cur.execute("""
        UPDATE field_tasks
        SET status = 'SUBMITTED',
            worker_findings = ?,
            worker_followup_notes = ?,
            worker_inspection_date = ?,
            worker_attachment_path = ?,
            submitted_at = ?,
            updated_at = ?
        WHERE task_id = ?;
    """, (findings, notes, inspection_date, attachment_path, now, now, task_id))

    cur.execute("""
        INSERT INTO task_audit_log (task_id, user_id, action, previous_status, new_status, details, timestamp)
        VALUES (?, ?, 'INSPECTION_SUBMITTED', ?, 'SUBMITTED', ?, ?);
    """, (task_id, user["id"], prev_status, f"Worker {user['full_name']} submitted field inspection observations", now))

    conn.commit()
    conn.close()

    return get_task_by_id(task_id, user), None


def review_task(task_id: str, user: dict, decision: str, comments: str) -> tuple[dict | None, str | None]:
    """Manager reviews submitted observations: APPROVE -> COMPLETED or RETURN -> RETURNED."""
    decision = decision.upper()
    if decision not in ("APPROVE", "RETURN"):
        return None, "Decision must be APPROVE or RETURN."

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT status FROM field_tasks WHERE task_id = ?;", (task_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        return None, "Task not found."

    prev_status = row["status"]
    new_status = "COMPLETED" if decision == "APPROVE" else "RETURNED"
    now = utc_now_iso()

    cur.execute("""
        UPDATE field_tasks
        SET status = ?,
            manager_review_comments = ?,
            reviewed_at = ?,
            reviewed_by_user_id = ?,
            completed_at = ?,
            updated_at = ?
        WHERE task_id = ?;
    """, (
        new_status,
        comments,
        now,
        user["id"],
        now if new_status == "COMPLETED" else None,
        now,
        task_id
    ))

    action_label = "REVIEW_APPROVED" if decision == "APPROVE" else "REVIEW_RETURNED"
    detail_msg = f"Manager {user['full_name']} {decision.lower()}ed inspection. Comments: {comments or 'None'}"

    cur.execute("""
        INSERT INTO task_audit_log (task_id, user_id, action, previous_status, new_status, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?);
    """, (task_id, user["id"], action_label, prev_status, new_status, detail_msg, now))

    conn.commit()
    conn.close()

    return get_task_by_id(task_id, user), None
