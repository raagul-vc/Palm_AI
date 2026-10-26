import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Layers,
  LayoutDashboard,
  Leaf,
  RefreshCw,
  Search,
  Sprout,
  TrendingUp,
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
  CheckCircle2
} from "lucide-react";
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

  // 42 Blocks Fleet Data & Filtering
  const allBlocks = datasets.risk || [];
  const filteredBlocks = useMemo(() => {
    return allBlocks.filter((b) => {
      const matchSearch =
        !blockSearch ||
        String(b.Block_ID).toLowerCase().includes(blockSearch.toLowerCase());
      const bRisk = String(b.Risk_Level || "LOW").toUpperCase();
      const matchRisk =
        riskFilter === "ALL" ||
        (riskFilter === "HIGH" && bRisk === "HIGH") ||
        (riskFilter === "MEDIUM" && bRisk === "MEDIUM") ||
        (riskFilter === "LOW" && bRisk === "LOW");
      return matchSearch && matchRisk;
    });
  }, [allBlocks, blockSearch, riskFilter]);

  // Estate Risk Counts
  const riskCounts = useMemo(() => {
    let high = 0, medium = 0, low = 0;
    allBlocks.forEach((b) => {
      const r = String(b.Risk_Level || "LOW").toUpperCase();
      if (r === "HIGH") high++;
      else if (r === "MEDIUM") medium++;
      else low++;
    });
    return { high, medium, low, total: allBlocks.length || 42 };
  }, [allBlocks]);

  // Mean Yield
  const meanYield = useMemo(() => {
    if (!allBlocks.length) return 19.42;
    const sum = allBlocks.reduce((acc, b) => acc + (num(b.Actual_Yield_t_Ha) || 0), 0);
    return sum / allBlocks.length;
  }, [allBlocks]);

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
                    <span className="stat-sub">B001 – B042</span>
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
                      <strong>{riskCounts.high}</strong> High Risk (9.5%)
                    </span>
                    <span className="risk-chip medium">
                      <strong>{riskCounts.medium}</strong> Medium Risk (33.3%)
                    </span>
                    <span className="risk-chip low">
                      <strong>{riskCounts.low}</strong> Low Risk (57.1%)
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
        {/* VIEW 2: ESTATE SCREEN — BLOCK GRID                       */}
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
                </div>
                <p className="estate-subtitle">
                  Click any block card to reveal its complete evidence-backed analysis and prioritized action plan on this same screen.
                </p>
              </div>

              {/* Summary Stats Strip */}
              <div className="grid-summary-stats">
                <div className="grid-stat">
                  <span>Monitored Area</span>
                  <strong>1,512 Ha</strong>
                </div>
                <div className="grid-stat">
                  <span>Mean Yield</span>
                  <strong className="text-emerald">{fmt(meanYield)} t/ha</strong>
                </div>
                <div className="grid-stat">
                  <span>High Risk</span>
                  <strong className="text-ruby">{riskCounts.high} Blocks</strong>
                </div>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="grid-toolbar">
              <div className="search-input-wrap">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search Block ID (e.g. B012)..."
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
                  All Blocks ({allBlocks.length || 42})
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

            {/* 42 Responsive Block Cards Grid */}
            <div className="operational-blocks-grid">
              {filteredBlocks.map((b) => {
                const bRisk = String(b.Risk_Level || "LOW").toUpperCase();
                const bYield = num(b.Actual_Yield_t_Ha);
                const bGap = num(b.Yield_Gap_pct);
                const bScore = num(b.Risk_Score);
                const bAge = num(b.Plant_Age_Years, 12);
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
                        {bRisk} ({bScore != null ? fmt(bScore, 1) : "N/A"})
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
                          {b.Limitation_1 || b.Risk_Contributor || "Balanced"}
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
