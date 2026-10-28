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
  Clock,
  ClipboardCheck,
  Database
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
import FieldActionCenter from "./FieldActionCenter";
import MultiSourceEvidencePage from "./MultiSourceEvidencePage";
import DroneHealthPage from "./DroneHealthPage";
import MultispectralHealthPage from "./MultispectralHealthPage";
import PlantationImage from "./PlantationImage";
import tallPalmImg from "./assets/images/tall_oil_palm_plantation.jpg";
import estateOverviewImg from "./assets/images/estate_canopy_overview.jpg";
import fruitBunchImg from "./assets/images/oil_palm_fruit_bunch.jpg";
import droneCanopyImg from "./assets/images/drone_canopy_inspection.jpg";
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

// Mandatory Estate Selection Empty State Screen
function EstateMandatoryPrompt({ onSelectEstate, onGoToEstates }) {
  return (
    <div className="view-container estate-mandatory-container">
      <div className="estate-mandatory-card">
        <div className="mandatory-icon-circle">
          <MapPin size={30} className="text-emerald" />
        </div>
        <span className="mandatory-eyebrow">ESTATE SELECTION REQUIRED</span>
        <h2 className="mandatory-title">Select an estate to view plantation intelligence.</h2>
        <p className="mandatory-description">
          Operational KPIs, 42-block fleet health, historical yield curves, foliar diagnostics, and field action directives are only displayed after selecting an operational estate.
        </p>

        <div className="mandatory-available-estate-box">
          <div className="avail-estate-header">
            <span className="avail-estate-label">Available Operational Fleet</span>
            <span className="avail-estate-badge">13-Yr Historical Telemetry</span>
          </div>
          <div className="avail-estate-body">
            <div className="avail-estate-main">
              <strong className="avail-estate-name">North Estate (PT Palm Indo)</strong>
              <span className="avail-estate-meta">Division A · 42 Blocks (B001–B042) · 1,512 Ha · Mature DxP Hybrid</span>
            </div>
            <button
              type="button"
              className="select-estate-cta-btn"
              onClick={() => onSelectEstate("North Estate (PT Palm Indo)")}
            >
              <CheckCircle2 size={15} />
              <span>Select Estate & Enter Dashboard</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>

        <div className="mandatory-footer-actions">
          <button
            type="button"
            className="browse-estates-btn"
            onClick={onGoToEstates}
          >
            <LayoutDashboard size={14} />
            <span>View All Operational Estates</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const VALID_ESTATES = ["North Estate (PT Palm Indo)"];

export default function App() {
  // Selected Estate: MUST NOT default to an estate on fresh session unless user has intentionally selected a valid one.
  const [selectedEstate, setSelectedEstate] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const estateParam = urlParams.get("estate");
      if (estateParam && VALID_ESTATES.includes(estateParam)) {
        sessionStorage.setItem("palm_ai_selected_estate", estateParam);
        return estateParam;
      }
      const stored = sessionStorage.getItem("palm_ai_selected_estate");
      if (stored && VALID_ESTATES.includes(stored)) {
        return stored;
      }
      // Purge invalid or unrecognized saved estate ID
      if (stored) {
        sessionStorage.removeItem("palm_ai_selected_estate");
      }
      return null;
    } catch {
      return null;
    }
  });

  // Enterprise Operations State (No user login required)
  const [authToken, setAuthToken] = useState(() => {
    try {
      return sessionStorage.getItem("palm_ai_auth_token") || "public-session";
    } catch {
      return "public-session";
    }
  });

  const [currentUser, setCurrentUser] = useState(() => ({
    id: "USR-PUBLIC-01",
    email: "operations@palmai.com",
    full_name: "Plantation Operations Manager",
    role: "MANAGER",
    estate_permissions: ["North Estate (PT Palm Indo)"],
    block_permissions: ["*"]
  }));

  // Navigation State: default to 'estates' on fresh session until estate is chosen
  const [viewLevel, setViewLevel] = useState(() => {
    const hash = window.location.hash.replace(/^#/, "").trim();
    let stored = null;
    try {
      stored = sessionStorage.getItem("palm_ai_selected_estate");
    } catch {
      stored = null;
    }
    // Mandatory initial screen: If no estate selected, MUST be "estates"
    if (!stored || !VALID_ESTATES.includes(stored)) {
      return "estates";
    }
    if (hash === "blocks" || hash === "estate" || hash === "dashboard") return "blocks";
    if (hash === "estates") return "estates";
    if (hash === "field-actions" || hash === "actions") return "field-actions";
    if (hash === "multi-source" || hash === "evidence") return "multi-source";
    if (hash === "drone-health" || hash === "drone" || hash === "rgb-drone" || hash === "drone-ai" || hash.startsWith("drone-")) return "drone-health";
    if (hash === "multispectral" || hash === "spectral" || hash.startsWith("spectral-") || hash === "indicators" || hash === "tiles" || hash === "gis-readiness" || hash === "visualizations") return "multispectral";
    if (hash.startsWith("block/") || /^B\d{3}$/i.test(hash)) return "block-detail";
    return "blocks";
  });

  const [selectedBlockId, setSelectedBlockId] = useState(() => {
    const hash = window.location.hash.replace(/^#/, "").trim();
    if (hash.startsWith("block/")) return hash.replace("block/", "").toUpperCase();
    if (/^B\d{3}$/i.test(hash)) return hash.toUpperCase();
    return null;
  });
  const [selectedActionId, setSelectedActionId] = useState(null);

  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);

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

  // Load API endpoints progressively so essential telemetry (productivity, risk, etc.)
  // renders immediately without waiting for heavy background audit endpoints.
  const loadSources = useCallback(async () => {
    setIsLoading(true);
    const unavail = [];

    await Promise.all(
      Object.entries(sourcePaths).map(async ([key, path]) => {
        try {
          const { data, available } = await fetchPayload(path);
          if (!available) unavail.push(key);

          setDatasets((prev) => {
            const updated = { ...prev };
            if (key === "modelValidation") {
              updated.modelMetrics = data?.metrics || [];
              updated.yearlyValidation = data?.yearly || [];
              updated.featureImportance = data?.feature_importance || [];
            } else if (key === "dataQuality") {
              updated.dataQuality = data;
            } else if (key === "droneVisualizations") {
              updated.droneVisualizations = data?.visualizations || [];
            } else if (key === "multispectralVisualizations") {
              updated.multispectralVisualizations = data || [];
            } else {
              updated[key] = data;
            }
            return updated;
          });
        } catch (err) {
          unavail.push(key);
        }
      })
    );

    setUnavailableSources(unavail);
    setIsLoading(false);
  }, []);

  const sourceStatus = useMemo(() => {
    const map = {};
    Object.keys(sourcePaths).forEach((k) => {
      map[k] = unavailableSources.includes(k) ? "unavailable" : "available";
    });
    return map;
  }, [unavailableSources]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  // Synchronize URL Hash
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace(/^#/, "").trim();
      let currentStored = null;
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const estateParam = urlParams.get("estate");
        if (estateParam && VALID_ESTATES.includes(estateParam)) {
          sessionStorage.setItem("palm_ai_selected_estate", estateParam);
          currentStored = estateParam;
        } else {
          currentStored = sessionStorage.getItem("palm_ai_selected_estate");
        }
      } catch {
        currentStored = null;
      }

      // If no estate is selected, strictly route to estates view
      if (!currentStored || !VALID_ESTATES.includes(currentStored)) {
        setViewLevel("estates");
        return;
      }

      if (!hash || hash === "dashboard" || hash === "blocks" || hash === "estate" || hash === "login") {
        setViewLevel("blocks");
      } else if (hash === "estates") {
        setViewLevel("estates");
      } else if (hash === "field-actions" || hash === "actions") {
        setViewLevel("field-actions");
      } else if (hash === "multi-source" || hash === "evidence") {
        setViewLevel("multi-source");
      } else if (hash === "drone-health" || hash === "drone" || hash === "rgb-drone" || hash.startsWith("drone-")) {
        setViewLevel("drone-health");
      } else if (hash === "multispectral" || hash === "spectral" || hash.startsWith("spectral-") || hash === "indicators" || hash === "tiles" || hash === "gis-readiness" || hash === "visualizations") {
        setViewLevel("multispectral");
      } else if (hash.startsWith("block/")) {
        const bid = hash.replace("block/", "").toUpperCase();
        setSelectedBlockId(bid);
        setViewLevel("block-detail");
      } else if (/^B\d{3}$/i.test(hash)) {
        setSelectedBlockId(hash.toUpperCase());
        setViewLevel("block-detail");
      } else {
        setViewLevel("blocks");
      }
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [selectedEstate]);

  // Update hash when viewLevel or selectedBlockId changes
  const navigateTo = (level, blockId = null, actionId = null) => {
    // If attempting to navigate into block views without an estate, enforce estates view
    if (!selectedEstate && level !== "estates") {
      setViewLevel("estates");
      window.history.pushState(null, "", "#estates");
      return;
    }
    setViewLevel(level);
    if (actionId !== undefined) {
      setSelectedActionId(actionId);
    }
    if (level === "login" || level === "dashboard" || level === "blocks") {
      window.history.pushState(null, "", "#blocks");
    } else if (level === "estates") {
      window.history.pushState(null, "", "#estates");
    } else if (level === "block-detail") {
      const bid = blockId || selectedBlockId || "B001";
      setSelectedBlockId(bid);
      window.history.pushState(null, "", `#${bid}`);
    } else if (level === "field-actions") {
      window.history.pushState(null, "", "#field-actions");
    } else if (level === "multi-source") {
      window.history.pushState(null, "", "#multi-source");
    } else if (level === "drone-health") {
      window.history.pushState(null, "", "#drone-health");
    } else if (level === "multispectral") {
      window.history.pushState(null, "", "#multispectral");
    }
  };

  // Explicit estate selection and deselection handlers
  const handleSelectEstate = useCallback((estateName) => {
    if (!VALID_ESTATES.includes(estateName)) return;
    try {
      sessionStorage.setItem("palm_ai_selected_estate", estateName);
    } catch {
      // ignore
    }
    setSelectedEstate(estateName);
    setSelectedBlockId(null);
    setSelectedActionId(null);
    setBlockSearch("");
    setRiskFilter("ALL");
    navigateTo("blocks");
  }, []);

  const handleClearEstate = useCallback(() => {
    try {
      sessionStorage.removeItem("palm_ai_selected_estate");
    } catch {
      // ignore
    }
    setSelectedEstate(null);
    setSelectedBlockId(null);
    setSelectedActionId(null);
    setBlockSearch("");
    setRiskFilter("ALL");
    navigateTo("estates");
  }, []);

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
      {/* Immersive fixed real oil-palm plantation background layer with dark translucent overlay */}
      <div className="palm-app-bg-layer" aria-hidden="true" />

      {/* GLOBAL ENTERPRISE TOPBAR (NO SIDEBAR EVER) */}
      <header className="global-topbar">
        <div className="topbar-left">
          {/* Logo Brand */}
          <div
            className="brand-cluster clickable"
            onClick={() => {
              if (selectedEstate) {
                navigateTo("blocks");
              } else {
                navigateTo("estates");
              }
            }}
            title={selectedEstate ? "Main 42-Block Risk Dashboard" : "Estate Fleet Selection"}
          >
            <div className="brand-logo-icon">
              <Sprout size={18} className="text-emerald" />
            </div>
            <div className="brand-text-stack">
              <strong className="brand-title">PALM AI</strong>
              <span className="brand-sub">Plantation Intelligence AI</span>
            </div>
          </div>

          <div className="brand-divider" />

          {/* Navigation Tabs: ONLY RENDERED WHEN AN ESTATE IS SELECTED */}
          {selectedEstate ? (
            <nav className="topbar-nav-tabs">
              <button
                type="button"
                className={`topbar-tab ${viewLevel === "blocks" ? "active" : ""}`}
                onClick={() => navigateTo("blocks")}
                title="Main 42-Block Risk Dashboard"
              >
                <Layers size={14} />
                <span>42-Block Risk Dashboard</span>
              </button>

              <button
                type="button"
                className={`topbar-tab ${viewLevel === "field-actions" ? "active" : ""}`}
                onClick={() => navigateTo("field-actions")}
                title="Field Action Center & Directives Tracking"
              >
                <ClipboardCheck size={14} />
                <span>Field Actions</span>
                {riskCounts.high > 0 && <span className="tab-badge">{riskCounts.high}</span>}
              </button>

              <button
                type="button"
                className={`topbar-tab ${viewLevel === "multi-source" ? "active" : ""}`}
                onClick={() => navigateTo("multi-source")}
                title="Multi-Source Evidence Matrix & Audit Registry"
              >
                <Database size={14} />
                <span>Evidence Matrix</span>
              </button>

              <button
                type="button"
                className={`topbar-tab ${viewLevel === "drone-health" ? "active" : ""}`}
                onClick={() => navigateTo("drone-health")}
                title="RGB Drone Health Vision (YOLO11n Palm Detection)"
              >
                <Camera size={14} />
                <span>RGB Drone</span>
              </button>

              <button
                type="button"
                className={`topbar-tab ${viewLevel === "multispectral" ? "active" : ""}`}
                onClick={() => navigateTo("multispectral")}
                title="Multispectral Aerial Vigour (Altum 5-band)"
              >
                <Layers3 size={14} />
                <span>Multispectral</span>
              </button>
            </nav>
          ) : (
            <div className="topbar-estate-selection-notice">
              <span className="notice-badge">STEP 1</span>
              <span className="notice-text">Estate Fleet Selection</span>
            </div>
          )}

          {/* Keep accessible return action without redundant topbar breadcrumbs */}
          {selectedEstate && viewLevel === "block-detail" && (
            <button
              type="button"
              className="sr-only"
              onClick={() => navigateTo("blocks")}
              aria-label="← Back to All 42 Blocks"
            >
              ← Back to All 42 Blocks
            </button>
          )}
        </div>

        {/* Topbar Right Telemetry Status */}
        <div className="topbar-right">
          {selectedEstate ? (
            <div className="topbar-estate-pill">
              <MapPin size={12} className="text-emerald" />
              <span className="estate-pill-label">Estate:</span>
              <strong className="estate-pill-name">{selectedEstate}</strong>
              <button
                type="button"
                className="estate-change-btn"
                onClick={handleClearEstate}
                title="Deselect active estate and return to Estate Selection"
              >
                Change Estate
              </button>
            </div>
          ) : null}



          <div className="telemetry-pill">
            <span className="telemetry-dot" />
            <span className="telemetry-text">
              {isLoading ? "Synchronizing Telemetry…" : "PALM AI v2.7 · 42 Blocks Monitored"}
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
            {/* MANDATORY ESTATE SELECTION PROMPT ON FRESH SESSION */}
            {!selectedEstate && (
              <div className="estate-mandatory-callout">
                <div className="mandatory-callout-icon">
                  <MapPin size={22} className="text-emerald" />
                </div>
                <div className="mandatory-callout-content">
                  <span className="mandatory-eyebrow">ESTATE SELECTION REQUIRED</span>
                  <h2 className="mandatory-title">Select an estate to view plantation intelligence.</h2>
                  <p className="mandatory-description">
                    Operational KPIs, 42-block fleet health, historical yield curves, foliar diagnostics, and field action directives are only displayed after selecting an operational estate.
                  </p>
                </div>
              </div>
            )}

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
                className={`estate-card ${selectedEstate === "North Estate (PT Palm Indo)" ? "is-selected" : "unselected"}`}
              >
                {/* Real Commercial Oil-Palm Plantation Photographic Banner */}
                <PlantationImage
                  src={estateOverviewImg}
                  fallbackSrc="/images/estate_canopy_overview.jpg"
                  alt="North Estate (PT Palm Indo) Commercial Plantation"
                  className="estate-card-photo-banner"
                  height="170px"
                  badge="Commercial Stand · Division A"
                  caption="Mature Oil-Palm Plantation Fleet (920.0 Ha)"
                  subcaption="42 Operational Blocks · Verified 920.0 Ha · DxP Hybrid Stand"
                />

                <div className="estate-card-top">
                  <div>
                    <span className="estate-category-tag">Operational Fleet · Division A</span>
                    <h2 className="estate-name">North Estate (PT Palm Indo)</h2>
                  </div>
                  <span className="estate-history-badge">
                    <Calendar size={12} /> Verified Historical Telemetry (2012–2024)
                  </span>
                </div>

                <p className="estate-description">
                  Commercial oil-palm plantation monitoring 42 contiguous management blocks across mature planting cohorts. Fully integrated with multi-source yield, foliar, weather, and UAV inference data.
                </p>

                {/* Conditional Metrics & Risk: Rendered ONLY when estate is explicitly selected */}
                {selectedEstate === "North Estate (PT Palm Indo)" ? (
                  <>
                    {/* 6 Key Estate Operational Metrics */}
                    <div className="estate-stats-grid">
                      <div className="estate-stat-item">
                        <span className="stat-label">Monitored Blocks</span>
                        <strong className="stat-val">{riskCounts.total} Blocks</strong>
                        <span className="stat-sub">B001 – B042 (Natural Order)</span>
                      </div>
                      <div className="estate-stat-item">
                        <span className="stat-label">Total Monitored Area</span>
                        <strong className="stat-val">920.0 Ha</strong>
                        <span className="stat-sub">21.9 Ha avg/block</span>
                      </div>
                      <div className="estate-stat-item">
                        <span className="stat-label">Tree Inventory</span>
                        <strong className="stat-val text-amber">Unavailable</strong>
                        <span className="stat-sub">Readiness 35%</span>
                      </div>
                      <div className="estate-stat-item">
                        <span className="stat-label">Mean 2024 Yield</span>
                        <strong className="stat-val text-emerald">{fmt(meanYield)} t/ha</strong>
                        <span className="stat-sub">Annual harvest</span>
                      </div>
                      <div className="estate-stat-item">
                        <span className="stat-label">Planting Cohort</span>
                        <strong className="stat-val">Mature (10–24 Yrs)</strong>
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
                  </>
                ) : (
                  /* Unselected State: Prospective Fleet Profile Overview */
                  <div className="estate-stats-grid prospective">
                    <div className="estate-stat-item">
                      <span className="stat-label">Monitored Blocks</span>
                      <strong className="stat-val">42 Blocks</strong>
                      <span className="stat-sub">B001 – B042 (Natural Order)</span>
                    </div>
                    <div className="estate-stat-item">
                      <span className="stat-label">Total Monitored Area</span>
                      <strong className="stat-val">920.0 Ha</strong>
                      <span className="stat-sub">21.9 Ha avg/block</span>
                    </div>
                    <div className="estate-stat-item">
                      <span className="stat-label">Planting Cohort</span>
                      <strong className="stat-val">Mature Stand</strong>
                      <span className="stat-sub">DxP Hybrid seed</span>
                    </div>
                    <div className="estate-stat-item">
                      <span className="stat-label">Data Ledger</span>
                      <strong className="stat-val">13 Years</strong>
                      <span className="stat-sub">2012 – 2024 Historical</span>
                    </div>
                  </div>
                )}

                {/* Provenance Disclosure Note */}
                <div className="estate-provenance-note">
                  <Info size={14} className="text-emerald" />
                  <span>
                    <strong>Metadata Provenance:</strong> The underlying agronomic master dataset contains 42 operational blocks under Division A. No external multi-estate hierarchy metadata exists in the repository. Multi-estate division hierarchy can be linked via an enterprise GIS connector.
                  </span>
                </div>

                {/* Card CTA: Requires explicit button click to enter dashboard */}
                <div className="estate-card-action">
                  {selectedEstate === "North Estate (PT Palm Indo)" ? (
                    <div className="estate-selected-action-row">
                      <span className="active-estate-pill">
                        <CheckCircle2 size={14} className="text-emerald" />
                        Selected Estate
                      </span>
                      <button
                        type="button"
                        className="open-estate-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateTo("blocks");
                        }}
                      >
                        <span>Enter Dashboard (42 Blocks)</span>
                        <ArrowRight size={15} />
                      </button>
                      <button
                        type="button"
                        className="deselect-estate-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearEstate();
                        }}
                      >
                        Change / Clear
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="select-estate-cta-btn explicit-cta"
                      onClick={() => handleSelectEstate("North Estate (PT Palm Indo)")}
                    >
                      <CheckCircle2 size={16} />
                      <span>Select Estate & Enter Dashboard</span>
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 2: ESTATE SCREEN — OVERVIEW & NATURAL BLOCK GRID    */}
        {/* ======================================================== */}
        {viewLevel === "blocks" && (
          !selectedEstate ? (
            <EstateMandatoryPrompt
              onSelectEstate={handleSelectEstate}
              onGoToEstates={() => navigateTo("estates")}
            />
          ) : (
            <div className="view-container block-grid-view">
              {/* Estate Header & Controls */}
              <div className="block-grid-header">
                <div className="grid-nav-breadcrumb-row">
                  <button
                    type="button"
                    className="crumb-back-link"
                    onClick={() => handleClearEstate()}
                    title="Return to Estate Selection"
                  >
                    <ArrowLeft size={14} />
                    <span>← All Operational Estates</span>
                  </button>
                </div>
                <div className="estate-header-title-section">
                  <div className="estate-title-row">
                    <h1 className="estate-display-title">{selectedEstate}</h1>
                    <span className="block-count-badge">42 Operational Blocks</span>
                    <span className="cohort-tag">Mature DxP Hybrid Stand</span>
                  </div>
                  <p className="estate-subtitle">
                    Plantation-wide agronomic risk surveillance, 13-year productivity history, canonical screening distribution, and comprehensive 42-block fleet risk analysis.
                  </p>
                </div>
              </div>

              {/* 4 PRIMARY KPIS IN A CLEAN BALANCED ROW */}
              <div className="primary-kpi-row">
                <div className="primary-kpi-card total">
                  <div className="kpi-card-header">
                    <span className="kpi-card-title">TOTAL BLOCKS</span>
                    <Layers size={16} className="text-emerald" />
                  </div>
                  <div className="kpi-card-val">
                    <strong>42</strong>
                    <span className="kpi-card-unit">Blocks</span>
                  </div>
                  <div className="kpi-card-footnote">
                    <span>B001 – B042 Natural Order · 100% Monitored</span>
                  </div>
                </div>

                <div className="primary-kpi-card high-risk">
                  <div className="kpi-card-header">
                    <span className="kpi-card-title">HIGH-RISK BLOCKS</span>
                    <ShieldAlert size={16} className="text-ruby" />
                  </div>
                  <div className="kpi-card-val text-ruby">
                    <strong>{riskCounts.high}</strong>
                    <span className="kpi-card-unit">({((riskCounts.high / (riskCounts.total || 42)) * 100).toFixed(1)}%)</span>
                  </div>
                  <div className="kpi-card-footnote">
                    <span>Block B001 · Urgent Agronomic Audit</span>
                  </div>
                </div>

                <div className="primary-kpi-card medium-risk">
                  <div className="kpi-card-header">
                    <span className="kpi-card-title">MEDIUM-RISK BLOCKS</span>
                    <AlertTriangle size={16} className="text-gold" />
                  </div>
                  <div className="kpi-card-val text-gold">
                    <strong>{riskCounts.medium}</strong>
                    <span className="kpi-card-unit">({((riskCounts.medium / (riskCounts.total || 42)) * 100).toFixed(1)}%)</span>
                  </div>
                  <div className="kpi-card-footnote">
                    <span>6 Blocks · Nutritional Watchlist</span>
                  </div>
                </div>

                <div className="primary-kpi-card low-risk">
                  <div className="kpi-card-header">
                    <span className="kpi-card-title">LOW-RISK BLOCKS</span>
                    <ShieldCheck size={16} className="text-emerald" />
                  </div>
                  <div className="kpi-card-val text-emerald">
                    <strong>{riskCounts.low}</strong>
                    <span className="kpi-card-unit">({((riskCounts.low / (riskCounts.total || 42)) * 100).toFixed(1)}%)</span>
                  </div>
                  <div className="kpi-card-footnote">
                    <span>35 Blocks · Performing to Benchmark</span>
                  </div>
                </div>
              </div>

              {/* SECONDARY METRICS BELOW */}
              <div className="secondary-metrics-row">
                <div className="secondary-stat-card">
                  <span className="stat-label">Monitored Area</span>
                  <strong className="stat-val">1,512 Ha</strong>
                  <span className="stat-sub">36.0 Ha avg/block</span>
                </div>
                <div className="secondary-stat-card">
                  <span className="stat-label">Mean 2024 Yield</span>
                  <strong className="stat-val text-emerald">{fmt(meanYield)} t/ha</strong>
                  <span className="stat-sub">Annual harvest average</span>
                </div>
                <div className="secondary-stat-card">
                  <span className="stat-label">Productive Stand</span>
                  <strong className="stat-val">204,120 Palms</strong>
                  <span className="stat-sub">135 palms/ha</span>
                </div>
                <div className="secondary-stat-card">
                  <span className="stat-label">Data History</span>
                  <strong className="stat-val">13 Years</strong>
                  <span className="stat-sub">2012 – 2024 Historical</span>
                </div>
              </div>

              {/* OVERALL PLANTATION RISK SUMMARY BANNER */}
              <div className="overall-summary-banner">
                <div className="overall-badge-group">
                  <Sparkles size={16} className="text-emerald" />
                  <span className="overall-title">OVERALL PLANTATION RISK SUMMARY</span>
                  <span className="overall-level-pill low">LOW PLANTATION RISK BASELINE</span>
                </div>
                <p className="overall-summary-text">
                  <strong>83.3% of operational blocks</strong> (35 of 42) operate in standard cohort yield alignment. Mean 2024 harvest productivity across the plantation is <strong>{fmt(meanYield)} t/ha/yr</strong>. 1 priority block (<strong>B001</strong>, score 70.0/100, nutrient imbalance flagged; peer yield baseline unavailable) requires joint field audit and foliar re-sampling, while 6 medium-risk blocks are queued for potassium balancing.
                </p>
              </div>

              {/* ===================================================== */}
              {/* SECTION 3: ESTATE OVERVIEW DASHBOARD (ANALYTICS STRIP) */}
              {/* ===================================================== */}
              <div className="estate-analytics-grid">
                {/* Historical Yield Trend Chart (2012–2024) */}
                <div className="analytics-card chart-analytics-card">
                  <div className="analytics-card-header">
                    <div className="header-icon-title">
                      <TrendingUp size={18} className="text-emerald" />
                      <div>
                        <h3>Estate Productivity Overview & Historical Yield Trend</h3>
                        <p className="subtext">13-year annual harvest average (2012–2024) across all 42 operational blocks vs age benchmark</p>
                      </div>
                    </div>
                    <span className="subtle-badge">13-Year Historical Harvest Ledger (2012–2024)</span>
                  </div>

                  <div className="chart-container-wrap">
                    {isLoading ? (
                      <div className="chart-loading-state">
                        <RefreshCw size={20} className="animate-spin text-emerald" />
                        <span>Loading 13-year harvest productivity telemetry…</span>
                      </div>
                    ) : estateYieldTrend && estateYieldTrend.length > 0 ? (
                      <ResponsiveContainer width="100%" height={260} minWidth={0} debounce={50}>
                        <LineChart data={estateYieldTrend} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.07)" />
                          <XAxis dataKey="year" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                          <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} domain={[0, (dataMax) => Math.max(26, Math.ceil(dataMax + 2))]} unit=" t/ha/yr" />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#061a10",
                              borderColor: "rgba(16, 185, 129, 0.4)",
                              borderRadius: "8px",
                              color: "#f8fafc",
                              fontSize: "12px",
                            }}
                            formatter={(val, name) => [
                              `${Number(val).toFixed(2)} t/ha/yr`,
                              name === "meanYield" ? "Estate Harvest Average (12-Mo Sum)" : "Maturity Benchmark",
                            ]}
                          />
                          <Line
                            type="monotone"
                            dataKey="meanYield"
                            name="meanYield"
                            stroke="#10b981"
                            strokeWidth={3}
                            isAnimationActive={false}
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
                            isAnimationActive={false}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="chart-empty-state">
                        <BarChart3 size={24} className="text-dim" />
                        <span className="empty-title">Historical Yield Telemetry Unavailable</span>
                        <span className="empty-sub">
                          No 13-year annual harvest average records found for the selected estate.
                        </span>
                      </div>
                    )}
                  </div>

                <div className="chart-footer-legend">
                  <span className="legend-chip"><i className="legend-dot bg-emerald" /> 42-Block Annual Harvest Mean (12-Mo Cumulative Actuals)</span>
                  <span className="legend-chip"><i className="legend-dot bg-gold dashed" /> Cohort Age Yield Expectation</span>
                  <span className="legend-note">Annual Cumulative Yield (Mean 17.90 t/ha/yr in 2024; monthly avg 1.49 t/ha/mo)</span>
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
                  <div className="action-panel-header-row">
                    <h4 className="action-panel-title">
                      <Sparkles size={14} className="text-emerald" />
                      Priority Operational Directives
                    </h4>
                    <button
                      type="button"
                      className="open-fac-link-btn"
                      onClick={() => navigateTo("field-actions")}
                      title="Open full Field Action Center queue"
                    >
                      <span>Action Queue (42)</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>

                  <div className="action-directive-item critical">
                    <div className="directive-item-top">
                      <span className="directive-tag critical">Critical Directive · Block B001</span>
                      <button
                        type="button"
                        className="directive-jump-btn"
                        onClick={() => navigateTo("block-detail", "B001", "block-B001")}
                      >
                        Inspect & Resolve B001 →
                      </button>
                    </div>
                    <p>Convene joint agronomy audit for Block B001 (score 70.0/100). Conduct palm bunch census count and fresh Frond 17 foliar laboratory re-sampling to re-assess nutritional status against mature stand standards.</p>
                  </div>

                  <div className="action-directive-item moderate">
                    <div className="directive-item-top">
                      <span className="directive-tag moderate">Medium Watch (6 Blocks)</span>
                      <button
                        type="button"
                        className="directive-jump-btn secondary"
                        onClick={() => navigateTo("field-actions")}
                      >
                        View Watch Items →
                      </button>
                    </div>
                    <p>Audit fertilizer broadcast uniformity across B005, B031, B028, B030, B019, B029 to close negative yield gap variances (-22% to -30%).</p>
                  </div>

                  <div className="action-directive-item routine">
                    <div className="directive-item-top">
                      <span className="directive-tag routine">Routine Maintenance (35 Blocks)</span>
                    </div>
                    <p>Maintain standard circular weeding, canopy upkeep, and standard fertilizer schedule across cohort-aligned low-risk blocks.</p>
                  </div>
                </div>
              </div>

              {/* Tall Plantation Visual Panel on Right Side */}
              <div className="tall-plantation-panel">
                <PlantationImage
                  src={tallPalmImg}
                  fallbackSrc="/images/tall_oil_palm_plantation.jpg"
                  alt="Commercial Oil Palm Plantation Stand (Elaeis guineensis)"
                  height="100%"
                  badge="Field Telemetry Reference"
                  caption="Commercial Stand Reference"
                  subcaption="Mature African oil palm canopy (Elaeis guineensis) under systematic agronomic management"
                />
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
                      <div className="chip-header-with-thumb">
                        <PlantationImage
                          src={fruitBunchImg}
                          fallbackSrc="/images/oil_palm_fruit_bunch.jpg"
                          alt={`Block ${b.Block_ID}`}
                          width="38px"
                          height="38px"
                          aspectRatio="1:1"
                          className="chip-palm-thumb"
                        />
                        <div className="chip-top-content">
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
                        </div>
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
        )
      )}

        {/* ======================================================== */}
        {/* VIEW 3: BLOCK SELECTED — ALL ANALYSIS ON THE SAME SCREEN */}
        {/* ======================================================== */}
        {viewLevel === "block-detail" && (
          !selectedEstate ? (
            <EstateMandatoryPrompt
              onSelectEstate={handleSelectEstate}
              onGoToEstates={() => navigateTo("estates")}
            />
          ) : (
            <UnifiedBlockIntelligence
              blockId={selectedBlockId || "B001"}
              onSelectBlock={(bid) => {
                setSelectedBlockId(bid);
                window.history.pushState(null, "", `#${bid}`);
              }}
              datasets={datasets}
              onBackToGrid={() => navigateTo("blocks")}
              onBackToActionQueue={() => navigateTo("field-actions")}
              selectedActionId={selectedActionId}
              estateName={selectedEstate}
              isLoading={isLoading}
              currentUser={currentUser}
              authToken={authToken}
            />
          )
        )}

        {/* ======================================================== */}
        {/* VIEW 4: FIELD ACTION CENTER — INTERACTIVE WORKFLOW       */}
        {/* ======================================================== */}
        {viewLevel === "field-actions" && (
          !selectedEstate ? (
            <EstateMandatoryPrompt
              onSelectEstate={handleSelectEstate}
              onGoToEstates={() => navigateTo("estates")}
            />
          ) : (
            <FieldActionCenter
              datasets={datasets}
              currentUser={currentUser}
              authToken={authToken}
              onNavigateBlock={(bid, actionId) => navigateTo("block-detail", bid, actionId)}
            />
          )
        )}

        {/* ======================================================== */}
        {/* VIEW 5: MULTI-SOURCE EVIDENCE REGISTRY & DATA AUDIT      */}
        {/* ======================================================== */}
        {viewLevel === "multi-source" && (
          !selectedEstate ? (
            <EstateMandatoryPrompt
              onSelectEstate={handleSelectEstate}
              onGoToEstates={() => navigateTo("estates")}
            />
          ) : (
            <MultiSourceEvidencePage
              datasets={datasets}
              navigate={(view) => {
                if (view === "drone") navigateTo("drone-health");
                else if (view === "multispectral") navigateTo("multispectral");
                else if (view === "actions") navigateTo("field-actions");
                else if (view === "blocks") navigateTo("blocks");
                else navigateTo("estates");
              }}
            />
          )
        )}

        {/* ======================================================== */}
        {/* VIEW 6: RGB DRONE HEALTH VISION (YOLO11N)                */}
        {/* ======================================================== */}
        {viewLevel === "drone-health" && (
          <DroneHealthPage
            datasets={datasets}
            sourceStatus={sourceStatus}
            loadSources={loadSources}
          />
        )}

        {/* ======================================================== */}
        {/* VIEW 7: MULTISPECTRAL VIGOUR (ALTUM 5-BAND BENCHMARK)    */}
        {/* ======================================================== */}
        {viewLevel === "multispectral" && (
          <MultispectralHealthPage
            datasets={datasets}
            sourceStatus={sourceStatus}
            loadSources={loadSources}
          />
        )}
      </main>
    </div>
  );
}
