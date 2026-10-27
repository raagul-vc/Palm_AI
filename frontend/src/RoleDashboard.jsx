import React from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  Layers,
  MapPin,
  ClipboardCheck,
  Database,
  Camera,
  Layers3,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  Sprout,
  Activity,
  FileText
} from "lucide-react";
import "./RoleDashboard.css";

export default function RoleDashboard({
  currentUser,
  selectedEstate,
  onSelectEstate,
  onNavigate,
  onOpenBlock,
  riskCounts = { total: 42, high: 1, medium: 6, low: 35 },
  meanYield = 21.8,
  onOpenAuditModal,
  onOpenUserModal
}) {
  const role = currentUser?.role || "MANAGER";

  return (
    <div className="role-dashboard-wrapper">
      <div className="role-dashboard-container">
        {/* Top Hero Banner */}
        <div className="dashboard-hero-banner">
          <div className="hero-left">
            <div className="hero-role-pill-row">
              <span className={`hero-role-pill ${role.toLowerCase()}`}>
                {role} COMMAND
              </span>
              <span className="hero-session-tag">
                <span className="live-dot" /> Authenticated Session
              </span>
            </div>
            <h1 className="hero-greeting">
              Welcome, {currentUser?.full_name || "Operational User"}
            </h1>
            <p className="hero-subtitle">
              {role === "ADMIN" && "Chief Administrator oversight across estate fleet, security audit logs, and multi-user RBAC."}
              {role === "MANAGER" && "Agronomy operations center for estate yield trajectories, risk screening, and directive verification."}
              {role === "WORKER" && "Field operations terminal for assigned block directives, inspection checklists, and evidence logging."}
            </p>
          </div>

          <div className="hero-right-meta">
            <div className="meta-fleet-box">
              <MapPin size={16} className="text-emerald" />
              <div>
                <strong>North Estate (PT Palm Indo)</strong>
                <span>Division A · 42 Blocks · 920.0 Ha Verified</span>
              </div>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* ROLE 1: ADMIN DASHBOARD VIEW                             */}
        {/* ======================================================== */}
        {role === "ADMIN" && (
          <div className="admin-dashboard-layout">
            <div className="dashboard-kpi-grid">
              <div className="dash-kpi-card">
                <span className="dash-kpi-label">Monitored Fleet</span>
                <strong className="dash-kpi-val text-emerald">42 Blocks</strong>
                <span className="dash-kpi-sub">Verified 920.0 Ha (North Estate)</span>
              </div>
              <div className="dash-kpi-card">
                <span className="dash-kpi-label">User Security &amp; RBAC</span>
                <strong className="dash-kpi-val">4 Accounts</strong>
                <span className="dash-kpi-sub">PBKDF2-HMAC-SHA256 Encrypted</span>
              </div>
              <div className="dash-kpi-card">
                <span className="dash-kpi-label">Persistence Engine</span>
                <strong className="dash-kpi-val text-emerald">SQLite WAL</strong>
                <span className="dash-kpi-sub">Task Lifecycle &amp; Audit Logs</span>
              </div>
              <div className="dash-kpi-card">
                <span className="dash-kpi-label">Remote Sensing Integrity</span>
                <strong className="dash-kpi-val text-amber">Disclosed</strong>
                <span className="dash-kpi-sub">RGB Unmapped · Spectral Isolated</span>
              </div>
            </div>

            <div className="admin-actions-grid">
              <div className="admin-action-card highlight">
                <div className="action-card-header">
                  <div className="icon-badge emerald">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <h3>Operational Estate Fleet</h3>
                    <p>Enter North Estate to inspect yield models, DRIS diagnostics, and 42-block fleet.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="dash-cta-btn emerald"
                  onClick={() => {
                    onSelectEstate("North Estate (PT Palm Indo)");
                    onNavigate("estates");
                  }}
                >
                  <span>Select North Estate &amp; Enter Dashboard</span>
                  <ArrowRight size={15} />
                </button>
              </div>

              <div className="admin-action-card">
                <div className="action-card-header">
                  <div className="icon-badge purple">
                    <Users size={20} />
                  </div>
                  <div>
                    <h3>User Accounts &amp; Permissions</h3>
                    <p>Create and manage manager and field inspector worker accounts.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="dash-cta-btn purple"
                  onClick={onOpenUserModal}
                >
                  <span>Manage User Accounts</span>
                  <ArrowRight size={15} />
                </button>
              </div>

              <div className="admin-action-card">
                <div className="action-card-header">
                  <div className="icon-badge blue">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3>Security &amp; Operational Audit Trail</h3>
                    <p>Inspect server-side immutable audit logs for task transitions and user logins.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="dash-cta-btn blue"
                  onClick={onOpenAuditModal}
                >
                  <span>View System Audit Logs</span>
                  <ArrowRight size={15} />
                </button>
              </div>

              <div className="admin-action-card">
                <div className="action-card-header">
                  <div className="icon-badge amber">
                    <ClipboardCheck size={20} />
                  </div>
                  <div>
                    <h3>Field Action Operations</h3>
                    <p>Review 7-step field directives, worker findings, and verification statuses.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="dash-cta-btn amber"
                  onClick={() => onNavigate("field-actions")}
                >
                  <span>Open Field Action Center</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* ROLE 2: MANAGER DASHBOARD VIEW                           */}
        {/* ======================================================== */}
        {role === "MANAGER" && (
          <div className="manager-dashboard-layout">
            <div className="dashboard-kpi-grid">
              <div className="dash-kpi-card">
                <span className="dash-kpi-label">Fleet Risk Screening</span>
                <strong className="dash-kpi-val text-ruby">1 High Risk</strong>
                <span className="dash-kpi-sub">6 Medium · 35 Low (42 Total)</span>
              </div>
              <div className="dash-kpi-card">
                <span className="dash-kpi-label">Mean 2024 Yield</span>
                <strong className="dash-kpi-val text-emerald">{meanYield} t/ha</strong>
                <span className="dash-kpi-sub">Annual Harvest Productivity</span>
              </div>
              <div className="dash-kpi-card">
                <span className="dash-kpi-label">Field Directives</span>
                <strong className="dash-kpi-val text-amber">3 Active</strong>
                <span className="dash-kpi-sub">1 Urgent (Block B001 Boron)</span>
              </div>
              <div className="dash-kpi-card">
                <span className="dash-kpi-label">Tree Inventory Readiness</span>
                <strong className="dash-kpi-val text-amber">35%</strong>
                <span className="dash-kpi-sub">Unique Crown Census Unavailable</span>
              </div>
            </div>

            <div className="manager-actions-grid">
              <div className="manager-action-card highlight">
                <div className="card-top-icon">
                  <MapPin size={22} className="text-emerald" />
                </div>
                <h3>Enter North Estate Operations</h3>
                <p>Inspect fleet-wide yield curves, DRIS foliar diagnostics, and the 42-block grid.</p>
                <button
                  type="button"
                  className="dash-cta-btn emerald"
                  onClick={() => {
                    onSelectEstate("North Estate (PT Palm Indo)");
                    onNavigate("blocks");
                  }}
                >
                  <span>Select Estate &amp; View 42 Blocks</span>
                  <ArrowRight size={15} />
                </button>
              </div>

              <div className="manager-action-card urgent">
                <div className="card-top-icon">
                  <AlertTriangle size={22} className="text-ruby" />
                </div>
                <h3>Urgent: Block B001 Field Directive</h3>
                <p>Severe Boron deficiency detected (DRIS index -42.8). Review directive and assign to worker.</p>
                <button
                  type="button"
                  className="dash-cta-btn ruby"
                  onClick={() => onOpenBlock("B001")}
                >
                  <span>Open Block B001 Intelligence</span>
                  <ArrowRight size={15} />
                </button>
              </div>

              <div className="manager-action-card">
                <div className="card-top-icon">
                  <ClipboardCheck size={22} className="text-emerald" />
                </div>
                <h3>Field Action Center</h3>
                <p>Manage the 7-step inspection and verification workflow across all 42 blocks.</p>
                <button
                  type="button"
                  className="dash-cta-btn amber"
                  onClick={() => onNavigate("field-actions")}
                >
                  <span>Open Field Action Queue</span>
                  <ArrowRight size={15} />
                </button>
              </div>

              <div className="manager-action-card">
                <div className="card-top-icon">
                  <Database size={22} className="text-blue" />
                </div>
                <h3>Multi-Source Evidence Matrix</h3>
                <p>Review the 3 concise evidence pillars and inspect ground truth datasets.</p>
                <button
                  type="button"
                  className="dash-cta-btn blue"
                  onClick={() => onNavigate("multi-source")}
                >
                  <span>Inspect Evidence Matrix</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* ROLE 3: WORKER DASHBOARD VIEW                            */}
        {/* ======================================================== */}
        {role === "WORKER" && (
          <div className="worker-dashboard-layout">
            <div className="worker-intro-banner">
              <CheckCircle2 size={24} className="text-emerald" />
              <div>
                <h3>Field Inspector Active Directives</h3>
                <p>
                  You are authorized for Division A blocks. Select an assigned task below to review the known issue, complete the field checklist, and record photo findings.
                </p>
              </div>
            </div>

            <div className="worker-tasks-section">
              <h3 className="section-title">My Assigned Field Inspection Directives</h3>

              <div className="worker-tasks-grid">
                <div className="worker-task-card urgent">
                  <div className="task-header-row">
                    <span className="task-id-badge">TSK-B001-001</span>
                    <span className="task-priority-badge urgent">URGENT</span>
                  </div>
                  <h4 className="task-title">Block B001: Foliar Boron S-Deficiency Inspection</h4>
                  <p className="task-desc">
                    Observed leaf Boron is critically low (8.4 ppm vs 15.0 ppm standard). Verify spear leaf crinkling (hook leaf) and record canopy photos.
                  </p>
                  <div className="task-meta-row">
                    <span>Block: <strong>B001 (20.0 Ha)</strong></span>
                    <span>Age: <strong>14 Yrs</strong></span>
                    <span>Status: <strong>ASSIGNED</strong></span>
                  </div>
                  <button
                    type="button"
                    className="worker-action-btn"
                    onClick={() => onOpenBlock("B001")}
                  >
                    <span>Open Block B001 &amp; Record Findings</span>
                    <ArrowRight size={14} />
                  </button>
                </div>

                <div className="worker-task-card">
                  <div className="task-header-row">
                    <span className="task-id-badge">TSK-B005-001</span>
                    <span className="task-priority-badge medium">MEDIUM</span>
                  </div>
                  <h4 className="task-title">Block B005: Water Deficit &amp; Frond Desiccation Check</h4>
                  <p className="task-desc">
                    Rolling 3-month rainfall deficit of 142mm. Inspect lower canopy frond drooping and check soil moisture retention in inter-row paths.
                  </p>
                  <div className="task-meta-row">
                    <span>Block: <strong>B005 (22.5 Ha)</strong></span>
                    <span>Age: <strong>12 Yrs</strong></span>
                    <span>Status: <strong>OPEN</strong></span>
                  </div>
                  <button
                    type="button"
                    className="worker-action-btn"
                    onClick={() => onOpenBlock("B005")}
                  >
                    <span>Open Block B005 &amp; Record Findings</span>
                    <ArrowRight size={14} />
                  </button>
                </div>

                <div className="worker-task-card">
                  <div className="task-header-row">
                    <span className="task-id-badge">TSK-B012-001</span>
                    <span className="task-priority-badge low">ROUTINE</span>
                  </div>
                  <h4 className="task-title">Block B012: Post-Harvest Yield &amp; Bunch Audit</h4>
                  <p className="task-desc">
                    Routine yield monitoring and bunch count verification. Inspect ripe bunch counts across sampling rows 12–24.
                  </p>
                  <div className="task-meta-row">
                    <span>Block: <strong>B012 (25.0 Ha)</strong></span>
                    <span>Age: <strong>10 Yrs</strong></span>
                    <span>Status: <strong>OPEN</strong></span>
                  </div>
                  <button
                    type="button"
                    className="worker-action-btn"
                    onClick={() => onOpenBlock("B012")}
                  >
                    <span>Open Block B012 &amp; Record Findings</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
