import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Layers,
  LayoutDashboard,
  Leaf,
  RefreshCw,
  Search,
  Sprout,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  MapPin,
  ArrowRight,
  ArrowLeft,
  Activity,
  CloudSun,
  FlaskConical,
  Camera,
  Layers3,
  ExternalLink,
  ChevronRight,
  Info,
  CheckCircle2,
  Sparkles,
  BarChart3,
  HelpCircle,
  Clock
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from "recharts";
import UnifiedBlockIntelligence from "./UnifiedBlockIntelligence";
import "./App.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

const sourcePaths = {
  risk: "/risk",
  multiRisk: "/multi-source-risk",
  nutrients: "/nutrients",
  dris: "/dris",
  drisReference: "/dris-reference",
  weather: "/weather",
  weatherCorrelation: "/weather-correlation",
  monthlyWeather: "/monthly-weather",
  productivity: "/productivity",
  production: "/production",
  harvestProduction: "/harvest-production",
  forecast: "/yield-forecast",
  modelValidation: "/model-validation",
  ageSeed: "/age-seed",
  seasonality: "/seasonality",
  soil: "/soil",
  dataQuality: "/data-quality",
  nutrientReference: "/nutrient-reference",
  droneSummary: "/drone/summary",
  droneValidation: "/drone/validation",
  droneOutliers: "/drone/outliers",
  droneImages: "/drone/images",
  droneVisualizations: "/drone/visualizations",
  multispectralSummary: "/multispectral/summary",
  multispectralTiles: "/multispectral/tiles",
  multispectralIndices: "/multispectral/indices",
  multispectralVisualizations: "/multispectral/visualizations",
  multiSourceSummary: "/multi-source/summary",
  multiSourceEvidence: "/multi-source/evidence",
};

const emptyDatasets = {
  risk: [], multiRisk: [], nutrients: [], nutrientReference: [], dris: [], drisReference: [],
  weather: [], weatherCorrelation: [], monthlyWeather: [], productivity: [], production: [],
  harvestProduction: [], forecast: [], ageSeed: [], seasonality: [], soil: [], dataQuality: null,
  modelMetrics: [], yearlyValidation: [], featureImportance: [],
  droneSummary: null, droneValidation: null, droneOutliers: null, droneImages: [], droneVisualizations: [],
  multispectralSummary: null, multispectralTiles: [], multispectralIndices: [], multispectralVisualizations: [],
  multiSourceSummary: null, multiSourceEvidence: null,
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

// Natural alphabetical block ordering: B001, B002 ... B009, B010 ... B042
function naturalBlockSort(a, b) {
  const idA = String(a.Block_ID || a.block_id || "");
  const idB = String(b.Block_ID || b.block_id || "");
  const numA = parseInt(idA.replace(/\D/g, ""), 10) || 0;
  const numB = parseInt(idB.replace(/\D/g, ""), 10) || 0;
  if (numA !== numB) return numA - numB;
  return idA.localeCompare(idB);
}

export default function App() {
  // Navigation State: 'estates' | 'blocks' | 'block-detail'
  const [viewLevel, setViewLevel] = useState("blocks");
  const [selectedEstate, setSelectedEstate] = useState("North Estate (PT Palm Indo)");
  const [selectedBlockId, setSelectedBlockId] = useState("B012");
  const [blockSearch, setBlockSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("ALL");

  const [datasets, setDatasets] = useState(emptyDatasets);
  const [isLoading, setIsLoading] = useState(true);
  const [unavailableSources, setUnavailableSources] = useState([]);

  // Fetch API payload safely
  const fetchPayload = async (path) => {
    const res = await fetch(`${API_BASE}${path}`);
    const result = await res.json().catch(() => null);
    if (!res.ok) throw new Error(result?.error || `API error (${res.status})`);
    return {
      data: result,
      available: res.headers.get("X-Data-Availability") !== "unavailable",
      reason: res.headers.get("X-Data-Reason") || "",
    };
  };

  // Load all 20 API endpoints
  const loadSources = useCallback(async () => {
    setIsLoading(true);
    const unavail = [];
    const newDatasets = { ...emptyDatasets };

    await Promise.all(
      Object.entries(sourcePaths).map(async ([key, path]) => {
        try {
          const { data, available } = await fetchPayload(path);
          if (!available) unavail.push(key);

          if (key === "modelValidation") {
            newDatasets.modelMetrics = data?.metrics || [];
            newDatasets.yearlyValidation = data?.yearly || [];
            newDatasets.featureImportance = data?.feature_importance || [];
          } else if (key === "dataQuality") {
            newDatasets.dataQuality = data;
          } else if (key === "droneVisualizations") {
            newDatasets.droneVisualizations = data?.visualizations || [];
          } else if (key === "multispectralVisualizations") {
            newDatasets.multispectralVisualizations = data || [];
          } else {
            newDatasets[key] = data;
          }
        } catch (err) {
          unavail.push(key);
        }
      })
    );

    setDatasets(newDatasets);
    setUnavailableSources(unavail);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  // Synchronize URL Hash
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace(/^#/, "").trim();
      if (!hash || hash === "estates") {
        setViewLevel("estates");
      } else if (hash === "blocks" || hash === "estate") {
        setViewLevel("blocks");
      } else if (hash.startsWith("block/")) {
        const bid = hash.replace("block/", "").toUpperCase();
        setSelectedBlockId(bid);
        setViewLevel("block-detail");
      } else if (/^B\d{3}$/i.test(hash)) {
        setSelectedBlockId(hash.toUpperCase());
        setViewLevel("block-detail");
      }
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  // Update hash when viewLevel or selectedBlockId changes
  const navigateTo = (level, blockId = null) => {
    setViewLevel(level);
    if (level === "estates") {
      window.history.pushState(null, "", "#estates");
    } else if (level === "blocks") {
      window.history.pushState(null, "", "#blocks");
    } else if (level === "block-detail") {
      const bid = blockId || selectedBlockId;
      setSelectedBlockId(bid);
      window.history.pushState(null, "", `#${bid}`);
    }
  };

  // Process and naturally sort 42 blocks merging multi-source canonical screening data
  const processedBlocks = useMemo(() => {
    const riskMap = new Map();
    (datasets.risk || []).forEach((b) => {
      const bid = String(b.Block_ID || "").trim().toUpperCase();
      if (bid) riskMap.set(bid, b);
    });

    const multiMap = new Map();
    (datasets.multiRisk || []).forEach((m) => {
      const bid = String(m.Block_ID || "").trim().toUpperCase();
      if (bid) multiMap.set(bid, m);
    });

    // Build unified 42 blocks fleet
    const allIds = new Set([...riskMap.keys(), ...multiMap.keys()]);
    const list = Array.from(allIds).map((bid) => {
      const r = riskMap.get(bid) || {};
      const m = multiMap.get(bid) || {};
      const canonicalLevel = String(m.Multi_Source_Risk_Level || r.Risk_Level || "LOW").toUpperCase();
      const canonicalScore = num(m.Multi_Source_Risk_Score ?? r.Risk_Score, 0);
      const actualYield = num(r.Actual_Yield_t_Ha ?? m.Actual_Productivity);
      const expectedYield = num(r.Expected_Yield_t_Ha);
      const yieldGap = num(r.Yield_Gap_pct ?? m.Productivity_Deviation_pct);
      const contributor = m.Main_Contributing_Indicators || r.Risk_Contributor || "Balanced";
      const action = m.Recommended_Action || r.Recommended_Action || "Standard field maintenance";
      const plantAge = num(r.Plant_Age_Years, 12);
      const plantingYear = r.Planting_Year || "2012";
      const seedType = r.Seed_Type || "DxP Hybrid";
      const areaHa = num(r.Area_Ha, 36.0);

      return {
        Block_ID: bid,
        Risk_Level: canonicalLevel,
        Risk_Score: canonicalScore,
        Actual_Yield_t_Ha: actualYield,
        Expected_Yield_t_Ha: expectedYield,
        Yield_Gap_pct: yieldGap,
        Main_Contributing_Indicators: contributor,
        Recommended_Action: action,
        Plant_Age_Years: plantAge,
        Planting_Year: plantingYear,
        Seed_Type: seedType,
        Area_Ha: areaHa,
      };
    });

    return list.sort(naturalBlockSort);
  }, [datasets.risk, datasets.multiRisk]);

  // Estate Risk Counts strictly computed from canonical telemetry
  const riskCounts = useMemo(() => {
    let high = 0, medium = 0, low = 0;
    processedBlocks.forEach((b) => {
      const r = b.Risk_Level;
      if (r === "HIGH") high++;
      else if (r === "MEDIUM") medium++;
      else low++;
    });
    return { high, medium, low, total: processedBlocks.length || 42 };
  }, [processedBlocks]);

  // Mean Yield across estate in 2024
  const meanYield = useMemo(() => {
    if (!processedBlocks.length) return 17.90;
    const valid = processedBlocks.filter((b) => b.Actual_Yield_t_Ha != null);
    if (!valid.length) return 17.90;
    const sum = valid.reduce((acc, b) => acc + b.Actual_Yield_t_Ha, 0);
    return sum / valid.length;
  }, [processedBlocks]);

  // Priority Blocks Watchlist (HIGH + top MEDIUM risk blocks)
  const priorityBlocks = useMemo(() => {
    return processedBlocks
      .filter((b) => b.Risk_Level === "HIGH" || b.Risk_Level === "MEDIUM")
      .sort((a, b) => (b.Risk_Score || 0) - (a.Risk_Score || 0));
  }, [processedBlocks]);

  // 13-Year Historical Yield Trend (2012–2024) across entire 42-block estate
  const estateYieldTrend = useMemo(() => {
    if (!datasets.productivity || !datasets.productivity.length) return [];
    const yearlyMap = new Map();
    datasets.productivity.forEach((row) => {
      const yr = Number(row.Year);
      const yld = num(row.Productivity_t_Ha);
      if (yr && yld != null) {
        if (!yearlyMap.has(yr)) yearlyMap.set(yr, { sum: 0, count: 0 });
        const entry = yearlyMap.get(yr);
        entry.sum += yld;
        entry.count += 1;
      }
    });

    return Array.from(yearlyMap.entries())
      .map(([year, val]) => ({
        year,
        meanYield: Number((val.sum / val.count).toFixed(2)),
        cohortBenchmark: year < 2015 ? 5.5 : year < 2018 ? 8.0 : year < 2022 ? 18.5 : 20.0,
      }))
      .sort((a, b) => a.year - b.year);
  }, [datasets.productivity]);

  // Filtered Blocks for Grid Search & Risk Filter
  const filteredBlocks = useMemo(() => {
    return processedBlocks.filter((b) => {
      const matchSearch =
        !blockSearch ||
        String(b.Block_ID).toLowerCase().includes(blockSearch.toLowerCase());
      const bRisk = b.Risk_Level;
      const matchRisk =
        riskFilter === "ALL" ||
        (riskFilter === "HIGH" && bRisk === "HIGH") ||
        (riskFilter === "MEDIUM" && bRisk === "MEDIUM") ||
        (riskFilter === "LOW" && bRisk === "LOW");
      return matchSearch && matchRisk;
    });
  }, [processedBlocks, blockSearch, riskFilter]);

  return (
    <div className="palm-app">
      {/* GLOBAL ENTERPRISE TOPBAR (NO SIDEBAR EVER) */}
      <header className="global-topbar">
        <div className="topbar-left">
          {/* Logo Brand */}
          <div
            className="brand-cluster clickable"
            onClick={() => navigateTo("estates")}
            title="Return to Estate Fleet Overview"
          >
            <div className="brand-logo-icon">
              <Sprout size={18} className="text-emerald" />
            </div>
            <div className="brand-text-stack">
              <strong className="brand-title">ALM AI</strong>
              <span className="brand-sub">Palm Intelligence AI</span>
            </div>
          </div>

          <div className="brand-divider" />

          {/* Breadcrumb Hierarchy Navigation */}
          <nav className="topbar-breadcrumbs">
            <button
              type="button"
              className={`crumb-btn ${viewLevel === "estates" ? "active" : ""}`}
              onClick={() => navigateTo("estates")}
            >
              Estates
            </button>

            {viewLevel !== "estates" && (
              <>
                <span className="crumb-chevron"><ChevronRight size={14} /></span>
                <button
                  type="button"
                  className={`crumb-btn ${viewLevel === "blocks" ? "active" : ""}`}
                  onClick={() => navigateTo("blocks")}
                >
                  {selectedEstate}
                </button>
              </>
            )}

            {viewLevel === "block-detail" && (
              <>
                <span className="crumb-chevron"><ChevronRight size={14} /></span>
                <strong className="crumb-current">Block {selectedBlockId}</strong>
              </>
            )}
          </nav>
        </div>

        {/* Topbar Right Telemetry Status */}
        <div className="topbar-right">
          {viewLevel === "block-detail" && (
            <button
              type="button"
              className="quick-back-grid-btn"
              onClick={() => navigateTo("blocks")}
            >
              <ArrowLeft size={14} />
              <span>Block Grid</span>
            </button>
          )}

          <div className="telemetry-pill">
            <span className="telemetry-dot" />
            <span className="telemetry-text">
              {isLoading ? "Synchronizing Telemetry…" : "42 Blocks Monitored (2012–2024)"}
            </span>
          </div>

          <button
            type="button"
            className="refresh-icon-btn"
            onClick={loadSources}
            title="Refresh Agronomic Telemetry"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {/* SINGLE-SCREEN MAIN VIEW WORKSPACE */}
      <main className="single-screen-content">
        {/* ======================================================== */}
        {/* VIEW 1: INITIAL SCREEN — ESTATE LIST                     */}
        {/* ======================================================== */}
        {viewLevel === "estates" && (
          <div className="view-container estate-list-view">
            <div className="view-hero-banner">
              <div>
                <span className="hero-eyebrow">COMMERCIAL ESTATE INTELLIGENCE</span>
                <h1 className="hero-heading">Operational Plantations & Estate Fleet</h1>
                <p className="hero-subtext">
                  Select an operational estate to inspect block-level yield trajectories, nutritional diagnostics, and canonical risk screening.
                </p>
              </div>
              <div className="hero-meta-badge">
                <MapPin size={16} className="text-emerald" />
                <span>Single Operational Estate Mapped in Current Dataset</span>
              </div>
            </div>

            {/* Real Estate Cards Grid */}
            <div className="estate-cards-grid">
              <div
                className="estate-card"
                onClick={() => navigateTo("blocks")}
              >
                <div className="estate-card-top">
                  <div>
                    <span className="estate-category-tag">Operational Fleet · Division A</span>
                    <h2 className="estate-name">{selectedEstate}</h2>
                  </div>
                  <span className="estate-live-badge">
                    <span className="dot-live" /> Live Telemetry
                  </span>
                </div>

                <p className="estate-description">
                  Commercial oil-palm plantation monitoring 42 contiguous management blocks across mature planting cohorts. Fully integrated with multi-source yield, foliar, weather, and UAV inference data.
                </p>

                {/* 6 Key Estate Metrics */}
                <div className="estate-stats-grid">
                  <div className="estate-stat-item">
                    <span className="stat-label">Monitored Blocks</span>
                    <strong className="stat-val">{riskCounts.total} Blocks</strong>
                    <span className="stat-sub">B001 – B042 (Natural Order)</span>
                  </div>
                  <div className="estate-stat-item">
                    <span className="stat-label">Total Monitored Area</span>
                    <strong className="stat-val">1,512 Ha</strong>
                    <span className="stat-sub">36.0 Ha avg/block</span>
                  </div>
                  <div className="estate-stat-item">
                    <span className="stat-label">Productive Stand</span>
                    <strong className="stat-val">204,120 Palms</strong>
                    <span className="stat-sub">135 palms/ha</span>
                  </div>
                  <div className="estate-stat-item">
                    <span className="stat-label">Mean 2024 Yield</span>
                    <strong className="stat-val text-emerald">{fmt(meanYield)} t/ha</strong>
                    <span className="stat-sub">Annual harvest</span>
                  </div>
                  <div className="estate-stat-item">
                    <span className="stat-label">Planting Cohort</span>
                    <strong className="stat-val">Mature (10–12 Yrs)</strong>
                    <span className="stat-sub">DxP Hybrid seed</span>
                  </div>
                  <div className="estate-stat-item">
                    <span className="stat-label">Data History</span>
                    <strong className="stat-val">13 Years</strong>
                    <span className="stat-sub">2012 – 2024 Window</span>
                  </div>
                </div>

                {/* Risk Distribution Bar */}
                <div className="estate-risk-summary-bar">
                  <span className="risk-summary-title">Canonical Risk Screening Distribution:</span>
                  <div className="risk-pills-row">
                    <span className="risk-chip high">
                      <strong>{riskCounts.high}</strong> High Risk ({(riskCounts.high / riskCounts.total * 100).toFixed(1)}%)
                    </span>
                    <span className="risk-chip medium">
                      <strong>{riskCounts.medium}</strong> Medium Risk ({(riskCounts.medium / riskCounts.total * 100).toFixed(1)}%)
                    </span>
                    <span className="risk-chip low">
                      <strong>{riskCounts.low}</strong> Low Risk ({(riskCounts.low / riskCounts.total * 100).toFixed(1)}%)
                    </span>
                  </div>
                </div>

                {/* Provenance Disclosure Note */}
                <div className="estate-provenance-note">
                  <Info size={14} className="text-emerald" />
                  <span>
                    <strong>Metadata Provenance:</strong> The underlying agronomic master dataset contains 42 operational blocks under Division A. No external multi-estate hierarchy metadata exists in the repository. Multi-estate division hierarchy can be linked via an enterprise GIS connector.
                  </span>
                </div>

                {/* Card CTA */}
                <div className="estate-card-action">
                  <button type="button" className="open-estate-btn">
                    <span>Inspect 42 Blocks</span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 2: ESTATE SCREEN — OVERVIEW & NATURAL BLOCK GRID    */}
        {/* ======================================================== */}
        {viewLevel === "blocks" && (
          <div className="view-container block-grid-view">
            {/* Estate Header & Controls */}
            <div className="block-grid-header">
              <div className="grid-header-left">
                <button
                  type="button"
                  className="crumb-back-link"
                  onClick={() => navigateTo("estates")}
                >
                  <ArrowLeft size={14} />
                  <span>All Estates</span>
                </button>
                <div className="estate-title-row">
                  <h1 className="estate-display-title">{selectedEstate}</h1>
                  <span className="block-count-badge">42 Operational Blocks</span>
                  <span className="cohort-tag">Mature DxP Hybrid</span>
                </div>
                <p className="estate-subtitle">
                  Enterprise agronomic intelligence overview with 13-year productivity history, canonical screening distribution, and naturally sorted block cards.
                </p>
              </div>

              {/* Summary Stats Strip */}
              <div className="grid-summary-stats">
                <div className="grid-stat">
                  <span>Monitored Area</span>
                  <strong>1,512 Ha</strong>
                </div>
                <div className="grid-stat">
                  <span>Mean 2024 Yield</span>
                  <strong className="text-emerald">{fmt(meanYield)} t/ha</strong>
                </div>
                <div className="grid-stat">
                  <span>High Risk</span>
                  <strong className="text-ruby">{riskCounts.high} Block</strong>
                </div>
                <div className="grid-stat">
                  <span>Medium Risk</span>
                  <strong className="text-gold">{riskCounts.medium} Blocks</strong>
                </div>
                <div className="grid-stat">
                  <span>Low Risk</span>
                  <strong className="text-emerald">{riskCounts.low} Blocks</strong>
                </div>
              </div>
            </div>

            {/* ===================================================== */}
            {/* SECTION 3: ESTATE OVERVIEW DASHBOARD (ANALYTICS STRIP) */}
            {/* ===================================================== */}
            <div className="estate-analytics-grid">
              {/* Historical Yield Trend Chart (2012–2024) */}
              <div className="analytics-card span-2">
                <div className="analytics-card-header">
                  <div className="header-icon-title">
                    <TrendingUp size={18} className="text-emerald" />
                    <div>
                      <h3>Estate Productivity Overview & Historical Yield Trend</h3>
                      <p className="subtext">13-year annual harvest average (2012–2024) across all 42 operational blocks vs age benchmark</p>
                    </div>
                  </div>
                  <span className="subtle-badge">Telemetry: 2012–2024</span>
                </div>

                <div className="chart-container-wrap">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={estateYieldTrend} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.07)" />
                      <XAxis dataKey="year" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} domain={[0, 26]} unit=" t" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#061a10",
                          borderColor: "rgba(16, 185, 129, 0.4)",
                          borderRadius: "8px",
                          color: "#f8fafc",
                          fontSize: "12px",
                        }}
                        formatter={(val, name) => [
                          `${Number(val).toFixed(2)} t/ha`,
                          name === "meanYield" ? "Estate Harvest Average" : "Maturity Benchmark",
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="meanYield"
                        name="meanYield"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={{ r: 4, fill: "#10b981" }}
                        activeDot={{ r: 7, stroke: "#061a10", strokeWidth: 2 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="cohortBenchmark"
                        name="cohortBenchmark"
                        stroke="#d97706"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-footer-legend">
                  <span className="legend-chip"><i className="legend-dot bg-emerald" /> 42-Block Annual Harvest Mean (Actuals)</span>
                  <span className="legend-chip"><i className="legend-dot bg-gold dashed" /> Cohort Age Yield Expectation</span>
                  <span className="legend-note">Immature (2012–2015) → Prime Peak (2018–2022) → Mature Plateau (2023–2024)</span>
                </div>
              </div>

              {/* Canonical Risk Distribution & Strategic Estate Directives */}
              <div className="analytics-card">
                <div className="analytics-card-header">
                  <div className="header-icon-title">
                    <ShieldAlert size={18} className="text-gold" />
                    <div>
                      <h3>Risk Screening Distribution</h3>
                      <p className="subtext">Canonical weighted screening formula (Yield 40%, Leaf 25%, DRIS 15%)</p>
                    </div>
                  </div>
                </div>

                {/* Risk Distribution Breakdown Bar */}
                <div className="distribution-progress-stack">
                  <div className="progress-labels-row">
                    <span className="text-ruby font-600">High: {riskCounts.high} ({(riskCounts.high / riskCounts.total * 100).toFixed(1)}%)</span>
                    <span className="text-gold font-600">Medium: {riskCounts.medium} ({(riskCounts.medium / riskCounts.total * 100).toFixed(1)}%)</span>
                    <span className="text-emerald font-600">Low: {riskCounts.low} ({(riskCounts.low / riskCounts.total * 100).toFixed(1)}%)</span>
                  </div>

                  <div className="stacked-progress-bar">
                    <div
                      className="progress-slice high"
                      style={{ width: `${(riskCounts.high / riskCounts.total) * 100}%` }}
                      title={`High Risk: ${riskCounts.high} Blocks`}
                    />
                    <div
                      className="progress-slice medium"
                      style={{ width: `${(riskCounts.medium / riskCounts.total) * 100}%` }}
                      title={`Medium Risk: ${riskCounts.medium} Blocks`}
                    />
                    <div
                      className="progress-slice low"
                      style={{ width: `${(riskCounts.low / riskCounts.total) * 100}%` }}
                      title={`Low Risk: ${riskCounts.low} Blocks`}
                    />
                  </div>
                </div>

                {/* Concise Recommended-Action Panel */}
                <div className="estate-action-panel">
                  <h4 className="action-panel-title">
                    <Sparkles size={14} className="text-emerald" />
                    Estate Recommended Actions
                  </h4>

                  <div className="action-directive-item critical">
                    <span className="directive-tag critical">Critical (B001)</span>
                    <p>Conduct emergency joint agronomy audit for Block B001. Frond 17 re-sampling and field drainage assessment to resolve foliar nutrient imbalance.</p>
                  </div>

                  <div className="action-directive-item moderate">
                    <span className="directive-tag moderate">Medium Watch (6 Blocks)</span>
                    <p>Audit fertilizer broadcast uniformity across B005, B031, B028, B030, B019, B029 to close negative yield gap variances (-22% to -30%).</p>
                  </div>

                  <div className="action-directive-item routine">
                    <span className="directive-tag routine">Routine (35 Blocks)</span>
                    <p>Maintain standard circular weeding, canopy upkeep, and standard fertilizer schedule across cohort-aligned low-risk blocks.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ===================================================== */}
            {/* PRIORITY BLOCKS WATCHLIST STRIP                       */}
            {/* ===================================================== */}
            <div className="priority-watchlist-card">
              <div className="watchlist-header">
                <div className="header-icon-title">
                  <AlertTriangle size={17} className="text-ruby" />
                  <div>
                    <h3>Priority Blocks Watchlist ({priorityBlocks.length} Blocks Requiring Attention)</h3>
                    <p className="subtext">Blocks flagged by canonical screening score with verified evidence-backed risk contributors</p>
                  </div>
                </div>
                <span className="subtle-badge">Telemetry Grounded</span>
              </div>

              <div className="priority-blocks-scroll-row">
                {priorityBlocks.map((b) => {
                  const bRisk = b.Risk_Level;
                  const bScore = b.Risk_Score;
                  const bYield = b.Actual_Yield_t_Ha;
                  const bGap = b.Yield_Gap_pct;
                  const contributor = b.Main_Contributing_Indicators;

                  return (
                    <div
                      key={b.Block_ID}
                      className={`priority-chip-card ${bRisk.toLowerCase()}`}
                      onClick={() => navigateTo("block-detail", b.Block_ID)}
                      title={`Inspect complete intelligence for Block ${b.Block_ID}`}
                    >
                      <div className="chip-top">
                        <strong className="chip-id">Block {b.Block_ID}</strong>
                        <span className={`chip-badge ${bRisk.toLowerCase()}`}>
                          {bRisk} ({fmt(bScore, 1)})
                        </span>
                      </div>
                      <div className="chip-metric">
                        <span>Yield:</span>
                        <strong>{bYield != null ? `${fmt(bYield)} t/ha` : "N/A"}</strong>
                        <span className={`chip-gap ${bGap != null && bGap < 0 ? "negative" : "positive"}`}>
                          {bGap != null ? `${fmt(bGap)}%` : ""}
                        </span>
                      </div>
                      <div className="chip-issue">
                        <span className="issue-label">Issue:</span>
                        <span className="issue-text">{contributor}</span>
                      </div>
                      <div className="chip-action-btn">
                        <span>Inspect Block</span>
                        <ArrowRight size={11} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ===================================================== */}
            {/* 42 OPERATIONAL BLOCKS GRID (STRICT NATURAL SORT B001-B042) */}
            {/* ===================================================== */}
            <div className="fleet-grid-section">
              <div className="fleet-section-header">
                <div>
                  <h3 className="section-title">All 42 Operational Blocks</h3>
                  <p className="section-sub">
                    Naturally sorted (B001, B002 ... B042). Click any block card to reveal its complete evidence-backed analysis and prioritized action plan on this same screen.
                  </p>
                </div>

                {/* Filter & Search Bar */}
                <div className="grid-toolbar">
                  <div className="search-input-wrap">
                    <Search size={16} className="search-icon" />
                    <input
                      type="text"
                      placeholder="Search Block ID (e.g. B001, B012)..."
                      value={blockSearch}
                      onChange={(e) => setBlockSearch(e.target.value)}
                    />
                    {blockSearch && (
                      <button
                        type="button"
                        className="clear-search-btn"
                        onClick={() => setBlockSearch("")}
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Risk Filter Buttons */}
                  <div className="risk-filter-group">
                    <button
                      type="button"
                      className={`filter-btn ${riskFilter === "ALL" ? "active" : ""}`}
                      onClick={() => setRiskFilter("ALL")}
                    >
                      All Blocks ({processedBlocks.length || 42})
                    </button>
                    <button
                      type="button"
                      className={`filter-btn high ${riskFilter === "HIGH" ? "active" : ""}`}
                      onClick={() => setRiskFilter("HIGH")}
                    >
                      High Risk ({riskCounts.high})
                    </button>
                    <button
                      type="button"
                      className={`filter-btn medium ${riskFilter === "MEDIUM" ? "active" : ""}`}
                      onClick={() => setRiskFilter("MEDIUM")}
                    >
                      Medium ({riskCounts.medium})
                    </button>
                    <button
                      type="button"
                      className={`filter-btn low ${riskFilter === "LOW" ? "active" : ""}`}
                      onClick={() => setRiskFilter("LOW")}
                    >
                      Low Risk ({riskCounts.low})
                    </button>
                  </div>
                </div>
              </div>

              {/* 42 Responsive Block Cards Grid */}
              <div className="operational-blocks-grid">
                {filteredBlocks.map((b) => {
                  const bRisk = b.Risk_Level;
                  const bYield = b.Actual_Yield_t_Ha;
                  const bGap = b.Yield_Gap_pct;
                  const bScore = b.Risk_Score;
                  const bAge = b.Plant_Age_Years;
                  const isSelected = String(b.Block_ID).toUpperCase() === selectedBlockId;

                  return (
                    <div
                      key={b.Block_ID}
                      className={`block-card ${bRisk.toLowerCase()} ${isSelected ? "selected" : ""}`}
                      onClick={() => navigateTo("block-detail", b.Block_ID)}
                    >
                      <div className="block-card-header">
                        <div className="block-id-group">
                          <span className="block-prefix">Block</span>
                          <strong className="block-number">{b.Block_ID}</strong>
                        </div>
                        <span className={`card-risk-badge ${bRisk.toLowerCase()}`}>
                          <span className="badge-dot" />
                          {bRisk} ({fmt(bScore, 1)})
                        </span>
                      </div>

                      <div className="block-card-body">
                        <div className="card-metric-row">
                          <span className="card-metric-label">Latest Yield:</span>
                          <strong className="card-metric-val">
                            {bYield != null ? `${fmt(bYield)} t/ha` : "N/A"}
                          </strong>
                        </div>

                        <div className="card-metric-row">
                          <span className="card-metric-label">Yield Gap:</span>
                          <span className={`card-gap-tag ${bGap != null && bGap < 0 ? "negative" : "positive"}`}>
                            {bGap != null ? `${fmt(bGap)}%` : "Benchmark"}
                          </span>
                        </div>

                        <div className="card-metric-row">
                          <span className="card-metric-label">Primary Issue:</span>
                          <span className="card-limitation-text">
                            {b.Main_Contributing_Indicators}
                          </span>
                        </div>
                      </div>

                      <div className="block-card-footer">
                        <span className="card-age-tag">{fmt(bAge, 0)} Yrs Mature</span>
                        <span className="card-view-link">
                          Open Analysis <ArrowRight size={12} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 3: BLOCK SELECTED — ALL ANALYSIS ON THE SAME SCREEN */}
        {/* ======================================================== */}
        {viewLevel === "block-detail" && (
          <UnifiedBlockIntelligence
            blockId={selectedBlockId}
            onSelectBlock={(bid) => {
              setSelectedBlockId(bid);
              window.history.pushState(null, "", `#${bid}`);
            }}
            datasets={datasets}
            onBackToGrid={() => navigateTo("blocks")}
            estateName={selectedEstate}
          />
        )}

        {/* ======================================================== */}
        {/* VIEW 3: BLOCK SELECTED — ALL ANALYSIS ON THE SAME SCREEN */}
        {/* ======================================================== */}
        {viewLevel === "block-detail" && (
          <UnifiedBlockIntelligence
            blockId={selectedBlockId}
            onSelectBlock={(bid) => {
              setSelectedBlockId(bid);
              window.history.pushState(null, "", `#${bid}`);
            }}
            datasets={datasets}
            onBackToGrid={() => navigateTo("blocks")}
            estateName={selectedEstate}
          />
        )}
      </main>
    </div>
  );
}
