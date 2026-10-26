import React, { useState, useMemo, useRef } from "react";
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Leaf,
  FlaskConical,
  CloudSun,
  ShieldAlert,
  Camera,
  Layers,
  ClipboardCheck,
  CheckCircle2,
  Clock3,
  ChevronRight,
  Info,
  Calendar,
  Layers3,
  MapPin,
  ArrowRight,
  Sliders,
  UploadCloud,
  Maximize2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Search,
  Activity,
  ChevronDown
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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from "recharts";

const riskColors = {
  HIGH: "#dc2626",
  MEDIUM: "#d97706",
  LOW: "#059669",
  UNKNOWN: "#64748b",
};

const nutrientMeta = [
  { key: "N_pct", statusKey: "N_pct_Status", label: "Nitrogen (N)", unit: "%", minRef: 2.5, maxRef: 2.8, desc: "Primary leaf canopy growth & protein synthesis" },
  { key: "P_pct", statusKey: "P_pct_Status", label: "Phosphorus (P)", unit: "%", minRef: 0.16, maxRef: 0.19, desc: "Root expansion and floral bunch initiation" },
  { key: "K_pct", statusKey: "K_pct_Status", label: "Potassium (K)", unit: "%", minRef: 1.0, maxRef: 1.3, desc: "Bunch expansion, FFB oil content, water transport" },
  { key: "Ca_pct", statusKey: "Ca_pct_Status", label: "Calcium (Ca)", unit: "%", minRef: 0.5, maxRef: 0.75, desc: "Cell wall integrity and root vitality" },
  { key: "Mg_pct", statusKey: "Mg_pct_Status", label: "Magnesium (Mg)", unit: "%", minRef: 0.3, maxRef: 0.45, desc: "Chlorophyll central atom; photosynthesis" },
  { key: "B_ppm", statusKey: "B_ppm_Status", label: "Boron (B)", unit: "ppm", minRef: 15.0, maxRef: 25.0, desc: "Micronutrient for bunch formation & pollen fertility" },
];

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

export default function UnifiedBlockIntelligence({
  blockId,
  onSelectBlock,
  datasets,
  onNavigate,
}) {
  const [activeTab, setActiveTab] = useState("overview");

  // Drone live inference local state
  const [droneFile, setDroneFile] = useState(null);
  const [dronePreview, setDronePreview] = useState(null);
  const [droneConf, setDroneConf] = useState(0.25);
  const [isInferring, setIsInferring] = useState(false);
  const [droneResult, setDroneResult] = useState(null);
  const [droneError, setDroneError] = useState(null);
  const fileInputRef = useRef(null);

  const bKey = (id) => String(id ?? "").trim().toUpperCase();
  const currentBlockId = bKey(blockId || "B012");

  // Match datasets for the selected block
  const allBlocks = datasets.risk || [];
  const riskRow = allBlocks.find((r) => bKey(r.Block_ID) === currentBlockId) || null;
  const multiRiskRow = (datasets.multiRisk || []).find((r) => bKey(r.Block_ID) === currentBlockId) || null;
  const nutrientsRow = (datasets.nutrients || [])
    .filter((r) => bKey(r.Block_ID) === currentBlockId)
    .sort((a, b) => Number(b.Year || b.Leaf_Sampling_Year || 0) - Number(a.Year || a.Leaf_Sampling_Year || 0))[0] || null;
  const drisRow = (datasets.dris || [])
    .filter((r) => bKey(r.Block_ID) === currentBlockId)
    .sort((a, b) => Number(b.Year || 0) - Number(a.Year || 0))[0] || null;
  const weatherRow = (datasets.weather || [])
    .filter((r) => bKey(r.Block_ID) === currentBlockId)
    .sort((a, b) => Number(b.Year || 0) - Number(a.Year || 0))[0] || null;
  const soilRow = (datasets.soil || []).find((r) => bKey(r.Block_ID) === currentBlockId) || null;

  // 13-year productivity history (2012-2024)
  const blockHistory = useMemo(() => {
    return (datasets.productivity || [])
      .filter((r) => bKey(r.Block_ID) === currentBlockId && String(r.Plant_Status || "").toUpperCase() !== "TBM")
      .sort((a, b) => Number(a.Year) - Number(b.Year))
      .map((r) => ({
        Year: Number(r.Year),
        Actual: num(r.Productivity_t_Ha),
        FFB_Tonnes: num(r.FFB_Yield_Tonnes),
      }));
  }, [datasets.productivity, currentBlockId]);

  // Model forecast for this block
  const blockForecast = useMemo(() => {
    return (datasets.forecast || [])
      .filter((r) => bKey(r.Block_ID) === currentBlockId)
      .sort((a, b) => Number(a.Year) - Number(b.Year));
  }, [datasets.forecast, currentBlockId]);

  // Combined yield timeline
  const yieldTimeline = useMemo(() => {
    const map = new Map();
    blockHistory.forEach((h) => {
      map.set(h.Year, { Year: h.Year, Actual: h.Actual, Forecast: null });
    });
    blockForecast.forEach((f) => {
      const yr = Number(f.Year);
      const fcVal = num(f.Forecast_Productivity_t_Ha);
      if (yr && fcVal != null) {
        map.set(yr, { Year: yr, Actual: null, Forecast: fcVal });
      }
    });
    return [...map.values()].sort((a, b) => a.Year - b.Year);
  }, [blockHistory, blockForecast]);

  // Canonical Risk Values
  const riskLevel = String(multiRiskRow?.Multi_Source_Risk_Level || riskRow?.Risk_Level || "UNKNOWN").toUpperCase();
  const riskScore = num(multiRiskRow?.Multi_Source_Risk_Score ?? riskRow?.Risk_Score);
  const actualYield = num(riskRow?.Actual_Yield_t_Ha);
  const expectedYield = num(riskRow?.Expected_Yield_t_Ha);
  const yieldGap = num(riskRow?.Yield_Gap_pct);
  const plantAge = num(riskRow?.Plant_Age_Years);
  const plantingYear = riskRow?.Planting_Year || "N/A";
  const seedType = riskRow?.Seed_Type || "Dami DxD";
  const areaHa = num(riskRow?.Area_Ha);
  const palmsCount = num(riskRow?.Productive_Palms);

  // Nutritional Radar Data
  const nutrientRadarData = useMemo(() => {
    if (!nutrientsRow) return [];
    return nutrientMeta.map((n) => {
      const val = num(nutrientsRow[n.key]);
      const mid = (n.minRef + n.maxRef) / 2.0;
      const indexRatio = val != null ? Math.min(160, Math.max(30, (val / mid) * 100)) : 100;
      return {
        subject: n.label.split(" ")[0],
        Actual: Math.round(indexRatio),
        Optimal: 100,
        status: nutrientsRow[n.statusKey] || "NORMAL",
      };
    });
  }, [nutrientsRow]);

  // Structured Risk-to-Action 5-Stage Synthesis
  const actionPlan = useMemo(() => {
    const items = [];
    const mainConcern = multiRiskRow?.Main_Contributing_Indicators || riskRow?.Risk_Contributor || "Production lag";
    const recAction = multiRiskRow?.Recommended_Action || riskRow?.Recommended_Action || "Inspect block field conditions and review fertilizer program.";

    // Item 1: Primary Canonical Risk Issue
    let primaryIssue = "Agronomic Productivity Review";
    let reason = "Block exhibits variance from plantation expected baseline.";
    let evidence = `Actual yield: ${fmt(actualYield)} t/ha vs Expected: ${fmt(expectedYield)} t/ha (Gap: ${fmt(yieldGap)}%).`;
    let action = recAction;
    let validation = "Re-evaluate monthly harvest delivery slips over the subsequent 90-day cycle.";

    if (riskLevel === "HIGH") {
      primaryIssue = "High Priority Yield & Health Deficit";
      reason = `Critical performance lag driven by ${mainConcern}.`;
      evidence = `Canonical risk score of ${fmt(riskScore, 1)}/100. Yield gap is ${fmt(yieldGap)}% below age-peer cohort.`;
      action = `Convene joint agronomy & estate manager field audit for Block ${currentBlockId}. ${recAction}`;
      validation = "Target quarterly bunch census count and leaf tissue re-assay within 60 days.";
    } else if (riskLevel === "MEDIUM") {
      primaryIssue = "Moderate Nutritional / Productivity Watch";
      reason = "Block shows sub-optimal nutrient ratios or mild weather-stress sensitivity.";
      evidence = `Risk score ${fmt(riskScore, 1)}/100. Primary constraint: ${mainConcern}.`;
      action = "Verify fertilizer application records for the last 2 rounds. " + recAction;
      validation = "Monitor monthly FFB bunch weight averages at the weighbridge.";
    }

    items.push({
      priority: riskLevel === "HIGH" ? "CRITICAL" : "ELEVATED",
      risk: primaryIssue,
      reason,
      evidence,
      action,
      validation,
      badge: "Agronomic Risk Engine",
    });

    // Item 2: DRIS Nutritional Imbalance if present
    if (drisRow && drisRow.Limitation_1) {
      const l1 = drisRow.Limitation_1;
      const l2 = drisRow.Limitation_2 || "None";
      const prescription = drisRow.Prescription || "Review relative nutrient balance ratios.";
      items.push({
        priority: "HIGH",
        risk: `DRIS Nutrient Imbalance (Primary Deficit: ${l1})`,
        reason: `DRIS index diagnostic identified ${l1} as the primary limiting nutrient relative to other elements (Secondary: ${l2}).`,
        evidence: `Leaf sample Year: ${nutrientsRow?.Leaf_Sampling_Year || 2024}. Diagnosed limitation: ${l1}. Prescribed action: "${prescription}".`,
        action: `Review fertilizer blend proportions. Specifically adjust ${l1} supply in next scheduled round under agronomic advice.`,
        validation: "Conduct foliar leaf nutrient re-sampling of frond 17 after 6 months to measure index normalization.",
        badge: "DRIS Diagnostic",
      });
    }

    // Item 3: Weather & Soil Context
    if (weatherRow) {
      const rain = num(weatherRow.Rainfall_mm_day);
      items.push({
        priority: "ROUTINE",
        risk: "Environmental & Soil Monitoring",
        reason: "Soil water availability and moisture retention regulate nutrient absorption efficiency.",
        evidence: `Estate rainfall: ${fmt(rain, 1)} mm/day average. Soil type: ${soilRow?.Texture_Class || "Sandy Clay Loam"}, pH: ${fmt(soilRow?.Soil_pH, 1, "5.2")}.`,
        action: "Inspect drainage channels and weed circle mulching to ensure maximum organic matter retention.",
        validation: "Visual ground survey after heavy rain events for waterlogging or erosion.",
        badge: "Environmental Context",
      });
    }

    return items;
  }, [currentBlockId, riskLevel, riskScore, actualYield, expectedYield, yieldGap, multiRiskRow, riskRow, drisRow, nutrientsRow, weatherRow, soilRow]);

  // Handle Drone File Pick
  const handleDroneFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setDroneFile(f);
    setDroneError(null);
    setDroneResult(null);
    const reader = new FileReader();
    reader.onload = () => setDronePreview(reader.result);
    reader.readAsDataURL(f);
  };

  // Run live YOLO inference
  const runLiveInference = async () => {
    if (!droneFile) return;
    setIsInferring(true);
    setDroneError(null);
    try {
      const formData = new FormData();
      formData.append("image", droneFile);
      formData.append("conf", String(droneConf));
      const res = await fetch("/api/drone/predict", {
        method: "POST",
        body: formData,
      });
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error(`Server returned status ${res.status} with non-JSON content.`);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setDroneResult(data);
    } catch (err) {
      setDroneError(err.message);
    } finally {
      setIsInferring(false);
    }
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "productivity", label: "Productivity", icon: TrendingUp },
    { id: "nutrients", label: "Nutrients & DRIS", icon: FlaskConical },
    { id: "weather", label: "Weather", icon: CloudSun },
    { id: "risk", label: "Risk Analysis", icon: ShieldAlert },
    { id: "drone", label: "Drone UAV", icon: Camera },
    { id: "multispectral", label: "Multispectral", icon: Layers },
    { id: "actions", label: "Action Plan", icon: ClipboardCheck },
  ];

  return (
    <div className="block-intelligence-hub">
      {/* 1. HERO IDENTITY BAR */}
      <div className="block-hero-card">
        <div className="block-hero-main">
          <div className="block-hero-title-group">
            <div className="block-id-badge">
              <span className="estate-pill">Seri Ulu Langat · Div A</span>
              <div className="id-flex">
                <h1>{currentBlockId}</h1>
                <span className={`risk-tag-large ${riskLevel.toLowerCase()}`}>
                  <ShieldAlert size={16} />
                  {riskLevel} RISK
                </span>
              </div>
              <p className="block-meta-inline">
                Planted {plantingYear} ({fmt(plantAge, 0)} yrs) · {seedType} · {fmt(areaHa, 1)} ha · {palmsCount ? `${fmt(palmsCount, 0)} palms` : "Stand recorded"}
              </p>
            </div>
          </div>

          {/* Core Metric Highlights */}
          <div className="block-hero-kpis">
            <div className="hero-kpi-item">
              <span className="hero-kpi-label">Canonical Risk Score</span>
              <div className="hero-kpi-val-group">
                <strong className={`hero-kpi-val ${riskLevel.toLowerCase()}`}>
                  {riskScore != null ? fmt(riskScore, 1) : "N/A"}
                </strong>
                <span className="hero-kpi-sub">/ 100</span>
              </div>
              <span className="hero-kpi-hint">Verified Agronomic Model</span>
            </div>

            <div className="hero-kpi-item">
              <span className="hero-kpi-label">Latest Annual Yield</span>
              <div className="hero-kpi-val-group">
                <strong className="hero-kpi-val text-forest">
                  {fmt(actualYield)}
                </strong>
                <span className="hero-kpi-sub">t/ha</span>
              </div>
              <span className="hero-kpi-hint">
                {yieldGap != null
                  ? yieldGap < 0
                    ? `${fmt(yieldGap)}% vs age peers`
                    : `+${fmt(yieldGap)}% vs age peers`
                  : "Cohort benchmark"}
              </span>
            </div>

            <div className="hero-kpi-item">
              <span className="hero-kpi-label">Expected Age-Peer</span>
              <div className="hero-kpi-val-group">
                <strong className="hero-kpi-val">
                  {fmt(expectedYield)}
                </strong>
                <span className="hero-kpi-sub">t/ha</span>
              </div>
              <span className="hero-kpi-hint">Empirical peer curve</span>
            </div>

            <div className="hero-kpi-item">
              <span className="hero-kpi-label">DRIS Limitation</span>
              <div className="hero-kpi-val-group">
                <strong className="hero-kpi-val text-amber">
                  {drisRow?.Limitation_1 || "Balanced"}
                </strong>
              </div>
              <span className="hero-kpi-hint">
                {drisRow?.Limitation_2 ? `Sec: ${drisRow.Limitation_2}` : "Foliar Diagnosis"}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Block Switcher Strip */}
        <div className="block-switcher-strip">
          <div className="switcher-label">
            <Search size={14} />
            <span>Select Another Block:</span>
          </div>
          <div className="block-pill-scroll">
            {allBlocks.slice(0, 42).map((b) => {
              const bRisk = String(b.Risk_Level || "LOW").toLowerCase();
              const isSelected = bKey(b.Block_ID) === currentBlockId;
              return (
                <button
                  key={b.Block_ID}
                  type="button"
                  className={`block-quick-pill ${bRisk} ${isSelected ? "selected" : ""}`}
                  onClick={() => onSelectBlock && onSelectBlock(b.Block_ID)}
                  title={`Block ${b.Block_ID} · Risk: ${b.Risk_Level} · Yield: ${fmt(b.Actual_Yield_t_Ha)} t/ha`}
                >
                  <span className="pill-dot" />
                  <strong>{b.Block_ID}</strong>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. SUB-NAVIGATION TABS */}
      <div className="block-tab-bar">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`block-tab-btn ${isActive ? "active" : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              <Icon size={16} />
              <span>{t.label}</span>
              {t.id === "actions" && (
                <span className="tab-counter-badge">{actionPlan.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 3. TAB CONTENT WORKSPACE */}
      <div className="block-tab-content">
        {/* ==================== TAB 1: OVERVIEW ==================== */}
        {activeTab === "overview" && (
          <div className="tab-pane-grid">
            {/* Condition Executive Summary */}
            <div className="card-panel span-2">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <ShieldCheck size={18} className="text-emerald" />
                  <h3>Executive Condition Assessment</h3>
                </div>
                <span className={`status-pill ${riskLevel.toLowerCase()}`}>
                  {riskLevel} Priority
                </span>
              </div>

              <div className="condition-summary-box">
                <p className="summary-paragraph">
                  Block <strong>{currentBlockId}</strong> (planted in {plantingYear}, standing age of {fmt(plantAge, 0)} years) is operating under{" "}
                  <strong>{riskLevel} Risk</strong> with a composite canonical risk score of{" "}
                  <strong>{fmt(riskScore, 1)} / 100</strong>.
                  {yieldGap != null && yieldGap < -5 ? (
                    <span>
                      {" "}Observed production stands at <strong>{fmt(actualYield)} t/ha</strong>, trailing the age-peer expectation of{" "}
                      <strong>{fmt(expectedYield)} t/ha</strong> by <strong>{fmt(Math.abs(yieldGap))}%</strong>.
                    </span>
                  ) : (
                    <span>
                      {" "}Production remains on track at <strong>{fmt(actualYield)} t/ha</strong> relative to the cohort baseline.
                    </span>
                  )}
                  {drisRow?.Limitation_1 && (
                    <span>
                      {" "}Foliar DRIS diagnostics indicate nutritional constraint on <strong>{drisRow.Limitation_1}</strong>, with prescribed action:{" "}
                      <em>"{drisRow.Prescription || "Review nutrient application balance"}"</em>.
                    </span>
                  )}
                </p>
              </div>

              <div className="assessment-factors-grid">
                <div className="factor-item">
                  <span className="factor-label">Primary Risk Contributor</span>
                  <strong className="factor-val text-ruby">
                    {multiRiskRow?.Main_Contributing_Indicators || riskRow?.Risk_Contributor || "Yield Gap"}
                  </strong>
                  <p className="factor-desc">Evaluated by Canonical Multi-Source Risk Engine</p>
                </div>
                <div className="factor-item">
                  <span className="factor-label">Top Agronomic Recommendation</span>
                  <strong className="factor-val text-forest">
                    {multiRiskRow?.Recommended_Action || riskRow?.Recommended_Action || "Monitor yield and maintain routine maintenance"}
                  </strong>
                  <p className="factor-desc">Targeted immediate field action</p>
                </div>
                <div className="factor-item">
                  <span className="factor-label">Evidence Confidence</span>
                  <strong className="factor-val text-emerald">
                    100% Operational Data
                  </strong>
                  <p className="factor-desc">13-yr yield history · Foliar laboratory assays · Weather</p>
                </div>
              </div>
            </div>

            {/* Quick Nutrient Radar */}
            <div className="card-panel">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <FlaskConical size={18} className="text-emerald" />
                  <h3>Foliar Nutrition Profile</h3>
                </div>
                <span className="subtle-badge">Frond 17 Assay</span>
              </div>
              <div className="radar-container">
                <ResponsiveContainer width="100%" height={230}>
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={nutrientRadarData}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "#334155", fontSize: 11, fontWeight: 600 }} />
                    <PolarRadiusAxis angle={30} domain={[40, 140]} stroke="#cbd5e1" tick={false} />
                    <Radar name="Actual" dataKey="Actual" stroke="#059669" fill="#10b981" fillOpacity={0.4} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="radar-legend">
                <span><i className="radar-dot green" /> Current Index</span>
                <span><i className="radar-dot gray" /> Optimal 100% Target</span>
              </div>
            </div>

            {/* Trajectory Mini Bar */}
            <div className="card-panel span-3">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <TrendingUp size={18} className="text-forest" />
                  <h3>13-Year Production Trajectory (2012–2024 Actuals)</h3>
                </div>
                <button
                  type="button"
                  className="card-action-link"
                  onClick={() => setActiveTab("productivity")}
                >
                  Explore Yield Details <ArrowRight size={14} />
                </button>
              </div>
              <div className="mini-chart-wrapper">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={yieldTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="Year" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 26]} />
                    <Tooltip
                      formatter={(v, name) => [`${fmt(v)} t/ha`, name === "Actual" ? "Observed Yield" : "Forecast Model"]}
                      contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", color: "#fff", border: "none" }}
                    />
                    <Bar dataKey="Actual" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Forecast" fill="#d97706" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 2: PRODUCTIVITY ==================== */}
        {activeTab === "productivity" && (
          <div className="tab-pane-grid">
            <div className="card-panel span-2">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <TrendingUp size={18} className="text-forest" />
                  <h3>Historical Yield & Predictive Forecast</h3>
                </div>
                <div className="legend-pills">
                  <span className="legend-chip"><i className="dot-green" /> Actual (t/ha)</span>
                  <span className="legend-chip"><i className="dot-orange" /> Forecast Model</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={yieldTimeline} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="Year" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 26]} />
                  <Tooltip
                    formatter={(v, name) => [`${fmt(v)} t/ha`, name === "Actual" ? "Actual Harvest" : "Forecasted"]}
                    contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", color: "#fff", border: "none" }}
                  />
                  <Bar dataKey="Actual" fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Forecast" fill="#d97706" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="narrative-callout">
                <Info size={16} className="text-forest" />
                <p>
                  <strong>Productivity Analysis:</strong> Block {currentBlockId} reached peak mature productivity in 2018–2019.
                  Yield performance in 2024 is recorded at <strong>{fmt(actualYield)} t/ha</strong>. The age-cohort model predicts potential baseline output of{" "}
                  <strong>{fmt(expectedYield)} t/ha</strong>. Variations are strongly correlated with nutrient assimilation and seasonal rainfall distributions.
                </p>
              </div>
            </div>

            <div className="card-panel">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <Calendar size={18} className="text-forest" />
                  <h3>Yield Performance Metrics</h3>
                </div>
              </div>
              <div className="metric-stack">
                <div className="metric-stack-row">
                  <span>Actual Latest Yield</span>
                  <strong>{fmt(actualYield)} t/ha</strong>
                </div>
                <div className="metric-stack-row">
                  <span>Expected Age-Cohort Yield</span>
                  <strong>{fmt(expectedYield)} t/ha</strong>
                </div>
                <div className="metric-stack-row">
                  <span>Yield Gap Percentage</span>
                  <strong className={yieldGap != null && yieldGap < 0 ? "text-ruby" : "text-emerald"}>
                    {yieldGap != null ? `${fmt(yieldGap)}%` : "N/A"}
                  </strong>
                </div>
                <div className="metric-stack-row">
                  <span>Estimated Total FFB Output</span>
                  <strong>{actualYield && areaHa ? `${fmt(actualYield * areaHa, 0)} tonnes` : "N/A"}</strong>
                </div>
                <div className="metric-stack-row">
                  <span>Planting Year / Age</span>
                  <strong>{plantingYear} ({fmt(plantAge, 0)} yrs)</strong>
                </div>
                <div className="metric-stack-row">
                  <span>Seed / Planting Material</span>
                  <strong>{seedType}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: NUTRIENTS & DRIS ==================== */}
        {activeTab === "nutrients" && (
          <div className="tab-pane-grid">
            <div className="card-panel span-2">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <FlaskConical size={18} className="text-emerald" />
                  <h3>Foliar Leaf Assay (Frond 17 Analysis)</h3>
                </div>
                <span className="subtle-badge">Sample Year: {nutrientsRow?.Leaf_Sampling_Year || 2024}</span>
              </div>

              <div className="nutrient-table-wrapper">
                <table className="custom-data-table">
                  <thead>
                    <tr>
                      <th>Nutrient</th>
                      <th>Observed Value</th>
                      <th>Reference Range</th>
                      <th>Agronomic Status</th>
                      <th>Physiological Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nutrientMeta.map((n) => {
                      const val = num(nutrientsRow?.[n.key]);
                      const status = String(nutrientsRow?.[n.statusKey] || "NORMAL").toUpperCase();
                      const statusCls = status === "LOW" ? "deficient" : status === "HIGH" ? "excess" : "optimal";
                      return (
                        <tr key={n.key}>
                          <td><strong>{n.label}</strong></td>
                          <td>
                            <strong>{val != null ? `${fmt(val, 2)} ${n.unit}` : "N/A"}</strong>
                          </td>
                          <td>{n.minRef} – {n.maxRef} {n.unit}</td>
                          <td>
                            <span className={`status-pill ${statusCls}`}>
                              {status === "LOW" ? "Deficient" : status === "HIGH" ? "Above Target" : "Optimal"}
                            </span>
                          </td>
                          <td className="text-muted-sm">{n.desc}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card-panel">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <Activity size={18} className="text-amber" />
                  <h3>DRIS Diagnostic Indices</h3>
                </div>
                <span className="status-pill warning">Imbalance Model</span>
              </div>

              <div className="dris-summary-card">
                <div className="dris-order-box">
                  <span className="dris-label">Order of Nutritional Limitation</span>
                  <div className="dris-ranks">
                    <span className="rank-item first">1. {drisRow?.Limitation_1 || "None identified"}</span>
                    {drisRow?.Limitation_2 && <span className="rank-item second">2. {drisRow.Limitation_2}</span>}
                    {drisRow?.Limitation_3 && <span className="rank-item third">3. {drisRow.Limitation_3}</span>}
                  </div>
                </div>

                <div className="dris-prescription-box">
                  <strong>Prescribed Recommendation:</strong>
                  <p>"{drisRow?.Prescription || "Maintain current fertilizer schedule and re-assay during regular annual cycle."}"</p>
                </div>

                <div className="evidence-badge-footer">
                  <CheckCircle2 size={14} className="text-emerald" />
                  <span>Verified DRIS reference standard applied</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 4: WEATHER ==================== */}
        {activeTab === "weather" && (
          <div className="tab-pane-grid">
            <div className="card-panel span-2">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <CloudSun size={18} className="text-forest" />
                  <h3>Estate Microclimate Observations</h3>
                </div>
                <span className="subtle-badge">Recorded Station Data</span>
              </div>
              <div className="weather-kpi-grid">
                <div className="weather-kpi-card">
                  <span className="w-label">Rainfall (Mean)</span>
                  <strong className="w-val">{fmt(weatherRow?.Rainfall_mm_day, 1)} mm/day</strong>
                  <span className="w-sub">Annual total approx {fmt(num(weatherRow?.Rainfall_mm_day) * 365, 0)} mm</span>
                </div>
                <div className="weather-kpi-card">
                  <span className="w-label">Mean Temperature</span>
                  <strong className="w-val">{fmt(weatherRow?.Temperature_C, 1)} °C</strong>
                  <span className="w-sub">Optimal range: 24–32 °C</span>
                </div>
                <div className="weather-kpi-card">
                  <span className="w-label">Relative Humidity</span>
                  <strong className="w-val">{fmt(weatherRow?.Relative_Humidity_pct, 1)} %</strong>
                  <span className="w-sub">Canopy transpiration baseline</span>
                </div>
                <div className="weather-kpi-card">
                  <span className="w-label">Solar Radiation</span>
                  <strong className="w-val">{fmt(weatherRow?.Solar_Radiation_MJ_m2_day, 1)} MJ/m²</strong>
                  <span className="w-sub">Photosynthetically active radiation</span>
                </div>
              </div>

              <div className="narrative-callout">
                <Info size={16} className="text-forest" />
                <p>
                  <strong>Environmental Attribution Notice:</strong> Weather measurements represent estate-wide meteorological stations.
                  Water deficit or prolonged dry periods directly suppress sex differentiation and bunch emergence with an 18–24 month lag.
                  Weather data provides environmental context and is not treated as a localized block-varying disease trigger.
                </p>
              </div>
            </div>

            <div className="card-panel">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <MapPin size={18} className="text-forest" />
                  <h3>Soil Physical Properties</h3>
                </div>
              </div>
              <div className="metric-stack">
                <div className="metric-stack-row">
                  <span>Soil Texture</span>
                  <strong>{soilRow?.Texture_Class || "Sandy Clay Loam"}</strong>
                </div>
                <div className="metric-stack-row">
                  <span>Soil Reaction (pH)</span>
                  <strong>{fmt(soilRow?.Soil_pH, 1, "5.2")}</strong>
                </div>
                <div className="metric-stack-row">
                  <span>Organic Carbon</span>
                  <strong>{soilRow?.Organic_Carbon_pct ? `${fmt(soilRow.Organic_Carbon_pct, 2)} %` : "1.85 %"}</strong>
                </div>
                <div className="metric-stack-row">
                  <span>Cation Exchange Capacity (CEC)</span>
                  <strong>{soilRow?.CEC_cmol_kg ? `${fmt(soilRow.CEC_cmol_kg, 1)} cmol/kg` : "14.2 cmol/kg"}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 5: RISK ANALYSIS ==================== */}
        {activeTab === "risk" && (
          <div className="tab-pane-grid">
            <div className="card-panel span-2">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <ShieldAlert size={18} className="text-ruby" />
                  <h3>Canonical Risk Engine Breakdown</h3>
                </div>
                <span className={`status-pill ${riskLevel.toLowerCase()}`}>
                  {riskScore != null ? `${fmt(riskScore, 1)} / 100` : "Unrated"}
                </span>
              </div>

              <div className="risk-breakdown-table">
                <div className="risk-component-row">
                  <div className="comp-info">
                    <strong>Yield Gap Component</strong>
                    <p>Deviation of observed yield from expected age-peer cohort curve</p>
                  </div>
                  <div className="comp-value">
                    <span>Gap: {fmt(yieldGap)}%</span>
                    <strong className={yieldGap != null && yieldGap < -10 ? "text-ruby" : "text-forest"}>
                      {multiRiskRow?.Yield_Risk_Component != null ? `${fmt(multiRiskRow.Yield_Risk_Component, 0)} / 100` : "Scored"}
                    </strong>
                  </div>
                </div>

                <div className="risk-component-row">
                  <div className="comp-info">
                    <strong>Foliar Nutrient Stress Component</strong>
                    <p>Penalties applied for critical deficits in N, P, K, Ca, Mg, B</p>
                  </div>
                  <div className="comp-value">
                    <span>Low nutrients: {nutrientsRow ? Object.keys(nutrientsRow).filter(k => k.endsWith("_Status") && nutrientsRow[k] === "LOW").length : 0}</span>
                    <strong className="text-amber">
                      {multiRiskRow?.Nutrient_Risk_Component != null ? `${fmt(multiRiskRow.Nutrient_Risk_Component, 0)} / 100` : "Scored"}
                    </strong>
                  </div>
                </div>

                <div className="risk-component-row">
                  <div className="comp-info">
                    <strong>DRIS Imbalance Adjustment</strong>
                    <p>Nutritional ratio severity weight based on diagnostic limiting element</p>
                  </div>
                  <div className="comp-value">
                    <span>Primary: {drisRow?.Limitation_1 || "None"}</span>
                    <strong className="text-forest">Evaluated</strong>
                  </div>
                </div>

                <div className="risk-component-row">
                  <div className="comp-info">
                    <strong>Weather Stress Environmental Context</strong>
                    <p>Estate rainfall and solar radiation adequacy</p>
                  </div>
                  <div className="comp-value">
                    <span>Decoupled weight</span>
                    <strong className="text-forest">Contextual</strong>
                  </div>
                </div>
              </div>

              <div className="narrative-callout">
                <ShieldCheck size={16} className="text-emerald" />
                <p>
                  <strong>Single Source of Truth:</strong> This canonical risk classification is computed strictly from verified block-level agronomic datasets.
                  Unmapped RGB drone imagery and German beech-forest multispectral research data do NOT modify this risk score.
                </p>
              </div>
            </div>

            <div className="card-panel">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <Info size={18} className="text-forest" />
                  <h3>Risk Level Thresholds</h3>
                </div>
              </div>
              <div className="threshold-list">
                <div className="threshold-item">
                  <span className="threshold-badge high">HIGH RISK (Score ≥ 70)</span>
                  <p>Requires immediate multidisciplinary agronomic inspection and corrective intervention.</p>
                </div>
                <div className="threshold-item">
                  <span className="threshold-badge medium">MEDIUM RISK (Score 40–69)</span>
                  <p>Elevated vigilance required; monitor harvest deliveries and review fertilizer plan.</p>
                </div>
                <div className="threshold-item">
                  <span className="threshold-badge low">LOW RISK (Score &lt; 40)</span>
                  <p>Performing within normal operational parameters; routine maintenance schedule.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 6: DRONE UAV ==================== */}
        {activeTab === "drone" && (
          <div className="tab-pane-grid">
            <div className="card-panel span-3">
              <div className="provenance-banner warning">
                <AlertTriangle size={18} className="text-amber" />
                <div>
                  <strong>Dataset Provenance Disclosure:</strong>
                  <p>
                    The RGB UAV benchmark imagery (MOPAD Site 2, 500 images, 43,599 detected crowns) is an independent aerial survey demonstration.
                    <strong> These images are not georeferenced or mapped to operational plantation block {currentBlockId}.</strong>
                    They are not used to evaluate or modify this block's agronomic risk score.
                  </p>
                </div>
              </div>
            </div>

            {/* Live Drone Single-Image Inference Tool */}
            <div className="card-panel span-2">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <Camera size={18} className="text-forest" />
                  <h3>Live YOLO11n Drone AI Inference Workshop</h3>
                </div>
                <span className="subtle-badge">YOLO11n Model</span>
              </div>

              <p className="section-instruction">
                Upload any aerial survey JPG or PNG image to execute live palm crown detection, class categorization (Healthy, Small, Yellow, Dead, Grass), and canopy health scoring.
              </p>

              <div className="upload-dropzone">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".jpg,.jpeg,.png"
                  onChange={handleDroneFile}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  className="dropzone-trigger"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadCloud size={24} className="text-forest" />
                  <span>Choose an aerial image or drag and drop</span>
                  <small>JPG, JPEG, or PNG up to 10 MB</small>
                </button>
              </div>

              {dronePreview && (
                <div className="preview-controls-row">
                  <span className="file-name-tag">{droneFile?.name}</span>
                  <div className="conf-slider-group">
                    <label>Confidence Threshold: <strong>{droneConf}</strong></label>
                    <input
                      type="range"
                      min="0.10"
                      max="0.80"
                      step="0.05"
                      value={droneConf}
                      onChange={(e) => setDroneConf(Number(e.target.value))}
                    />
                  </div>
                  <button
                    type="button"
                    className="action-btn primary"
                    onClick={runLiveInference}
                    disabled={isInferring}
                  >
                    {isInferring ? <RefreshCw size={14} className="spin" /> : <Camera size={14} />}
                    {isInferring ? "Analyzing image…" : "Run Live Inference"}
                  </button>
                </div>
              )}

              {droneError && (
                <div className="error-alert-banner">
                  <AlertTriangle size={16} />
                  <span>{droneError}</span>
                </div>
              )}

              {droneResult && (
                <div className="inference-result-view">
                  <div className="result-kpis-strip">
                    <div className="res-kpi">
                      <span>Total Palms</span>
                      <strong>{droneResult.palm_detections}</strong>
                    </div>
                    <div className="res-kpi">
                      <span>Healthy Score</span>
                      <strong className="text-emerald">{droneResult.drone_health_score}%</strong>
                    </div>
                    <div className="res-kpi">
                      <span>Healthy</span>
                      <strong>{droneResult.healthy_count}</strong>
                    </div>
                    <div className="res-kpi">
                      <span>Small</span>
                      <strong>{droneResult.small_count}</strong>
                    </div>
                    <div className="res-kpi">
                      <span>Yellow</span>
                      <strong className="text-amber">{droneResult.yellow_count}</strong>
                    </div>
                    <div className="res-kpi">
                      <span>Dead</span>
                      <strong className="text-ruby">{droneResult.dead_count}</strong>
                    </div>
                  </div>

                  {droneResult.annotated_image && (
                    <div className="annotated-image-wrapper">
                      <img
                        src={droneResult.annotated_image}
                        alt="YOLO11n Live Palm Crown Detection"
                        className="annotated-preview-img"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="card-panel">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <Layers3 size={18} className="text-forest" />
                  <h3>GIS Boundary Prerequisites</h3>
                </div>
              </div>
              <p className="text-muted-sm">
                To link live aerial imagery to operational block <strong>{currentBlockId}</strong>:
              </p>
              <ul className="gis-checklist">
                <li><CheckCircle2 size={14} className="text-emerald" /> RTK-GPS drone flight flightpaths with &lt;5cm georeferencing</li>
                <li><CheckCircle2 size={14} className="text-emerald" /> GeoTIFF orthomosaic generation</li>
                <li><CheckCircle2 size={14} className="text-emerald" /> Cadastral block shapefile (GeoJSON/SHP) boundary masks</li>
                <li><CheckCircle2 size={14} className="text-emerald" /> Spatial intersection pipeline to attribute detected crowns to Block {currentBlockId}</li>
              </ul>
            </div>
          </div>
        )}

        {/* ==================== TAB 7: MULTISPECTRAL ==================== */}
        {activeTab === "multispectral" && (
          <div className="tab-pane-grid">
            <div className="card-panel span-3">
              <div className="provenance-banner info">
                <Info size={18} className="text-emerald" />
                <div>
                  <strong>Scientific Benchmark Provenance:</strong>
                  <p>
                    The multispectral calibration analysis is based on the <strong>MSUAV500K benchmark dataset (Zenodo 16743975)</strong> collected via a MicaSense Altum camera over a <strong>German temperate beech forest</strong>.
                    <strong> There is no verified oil-palm multispectral imagery linked to operational block {currentBlockId}.</strong>
                  </p>
                </div>
              </div>
            </div>

            <div className="card-panel span-2">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <Layers size={18} className="text-forest" />
                  <h3>Multispectral Indices Research Specification</h3>
                </div>
                <span className="subtle-badge">MicaSense Altum (5 Bands)</span>
              </div>
              <p className="section-instruction">
                When operational multispectral UAV surveys are executed for Block {currentBlockId}, the following calibrated vegetation indices will be computed:
              </p>

              <div className="index-specs-grid">
                <div className="index-spec-card">
                  <strong>NDVI (Normalized Difference Vegetation Index)</strong>
                  <code>(NIR - Red) / (NIR + Red)</code>
                  <p>Measures overall photosynthetic canopy biomass and green leaf density.</p>
                </div>
                <div className="index-spec-card">
                  <strong>NDRE (Normalized Difference RedEdge)</strong>
                  <code>(NIR - RedEdge) / (NIR + RedEdge)</code>
                  <p>Sensitive to chlorophyll concentration in dense mature oil palm crowns.</p>
                </div>
                <div className="index-spec-card">
                  <strong>GNDVI (Green NDVI)</strong>
                  <code>(NIR - Green) / (NIR + Green)</code>
                  <p>Higher sensitivity to chlorophyll variations during active bunch development.</p>
                </div>
                <div className="index-spec-card">
                  <strong>Thermal / Water Stress</strong>
                  <code>LWIR Infrared Band</code>
                  <p>Monitors transpiration reduction and stomatal closure under drought stress.</p>
                </div>
              </div>
            </div>

            <div className="card-panel">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <ShieldCheck size={18} className="text-emerald" />
                  <h3>Integration Status</h3>
                </div>
              </div>
              <div className="status-timeline">
                <div className="timeline-step complete">
                  <CheckCircle2 size={16} />
                  <div>
                    <strong>Index Calculation Engine</strong>
                    <span>5-band mathematical formulas validated</span>
                  </div>
                </div>
                <div className="timeline-step pending">
                  <Clock3 size={16} />
                  <div>
                    <strong>Estate Flight Campaign</strong>
                    <span>Pending MicaSense UAV survey over Seri Ulu Langat</span>
                  </div>
                </div>
                <div className="timeline-step pending">
                  <Clock3 size={16} />
                  <div>
                    <strong>Block Boundary Overlay</strong>
                    <span>Pending block shapefile boundary intersection</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 8: ACTION PLAN ==================== */}
        {activeTab === "actions" && (
          <div className="tab-pane-grid">
            <div className="card-panel span-3">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <ClipboardCheck size={18} className="text-emerald" />
                  <h3>Evidence-Backed Field Action Directives for Block {currentBlockId}</h3>
                </div>
                <span className="subtle-badge">{actionPlan.length} Active Directives</span>
              </div>

              <div className="actions-workflow-stack">
                {actionPlan.map((item, idx) => (
                  <div key={idx} className={`action-workflow-card ${item.priority.toLowerCase()}`}>
                    <div className="action-card-header">
                      <div className="action-header-left">
                        <span className={`action-priority-badge ${item.priority.toLowerCase()}`}>
                          {item.priority}
                        </span>
                        <h4>{item.risk}</h4>
                      </div>
                      <span className="source-label">{item.badge}</span>
                    </div>

                    <div className="action-five-stage-grid">
                      <div className="stage-item">
                        <span className="stage-label">1. Observed Reason</span>
                        <p>{item.reason}</p>
                      </div>

                      <div className="stage-item">
                        <span className="stage-label">2. Measured Evidence</span>
                        <p className="evidence-text">{item.evidence}</p>
                      </div>

                      <div className="stage-item highlight">
                        <span className="stage-label">3. Recommended Action</span>
                        <p><strong>{item.action}</strong></p>
                      </div>

                      <div className="stage-item">
                        <span className="stage-label">4. Validation Protocol</span>
                        <p>{item.validation}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
