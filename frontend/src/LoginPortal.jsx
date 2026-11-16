import React, { useState } from "react";
import {
  Shield,
  ShieldCheck,
  Lock,
  Mail,
  KeyRound,
  UserCheck,
  AlertTriangle,
  X
} from "lucide-react";
import "./LoginPortal.css";

export default function LoginPortal({ onLoginSuccess, onCancel }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleCustomLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Please enter both enterprise email and password.");
      return;
    }
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.token) {
        throw new Error(data?.error || "Authentication failed. Please verify credentials.");
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
          {onCancel && (
            <button
              type="button"
              className="login-modal-close-icon"
              onClick={onCancel}
              title="Close and continue browsing public telemetry"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          )}
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
            Authorized Operational Access · Field Directives, Review &amp; Estate Administration
          </p>
        </div>

        {/* Credentials Form */}
        <div className="custom-login-card">
          <div className="custom-card-header">
            <KeyRound size={16} className="text-emerald" />
            <h3>Sign In to Operational Portal</h3>
          </div>

          {errorMsg && (
            <div className="login-error-banner" role="alert">
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
                disabled={isSubmitting}
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
                placeholder="Enter enterprise password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={isSubmitting}
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

              {onCancel && (
                <button
                  type="button"
                  className="login-cancel-btn"
                  onClick={onCancel}
                  disabled={isSubmitting}
                >
                  <span>Continue Browsing Public Dashboard</span>
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Security Disclosures Footer */}
        <div className="login-portal-footer">
          <div className="security-tag">
            <Shield size={13} className="text-emerald" />
            <span>PBKDF2-HMAC-SHA256 Encryption · Role-Isolated Server Authorization</span>
          </div>
          <span className="footer-meta">
            Division A · 42 Operational Blocks (B001–B042) · 920.0 Ha Commercial Stand
          </span>
        </div>
      </div>
    </div>
  );
}
