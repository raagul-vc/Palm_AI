import React, { useState, useEffect } from "react";
import {
  Shield, UserCheck, LogOut, KeyRound, CheckCircle2, AlertTriangle,
  FileText, Users, X, ChevronDown, Lock, Mail, RefreshCw, Sparkles
} from "lucide-react";

const DEMO_ACCOUNTS = [
  {
    role: "MANAGER",
    label: "Agronomy Manager",
    email: "manager@palmai.com",
    password: "ManagerPassword2026!",
    name: "Estate Agronomy Operations Manager",
    badgeClass: "badge-manager"
  },
  {
    role: "WORKER",
    label: "Field Inspector",
    email: "worker@palmai.com",
    password: "WorkerPassword2026!",
    name: "Senior Field Inspector Ahmad",
    badgeClass: "badge-worker"
  },
  {
    role: "ADMIN",
    label: "Plantation Admin",
    email: "admin@palmai.com",
    password: "AdminPassword2026!",
    name: "Chief Plantation Administrator",
    badgeClass: "badge-admin"
  }
];

export default function AuthManager({ currentUser, onUserChange, authToken, onTokenChange }) {
  const [showModal, setShowModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // New user form state (Admin only)
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("WORKER");
  const [userCreateSuccess, setUserCreateSuccess] = useState("");

  // Handle direct login submission
  const handleLogin = async (email, password) => {
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }
      onTokenChange(data.token);
      onUserChange(data.user);
      setShowModal(false);
      setEmailInput("");
      setPasswordInput("");
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (authToken) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}` }
        });
      }
    } catch (err) {
      console.warn("Logout error:", err);
    } finally {
      onTokenChange(null);
      onUserChange(null);
      setShowModal(false);
    }
  };

  // Fetch Audit Logs (Admin only)
  const fetchAuditLogs = async () => {
    if (!authToken || currentUser?.role !== "ADMIN") return;
    setLoadingAudit(true);
    try {
      const res = await fetch("/api/audit-logs", {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setAuditLogs(data.audit_logs || []);
      }
    } catch (err) {
      console.warn("Failed to fetch audit logs:", err);
    } finally {
      setLoadingAudit(false);
    }
  };

  // Fetch users for user management (Admin/Manager)
  const fetchUsers = async () => {
    if (!authToken || !["ADMIN", "MANAGER"].includes(currentUser?.role)) return;
    try {
      const res = await fetch("/api/auth/users", {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setAllUsers(data.users || []);
      }
    } catch (err) {
      console.warn("Failed to fetch users:", err);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword || !newUserName) return;
    setUserCreateSuccess("");
    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          email: newUserEmail,
          full_name: newUserName,
          password: newUserPassword,
          role: newUserRole
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      setUserCreateSuccess(`User ${data.user.email} successfully created.`);
      setNewUserEmail("");
      setNewUserName("");
      setNewUserPassword("");
      fetchUsers();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="auth-manager-cluster">
      {/* Active User Topbar Trigger */}
      {currentUser ? (
        <button
          type="button"
          className="auth-profile-pill"
          onClick={() => setShowModal(true)}
          title={`Active User: ${currentUser.full_name} (${currentUser.role}). Click to switch role or inspect permissions.`}
        >
          <span className={`role-badge ${currentUser.role.toLowerCase()}`}>
            {currentUser.role}
          </span>
          <span className="user-short-name">{currentUser.full_name.split(" ")[0]}</span>
          <ChevronDown size={12} className="text-dim" />
        </button>
      ) : (
        <button
          type="button"
          className="auth-login-trigger-btn"
          onClick={() => setShowModal(true)}
          title="Sign in with enterprise credentials or test role accounts"
        >
          <Lock size={13} className="text-emerald" />
          <span>Sign In</span>
        </button>
      )}

      {/* Main Authentication & Role Switcher Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="auth-modal-header">
              <div className="auth-modal-title-group">
                <Shield size={20} className="text-emerald" />
                <div>
                  <h3>Enterprise Role Authentication</h3>
                  <p>PALM AI Multi-Role Security &amp; Access Control</p>
                </div>
              </div>
              <button
                type="button"
                className="close-modal-btn"
                onClick={() => setShowModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Current Active Account Card */}
            {currentUser && (
              <div className="active-user-strip">
                <div className="active-user-meta">
                  <span className="active-user-label">Currently Authenticated:</span>
                  <strong className="active-user-name">{currentUser.full_name}</strong>
                  <span className="active-user-email">{currentUser.email}</span>
                </div>
                <div className="active-user-actions">
                  <span className={`role-badge ${currentUser.role.toLowerCase()}`}>
                    {currentUser.role} ROLE
                  </span>
                  {currentUser.role === "ADMIN" && (
                    <button
                      type="button"
                      className="admin-tool-btn"
                      onClick={() => {
                        fetchAuditLogs();
                        setShowAuditModal(true);
                      }}
                    >
                      <FileText size={13} />
                      <span>Audit Logs</span>
                    </button>
                  )}
                  {currentUser.role === "ADMIN" && (
                    <button
                      type="button"
                      className="admin-tool-btn"
                      onClick={() => {
                        fetchUsers();
                        setShowUserModal(true);
                      }}
                    >
                      <Users size={13} />
                      <span>Manage Users</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="auth-logout-btn"
                    onClick={handleLogout}
                  >
                    <LogOut size={13} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}

            {/* 1-Click Role Switcher for Verification & Evaluation */}
            <div className="role-switcher-section">
              <h4 className="role-switcher-heading">
                <Sparkles size={14} className="text-gold" />
                <span>Instant Role Switcher (Pre-Seeded Commercial Accounts)</span>
              </h4>
              <p className="role-switcher-hint">
                Switch instantly between roles to verify permission gates, task assignments, inspection submissions, and manager approvals.
              </p>
              <div className="role-cards-grid">
                {DEMO_ACCOUNTS.map((acc) => {
                  const isActive = currentUser?.email === acc.email;
                  return (
                    <div
                      key={acc.role}
                      className={`role-select-card ${isActive ? "active-role" : ""}`}
                      onClick={() => handleLogin(acc.email, acc.password)}
                    >
                      <div className="role-card-top">
                        <span className={`role-badge ${acc.role.toLowerCase()}`}>
                          {acc.role}
                        </span>
                        {isActive && <CheckCircle2 size={14} className="text-emerald" />}
                      </div>
                      <strong className="role-card-name">{acc.label}</strong>
                      <span className="role-card-user">{acc.name}</span>
                      <span className="role-card-email">{acc.email}</span>
                      <button
                        type="button"
                        className="role-activate-btn"
                        disabled={isSubmitting}
                      >
                        {isActive ? "Active Account" : `Switch to ${acc.label}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Credentials Form */}
            <div className="custom-login-section">
              <h4 className="custom-login-heading">Or Sign In with Custom Credentials</h4>
              {errorMsg && (
                <div className="auth-error-banner">
                  <AlertTriangle size={14} />
                  <span>{errorMsg}</span>
                </div>
              )}
              <form
                className="auth-login-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLogin(emailInput, passwordInput);
                }}
              >
                <div className="auth-input-group">
                  <label htmlFor="auth-email-input">Email Address</label>
                  <div className="auth-input-wrap">
                    <Mail size={14} className="auth-input-icon" />
                    <input
                      id="auth-email-input"
                      type="email"
                      placeholder="e.g. manager@palmai.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="auth-input-group">
                  <label htmlFor="auth-pwd-input">Password</label>
                  <div className="auth-input-wrap">
                    <KeyRound size={14} className="auth-input-icon" />
                    <input
                      id="auth-pwd-input"
                      type="password"
                      placeholder="••••••••••••"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="auth-submit-btn"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Authenticating..." : "Sign In to Enterprise Workspace"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Admin Audit Logs Modal */}
      {showAuditModal && (
        <div className="modal-backdrop" onClick={() => setShowAuditModal(false)}>
          <div className="audit-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="audit-modal-header">
              <div className="audit-modal-title">
                <FileText size={18} className="text-emerald" />
                <h3>Enterprise Security &amp; Operational Audit Trail</h3>
              </div>
              <button
                type="button"
                className="close-modal-btn"
                onClick={() => setShowAuditModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="audit-modal-body">
              {loadingAudit ? (
                <div className="audit-loading">Loading audit records...</div>
              ) : auditLogs.length === 0 ? (
                <div className="audit-empty">No audit events recorded yet.</div>
              ) : (
                <div className="audit-table-wrap">
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>Time (UTC)</th>
                        <th>Event</th>
                        <th>Actor</th>
                        <th>Role</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="audit-time">{log.timestamp.slice(0, 19).replace("T", " ")}</td>
                          <td><span className="event-tag">{log.event_type}</span></td>
                          <td><strong>{log.user_name}</strong></td>
                          <td><span className={`role-badge ${log.user_role?.toLowerCase()}`}>{log.user_role}</span></td>
                          <td className="audit-details">{log.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Admin User Management Modal */}
      {showUserModal && (
        <div className="modal-backdrop" onClick={() => setShowUserModal(false)}>
          <div className="user-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="user-modal-header">
              <div className="user-modal-title">
                <Users size={18} className="text-emerald" />
                <h3>Plantation User &amp; Account Management</h3>
              </div>
              <button
                type="button"
                className="close-modal-btn"
                onClick={() => setShowUserModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="user-modal-body">
              {userCreateSuccess && (
                <div className="auth-success-banner">
                  <CheckCircle2 size={14} />
                  <span>{userCreateSuccess}</span>
                </div>
              )}
              <form className="create-user-form" onSubmit={handleCreateUser}>
                <h4>Create New Operational User Account</h4>
                <div className="create-user-grid">
                  <div className="auth-input-group">
                    <label>Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Agronomist Farhan"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="auth-input-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      placeholder="e.g. farhan@palmai.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="auth-input-group">
                    <label>Password</label>
                    <input
                      type="password"
                      placeholder="Min 8 characters"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="auth-input-group">
                    <label>Role</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value)}
                    >
                      <option value="WORKER">WORKER (Field Inspector)</option>
                      <option value="MANAGER">MANAGER (Agronomy Lead)</option>
                      <option value="ADMIN">ADMIN (System Administrator)</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="create-user-btn">
                  Create User Account
                </button>
              </form>

              <h4>Current Active Estate Accounts ({allUsers.length})</h4>
              <div className="users-list-wrap">
                {allUsers.map((u) => (
                  <div key={u.id} className="user-row-item">
                    <div>
                      <strong>{u.full_name}</strong>
                      <span className="user-email-sub">{u.email}</span>
                    </div>
                    <span className={`role-badge ${u.role.toLowerCase()}`}>{u.role}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
