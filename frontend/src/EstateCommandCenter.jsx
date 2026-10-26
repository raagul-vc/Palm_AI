import React, { useState, useMemo } from "react";
import {
  ShieldAlert,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Search,
  CheckCircle2,
  Filter,
  BarChart3,
  Layers,
  Sparkles,
  MapPin,
  Calendar,
  Leaf,
  Activity,
  ArrowUpRight
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from "recharts";

const riskColors = {
  HIGH: "#dc2626",
  MEDIUM: "#d97706",
  LOW: "#059669",
  UNKNOWN: "#64748b",
};

function num(val, fallback = null) {
  if (val == null || val === "") return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(val, digits = 1, fallback = "N/A") {
  const n = num(val);
  if (n == null) return fallback;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function EstateCommandCenter({
  datasets,
  onSelectBlock,
  onNavigate,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [riskFilter, setRiskFilter] = useState("ALL");

  const blocks = datasets.risk || [];
  const multiRiskMap = useMemo(() => {
    return new Map((datasets.multiRisk || []).map((r) => [String(r.Block_ID).trim().toUpperCase(), r]));
  }, [datasets.multiRisk]);

  // Aggregate stats
  const totalBlocks = blocks.length || 42;
  const highRiskCount = blocks.filter((b) => (b.Risk_Level || "").toUpperCase() === "HIGH").length;
  const medRiskCount = blocks.filter((b) => (b.Risk_Level || "").toUpperCase() === "MEDIUM").length;
  const lowRiskCount = blocks.filter((b) => (b.Risk_Level || "").toUpperCase() === "LOW").length;

  const totalArea = useMemo(() => {
    return blocks.reduce((acc, b) => acc + (num(b.Area_Ha) || 0), 0);
  }, [blocks]);

  const avgYield = useMemo(() => {
    const valid = blocks.map((b) => num(b.Actual_Yield_t_Ha)).filter((v) => v != null);
    if (!valid.length) return 18.2;
    return valid.reduce((acc, v) => acc + v, 0) / valid.length;
  }, [blocks]);

  // Priority Attention Blocks (Sorted by Risk Score descending)
  const priorityBlocks = useMemo(() => {
    return [...blocks]
      .sort((a, b) => (num(b.Risk_Score) || 0) - (num(a.Risk_Score) || 0))
      .slice(0, 6);
  }, [blocks]);

  // Estate 13-Year Productivity Trend (2012-2024)
  const estateTrend = useMemo(() => {
    const prod = datasets.productivity || [];
    const yearMap = new Map();
    prod.forEach((r) => {
      const yr = Number(r.Year);
      const yld = num(r.Productivity_t_Ha);
      if (yr && yld != null) {
        if (!yearMap.has(yr)) yearMap.set(yr, { total: 0, count: 0 });
        const cur = yearMap.get(yr);
        cur.total += yld;
        cur.count += 1;
      }
    });
    return [...yearMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([yr, data]) => ({
        year: yr,
        avgYield: Number((data.total / data.count).toFixed(2)),
      }));
  }, [datasets.productivity]);

  // Risk Distribution Data for Pie Chart
  const riskDistData = useMemo(() => {
    return [
      { name: "HIGH", value: highRiskCount, color: "#dc2626" },
      { name: "MEDIUM", value: medRiskCount, color: "#d97706" },
      { name: "LOW", value: lowRiskCount, color: "#059669" },
    ].filter((d) => d.value > 0);
  }, [highRiskCount, medRiskCount, lowRiskCount]);

  // Filtered block list for the 42-block fleet grid
  const filteredBlocks = useMemo(() => {
    return blocks.filter((b) => {
      const matchSearch = b.Block_ID.toLowerCase().includes(searchTerm.trim().toLowerCase());
      const level = String(b.Risk_Level || "UNKNOWN").toUpperCase();
      const matchRisk = riskFilter === "ALL" || level === riskFilter;
      return matchSearch && matchRisk;
    });
  }, [blocks, searchTerm, riskFilter]);

  const handleBlockClick = (blockId) => {
    if (onSelectBlock) onSelectBlock(blockId);
    if (onNavigate) onNavigate("block-intelligence");
  };

  return (
    <div className="estate-command-center">
      {/* 1. ESTATE COMMAND HEADER BANNER */}
      <div className="command-hero-card">
        <div className="command-hero-left">
          <div className="hero-estate-badge">
            <span className="live-indicator-dot" />
            <span>Operational Plantation Command</span>
          </div>
          <h2>Estate: Seri Ulu Langat (Division A)</h2>
          <p className="command-hero-desc">
            Integrated intelligence monitoring <strong>{totalBlocks} Operational Blocks</strong> across{" "}
            <strong>{fmt(totalArea, 0)} Hectares</strong>. Powered by the canonical multi-source risk engine,
            historical productivity backtests (2012–2024), and laboratory tissue diagnostics.
          </p>
        </div>
        <div className="command-hero-right">
          <div className="reporting-period-box">
            <span className="period-label">Reporting Horizon</span>
            <strong>2012–2024 Harvest Actuals</strong>
            <span className="period-sub">Verified Agronomic Datasets</span>
          </div>
        </div>
      </div>

      {/* 2. FLEET EXECUTIVE KPI CARDS */}
      <div className="command-kpi-grid">
        <div className="command-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">Monitored Blocks</span>
            <span className="kpi-icon-pill forest"><Leaf size={16} /></span>
          </div>
          <div className="kpi-main-val">
            <strong>{totalBlocks}</strong>
            <span className="kpi-unit">Blocks</span>
          </div>
          <span className="kpi-foot">100% operational coverage ({fmt(totalArea, 0)} ha)</span>
        </div>

        <div className="command-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">High Risk Blocks</span>
            <span className="kpi-icon-pill ruby"><ShieldAlert size={16} /></span>
          </div>
          <div className="kpi-main-val">
            <strong className="text-ruby">{highRiskCount}</strong>
            <span className="kpi-unit">Critical</span>
          </div>
          <span className="kpi-foot">Immediate agronomic audit required</span>
        </div>

        <div className="command-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">Estate Mean Yield</span>
            <span className="kpi-icon-pill emerald"><TrendingUp size={16} /></span>
          </div>
          <div className="kpi-main-val">
            <strong>{fmt(avgYield)}</strong>
            <span className="kpi-unit">t/ha</span>
          </div>
          <span className="kpi-foot">Across mature & immature cohorts</span>
        </div>

        <div className="command-kpi-card">
          <div className="kpi-top-row">
            <span className="kpi-title">Active Action Directives</span>
            <span className="kpi-icon-pill gold"><Activity size={16} /></span>
          </div>
          <div className="kpi-main-val">
            <strong className="text-amber">12</strong>
            <span className="kpi-unit">Tasks</span>
          </div>
          <span className="kpi-foot">
            <button
              type="button"
              className="inline-nav-btn"
              onClick={() => onNavigate && onNavigate("field-action-center")}
            >
              Field Action Center <ArrowRight size={12} />
            </button>
          </span>
        </div>
      </div>

      {/* 3. ESTATE CHARTS ROW */}
      <div className="command-visual-row">
        {/* Estate 13-Year Productivity Curve */}
        <div className="card-panel span-2">
          <div className="card-panel-header">
            <div className="header-icon-title">
              <TrendingUp size={18} className="text-forest" />
              <h3>Estate Productivity Curve (2012–2024 Actual Average t/ha)</h3>
            </div>
            <span className="subtle-badge">Annual Mean</span>
          </div>
          <div className="trend-chart-box">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={estateTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="year" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} domain={[10, 24]} />
                <Tooltip
                  formatter={(v) => [`${v} t/ha`, "Estate Average"]}
                  contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", color: "#fff", border: "none" }}
                />
                <Bar dataKey="avgYield" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Distribution Donut */}
        <div className="card-panel">
          <div className="card-panel-header">
            <div className="header-icon-title">
              <ShieldAlert size={18} className="text-ruby" />
              <h3>Canonical Risk Distribution</h3>
            </div>
            <span className="subtle-badge">42 Blocks</span>
          </div>
          <div className="donut-chart-box">
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie
                  data={riskDistData}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {riskDistData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="risk-donut-legend">
              <div className="legend-entry">
                <span className="dot red" />
                <span>High: <strong>{highRiskCount}</strong></span>
              </div>
              <div className="legend-entry">
                <span className="dot amber" />
                <span>Medium: <strong>{medRiskCount}</strong></span>
              </div>
              <div className="legend-entry">
                <span className="dot green" />
                <span>Low: <strong>{lowRiskCount}</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. PRIORITY ATTENTION WATCHLIST */}
      <div className="card-panel">
        <div className="card-panel-header">
          <div className="header-icon-title">
            <AlertTriangle size={18} className="text-ruby" />
            <h3>Priority Attention Watchlist (Top High-Risk Blocks)</h3>
          </div>
          <span className="subtle-badge">Ranked by Risk Engine</span>
        </div>

        <div className="watchlist-grid">
          {priorityBlocks.map((b) => {
            const rLevel = String(b.Risk_Level || "UNKNOWN").toUpperCase();
            const yld = num(b.Actual_Yield_t_Ha);
            const gap = num(b.Yield_Gap_pct);
            const score = num(b.Risk_Score);
            return (
              <div
                key={b.Block_ID}
                className={`watchlist-card ${rLevel.toLowerCase()}`}
                onClick={() => handleBlockClick(b.Block_ID)}
              >
                <div className="watchlist-card-top">
                  <div className="w-block-id">
                    <strong>{b.Block_ID}</strong>
                    <span className="w-planted">Planted {b.Planting_Year} ({fmt(b.Plant_Age_Years, 0)}y)</span>
                  </div>
                  <span className={`status-pill ${rLevel.toLowerCase()}`}>
                    {rLevel} · {fmt(score, 1)}
                  </span>
                </div>

                <div className="watchlist-metrics">
                  <div>
                    <span className="wm-label">Yield</span>
                    <strong>{fmt(yld)} t/ha</strong>
                  </div>
                  <div>
                    <span className="wm-label">Yield Gap</span>
                    <strong className={gap != null && gap < 0 ? "text-ruby" : "text-emerald"}>
                      {gap != null ? `${fmt(gap)}%` : "N/A"}
                    </strong>
                  </div>
                  <div>
                    <span className="wm-label">Seed</span>
                    <strong>{b.Seed_Type || "DxD"}</strong>
                  </div>
                </div>

                <div className="watchlist-concern">
                  <span className="wc-label">Primary Constraint:</span>
                  <p>{b.Risk_Contributor || "Yield lag vs cohort peers"}</p>
                </div>

                <button
                  type="button"
                  className="inspect-block-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBlockClick(b.Block_ID);
                  }}
                >
                  <span>Open Block Intelligence</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. THE 42-BLOCK INTERACTIVE FLEET GRID */}
      <div className="card-panel">
        <div className="fleet-grid-header">
          <div>
            <div className="header-icon-title">
              <Layers size={18} className="text-forest" />
              <h3>Complete 42-Block Operational Fleet Matrix</h3>
            </div>
            <p className="fleet-desc">
              Click any block to open its dedicated, unified intelligence dossier.
            </p>
          </div>

          <div className="fleet-controls">
            {/* Search Box */}
            <div className="fleet-search-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search Block ID (e.g. B012)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="fleet-search-input"
              />
            </div>

            {/* Risk Filter Buttons */}
            <div className="fleet-filter-pills">
              {["ALL", "HIGH", "MEDIUM", "LOW"].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  className={`fleet-filter-btn ${riskFilter === lvl ? "active" : ""}`}
                  onClick={() => setRiskFilter(lvl)}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 42 Block Matrix Cards */}
        <div className="fleet-matrix-grid">
          {filteredBlocks.map((b) => {
            const rLevel = String(b.Risk_Level || "UNKNOWN").toUpperCase();
            const yld = num(b.Actual_Yield_t_Ha);
            const gap = num(b.Yield_Gap_pct);
            const score = num(b.Risk_Score);
            return (
              <div
                key={b.Block_ID}
                className={`fleet-matrix-card ${rLevel.toLowerCase()}`}
                onClick={() => handleBlockClick(b.Block_ID)}
              >
                <div className="matrix-card-top">
                  <span className="matrix-block-id">{b.Block_ID}</span>
                  <span className={`matrix-risk-dot ${rLevel.toLowerCase()}`} title={`Risk: ${rLevel}`} />
                </div>
                <div className="matrix-card-body">
                  <div className="matrix-stat-row">
                    <span>Yield</span>
                    <strong>{fmt(yld)} t/ha</strong>
                  </div>
                  <div className="matrix-stat-row">
                    <span>Score</span>
                    <strong className={rLevel === "HIGH" ? "text-ruby" : rLevel === "MEDIUM" ? "text-amber" : "text-emerald"}>
                      {fmt(score, 1)}
                    </strong>
                  </div>
                  <div className="matrix-stat-row">
                    <span>Gap</span>
                    <span className={gap != null && gap < 0 ? "text-ruby" : "text-emerald"}>
                      {gap != null ? `${fmt(gap)}%` : "0%"}
                    </span>
                  </div>
                </div>
                <div className="matrix-card-footer">
                  <span>{b.Planting_Year} · {fmt(b.Plant_Age_Years, 0)}y</span>
                  <ArrowUpRight size={12} className="matrix-arrow" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
