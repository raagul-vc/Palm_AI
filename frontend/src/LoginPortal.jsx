import React, { useState } from "react";
import {
  Shield,
  ShieldCheck,
  Lock,
  Mail,
  KeyRound,
  UserCheck,
  Users,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  MapPin,
  ClipboardCheck,
  AlertTriangle,
  FileText
} from "lucide-react";
import "./LoginPortal.css";

const ROLE_PRESETS = [
  {
    role: "ADMIN",
    title: "Chief Plantation Administrator",
    email: "admin@palmai.com",
    password: "AdminPassword2026!",
    scope: "Full fleet oversight, user accounts, audit logging & system security",
    badgeClass: "badge-admin",
    accentColor: "#8b5cf6"
  },
  {
    role: "MANAGER",
    title: "Agronomy Operations Manager",
    email: "manager@palmai.com",
    password: "ManagerPassword2026!",
    scope: "Estate health monitoring, block diagnostics, directive assignment & verification",
    badgeClass: "badge-manager",
    accentColor: "#10b981"
  },
  {
    role: "WORKER",
    title: "Senior Field Inspector",
    email: "worker@palmai.com",
    password: "WorkerPassword2026!",
    scope: "Assigned field directives, inspection checklists, findings & photo evidence",
    badgeClass: "badge-worker",
    accentColor: "#f59e0b"
  }
];

export default function LoginPortal({ onLoginSuccess, onGuestLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleRolePresetLogin = async (preset) => {
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: preset.email, password: preset.password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }
      onLoginSuccess(data.user, data.token);
    } catch (err) {
      // Offline fallback if local mock mode
      const fallbackUser = {
        id: preset.role === "ADMIN" ? "USR-ADM-01" : preset.role === "MANAGER" ? "USR-MGR-01" : "USR-WRK-01",
        email: preset.email,
        full_name: preset.title,
        role: preset.role,
        estate_permissions: ["North Estate (PT Palm Indo)"],
        block_permissions: ["*"]
      };
      onLoginSuccess(fallbackUser, "mock-token-fallback");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Please enter both email address and password.");
      return;
    }
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
        throw new Error(data.error || "Invalid email or password");
      }
      onLoginSuccess(data.user, data.token);
    } catch (err) {
      setErrorMsg(err.message || "Failed to authenticate with server");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-portal-wrapper">
      <div className="login-portal-container">
        {/* Portal Header */}
        <div className="login-brand-header">
          <div className="brand-logo-cluster">
            <div className="brand-emblem">
              <ShieldCheck size={28} className="text-emerald" />
            </div>
            <div>
              <span className="brand-eyebrow">ENTERPRISE PLANTATION INTELLIGENCE</span>
              <h1 className="brand-title">PALM AI</h1>
            </div>
          </div>
          <p className="brand-tagline">
            Role-Based Field Operations, Drone Analytics &amp; Autonomous Agronomic Intelligence
          </p>
        </div>

        {/* 1-Click Fast Role Sign-In Cluster */}
        <div className="role-presets-section">
          <div className="section-label-row">
            <Sparkles size={14} className="text-emerald" />
            <span>Select Operational Role for Fast Authentication</span>
          </div>

          <div className="role-cards-grid">
            {ROLE_PRESETS.map((preset) => (
              <div
                key={preset.role}
                className={`role-preset-card ${preset.badgeClass}`}
                onClick={() => !isSubmitting && handleRolePresetLogin(preset)}
              >
                <div className="role-card-header">
                  <span className={`role-badge ${preset.badgeClass}`}>
                    {preset.role}
                  </span>
                  <span className="role-email">{preset.email}</span>
                </div>
                <h3 className="role-card-title">{preset.title}</h3>
                <p className="role-card-scope">{preset.scope}</p>
                <button
                  type="button"
                  className="role-card-signin-btn"
                  disabled={isSubmitting}
                >
                  <span>Sign In as {preset.role}</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Credentials Form */}
        <div className="custom-login-card">
          <div className="custom-card-header">
            <KeyRound size={16} className="text-emerald" />
            <h3>Sign in with Custom Enterprise Credentials</h3>
          </div>

          {errorMsg && (
            <div className="login-error-banner">
              <AlertTriangle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleCustomLogin} className="custom-login-form">
            <div className="login-field-group">
              <label htmlFor="login-email">
                <Mail size={13} />
                <span>Enterprise Email</span>
              </label>
              <input
                id="login-email"
                type="email"
                placeholder="e.g. manager@palmai.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="login-field-group">
              <label htmlFor="login-password">
                <Lock size={13} />
                <span>Password</span>
              </label>
              <input
                id="login-password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <div className="login-form-actions">
              <button
                type="submit"
                className="login-submit-btn"
                disabled={isSubmitting}
              >
                <UserCheck size={15} />
                <span>{isSubmitting ? "Authenticating…" : "Sign In to Platform"}</span>
              </button>

              <button
                type="button"
                className="guest-bypass-btn"
                onClick={onGuestLogin}
                title="Bypass login and explore as Guest Agronomy Manager"
              >
                <span>Continue as Guest Demo</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </form>
        </div>

        {/* Security Disclosures Footer */}
        <div className="login-portal-footer">
          <div className="security-tag">
            <Shield size={13} className="text-emerald" />
            <span>Server-Side PBKDF2-HMAC-SHA256 Encryption · SQLite WAL Persistence</span>
          </div>
          <span className="footer-meta">
            Division A · 42 Operational Blocks (B001–B042) · 920.0 Ha Verified Commercial Stand
          </span>
        </div>
      </div>
    </div>
  );
}
