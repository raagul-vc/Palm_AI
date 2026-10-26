import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Camera,
  ChevronDown, CloudSun, Database, FlaskConical,
  Layers, LayoutDashboard, Leaf, Menu, RefreshCw,
  Search, Sprout, TrendingUp, Wind, Workflow, X, ClipboardCheck,
  MapPin,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend,
  Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";
import DroneHealthPage from "./DroneHealthPage";
import MultispectralHealthPage from "./MultispectralHealthPage";
import MultiSourceEvidencePage from "./MultiSourceEvidencePage";
import FieldActionCenter from "./FieldActionCenter";
import UnifiedBlockIntelligence from "./UnifiedBlockIntelligence";
import EstateCommandCenter from "./EstateCommandCenter";
import "./App.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

const sections = [
  { id: "overview", label: "Command Center", icon: LayoutDashboard, title: "Estate Command Center", description: "Plantation operations command, fleet risk distribution, and historical productivity." },
  { id: "block-intelligence", label: "Block Intelligence", icon: FlaskConical, title: "Unified Block Intelligence", description: "Comprehensive block intelligence dossier: yield trajectory, foliar assays, DRIS diagnostics, weather, and action plan." },
  { id: "field-action-center", label: "Action Center", icon: ClipboardCheck, title: "Field Action Center", description: "Prioritised estate review queue and ground inspection follow-up directives." },
  { id: "productivity", label: "Productivity", icon: TrendingUp, title: "Productivity & Analysis", description: "Review observed productivity, saved forecast outputs, nutrient data, age curves and validation outputs." },
  { id: "risk-analysis", label: "Risk Analysis", icon: AlertTriangle, title: "Multi-Source Risk Analysis", description: "Compare block-varying yield and nutrient indicators with DRIS limitation diagnostics." },
  { id: "weather-impact", label: "Weather Data", icon: CloudSun, title: "Weather Data and Association", description: "Explore the available block weather summaries and observed weather–productivity correlations." },
  { id: "drone-health", label: "Drone UAV Hub", icon: Camera, title: "RGB UAV Survey & Live AI", description: "Live single-image YOLO11n canopy inference workshop and 500-image benchmark exploration." },
  { id: "multispectral-health", label: "Multispectral", icon: Layers, title: "Multispectral UAV Survey", description: "Calibrated 5-band reflectance, vegetation indices, and canopy health indicators." },
  { id: "multi-source-evidence", label: "Evidence Matrix", icon: Workflow, title: "Multi-Source Evidence", description: "Three independent evidence layers with strict scientific provenance boundaries." },
];

const productivityTabs = [
  { id: "forecast", label: "Yield forecast" },
  { id: "fertilizer", label: "Nutrient status" },
  { id: "curves", label: "Age & seed curves" },
  { id: "replanting", label: "Replanting" },
  { id: "harvest", label: "Harvest & revenue" },
  { id: "validation", label: "Data & model" },
];

const riskColors = { HIGH: "#c75242", MEDIUM: "#c28a29", LOW: "#34835c", UNKNOWN: "#89958c" };
const englishMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function displayMonth(monthNumber, fallback = "") {
  return englishMonths[Number(monthNumber) - 1] || fallback || "N/A";
}

const nutrientFields = [
  ["N", "N_pct", "N_pct_Status"], ["P", "P_pct", "P_pct_Status"],
  ["K", "K_pct", "K_pct_Status"], ["Ca", "Ca_pct", "Ca_pct_Status"],
  ["Mg", "Mg_pct", "Mg_pct_Status"], ["B", "B_ppm", "B_ppm_Status"],
];

const weatherFields = [
  ["Rainfall", "Rainfall_mm_day", "mm/day", CloudSun],
  ["Temperature", "Temperature_C", "°C", Activity],
  ["Relative humidity", "Relative_Humidity_pct", "%", Leaf],
  ["Wind speed", "Wind_Speed_m_s", "m/s", Wind],
  ["Solar radiation", "Solar_Radiation_MJ_m2_day", "MJ/m²/day", TrendingUp],
];

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

function initialSection() {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "block-diagnostics") return "block-intelligence";
  return sections.some((s) => s.id === hash) ? hash : "overview";
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value, digits = 2) {
  const number = numberOrNull(value);
  return number == null ? "N/A" : number.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function nutrientStatusLabel(value, status) {
  if (numberOrNull(value) == null || status === "NO_DATA") return "N/A";
  if (status === "LOW") return "Below threshold";
  if (status === "HIGH") return "Above threshold";
  return "Between thresholds";
}

async function fetchPayload(path) {
  const response = await fetch(`${API_BASE}${path}`);
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || `API request failed (${response.status})`);
  return {
    data: result,
    available: response.headers.get("X-Data-Availability") !== "unavailable",
    reason: response.headers.get("X-Data-Reason") || "",
  };
}

async function fetchRecords(path) {
  const { data, available, reason } = await fetchPayload(path);
  if (!Array.isArray(data)) throw new Error("Unexpected API response format");
  return { rows: data, available, reason };
}

function latestBlockRecord(rows, blockId) {
  return rows.filter((row) => String(row.Block_ID).trim().toUpperCase() === String(blockId).trim().toUpperCase())
    .sort((a, b) => Number(b.Year || b.Leaf_Sampling_Year || 0) - Number(a.Year || a.Leaf_Sampling_Year || 0))[0] || null;
}

function App() {
  const [activeSection, setActiveSection] = useState(initialSection);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [datasets, setDatasets] = useState(emptyDatasets);
  const [sourceStatus, setSourceStatus] = useState(() =>
    Object.fromEntries(Object.keys(sourcePaths).map((key) => [key, "loading"]))
  );
  const [selectedBlockId, setSelectedBlockId] = useState("B002");
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("ALL");
  const [productivityTab, setProductivityTab] = useState("forecast");

  // Synchronize navigation state cleanly
  const navigate = useCallback((sectionId) => {
    setActiveSection(sectionId);
    setSidebarOpen(false);
    if (window.location.hash !== `#${sectionId}`) {
      window.history.pushState(null, "", `#${sectionId}`);
    }
  }, []);

  useEffect(() => {
    const handleUrlChange = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash === "block-diagnostics") {
        setActiveSection("block-intelligence");
      } else if (sections.some((s) => s.id === hash)) {
        setActiveSection(hash);
      } else if (!hash) {
        setActiveSection("overview");
      }
    };
    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("hashchange", handleUrlChange);
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("hashchange", handleUrlChange);
    };
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setSidebarOpen(false);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [sidebarOpen]);

  const loadSources = useCallback(async () => {
    setSourceStatus(Object.fromEntries(Object.keys(sourcePaths).map((key) => [key, "loading"])));
    const requests = Object.entries(sourcePaths).map(async ([key, path]) => {
      try {
        if (key === "modelValidation") {
          const { data: result, available } = await fetchPayload(path);
          setDatasets((cur) => ({
            ...cur,
            modelMetrics: result.metrics || [],
            yearlyValidation: result.yearly || [],
            featureImportance: result.feature_importance || [],
          }));
          setSourceStatus((cur) => ({ ...cur, [key]: available && result.metrics?.length ? "ready" : "empty" }));
        } else if (key === "dataQuality") {
          const { data: result, available } = await fetchPayload(path);
          setDatasets((cur) => ({ ...cur, dataQuality: result }));
          setSourceStatus((cur) => ({ ...cur, [key]: available && result.findings?.length ? "ready" : "empty" }));
        } else if (key === "droneVisualizations") {
          const { data: result, available } = await fetchPayload(path);
          setDatasets((cur) => ({ ...cur, droneVisualizations: result?.visualizations || [] }));
          setSourceStatus((cur) => ({ ...cur, [key]: available && result?.visualizations?.length ? "ready" : "empty" }));
        } else if (key === "multispectralVisualizations") {
          const { data: result, available } = await fetchPayload(path);
          setDatasets((cur) => ({ ...cur, multispectralVisualizations: result || [] }));
          setSourceStatus((cur) => ({ ...cur, [key]: available && result?.length ? "ready" : "empty" }));
        } else if (key === "multispectralSummary" || key === "multiSourceSummary" || key === "multiSourceEvidence") {
          const { data: result, available } = await fetchPayload(path);
          setDatasets((cur) => ({ ...cur, [key]: result }));
          setSourceStatus((cur) => ({ ...cur, [key]: available && result ? "ready" : "empty" }));
        } else if (key === "droneSummary" || key === "droneValidation" || key === "droneOutliers") {
          const { data: result, available } = await fetchPayload(path);
          setDatasets((cur) => ({ ...cur, [key]: result }));
          setSourceStatus((cur) => ({ ...cur, [key]: available && result ? "ready" : "empty" }));
        } else {
          const { rows, available } = await fetchRecords(path);
          setDatasets((cur) => ({ ...cur, [key]: rows }));
          setSourceStatus((cur) => ({ ...cur, [key]: available && rows.length ? "ready" : "empty" }));
        }
        setSourceStatus((cur) => ({ ...cur, [`${key}Error`]: "" }));
      } catch (error) {
        setSourceStatus((cur) => ({ ...cur, [key]: "error", [`${key}Error`]: error.message }));
      }
    });
    await Promise.allSettled(requests);
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadSources, 0);
    return () => clearTimeout(timer);
  }, [loadSources]);

  // Data mappings and joins
  const blockKey = (id) => String(id ?? "").trim().toUpperCase();
  const multiRiskByBlock = useMemo(() => new Map(datasets.multiRisk.map((r) => [blockKey(r.Block_ID), r])), [datasets.multiRisk]);

  const allRiskRows = useMemo(() => datasets.risk.map((row) => ({
    ...row,
    ...(multiRiskByBlock.get(blockKey(row.Block_ID)) || {}),
    Block_ID: row.Block_ID,
    Block_Risk_Score: row.Risk_Score,
    Block_Risk_Level: row.Risk_Level,
    Actual_Yield_t_Ha: row.Actual_Yield_t_Ha,
    Expected_Yield_t_Ha: row.Expected_Yield_t_Ha,
    Yield_Gap_pct: row.Yield_Gap_pct,
  })), [datasets.risk, multiRiskByBlock]);

  // Selected block matching
  const currentBlockId = selectedBlockId;
  const selectedBlock = datasets.risk.find((r) => String(r.Block_ID).trim().toUpperCase() === String(currentBlockId).trim().toUpperCase()) || null;
  const selectedMultiRisk = multiRiskByBlock.get(blockKey(currentBlockId)) || null;
  const selectedNutrients = latestBlockRecord(datasets.nutrients, currentBlockId);
  const selectedDris = latestBlockRecord(datasets.dris, currentBlockId);
  const selectedWeather = latestBlockRecord(datasets.weather, currentBlockId);
  const selectedSoil = datasets.soil.find((row) => blockKey(row.Block_ID) === blockKey(currentBlockId)) || null;

  const selectedHistory = useMemo(() => datasets.productivity
    .filter((row) => blockKey(row.Block_ID) === blockKey(currentBlockId) && String(row.Plant_Status || "").toUpperCase() !== "TBM")
    .sort((a, b) => Number(a.Year) - Number(b.Year))
    .map((row) => ({ Year: Number(row.Year), Productivity: numberOrNull(row.Productivity_t_Ha), Plant_Status: row.Plant_Status })),
  [datasets.productivity, currentBlockId]);

  const selectedBlockForecast = useMemo(() => {
    return datasets.forecast.filter((row) => blockKey(row.Block_ID) === blockKey(currentBlockId));
  }, [datasets.forecast, currentBlockId]);


  const tableRows = useMemo(() => allRiskRows.filter((row) => {
    const level = String(row.Multi_Source_Risk_Level ?? row.Block_Risk_Level ?? "UNKNOWN").toUpperCase();
    return row.Block_ID?.toLowerCase().includes(search.trim().toLowerCase())
      && (riskFilter === "ALL" || level === riskFilter);
  }).sort((a, b) => (numberOrNull(b.Multi_Source_Risk_Score) ?? -1) - (numberOrNull(a.Multi_Source_Risk_Score) ?? -1)),
  [allRiskRows, riskFilter, search]);

  const riskCounts = useMemo(() => ["HIGH", "MEDIUM", "LOW"].map((level) => ({
    name: level,
    value: datasets.multiRisk.filter((r) => String(r.Multi_Source_Risk_Level ?? "UNKNOWN").toUpperCase() === level).length,
  })).filter((item) => item.value > 0), [datasets.multiRisk]);

  const currentSection = sections.find((s) => s.id === activeSection) || sections[0];
  const isLoading = Object.values(sourceStatus).some((s) => s === "loading");
  const unavailableSources = Object.entries(sourceStatus).filter(([k, s]) => ["empty", "error"].includes(s) && !k.endsWith("Error"));

  const selectBlock = (blockId) => {
    setSelectedBlockId(blockId);
    setSearch("");
    navigate("block-intelligence");
  };

  return (
    <div className={`app ${sidebarOpen ? "sidebar-open" : ""}`}>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark"><Leaf size={21} strokeWidth={2.2} /></div>
          <div className="brand-copy"><strong>Palm AI</strong><span>Plantation Intelligence</span></div>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>

        <div className="workspace-chip">
          <span className="workspace-dot" />
          <span>{datasets.risk.length ? `${datasets.risk.length} blocks · source dataset` : "Source dataset"}</span>
          <ChevronDown size={14} />
        </div>

        <p className="nav-caption">NAVIGATION</p>
        <nav className="navigation" aria-label="Dashboard sections">
          {sections.map(({ id, label, icon: Icon }) => {
            const isActive = activeSection === id;
            return (
              <button
                key={id}
                type="button"
                className={`nav-item ${isActive ? "active" : ""}`}
                onClick={() => navigate(id)}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                <span>{label}</span>
                {isActive && <span className="nav-active-indicator" />}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="engine-icon"><Activity size={16} /></div>
          <div>
            <strong>Multi-source engine</strong>
            <small>{datasets.risk.length || "N/A"} blocks · {datasets.dataQuality?.period_start ?? "N/A"}–{datasets.dataQuality?.period_end ?? "N/A"}</small>
          </div>
          <span className="live-dot" />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main">
        {/* Top Header Bar */}
        <header className="topbar">
          <button className="icon-button menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open navigation" aria-expanded={sidebarOpen}><Menu size={20} /></button>
          <div className="breadcrumb">
            <span>Estate intelligence</span>
            <span className="crumb-separator">/</span>
            <strong>{currentSection.label}</strong>
          </div>
          <div className="topbar-meta">
            <div className="topbar-estate-selector">
              <div className="estate-dropdown-pill" title="Active Plantation Estate">
                <MapPin size={13} style={{ color: "#059669" }} />
                <span>Seri Ulu Langat (Div A)</span>
              </div>
              <div className="block-select-topbar" title="Quick Jump to Block Intelligence">
                <Search size={13} />
                <select
                  value={selectedBlockId}
                  onChange={(e) => selectBlock(e.target.value)}
                  aria-label="Select plantation block"
                >
                  {datasets.risk.map((b) => (
                    <option key={b.Block_ID} value={b.Block_ID}>
                      {b.Block_ID} ({b.Risk_Level} Risk · {formatNumber(b.Actual_Yield_t_Ha)} t/ha)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {activeSection === "multi-source-evidence" ? (
              <>
                <span className="estate-badge">3 Evidence Sources</span>
                <span className="estate-badge">Canonical Risk: Agronomic</span>
                <span className="estate-badge unmapped-pill">Spatial Link: Not Available</span>
              </>
            ) : activeSection === "multispectral-health" ? (
              <>
                <span className="estate-badge">34 Tiles</span>
                <span className="estate-badge">8.91M Pixels</span>
                <span className="estate-badge unmapped-pill">Spatial Link: Not Available</span>
              </>
            ) : activeSection === "drone-health" ? (
              <>
                <span className="estate-badge">500 Images</span>
                <span className="estate-badge">43,599 Palm Detections</span>
                <span className="estate-badge unmapped-pill">Spatial Link: Not Available</span>
              </>
            ) : (
              <>
                <span className="estate-badge">{datasets.risk.length || "N/A"} blocks</span>
                <span className="estate-badge">{datasets.risk.length ? formatNumber(datasets.risk.reduce((sum, r) => sum + (numberOrNull(r.Area_Ha) || 0), 0), 0) : "N/A"} ha</span>
                <span className="estate-badge">{datasets.risk.length ? formatNumber(datasets.risk.reduce((sum, r) => sum + (numberOrNull(r.Productive_Palms) || 0), 0), 0) : "N/A"} palms</span>
              </>
            )}
            <div className={`api-indicator ${unavailableSources.length ? "warning" : ""}`}>
              <span className="api-dot" />
              <span>{isLoading ? "Loading dataset…" : unavailableSources.length ? "Partial source data" : "Source dataset loaded"}</span>
              <button className="refresh-button" onClick={loadSources} title="Refresh data"><RefreshCw size={13} /></button>
            </div>
          </div>
        </header>

        <div className="page-content">
          {/* Page Heading */}
          <section className="page-heading">
            <div>
              <p className="eyebrow">AI PLANTATION INTELLIGENCE</p>
              <h1>
                {activeSection === "overview"
                  ? "Estate Command Center"
                  : activeSection === "block-intelligence" || activeSection === "block-diagnostics"
                  ? `Block Intelligence · ${selectedBlockId}`
                  : activeSection === "multi-source-evidence"
                  ? "Multi-Source Evidence"
                  : activeSection === "multispectral-health"
                  ? "Multispectral UAV Survey"
                  : activeSection === "drone-health"
                  ? "RGB UAV Survey & Live AI"
                  : currentSection.title}
              </h1>
              <p className="subtitle">{currentSection.description}</p>
            </div>
            <div className="heading-meta">
              <span className="meta-icon"><Database size={16} /></span>
              {activeSection === "multi-source-evidence" ? (
                <span>Three Independent Evidence Layers<br /><strong>Canonical Risk: Agronomic · Decoupled Architecture</strong></span>
              ) : activeSection === "multispectral-health" ? (
                <span>Sensor: MicaSense Altum (5-Band Reflectance)<br /><strong>Standalone Spectral Evidence · Decoupled from Block Risk</strong></span>
              ) : activeSection === "drone-health" ? (
                <span>Sensor: RGB UAV Camera (MOPAD Site 2)<br /><strong>Baseline Conf: 0.25 · Independent Image Evidence</strong></span>
              ) : (
                <span>Observed records: {datasets.dataQuality?.period_start ?? "N/A"}–{datasets.dataQuality?.period_end ?? "N/A"}<br /><strong>Source dataset loaded · saved analyses shown separately</strong></span>
              )}
            </div>
          </section>

          {/* SECTION 1: ESTATE COMMAND CENTER */}
          {activeSection === "overview" && (
            <EstateCommandCenter
              datasets={datasets}
              onSelectBlock={selectBlock}
              onNavigate={navigate}
            />
          )}

          {/* SECTION 2: UNIFIED BLOCK INTELLIGENCE */}
          {(activeSection === "block-intelligence" || activeSection === "block-diagnostics") && (
            <UnifiedBlockIntelligence
              blockId={selectedBlockId}
              onSelectBlock={(id) => {
                setSelectedBlockId(id);
                navigate("block-intelligence");
              }}
              datasets={datasets}
              onNavigate={navigate}
            />
          )}

          {/* SECTION 2: RISK ANALYSIS */}
          {activeSection === "risk-analysis" && (
            <RiskPage
              datasets={datasets}
              sourceStatus={sourceStatus}
              riskCounts={riskCounts}
              tableRows={tableRows}
              search={search}
              setSearch={setSearch}
              riskFilter={riskFilter}
              setRiskFilter={setRiskFilter}
              selectBlock={selectBlock}
              loadSources={loadSources}
              isLoading={isLoading}
            />
          )}


          {/* SECTION 4: WEATHER IMPACT */}
          {activeSection === "weather-impact" && (
            <WeatherPage datasets={datasets} sourceStatus={sourceStatus} />
          )}

          {/* SECTION 5: PRODUCTIVITY */}
          {activeSection === "productivity" && (
            <ProductivityPage
              datasets={datasets}
              sourceStatus={sourceStatus}
              productivityTab={productivityTab}
              setProductivityTab={setProductivityTab}
              selectBlock={selectBlock}
              selectedBlockId={currentBlockId}
              setSelectedBlockId={setSelectedBlockId}
            />
          )}

          {/* SECTION 6: DRONE HEALTH ANALYSIS */}
          {activeSection === "drone-health" && (
            <DroneHealthPage
              datasets={datasets}
              sourceStatus={sourceStatus}
              loadSources={loadSources}
            />
          )}

          {/* SECTION 7: MULTISPECTRAL HEALTH ANALYSIS */}
          {activeSection === "multispectral-health" && (
            <MultispectralHealthPage
              datasets={datasets}
              sourceStatus={sourceStatus}
              loadSources={loadSources}
            />
          )}

          {/* SECTION 8: MULTI-SOURCE EVIDENCE INTEGRATION */}
          {activeSection === "multi-source-evidence" && (
            <MultiSourceEvidencePage
              datasets={datasets}
              sourceStatus={sourceStatus}
              loadSources={loadSources}
              navigate={navigate}
            />
          )}

          {/* SECTION 9: FIELD ACTION CENTER */}
          {activeSection === "field-action-center" && (
            <FieldActionCenter datasets={datasets} />
          )}

          <footer className="dashboard-footer">
            <span>Palm AI · Division A Estate Intelligence</span>
            <span>Observed records and saved projection outputs are identified by their source.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

// =========================================================================
// SECTION 1: OVERVIEW PAGE (References 1 & 2)
// =========================================================================
function OverviewPage({ datasets, sourceStatus, riskCounts, tableRows, search, setSearch, riskFilter, setRiskFilter, selectBlock, loadSources }) {
  const actualYears = [...datasets.production].sort((a, b) => Number(a.Year) - Number(b.Year));
  const latestActual = actualYears.at(-1);
  const forecastTotals = datasets.forecast.reduce((totals, row) => {
    const year = Number(row.Year);
    if (latestActual && year > Number(latestActual.Year) && numberOrNull(row.Forecast_FFB_t) != null) totals.set(year, (totals.get(year) || 0) + numberOrNull(row.Forecast_FFB_t));
    return totals;
  }, new Map());
  const latestForecastYear = Math.min(...forecastTotals.keys());
  const latestForecast = Number.isFinite(latestForecastYear) ? forecastTotals.get(latestForecastYear) : null;
  const belowPeers = datasets.risk.filter((row) => Number(row.Productivity_Deviation_pct) < -10).length;
  // Production Trend bar chart data (2012-2026)
  const productionTrend = useMemo(() => {
    const map = new Map();
    datasets.production.forEach((r) => {
      const year = Number(r.Year);
      if (Number.isFinite(year)) {
        map.set(year, { Year: year, Actual: numberOrNull(r.FFB_Production_t), Forecast: null });
      }
    });
    const fcYears = new Map();
    datasets.forecast.forEach((r) => {
      const year = Number(r.Year);
      const ffb = numberOrNull(r.Forecast_FFB_t) ?? 0;
      if (latestActual && year > Number(latestActual.Year) && numberOrNull(r.Forecast_FFB_t) != null) {
        fcYears.set(year, (fcYears.get(year) || 0) + ffb);
      }
    });
    fcYears.forEach((val, year) => {
      map.set(year, { Year: year, Actual: null, Forecast: Math.round(val) });
    });
    return [...map.values()].sort((a, b) => a.Year - b.Year);
  }, [datasets.production, datasets.forecast, latestActual]);

  return (
    <>
      {/* 5 KPI Metric Cards (Reference 1) */}
      <div className="stats-grid overview-kpis">
        <article className="metric-card tone-amber">
          <div className="metric-top">
            <span className="metric-label">LATEST FFB PRODUCTION</span>
            <span className="metric-icon"><TrendingUp size={16} /></span>
          </div>
            <strong className="metric-value">{latestActual ? `${formatNumber(latestActual.FFB_Production_t, 0)} ` : "N/A "}<span className="metric-unit">{latestActual ? "t" : ""}</span></strong>
            <span className="metric-delta">{latestActual ? `${latestActual.Year} actual production` : "No production observation"}</span>
        </article>

        <article className="metric-card tone-green">
          <div className="metric-top">
            <span className="metric-label">SAVED FORECAST OUTPUT</span>
            <span className="metric-icon"><TrendingUp size={16} /></span>
          </div>
            <strong className="metric-value">{latestForecast == null ? "N/A" : formatNumber(latestForecast, 0)} <span className="metric-unit">{latestForecast == null ? "" : "t"}</span></strong>
            <span className="metric-hint">{latestForecast == null ? "No saved forecast available" : `Saved output · ${latestForecastYear}`}</span>
        </article>

        <article className="metric-card">
          <div className="metric-top">
            <span className="metric-label">{datasets.risk[0]?.Latest_Year ?? "Latest"} ANNUAL PRODUCTIVITY</span>
            <span className="metric-icon"><Sprout size={16} /></span>
          </div>
            <strong className="metric-value">{datasets.risk.some((row) => numberOrNull(row.Actual_Yield_t_Ha) != null) ? formatNumber(datasets.risk.reduce((sum, row) => sum + (numberOrNull(row.Actual_Yield_t_Ha) ?? 0), 0) / datasets.risk.filter((row) => numberOrNull(row.Actual_Yield_t_Ha) != null).length) : "N/A"} <span className="metric-unit">{datasets.risk.length ? "t/ha" : ""}</span></strong>
            <span className="metric-hint">Mean across blocks with a value · {datasets.risk.filter((row) => numberOrNull(row.Actual_Yield_t_Ha) != null).length} valid blocks</span>
        </article>

        <article className="metric-card tone-red">
          <div className="metric-top">
            <span className="metric-label">BLOCKS BELOW PEERS</span>
            <span className="metric-icon"><AlertTriangle size={16} /></span>
          </div>
            <strong className="metric-value">{datasets.risk.length ? belowPeers : "N/A"} <span className="metric-unit">{datasets.risk.length ? `of ${datasets.risk.length}` : ""}</span></strong>
            <span className="metric-hint">Blocks more than 10% below peer yield</span>
        </article>

      </div>

      {/* Main Top Grid: Annual FFB Production + Needs Attention (Reference 1) */}
      <div className="overview-grid">
        <Panel className="chart-panel">
          <PanelHeading
            title="Annual FFB production"
            action={
              <div className="chart-legend-inline">
                <span className="legend-chip"><i className="chip-green" /> Actual</span>
                <span className="legend-chip"><i className="chip-orange" /> Saved forecast output</span>
              </div>
            }
          />
          <div className="bar-chart">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={productionTrend} margin={{ top: 12, right: 15, left: -5, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e8eee9" />
                <XAxis dataKey="Year" tickLine={false} axisLine={false} tick={{ fill: "#6a7b70", fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#6a7b70", fontSize: 11 }} domain={[0, 20000]} />
                <Tooltip content={<ChartTooltip unit=" t" />} />
                <Bar dataKey="Actual" name="Actual" fill="#2d6e47" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Forecast" name="Saved forecast output" fill="#d95e28" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="attention-panel">
          <PanelHeading title="Data availability" action={<span className="count-pill">{Object.values(sourceStatus).filter((s) => s === "ready").length} sources ready</span>} />
          <div className="attention-list">
            {datasets.risk.length ? datasets.risk.filter((row) => Number(row.Productivity_Deviation_pct) < -10)
              .sort((a, b) => Number(a.Productivity_Deviation_pct) - Number(b.Productivity_Deviation_pct)).slice(0, 5)
              .map((row) => <div className="attention-item red" key={row.Block_ID}><strong>{row.Block_ID}: {formatNumber(row.Productivity_Deviation_pct, 1)}% vs peer yield</strong><p>Saved block risk output. Select the block to inspect its recorded inputs.</p></div>)
              : <EmptyState title="No block risk observations" copy="The risk source has no records available." />}
            {Object.entries(sourceStatus).filter(([key, status]) => !key.endsWith("Error") && ["empty", "error"].includes(status))
              .map(([key]) => <div className="attention-item amber" key={key}><strong>{key} data unavailable</strong><p>Other available project data remains visible.</p></div>)}
          </div>
        </Panel>
      </div>

      {/* "What the data says" Card (Reference 2) */}
      <Panel className="data-says-panel">
        <PanelHeading title="What the data says" />
        <p className="data-says-body">{actualYears.length ? `Annual production observations span ${actualYears[0].Year}–${latestActual.Year}. Latest recorded total: ${formatNumber(latestActual.FFB_Production_t, 0)} tonnes.` : "No annual production observations are available."} {forecastTotals.size ? `Saved forecast output covers ${[...forecastTotals.keys()].sort().join(", ")}.` : "No saved yield forecast is available."} Block details reflect the records available in the project outputs.</p>
      </Panel>

      {/* Middle Row: Risk Distribution Donut & Top Risk Blocks */}
      <div className="overview-grid">
        <Panel className="distribution-panel">
          <PanelHeading eyebrow="MULTI-SOURCE BLOCK RISK" title="Risk distribution" />
          <RiskDistribution data={riskCounts} loading={sourceStatus.multiRisk === "loading"} error={sourceStatus.multiRiskError} onRetry={loadSources} compact />
        </Panel>

        <Panel>
          <PanelHeading eyebrow="BLOCKS TO REVIEW" title="Highest saved risk scores" action={<span className="count-pill">Top 5</span>} />
          {tableRows.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr><th>Block</th><th>Risk Level</th><th>Score</th><th>Deviation</th></tr>
                </thead>
                <tbody>
                  {tableRows.slice(0, 5).map((row) => (
                    <tr key={row.Block_ID} className="clickable-row" onClick={() => selectBlock(row.Block_ID)}>
                      <td><strong className="block-id">{row.Block_ID}</strong></td>
                      <td><span className={`risk-badge ${String(row.Multi_Source_Risk_Level).toLowerCase()}`}><i />{row.Multi_Source_Risk_Level}</span></td>
                      <td>{formatNumber(row.Multi_Source_Risk_Score, 1)}</td>
                      <td className={Number(row.Productivity_Deviation_pct) < 0 ? "text-negative" : ""}>
                        {row.Productivity_Deviation_pct == null ? "—" : `${Number(row.Productivity_Deviation_pct) > 0 ? "+" : ""}${formatNumber(row.Productivity_Deviation_pct, 1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No risk records" copy="No block risk scores were returned." />
          )}
        </Panel>
      </div>

      {/* Bottom Table: Plantation Risk Overview */}
      <Panel className="table-panel">
        <PanelHeading eyebrow="BLOCK-LEVEL ANALYSIS" title="Plantation risk overview" action={<span className="count-pill">{datasets.risk.length} blocks</span>} />
        <p className="panel-description">Saved multi-source analysis where available. Select a row to open diagnostics for that block.</p>
        <BlockTable
          rows={tableRows}
          loading={sourceStatus.risk === "loading"}
          error={sourceStatus.riskError}
          search={search}
          setSearch={setSearch}
          riskFilter={riskFilter}
          setRiskFilter={setRiskFilter}
          selectBlock={selectBlock}
          onRetry={loadSources}
          compact
        />
      </Panel>
    </>
  );
}

// =========================================================================
// SECTION 2: RISK ANALYSIS PAGE
// =========================================================================
function RiskPage({ datasets, sourceStatus, riskCounts, tableRows, search, setSearch, riskFilter, setRiskFilter, selectBlock, loadSources, isLoading }) {
  const highScore = Math.max(0, ...tableRows.map((r) => numberOrNull(r.Multi_Source_Risk_Score) ?? 0));
  const riskChartRows = useMemo(() => tableRows.slice(0, 12).map((r) => ({
    Block_ID: r.Block_ID,
    Score: numberOrNull(r.Multi_Source_Risk_Score) ?? 0,
    fill: riskColors[r.Multi_Source_Risk_Level] || riskColors.UNKNOWN,
  })).reverse(), [tableRows]);

  return (
    <>
      <div className="stats-grid risk-stats">
        <MetricCard title="Blocks analyzed" value={datasets.multiRisk.length ? datasets.multiRisk.length : "—"} icon={Sprout} />
        <MetricCard title="High risk blocks" value={riskCounts.find((r) => r.name === "HIGH")?.value ?? 0} icon={AlertTriangle} tone="red" />
        <MetricCard title="Highest multi-source score" value={formatNumber(highScore, 1)} icon={Activity} tone="amber" />
      </div>

      <p className="method-note">
        Derived screening score = weighted mean of available components: yield gap score (40%), nutrient low-count / measured-count (25%; requires at least 3 of 6 measurements), and DRIS limiting-nutrient count / 5 (15% when available). Available weights are renormalized per block. Yield gap scores: &lt;5%=20, 5–&lt;10%=40, 10–&lt;20%=60, 20–&lt;30%=75, ≥30%=90. Bands: low &lt;40, medium 40–&lt;70, high ≥70. Weather is repeated estate context and excluded. This is a screening analysis, not a validated agronomic risk model. Click a block for indicators, coverage and source years.
      </p>

      {/* DECOUPLED MULTI-SOURCE EVIDENCE ARCHITECTURE */}
      <Panel className="evidence-arch-panel">
        <PanelHeading eyebrow="THREE INDEPENDENT EVIDENCE PILLARS" title="Decoupled Multi-Source Evidence Architecture" />
        <div className="evidence-arch-grid">
          <div className="pillar-card pillar-palm">
            <div className="pillar-badge-strip">
              <span className="pillar-tag">PILLAR 1</span>
              <span className="status-tag available">Available</span>
            </div>
            <h4>Palm Agronomic Risk</h4>
            <p className="pillar-desc">Operational block-level predictive modeling source. Combines yield deviation, foliar nutrients, and DRIS ratios.</p>
            <div className="pillar-metrics">
              <div><span>Scope:</span> <strong>42 Blocks (100%)</strong></div>
              <div><span>History:</span> <strong>2012–2024 (13 yrs)</strong></div>
              <div><span>Block Mapping:</span> <strong className="text-green">Available</strong></div>
            </div>
          </div>

          <div className="pillar-card pillar-rgb">
            <div className="pillar-badge-strip">
              <span className="pillar-tag">PILLAR 2</span>
              <span className="status-tag unmapped">Unmapped</span>
            </div>
            <h4>RGB Drone UAV (YOLO11n)</h4>
            <p className="pillar-desc">External visual demonstration from MOPAD Site 2. High-precision crown detection (Healthy, Dead, Yellow, Small).</p>
            <div className="pillar-metrics">
              <div><span>Scope:</span> <strong>500 Image Crops</strong></div>
              <div><span>Health Score:</span> <strong>75.8% mean</strong></div>
              <div><span>Block Mapping:</span> <strong className="text-amber">Unavailable</strong></div>
            </div>
          </div>

          <div className="pillar-card pillar-ms">
            <div className="pillar-badge-strip">
              <span className="pillar-tag">PILLAR 3</span>
              <span className="status-tag unmapped">Unmapped</span>
            </div>
            <h4>Multispectral UAV (Altum)</h4>
            <p className="pillar-desc">External spectral demonstration from MSUAV500K benchmark. Pure-canopy NDVI/NDRE physiological vigour.</p>
            <div className="pillar-metrics">
              <div><span>Scope:</span> <strong>34 GeoTIFF Tiles</strong></div>
              <div><span>Canopy NDVI:</span> <strong>0.886 mean</strong></div>
              <div><span>Block Mapping:</span> <strong className="text-amber">Unavailable</strong></div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="overview-grid risk-visuals">
        <Panel>
          <PanelHeading eyebrow="SAVED MULTI-SOURCE OUTPUT" title="Highest block risk scores" />
          {riskChartRows.length ? (
            <div className="bar-chart">
              <ResponsiveContainer width="100%" height={Math.max(290, riskChartRows.length * 28)}>
                <BarChart data={riskChartRows} layout="vertical" margin={{ left: 10, right: 22, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e8eee9" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#748178" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="Block_ID" width={52} tick={{ fontSize: 11, fill: "#59675e" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip unit=" / 100" />} />
                  <Bar dataKey="Score" name="Risk score" radius={[0, 5, 5, 0]} barSize={16}>
                    {riskChartRows.map((r) => <Cell key={r.Block_ID} fill={r.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <LoadingOrEmpty loading={isLoading} label="Loading risk analysis…" />
          )}
        </Panel>

        <Panel>
          <PanelHeading eyebrow="ESTATE RISK MIX" title="Risk distribution" />
          <RiskDistribution data={riskCounts} loading={sourceStatus.multiRisk === "loading"} error={sourceStatus.multiRiskError} onRetry={loadSources} />
          <p className="method-note">Risk levels: High (&ge;70), Medium (40–69), Low (&lt;40).</p>
        </Panel>
      </div>

      <Panel className="table-panel">
        <PanelHeading eyebrow="BLOCKS BY SAVED RISK SCORE" title="Risk register" action={<span className="count-pill">{tableRows.length} blocks</span>} />
        <BlockTable
          rows={tableRows}
          loading={sourceStatus.risk === "loading"}
          error={sourceStatus.riskError}
          search={search}
          setSearch={setSearch}
          riskFilter={riskFilter}
          setRiskFilter={setRiskFilter}
          selectBlock={selectBlock}
          onRetry={loadSources}
        />
      </Panel>
    </>
  );
}

// =========================================================================
// SECTION 3: BLOCK DIAGNOSTICS PAGE (References 5 & 6)
// =========================================================================
function DiagnosticsPage({ blocks, selectedBlock, selectedBlockId, setSelectedBlockId, selectedMultiRisk, selectedNutrients, selectedDris, selectedWeather, selectedSoil, nutrientReference, selectedHistory, selectedBlockForecast, search, setSearch, datasets, sourceStatus }) {
  const latestObservedYear = numberOrNull(selectedBlock?.Latest_Year) ?? numberOrNull(datasets.dataQuality?.period_end);
  const comparisonYear = latestObservedYear == null ? null : latestObservedYear - 1;
  const filteredBlocks = blocks.filter((b) => b.Block_ID?.toLowerCase().includes(search.trim().toLowerCase()));
  const drisBlocks = [...new Set(datasets.dris.map((row) => row.Block_ID).filter(Boolean))].sort().join(", ");

  // Calculate annual yield history & forecast for selected block (Reference 5 bar chart)
  const blockAnnualYield = useMemo(() => {
    if (!selectedBlock) return [];
    const map = new Map();
    selectedHistory.forEach((h) => {
      map.set(h.Year, { Year: h.Year, Actual: h.Productivity, Forecast: null });
    });
    const fcByYear = new Map();
    selectedBlockForecast.forEach((f) => {
      const year = Number(f.Year);
      const value = numberOrNull(f.Forecast_Productivity_t_Ha);
      if (!Number.isFinite(year) || value == null) return;
      const current = fcByYear.get(year) || { total: 0, count: 0 };
      current.total += value;
      current.count += 1;
      fcByYear.set(year, current);
    });
    fcByYear.forEach(({ total, count }, year) => {
      if (count) map.set(year, { Year: year, Actual: null, Forecast: Number(total.toFixed(2)) });
    });
    return [...map.values()].sort((a, b) => a.Year - b.Year);
  }, [selectedHistory, selectedBlockForecast, selectedBlock]);

  const firstForecastYear = [...new Set(selectedBlockForecast.map((row) => Number(row.Year)).filter(Number.isFinite))].sort((a, b) => a - b)[0] ?? null;
  const firstForecastYield = firstForecastYear == null ? null : blockAnnualYield.find((row) => row.Year === firstForecastYear)?.Forecast ?? null;
  const firstForecastTonnesValues = firstForecastYear == null ? [] : selectedBlockForecast
    .filter((row) => Number(row.Year) === firstForecastYear)
    .map((row) => numberOrNull(row.Forecast_FFB_t)).filter((value) => value != null);
  const firstForecastTonnes = firstForecastTonnesValues.length
    ? firstForecastTonnesValues.reduce((sum, value) => sum + value, 0)
    : null;
  const historicalMatureValues = selectedHistory
    .filter((row) => String(row.Plant_Status || "").toUpperCase() !== "TBM")
    .map((row) => row.Productivity)
    .filter((value) => value != null);
  const historicalAverage = historicalMatureValues.length
    ? historicalMatureValues.reduce((sum, value) => sum + value, 0) / historicalMatureValues.length
    : null;

  // Deficient nutrients string
  const belowThresholdNutrients = selectedNutrients ? nutrientFields
    .filter(([, , status]) => selectedNutrients[status] === "LOW")
    .map(([label]) => label).join(", ") || "None below threshold" : "N/A";

  // Peer comparison ratio and badge
  const actualYield = numberOrNull(selectedBlock?.Actual_Yield_t_Ha);
  const expectedYield = numberOrNull(selectedBlock?.Expected_Yield_t_Ha);
  const ratio = actualYield != null && expectedYield != null && expectedYield !== 0 ? actualYield / expectedYield : null;
  const statusBadge = ratio == null ? "N/A" : ratio < 0.9 ? "Below peers" : ratio > 1.1 ? "Above peers" : "On track";
  const statusTone = ratio == null ? "teal" : ratio < 0.9 ? "red" : ratio > 1.1 ? "green" : "teal";

  return (
    <>
      {/* Block Selector */}
      <Panel className="selector-panel">
        <div className="selector-copy">
          <span className="selector-icon"><Search size={18} /></span>
          <div>
            <strong>Select a plantation block</strong>
            <p>Choose a block to load matching observations and saved analysis outputs.</p>
          </div>
        </div>
        <div className="selector-controls">
          <label className="search-box">
            <Search size={15} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter blocks…"
              aria-label="Filter blocks"
            />
          </label>
          <label className="select-block">
            <select
              value={selectedBlockId || ""}
              onChange={(e) => setSelectedBlockId(e.target.value)}
            >
              {filteredBlocks.map((b) => (
                <option key={b.Block_ID} value={b.Block_ID}>
                  {b.Block_ID} · planted {b.Planting_Year} · {b.Seed_Type}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
        </div>
      </Panel>

      {sourceStatus?.risk === "loading" && !blocks.length && <LoadingState label="Loading block records…" />}
      {sourceStatus?.riskError && <ErrorState title="Block records unavailable" error={sourceStatus.riskError} />}
      {sourceStatus?.risk === "empty" && !blocks.length && <EmptyState title="No block records" copy="The block risk endpoint returned no records." />}
      {sourceStatus?.nutrientsError && <ErrorState title="Nutrient observations unavailable" error={sourceStatus.nutrientsError} />}
      {sourceStatus?.drisError && <ErrorState title="DRIS output unavailable" error={sourceStatus.drisError} />}
      {sourceStatus?.multiRiskError && <ErrorState title="Multi-source risk output unavailable" error={sourceStatus.multiRiskError} />}
      {sourceStatus?.weatherError && <ErrorState title="Block weather context unavailable" error={sourceStatus.weatherError} />}
      {sourceStatus?.nutrientReferenceError && <ErrorState title="Nutrient reference ranges unavailable" error={sourceStatus.nutrientReferenceError} />}
      {selectedBlock && (
        <>
          {/* Top Block Detail Card (Reference 5) */}
          <Panel className="block-detail-hero">
            <div className="block-detail-header">
              <div>
                <span className="detail-tag">BLOCK DETAIL</span>
                <h2>{selectedBlock.Block_ID} · planted {selectedBlock.Planting_Year} · {selectedBlock.Seed_Type}</h2>
              </div>
              <span className={`peer-badge ${statusTone}`}>• {statusBadge}</span>
            </div>

            <div className="block-detail-grid">
              {/* Left Column: Annual Yield Bar Chart */}
              <div className="block-chart-col">
                <div className="mini-chart-header">
                  <span>Annual yield (t/ha)</span>
                  <div className="chart-legend-inline">
                    <span className="legend-chip"><i className="chip-green" /> Actual</span>
                    <span className="legend-chip"><i className="chip-orange" /> Forecast</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={blockAnnualYield} margin={{ top: 8, right: 6, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e8eee9" />
                    <XAxis dataKey="Year" tickLine={false} axisLine={false} tick={{ fill: "#6a7b70", fontSize: 10 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "#6a7b70", fontSize: 10 }} domain={[0, 25]} />
                    <Tooltip content={<ChartTooltip unit=" t/ha" />} />
                    <Bar dataKey="Actual" fill="#2d6e47" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Forecast" fill="#d95e28" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Middle Column: Metadata */}
              <div className="block-meta-col">
                <div className="meta-spec">
                  <span>Area</span>
                  <strong>{formatNumber(selectedBlock.Area_Ha, 0)} ha · {formatNumber(selectedBlock.Productive_Palms, 0)} palms</strong>
                </div>
                <div className="meta-spec">
                  <span>Age / status</span>
                  <strong>{formatNumber(selectedBlock.Plant_Age_Years, 0)} yrs · {selectedBlock.Plant_Status}</strong>
                </div>
                <div className="meta-spec">
                  <span>{latestObservedYear ?? "Latest"} observed annual productivity</span>
                  <strong>{formatNumber(selectedBlock.Actual_Yield_t_Ha)} t/ha</strong>
                </div>
                <div className="meta-spec"><span>Historical mature-block average</span><strong>{historicalAverage == null ? "N/A" : `${formatNumber(historicalAverage)} t/ha`}</strong></div>
                <div className="meta-spec">
                  <span>Expected age-peer yield</span>
                  <strong>{selectedBlock.Expected_Yield_t_Ha == null ? "Limited peer sample" : `${formatNumber(selectedBlock.Expected_Yield_t_Ha)} t/ha · n=${selectedBlock.Expected_Peer_Count ?? "N/A"}`}</strong>
                </div>
                <div className="meta-spec">
                  <span>{firstForecastYear ?? "Forecast"} model output</span>
                  <strong>{firstForecastYield != null ? `${formatNumber(firstForecastYield)} t/ha · ${formatNumber(firstForecastTonnes, 0)} t` : "N/A"}</strong>
                </div>
                <div className="meta-spec">
                  <span>Low nutrients</span>
                  <strong className={selectedNutrients && nutrientFields.some(([, , status]) => selectedNutrients[status] === "LOW") ? "text-amber" : ""}>{belowThresholdNutrients}</strong>
                </div>
                <div className="meta-spec">
                  <span>Weather context</span>
                  <strong>{selectedWeather ? `${formatNumber(selectedWeather.Rainfall_mm_day)} mm/day at estate level` : "N/A"}</strong>
                </div>
                <div className="meta-spec"><span>Soil sample</span><strong>{selectedSoil ? `Available · ${selectedSoil.Sample_Year}` : "Not available for this block"}</strong></div>
                <div className="meta-spec"><span>Leaf sample</span><strong>{selectedNutrients?.Leaf_Sampling_Year ? `Historical sample · ${selectedNutrients.Leaf_Sampling_Year}` : "Not available"}</strong></div>
              </div>

              {/* Right Column: Standardized Block Risk & Evidence Availability */}
              <div className="block-recom-col block-risk-card">
                <div className="block-risk-header">
                  <h4>Block Risk</h4>
                  <span className={`risk-badge ${(selectedMultiRisk?.Multi_Source_Risk_Level || "UNKNOWN").toLowerCase()}`}>
                    {selectedMultiRisk?.Multi_Source_Risk_Level || "UNKNOWN"}
                  </span>
                </div>
                <div className="block-risk-summary-row">
                  <div className="risk-metric-box">
                    <span className="risk-metric-label">Risk Score</span>
                    <strong className="risk-metric-num">
                      {selectedMultiRisk ? formatNumber(selectedMultiRisk.Multi_Source_Risk_Score, 1) : "N/A"}
                      <small> / 100</small>
                    </strong>
                  </div>
                  <div className="risk-metric-box">
                    <span className="risk-metric-label">Risk Level</span>
                    <strong className={`risk-metric-level ${(selectedMultiRisk?.Multi_Source_Risk_Level || "UNKNOWN").toLowerCase()}`}>
                      {selectedMultiRisk?.Multi_Source_Risk_Level || "N/A"}
                    </strong>
                  </div>
                </div>

                <div className="risk-sub-heading">Risk Components</div>
                <div className="risk-components-mini-grid">
                  <div className="comp-row">
                    <span>Production</span>
                    <strong>{selectedMultiRisk?.Yield_Risk_Component != null ? `${formatNumber(selectedMultiRisk.Yield_Risk_Component, 0)} / 100` : "Limited peer sample"}</strong>
                  </div>
                  <div className="comp-row">
                    <span>Nutrient</span>
                    <strong>{selectedMultiRisk?.Nutrient_Risk_Component != null ? `${formatNumber(selectedMultiRisk.Nutrient_Risk_Component, 1)} / 100` : "Insufficient data"}</strong>
                  </div>
                  <div className="comp-row">
                    <span>Soil</span>
                    <strong>{selectedSoil ? `Observed (${selectedSoil.Sample_Year})` : "Unavailable"}</strong>
                  </div>
                  <div className="comp-row">
                    <span>Weather</span>
                    <strong>Unavailable / Not integrated</strong>
                  </div>
                </div>

                <div className="risk-sub-heading">Evidence Availability</div>
                <div className="evidence-status-stack">
                  <div className="evidence-pill pill-available">
                    <span className="dot dot-green" />
                    <span>Palm Agronomic: <strong>Available</strong></span>
                  </div>
                  <div className="evidence-pill pill-unmapped">
                    <span className="dot dot-gray" />
                    <span>RGB Drone: <strong>Spatial Link: Not Available</strong></span>
                  </div>
                  <div className="evidence-pill pill-unmapped">
                    <span className="dot dot-gray" />
                    <span>Multispectral: <strong>Spatial Link: Not Available</strong></span>
                  </div>
                </div>

                <p className="method-note">
                  * RGB Drone and Multispectral features are spatially unmapped demonstration modules and are NOT attributed to individual palm plantation blocks.
                </p>
              </div>
            </div>
          </Panel>

          {/* Diagnostic Metrics Grid */}
          <div className="diagnostic-metrics">
            <DiagnosticMetric label="Multi-source risk score" value={selectedMultiRisk ? formatNumber(selectedMultiRisk.Multi_Source_Risk_Score, 1) : "N/A"} suffix="/ 100" />
            <DiagnosticMetric label="Multi-source risk level" value={selectedMultiRisk?.Multi_Source_Risk_Level || "N/A"} />
            <DiagnosticMetric label="Yield gap screening score" value={formatNumber(selectedBlock.Risk_Score, 0)} suffix="/ 100" />
            <DiagnosticMetric label={`${latestObservedYear ?? "Latest"} observed productivity`} value={formatNumber(selectedBlock.Actual_Yield_t_Ha)} suffix="t/ha annual" />
            <DiagnosticMetric label="Expected yield" value={formatNumber(selectedBlock.Expected_Yield_t_Ha)} suffix="t/ha age-peer median" />
            <DiagnosticMetric label="Productivity deviation" value={selectedBlock.Productivity_Deviation_pct == null ? "—" : `${formatNumber(selectedBlock.Productivity_Deviation_pct, 1)}%`} suffix="vs peers" />
            <DiagnosticMetric label="Yield gap" value={selectedBlock.Yield_Gap_pct == null ? "—" : `${formatNumber(selectedBlock.Yield_Gap_pct, 1)}%`} suffix="below benchmark" />
          </div>

          {/* Leaf Nutrients & DRIS Grid */}
          <div className="overview-grid diagnostic-grid">
            {/* Leaf Nutrient Diagnostics */}
            <Panel>
              <PanelHeading eyebrow="FROND 17 ANALYSIS" title="Leaf nutrient status" action={<span className="count-pill">Sample: {selectedNutrients?.Leaf_Sampling_Year ?? "N/A"}</span>} />
              {selectedNutrients ? (
                <>
                  <div className="nutrient-grid">
                    {nutrientFields.map(([label, field, status]) => {
                      const val = selectedNutrients[field];
                      const st = String(selectedNutrients[status] || "NO_DATA").toLowerCase();
                      const reference = nutrientReference.find((r) => String(r.Nutrient).toUpperCase() === field.toUpperCase());
                      return (
                        <div key={field} className={`nutrient-card status-${st}`}>
                          <div className="nut-top">
                            <span className="nut-name">{label}</span>
                          <span className={`nut-badge ${st}`}>{nutrientStatusLabel(val, selectedNutrients[status])}</span>
                          </div>
                          <strong className="nut-val">{val != null ? formatNumber(val, 3) : "N/A"}</strong>
                          <small className="nut-opt">Dataset Q25/Q75: {reference ? `${formatNumber(reference.Low_Reference_Q25, 3)} / ${formatNumber(reference.High_Reference_Q75, 3)}` : "N/A"}</small>
                        </div>
                      );
                    })}
                  </div>
                  {selectedNutrients.Nutrient_Concern && (
                    <div className="concern-note">
                      <strong>Nutrient concern level:</strong> {selectedNutrients.Nutrient_Concern}
                    </div>
                  )}
                  {nutrientReference.length > 0 && (
                    <div className="table-scroll table-compact" style={{ marginTop: "12px" }}>
                      <table className="data-table">
                        <thead>
                          <tr><th>Nutrient</th><th>Q25 Lower</th><th>Q75 Upper</th></tr>
                        </thead>
                        <tbody>
                          {nutrientReference.map((nr) => (
                            <tr key={nr.Nutrient}>
                              <td><strong>{nr.Nutrient}</strong></td>
                              <td>{formatNumber(nr.Low_Reference_Q25, 3)}</td>
                              <td>{formatNumber(nr.High_Reference_Q75, 3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState title="No nutrient record" copy="No leaf test found for this block." />
              )}
            </Panel>

            {/* DRIS Diagnosis */}
            <Panel>
              <PanelHeading eyebrow="DRIS SYSTEM" title="Nutrient balance diagnosis" />
              {selectedDris ? (
                <div className="dris-box">
                  <p className="dris-recom"><strong>DRIS diagnostic note:</strong> {selectedDris.Prescription_Recommendation}</p>
                  <div className="detail-line"><span>Survey Year</span><strong>{selectedDris.Year}</strong></div>
                  <div className="detail-line"><span>Potential Limiting</span><strong className="text-negative">{selectedDris.Potential_Limiting_Nutrients || "None"}</strong></div>
                  <div className="detail-line"><span>Potential Excess</span><strong>{selectedDris.Potential_Excess_Nutrients || "None"}</strong></div>
                </div>
              ) : (
                <div className="dris-empty-box">
                  <span className="dris-icon"><FlaskConical size={24} /></span>
                  <strong>DRIS data not available for this block</strong>
                  <p>Available DRIS outputs cover {drisBlocks || "no listed blocks"}. This selected block has no matching DRIS record.</p>
                </div>
              )}
            </Panel>
          </div>

          {/* Full Block Health Peer Comparison Table (Reference 6) */}
          <Panel className="table-panel">
            <PanelHeading eyebrow="ESTATE PEER BENCHMARK" title="Block health comparison" action={<span className="count-pill">{blocks.length} blocks</span>} />
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Block</th>
                    <th>Age</th>
                    <th>Seed</th>
                    <th>ha</th>
                    <th>Palms/ha</th>
                    <th>{latestObservedYear ?? "Latest"} yield (t/ha)</th>
                    <th>Expected</th>
                    <th>Ratio</th>
                    <th>Gap t/ha</th>
                    <th>{comparisonYear ?? "Prior"} yield (t/ha)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.map((b) => {
                    const bRatio = numberOrNull(b.Expected_Yield_t_Ha) && numberOrNull(b.Actual_Yield_t_Ha) != null ? Number(b.Actual_Yield_t_Ha) / Number(b.Expected_Yield_t_Ha) : null;
                    const bStatus = bRatio == null ? "N/A" : bRatio < 0.9 ? "Below peers" : bRatio > 1.1 ? "Above peers" : "On track";
                    const bClass = bRatio == null ? "track" : bRatio < 0.9 ? "below" : bRatio > 1.1 ? "above" : "track";
                    const isSelected = String(b.Block_ID).toUpperCase() === String(selectedBlockId).toUpperCase();
                    const priorYield = comparisonYear == null ? null : datasets.productivity.find((p) => String(p.Block_ID).toUpperCase() === String(b.Block_ID).toUpperCase() && Number(p.Year) === comparisonYear && String(p.Plant_Status || "").toUpperCase() !== "TBM")?.Productivity_t_Ha;

                    return (
                      <tr
                        key={b.Block_ID}
                        className={`clickable-row ${isSelected ? "selected-row" : ""}`}
                        onClick={() => setSelectedBlockId(b.Block_ID)}
                      >
                        <td><strong className="block-id">{b.Block_ID}</strong></td>
                        <td>{formatNumber(b.Plant_Age_Years, 0)}</td>
                        <td>{b.Seed_Type}</td>
                        <td>{formatNumber(b.Area_Ha, 0)}</td>
                        <td>{formatNumber(b.Palms_per_Ha, 1)}</td>
                        <td><strong>{formatNumber(b.Actual_Yield_t_Ha)}</strong></td>
                        <td>{formatNumber(b.Expected_Yield_t_Ha)}</td>
                        <td><strong>{bRatio == null ? "N/A" : bRatio.toFixed(2)}</strong></td>
                        <td className={Number(b.Actual_Yield_t_Ha) - Number(b.Expected_Yield_t_Ha) < 0 ? "text-negative" : ""}>
                          {numberOrNull(b.Actual_Yield_t_Ha) == null || numberOrNull(b.Expected_Yield_t_Ha) == null ? "N/A" : formatNumber(Number(b.Actual_Yield_t_Ha) - Number(b.Expected_Yield_t_Ha))}
                        </td>
                        <td>{priorYield != null ? formatNumber(priorYield) : "N/A"}</td>
                        <td><span className={`peer-pill ${bClass}`}>• {bStatus}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
      {!selectedBlock && blocks.length > 0 && <EmptyState title="Selected block not found" copy={`No record matched ${selectedBlockId}. Choose a block from the list above.`} />}
    </>
  );
}

// =========================================================================
// SECTION 4: WEATHER IMPACT PAGE (Section 11)
// =========================================================================
function WeatherPage({ datasets, sourceStatus }) {
  const variables = weatherFields.map(([label, field, unit, icon]) => {
    const vals = datasets.monthlyWeather.map((r) => numberOrNull(r[field])).filter((v) => v != null);
    return { label, field, unit, icon, value: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
  });
  const yearly = new Map();
  datasets.monthlyWeather.forEach((row) => {
    const year = Number(row.Year);
    if (!yearly.has(year)) yearly.set(year, { Year: year, ...Object.fromEntries(weatherFields.map(([, field]) => [field, []])) });
    weatherFields.forEach(([, field]) => {
      const value = numberOrNull(row[field]);
      if (value != null) yearly.get(year)[field].push(value);
    });
  });
  const trend = [...yearly.values()].sort((a, b) => a.Year - b.Year).map((row) => ({
    Year: row.Year,
    ...Object.fromEntries(weatherFields.map(([, field]) => [field, row[field].length ? row[field].reduce((a, b) => a + b, 0) / row[field].length : null])),
  }));
  const loading = sourceStatus?.monthlyWeather === "loading";
  const error = sourceStatus?.monthlyWeatherError;
  return <>
    {error && <ErrorState title="Weather dataset unavailable" error={error} />}
    {loading && !datasets.monthlyWeather.length && <LoadingState label="Loading monthly weather observations..." />}
    <p className="method-note">Monthly NASA POWER weather records; rainfall is a daily average (mm/day) within each month. These are estate-level context, not block-specific measurements; weather is excluded from block risk scores. Correlations and model feature importance do not establish causation.</p>
    <div className="stats-grid weather-stats">{variables.map((item) => <MetricCard key={item.field} title={`Mean ${item.label}`} value={item.value == null ? "N/A" : `${formatNumber(item.value, 2)} ${item.unit}`} icon={item.icon} hint={`${datasets.monthlyWeather.length} monthly records`} />)}</div>
    {trend.length ? <Panel>
      <PanelHeading eyebrow="MONTHLY INPUT SUMMARIZED BY YEAR" title="Weather trends" />
      <div className="line-chart"><ResponsiveContainer width="100%" height={300}>
        <LineChart data={trend}><CartesianGrid strokeDasharray="3 5" vertical={false} /><XAxis dataKey="Year" /><YAxis /><Tooltip content={<ChartTooltip />} /><Legend />
          {weatherFields.map(([label, field], i) => <Line key={field} dataKey={field} name={label} stroke={["#2d6e47", "#d95e28", "#5886a6", "#a47a25", "#785c9c"][i]} dot={false} />)}
        </LineChart>
      </ResponsiveContainer></div>
    </Panel> : !loading && !error && <EmptyState title="Weather observations unavailable" copy="No monthly weather rows were returned." />}
    <Panel>
      <PanelHeading eyebrow="ASSOCIATION ONLY" title="Weather and productivity correlation" />
      {sourceStatus?.weatherCorrelation === "loading" && !datasets.weatherCorrelation.length ? <LoadingState label="Loading correlation output..." /> : sourceStatus?.weatherCorrelationError ? <ErrorState title="Correlation output unavailable" error={sourceStatus.weatherCorrelationError} /> : datasets.weatherCorrelation.length ? <>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Variable</th><th>Pearson r</th><th>Rows</th></tr></thead><tbody>{datasets.weatherCorrelation.map((r) => <tr key={r.Weather_Variable}><td>{r.Weather_Variable}</td><td>{formatNumber(r.Correlation_with_Productivity, 3)}</td><td>{formatNumber(r.Observations, 0)}</td></tr>)}</tbody></table></div>
        <p className="method-note">These are unadjusted correlations from the saved analysis. They show association, not cause or a block-specific weather effect.</p>
      </> : <EmptyState title="No correlation output" copy="No correlation rows were returned." />}
    </Panel>
  </>;
}

// =========================================================================
// SECTION 5: PRODUCTIVITY PAGE (References 3, 4, 7, 8, 9, 10, 11, 12, 13, 14)
// =========================================================================
function ProductivityPage({ datasets, sourceStatus, productivityTab, setProductivityTab, selectBlock, selectedBlockId, setSelectedBlockId }) {
  return (
    <>
      {/* Sub-tab navigation bar matching reference screenshots */}
      <div className="subtab-bar" role="tablist">
        {productivityTabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={productivityTab === tab.id}
            className={`subtab-btn ${productivityTab === tab.id ? "active" : ""}`}
            onClick={() => setProductivityTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SUB-VIEW 1: YIELD FORECAST (References 3 & 4) */}
      {productivityTab === "forecast" && <YieldForecastView datasets={datasets} sourceStatus={sourceStatus} selectedBlockId={selectedBlockId} setSelectedBlockId={setSelectedBlockId} />}

      {/* SUB-VIEW 2: FERTILIZER ADVISOR (References 7 & 8) */}
      {productivityTab === "fertilizer" && <FertilizerAdvisorView datasets={datasets} sourceStatus={sourceStatus} selectBlock={selectBlock} />}

      {/* SUB-VIEW 3: AGE & SEED CURVES (Reference 9) */}
      {productivityTab === "curves" && <AgeCurvesView datasets={datasets} sourceStatus={sourceStatus} />}

      {/* SUB-VIEW 4: REPLANTING (Reference 10) */}
      {productivityTab === "replanting" && <ReplantingView datasets={datasets} sourceStatus={sourceStatus} />}

      {/* SUB-VIEW 5: HARVEST & REVENUE (Reference 11) */}
      {productivityTab === "harvest" && <HarvestRevenueView datasets={datasets} sourceStatus={sourceStatus} selectedBlockId={selectedBlockId} setSelectedBlockId={setSelectedBlockId} />}

      {/* SUB-VIEW 6: DATA & MODEL VALIDATION (References 13 & 14) */}
              {productivityTab === "validation" && <ValidationDataView datasets={datasets} sourceStatus={sourceStatus} />}

    </>
  );
}

// -------------------------------------------------------------------------
// Sub-view: Yield Forecast (References 3 & 4)
// -------------------------------------------------------------------------
function YieldForecastView({ datasets, sourceStatus, selectedBlockId, setSelectedBlockId }) {
  const [forecastYear, setForecastYear] = useState(null);
  const divisionMonthly = useMemo(() => {
    const unique = new Map();
    datasets.forecast.forEach((r) => {
      const value = numberOrNull(r.Forecast_FFB_t);
      if (value == null) return;
      const key = `${r.Year}-${r.Month_Number}`;
      const month = unique.get(key) || {
        Month: displayMonth(r.Month_Number, r.Month), Month_Number: Number(r.Month_Number), Year: Number(r.Year), Forecast: null,
      };
      month.Forecast = (month.Forecast ?? 0) + value;
      unique.set(key, month);
    });
    return [...unique.values()].sort((a, b) => a.Year - b.Year || a.Month_Number - b.Month_Number);
  }, [datasets.forecast]);
  const availableYears = [...new Set(divisionMonthly.map((r) => r.Year))].sort((a, b) => a - b);
  const selectedForecastYear = availableYears.includes(forecastYear) ? forecastYear : (availableYears[0] ?? null);
  const blockHistory = datasets.productivity.filter((r) => String(r.Block_ID).trim().toUpperCase() === String(selectedBlockId).trim().toUpperCase() && String(r.Plant_Status || "").toUpperCase() !== "TBM")
    .map((r) => ({ Year: Number(r.Year), Actual: numberOrNull(r.Productivity_t_Ha), Forecast: null }));
  const forecastByYear = new Map();
  datasets.forecast.filter((r) => String(r.Block_ID).trim().toUpperCase() === String(selectedBlockId).trim().toUpperCase()).forEach((r) => {
    const year = Number(r.Year);
    const value = numberOrNull(r.Forecast_Productivity_t_Ha);
    if (!Number.isFinite(year) || value == null) return;
    const current = forecastByYear.get(year) || { Year: year, Actual: null, Forecast: null };
    current.Forecast = (current.Forecast ?? 0) + value;
    forecastByYear.set(year, current);
  });
  const blockSeriesByYear = new Map(blockHistory.map((row) => [row.Year, { ...row }]));
  forecastByYear.forEach((row, year) => blockSeriesByYear.set(year, { ...(blockSeriesByYear.get(year) || { Year: year, Actual: null }), ...row }));
  const firstForecastYear = Math.min(...forecastByYear.keys());
  const anchorYear = Number.isFinite(firstForecastYear) ? firstForecastYear - 1 : null;
  const anchor = anchorYear == null ? null : blockSeriesByYear.get(anchorYear);
  if (anchor && numberOrNull(anchor.Actual) != null) {
    blockSeriesByYear.set(anchorYear, { ...anchor, Forecast: numberOrNull(anchor.Actual), ForecastAnchor: true });
  }
  const blockSeries = [...blockSeriesByYear.values()].sort((a, b) => a.Year - b.Year);
  const monthRows = divisionMonthly.filter((r) => r.Year === selectedForecastYear);
  const sumField = (key) => {
    const values = monthRows.map((row) => numberOrNull(row[key])).filter((value) => value != null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };

  return <>
    {sourceStatus?.forecast === "loading" && !datasets.forecast.length && <LoadingState label="Loading saved forecast output…" />}
    {sourceStatus?.forecastError && <ErrorState title="Forecast output unavailable" error={sourceStatus.forecastError} />}
      <Panel>
        <PanelHeading title="Saved estate monthly forecast" />
      <p className="method-note">Forecast values are model outputs, not observed production. Monthly estate totals sum the saved output's block-level predictions. No calibrated prediction interval is available.</p>
      {monthRows.length ? <>
        <div className="bar-chart monthly-forecast-chart"><ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthRows} margin={{ top: 8, right: 8, left: 0, bottom: 18 }}><CartesianGrid strokeDasharray="3 5" vertical={false} /><XAxis dataKey="Month" interval={0} angle={-35} textAnchor="end" height={58} tick={{ fontSize: 9 }} /><YAxis /><Tooltip content={<ChartTooltip unit=" t" />} />
            <Bar dataKey="Forecast" name="Saved forecast" fill="#d95e28" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer></div>
      </> : <EmptyState title="Forecast unavailable" copy="The forecast endpoint returned no records." />}
    </Panel>
    <div className="overview-grid">
      <Panel className="block-history-panel">
        <div className="panel-header-row"><h2>Block history and forecast</h2>
          <label className="select-block-small"><select value={selectedBlockId} onChange={(e) => setSelectedBlockId(e.target.value)}>
            {datasets.risk.map((r) => <option key={r.Block_ID} value={r.Block_ID}>{r.Block_ID}</option>)}
          </select><ChevronDown size={14} /></label>
        </div>
        {blockSeries.length ? <div className="block-history-chart"><ResponsiveContainer width="100%" height="100%">
          <LineChart data={blockSeries} margin={{ top: 12, right: 14, left: 2, bottom: 14 }}><CartesianGrid strokeDasharray="3 5" vertical={false} /><XAxis dataKey="Year" type="number" domain={["dataMin", "dataMax"]} ticks={blockSeries.map((row) => row.Year)} allowDecimals={false} interval={0} angle={-42} textAnchor="end" height={54} tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip content={<ChartTooltip unit=" t/ha" />} /><Legend verticalAlign="top" height={24} />
            <Line dataKey="Actual" name="Observed annual productivity" stroke="#2d6e47" strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="Forecast" name="Saved forecast, monthly sum" stroke="#d95e28" strokeWidth={2} strokeDasharray="5 4" dot={(props) => props.payload?.Forecast == null || props.payload?.ForecastAnchor ? null : <circle cx={props.cx} cy={props.cy} r={4} fill="#d95e28" stroke="#fff" strokeWidth={1.5} />} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer></div> : <EmptyState title="No block series" copy={`No history or forecast records are available for ${selectedBlockId}.`} />}
        <p className="method-note">The block series uses the cached allocation described above.</p>
      </Panel>
      <Panel className="monthly-output-panel">
        <div className="panel-header-row"><h2>Estate monthly output {selectedForecastYear ?? ""}</h2><div className="year-pill-toggle" aria-label="Select forecast year">
          {availableYears.map((y) => <button type="button" key={y} aria-pressed={selectedForecastYear === y} className={selectedForecastYear === y ? "active" : ""} onClick={() => setForecastYear(y)}>{y}</button>)}
        </div></div>
        {monthRows.length ? <div className="table-scroll"><table className="data-table monthly-output-table"><thead><tr><th>Month</th><th className="numeric-cell">Model forecast (t)</th></tr></thead>
          <tbody>{monthRows.map((r) => <tr key={r.Month_Number}><td>{r.Month}</td><td className="numeric-cell">{formatNumber(r.Forecast, 0)}</td></tr>)}
            <tr className="table-total-row"><td>Total</td><td className="numeric-cell">{formatNumber(sumField("Forecast"), 0)}</td></tr>
          </tbody></table></div> : <EmptyState title="No forecast rows" copy={selectedForecastYear == null ? "No forecast years are available from the current API data." : `No saved forecast is available for ${selectedForecastYear}.`} />}
      </Panel>
    </div>
  </>;
}

// -------------------------------------------------------------------------
// Sub-view: Fertilizer Advisor (References 7 & 8)
// -------------------------------------------------------------------------
function FertilizerAdvisorView({ datasets, sourceStatus, selectBlock }) {
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("Block_ID");
  const [descending, setDescending] = useState(false);
  const reference = new Map(datasets.nutrientReference.map((r) => [r.Nutrient, r]));
  const fields = ["N_pct", "P_pct", "K_pct", "Mg_pct", "Ca_pct", "B_ppm"];
  const summaries = fields.map((field) => ({
    field,
    nutrient: field.replace("_pct", "").replace("_ppm", ""),
    range: reference.get(field),
  }));
  const rows = [...datasets.nutrients]
    .filter((row) => String(row.Block_ID || "").toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => {
      const aValue = a[sortBy], bValue = b[sortBy];
      const aMissing = aValue == null || aValue === "", bMissing = bValue == null || bValue === "";
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      const aNumber = numberOrNull(aValue), bNumber = numberOrNull(bValue);
      const order = aNumber != null && bNumber != null ? aNumber - bNumber : String(aValue).localeCompare(String(bValue));
      return descending ? -order : order;
    });
  return <>
    {sourceStatus?.nutrients === "loading" && !datasets.nutrients.length && <LoadingState label="Loading nutrient observations..." />}
    {sourceStatus?.nutrientsError && <ErrorState title="Nutrient observations unavailable" error={sourceStatus.nutrientsError} />}
    <div className="stats-grid fertilizer-kpis">{summaries.map((item) =>
      <MetricCard key={item.field} title={`${item.nutrient} below threshold`} value={item.range?.Valid_Blocks != null ? `${item.range.Low_Blocks} / ${item.range.Valid_Blocks} sampled` : "N/A"} hint={item.range ? `Dataset-derived Q25/Q75: ${formatNumber(item.range.Low_Reference_Q25, 3)} / ${formatNumber(item.range.High_Reference_Q75, 3)}; no valid value: ${item.range.Missing_Blocks} blocks` : "Reference unavailable"} />
    )}</div>
    <Panel className="table-panel">
      <PanelHeading eyebrow="LATEST AVAILABLE LEAF SAMPLE" title="Nutrient status by block" action={<span className="count-pill">{datasets.nutrients.length} blocks</span>} />
      <p className="panel-subtitle">Leaf sampling spans {datasets.dataQuality?.leaf_period_start ?? "N/A"}-{datasets.dataQuality?.leaf_period_end ?? "N/A"}; these are historical samples, not a current survey. Thresholds are {reference.get(fields[0])?.Threshold_Method || "dataset-derived quartiles"}, not universal agronomic targets. Missing values are N/A. Repeated monthly values are reduced to block/sample-year observations; within-year measurements are averaged, then the latest valid sample year is used. Concern is Limited data with fewer than 3 measured nutrients.</p>
      <div className="table-controls">
        <label className="search-box"><Search size={15} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter blocks..." aria-label="Filter nutrient blocks" /></label>
        <label className="nutrient-sort"><span>Sort by</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="Block_ID">Block ID</option><option value="Leaf_Sampling_Year">Sample year</option>{fields.map((field) => <option key={field} value={field}>{field.replace("_pct", "").replace("_ppm", "")}</option>)}</select></label>
        <button type="button" className="secondary-button" onClick={() => setDescending((value) => !value)}>{descending ? "Descending" : "Ascending"}</button>
      </div>
      {datasets.nutrients.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Block</th><th>Sample year</th><th>N %</th><th>P %</th><th>K %</th><th>Mg %</th><th>Ca %</th><th>B ppm</th><th>Below threshold</th><th>Valid count</th><th>Concern</th><th>Data status</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.Block_ID} className="clickable-row" onClick={() => selectBlock(r.Block_ID)}>
          <td>{r.Block_ID}</td><td>{r.Leaf_Sampling_Year ?? "N/A"}</td>
          {fields.map((field) => <td key={field} className={`status-cell ${String(r[`${field}_Status`] || "NO_DATA").toLowerCase()}`}>{r[field] == null ? "N/A" : formatNumber(r[field], 3)}<small className="nutrient-status-label">{nutrientStatusLabel(r[field], r[`${field}_Status`])}</small></td>)}
          <td>{r.Low_Nutrients || "N/A"}</td><td>{r.Available_Nutrient_Count ?? "N/A"}/{fields.length}</td><td>{r.Nutrient_Concern || "N/A"}</td><td>{r.Data_Status || "N/A"}</td></tr>)}</tbody></table></div> : <EmptyState title="Nutrient data unavailable" copy="No block nutrient diagnostics were returned." />}
      {datasets.nutrients.length > 0 && rows.length === 0 && <EmptyState title="No matching blocks" copy="Change the filter to see nutrient records." />}
      <p className="method-note">No verified fertilizer application history is available. Status labels describe dataset quartile thresholds, not diagnoses or fertilizer prescriptions.</p>
    </Panel>
  </>;
}

// -------------------------------------------------------------------------
// Sub-view: Age & Seed Curves (Reference 9)
// -------------------------------------------------------------------------
function AgeCurvesView({ datasets, sourceStatus }) {
  const seedTypes = [...new Set(datasets.ageSeed.map((r) => r.Seed_Type).filter(Boolean))];
  const seedColors = ["#b38622", "#2d6e47", "#c75242", "#5886a6", "#785c9c"];
  const pointCounts = datasets.ageSeed.map((r) => numberOrNull(r.Block_Years)).filter((n) => n != null).sort((a, b) => a - b);
  const countSummary = pointCounts.length ? `Point sample sizes: ${pointCounts[0]}–${pointCounts.at(-1)} block-years (median ${formatNumber(pointCounts[Math.floor(pointCounts.length / 2)], 0)}); counts are shown in tooltips.` : "Block-year sample counts unavailable.";

  const ageData = useMemo(() => {
    const map = new Map();
    datasets.ageSeed.forEach((r) => {
      const age = Number(r.Plant_Age_Years);
      const seed = r.Seed_Type;
      const yieldVal = numberOrNull(r.Productivity_t_Ha);
      if (!Number.isFinite(age) || !seed || yieldVal == null) return;
      const item = map.get(age) || { age };
      item[seed] = yieldVal;
      item.__counts = { ...(item.__counts || {}), [seed]: numberOrNull(r.Block_Years) };
      map.set(age, item);
    });
    return [...map.values()].sort((a, b) => a.age - b.age);
  }, [datasets.ageSeed]);

  const seasonalityData = useMemo(() => {
    return datasets.seasonality.map((r) => ({
      month: displayMonth(r.Month_Number, r.Month),
      index: numberOrNull(r.Relative_Index) == null ? null : Number(numberOrNull(r.Relative_Index).toFixed(2)),
    }));
  }, [datasets.seasonality]);

  return (
    <>
      {sourceStatus?.ageSeedError && <ErrorState title="Age and seed output unavailable" error={sourceStatus.ageSeedError} />}
      {sourceStatus?.seasonalityError && <ErrorState title="Seasonality output unavailable" error={sourceStatus.seasonalityError} />}
      {sourceStatus?.ageSeed === "loading" && !datasets.ageSeed.length && <LoadingState label="Loading age and seed output…" />}
      <div className="overview-grid">
        {/* Yield by Palm Age and Seed */}
        <Panel>
          <PanelHeading eyebrow="COHORT ANALYSIS" title="Yield by palm age and seed" />
          <p className="panel-subtitle">Observational association: mean annual productivity (t/ha) by recorded age and seed type, across block-years. {countSummary} Sparse groups need caution.</p>
          {ageData.length ? <div className="line-chart">
            <ResponsiveContainer width="100%" height={270}>
              <LineChart data={ageData} margin={{ top: 12, right: 18, left: -10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e8eee9" />
                <XAxis dataKey="age" tickLine={false} axisLine={false} tick={{ fill: "#6a7b70", fontSize: 10 }} domain={["auto", "auto"]} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#6a7b70", fontSize: 10 }} domain={["auto", "auto"]} />
                <Tooltip content={<ChartTooltip unit=" t/ha" />} />
                <Legend />
                {seedTypes.map((seed, index) => (
                  <Line key={seed} type="monotone" dataKey={seed} stroke={seedColors[index % seedColors.length]} strokeWidth={2.2} dot={{ r: 3 }} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div> : <EmptyState title="Age and seed data unavailable" copy="No cohort rows were returned." />}
        </Panel>

        {/* Seasonal Crop Pattern */}
        <Panel>
          <PanelHeading eyebrow="HISTORICAL SEASONAL PATTERN" title="Seasonal crop pattern" />
          <p className="panel-subtitle">Mature-block monthly mean productivity relative to the overall historical monthly mean (1.00 = average); descriptive association only.</p>
          {seasonalityData.length ? <div className="bar-chart">
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={seasonalityData} margin={{ top: 12, right: 12, left: -15, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e8eee9" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#6a7b70", fontSize: 10 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#6a7b70", fontSize: 10 }} domain={["auto", "auto"]} />
                <Tooltip content={<ChartTooltip unit="x average" />} />
                <Bar dataKey="index" name="Monthly index" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {seasonalityData.map((r, i) => (
                    <Cell key={i} fill={seedColors[i % seedColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div> : <EmptyState title="Seasonality data unavailable" copy="No monthly seasonality rows were returned." />}
        </Panel>
      </div>

      <Panel className="data-says-panel">
        <p className="data-says-body">Charts summarize the returned age, seed and monthly seasonality datasets. They describe associations in the available observations and do not isolate causal seed or seasonal effects.</p>
      </Panel>
    </>
  );
}

// -------------------------------------------------------------------------
// Sub-view: Replanting (Reference 10)
// -------------------------------------------------------------------------
function ReplantingView({ datasets, sourceStatus }) {
  const rows = [...datasets.risk].sort((a, b) => (numberOrNull(b.Plant_Age_Years) ?? -1) - (numberOrNull(a.Plant_Age_Years) ?? -1));
  const latestYear = rows[0]?.Latest_Year ?? "N/A";
  return <Panel className="table-panel">
    <PanelHeading title="Block age and productivity screen" action={<span className="count-pill">{rows.length} blocks</span>} />
    <p className="panel-subtitle">This project does not calculate an approved replanting score. This screening indicator compares {latestYear} annual productivity with the median of at least 3 other blocks within 2 years of age. Fewer peers are shown as Limited sample. Deviation = (actual - peer median) / peer median x 100.</p>
    {sourceStatus?.riskError && <ErrorState title="Block records unavailable" error={sourceStatus.riskError} />}
    {sourceStatus?.risk === "loading" && !rows.length ? <LoadingState label="Loading block records…" /> : rows.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Block</th><th>Planting year</th><th>Age years</th><th>Palms/ha</th><th>{latestYear} yield (t/ha)</th><th>Expected age-peer yield (n)</th><th>Deviation</th><th>Screening indicator</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.Block_ID}><td>{r.Block_ID}</td><td>{formatNumber(r.Planting_Year, 0)}</td><td>{formatNumber(r.Plant_Age_Years, 0)}</td><td>{formatNumber(r.Palms_per_Ha, 1)}</td><td>{formatNumber(r.Actual_Yield_t_Ha)}</td><td>{r.Expected_Yield_t_Ha == null ? "Limited sample" : `${formatNumber(r.Expected_Yield_t_Ha)} (${r.Expected_Peer_Count})`}</td><td>{r.Productivity_Deviation_pct == null ? "N/A" : `${formatNumber(r.Productivity_Deviation_pct, 1)}%`}</td><td>{r.Risk_Level || "N/A"} | {formatNumber(r.Risk_Score, 0)}</td></tr>)}</tbody>
    </table></div> : <EmptyState title="Block screen unavailable" copy="The block risk endpoint returned no records." />}
  </Panel>;
}

// -------------------------------------------------------------------------
// Sub-view: Harvest & Revenue Planner (Reference 11)
// -------------------------------------------------------------------------
function HarvestRevenueView({ datasets, sourceStatus, selectedBlockId, setSelectedBlockId }) {
  const [estateSelected, setEstateSelected] = useState(false);
  const [year, setYear] = useState(null);
  const production = datasets.harvestProduction || [];
  const blocks = [...new Set(production.map((row) => String(row.Block_ID || "").trim()).filter(Boolean))].sort();
  const selectedProduction = production.filter((row) => estateSelected
    || String(row.Block_ID).trim().toUpperCase() === String(selectedBlockId).trim().toUpperCase());
  const annualTotals = new Map();
  selectedProduction.forEach((row) => {
    const recordYear = Number(row.Year);
    const tonnes = numberOrNull(row.FFB_Production_t);
    if (Number.isFinite(recordYear) && tonnes != null) {
      annualTotals.set(recordYear, (annualTotals.get(recordYear) || 0) + tonnes);
    }
  });
  const annualRows = [...annualTotals].map(([Year, Tonnes]) => ({ Year, Tonnes })).sort((a, b) => a.Year - b.Year);
  const availableYears = annualRows.map((row) => row.Year);
  const selectedYear = availableYears.includes(Number(year)) ? Number(year) : (availableYears.at(-1) ?? null);
  const monthlyTotals = new Map();
  selectedProduction.filter((row) => Number(row.Year) === selectedYear).forEach((row) => {
    const monthNumber = Number(row.Month_Number);
    const tonnes = numberOrNull(row.FFB_Production_t);
    if (Number.isFinite(monthNumber) && tonnes != null) {
      const month = monthlyTotals.get(monthNumber) || { Month_Number: monthNumber, Month: displayMonth(monthNumber, row.Month), Tonnes: 0 };
      month.Tonnes += tonnes;
      monthlyTotals.set(monthNumber, month);
    }
  });
  const monthlyRows = [...monthlyTotals.values()].sort((a, b) => a.Month_Number - b.Month_Number);
  const annualTotal = annualRows.find((row) => row.Year === selectedYear)?.Tonnes ?? null;
  const loading = sourceStatus?.harvestProduction === "loading";
  const error = sourceStatus?.harvestProductionError;
  const scopeLabel = estateSelected ? "Estate" : selectedBlockId;

  return <Panel>
    <div className="panel-header-row">
      <h2>Observed harvest and revenue</h2>
      <div className="harvest-filters">
        <label><span>Production scope</span><select value={estateSelected ? "__ESTATE__" : selectedBlockId} onChange={(event) => {
          const value = event.target.value;
          setEstateSelected(value === "__ESTATE__");
          if (value !== "__ESTATE__") setSelectedBlockId(value);
        }}><option value="__ESTATE__">Estate total</option>{blocks.map((block) => <option key={block} value={block}>{block}</option>)}</select></label>
        <label><span>Year</span><select value={selectedYear ?? ""} onChange={(event) => setYear(Number(event.target.value))} disabled={!availableYears.length}>{availableYears.map((availableYear) => <option key={availableYear} value={availableYear}>{availableYear}</option>)}</select></label>
      </div>
    </div>
    <p className="panel-subtitle">Recorded monthly FFB production from the plantation master dataset. Revenue data unavailable: no dated FFB price or recorded revenue source exists in this project.</p>
    {error && <ErrorState title="Harvest production unavailable" error={error} />}
    {loading && !production.length && <LoadingState label="Loading observed harvest data..." />}
    {annualRows.length ? <>
      <div className="stats-grid planner-kpis">
        <MetricCard title={`${selectedYear} observed FFB production`} value={`${formatNumber(annualTotal, 1)} t`} hint={estateSelected ? "Estate total" : `Block ${scopeLabel}`} />
        <MetricCard title="Revenue" value="Revenue data unavailable" hint="No dated FFB price or recorded revenue source is available." />
      </div>
      <PanelHeading eyebrow={`${scopeLabel.toUpperCase()} · ${selectedYear} · TONNES`} title="Monthly FFB production" />
      {monthlyRows.length ? <>
        <div className="bar-chart"><ResponsiveContainer width="100%" height={230}><BarChart data={monthlyRows}><CartesianGrid strokeDasharray="3 5" vertical={false} /><XAxis dataKey="Month" interval={0} angle={-35} textAnchor="end" height={58} tick={{ fontSize: 9 }} /><YAxis /><Tooltip content={<ChartTooltip unit=" t" />} /><Bar dataKey="Tonnes" name="Observed FFB production" fill="#2d6e47" isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Month</th><th>Observed FFB production (t)</th><th>Revenue</th></tr></thead><tbody>{monthlyRows.map((row) => <tr key={row.Month_Number}><td>{row.Month}</td><td>{formatNumber(row.Tonnes, 1)}</td><td>Revenue data unavailable</td></tr>)}</tbody></table></div>
      </> : <EmptyState title="Monthly harvest unavailable" copy={`No monthly production records were returned for ${scopeLabel} in ${selectedYear}.`} />}
      <PanelHeading eyebrow="OBSERVED PRODUCTION HISTORY" title="Year-wise totals" />
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Year</th><th>Observed FFB production (t)</th><th>Revenue</th></tr></thead><tbody>{annualRows.map((row) => <tr key={row.Year}><td>{row.Year}</td><td>{formatNumber(row.Tonnes, 1)}</td><td>Revenue data unavailable</td></tr>)}</tbody></table></div>
    </> : !loading && !error ? <EmptyState title="Harvest production unavailable" copy="No monthly FFB production records were returned by the harvest API. Revenue data unavailable." /> : null}
  </Panel>;
}

// -------------------------------------------------------------------------
// Sub-view: Model & Data Validation (References 13 & 14)
// -------------------------------------------------------------------------
function ValidationDataView({ datasets, sourceStatus }) {
  const yearly = datasets.yearlyValidation || [];
  const validationYears = [...new Set(yearly.map((row) => Number(row.Year)).filter(Number.isFinite))].sort((a, b) => a - b);
  const validationPeriod = validationYears.length ? validationYears.join(" and ") : "saved validation period";
  const importance = (datasets.featureImportance || []).map((r) => ({ ...r, Importance: numberOrNull(r.Importance) }));
  const soil = datasets.soil || [];
  const metrics = new Map((datasets.modelMetrics || []).map((r) => [r.Metric, r.Value]));
  const findings = datasets.dataQuality?.findings || [];

  return (
    <>
      <div className="stats-grid">
        {["MAE", "RMSE", "R2"].map((name) => <MetricCard key={name} title={`Saved time-based validation ${name}`} value={metrics.has(name) ? formatNumber(metrics.get(name), 3) : "N/A"} hint={`Held-out validation years: ${validationPeriod}`} />)}
      </div>
      {sourceStatus?.modelValidation === "loading" && <LoadingState label="Loading saved validation outputs…" />}
      {sourceStatus?.modelValidationError && <ErrorState title="Validation output unavailable" error={sourceStatus.modelValidationError} />}
      {sourceStatus?.dataQualityError && <ErrorState title="Data quality summary unavailable" error={sourceStatus.dataQualityError} />}
      {sourceStatus?.soilError && <ErrorState title="Soil sample output unavailable" error={sourceStatus.soilError} />}
      {/* Top Grid: Validation Summary + Feature Importance */}
      <div className="overview-grid">
        {/* Forecast Accuracy Backtest */}
        <Panel>
          <PanelHeading eyebrow="SAVED VALIDATION OUTPUT" title="Year-level forecast validation" />
          <p className="panel-subtitle">Values are returned by the validation endpoint; the panel does not imply a rolling backtest unless its source output does.</p>
          <div className="table-scroll table-compact">
            <table className="data-table">
              <thead><tr><th>Year</th><th>Actual mean (t/ha)</th><th>Predicted mean (t/ha)</th><th>MAE (t/ha)</th><th>MAPE</th></tr></thead>
              <tbody>{yearly.map((r) => <tr key={r.Year}><td><strong>{r.Year}</strong></td><td>{formatNumber(r.Actual_Mean)}</td><td>{formatNumber(r.Predicted_Mean)}</td><td>{formatNumber(r.MAE)}</td><td>{formatNumber(r.MAPE)}%</td></tr>)}</tbody>
            </table>
          </div>
          {!yearly.length && <EmptyState title="Validation summary unavailable" copy="No year-level validation records were returned." />}
          <p className="method-note">MAE is the average absolute prediction error in t/ha; RMSE is similar but penalizes larger errors more. R² describes the share of observed variation accounted for by predictions (the saved value is shown above). These metrics do not establish production readiness.</p>
        </Panel>

        {/* What Drives the Forecast (Feature Permutation Importance) */}
        <Panel>
          <PanelHeading eyebrow="RANDOM FOREST IMPURITY IMPORTANCE" title="Model feature importance" />
          <p className="panel-subtitle">Random Forest impurity importance from the fitted model; this is not permutation testing or causal evidence.</p>
          <div className="bar-chart">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={importance} layout="vertical" margin={{ left: 20, right: 25, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e8eee9" />
                <XAxis type="number" tick={{ fontSize: 9, fill: "#6a7b70" }} />
                <YAxis type="category" dataKey="Feature" width={140} tick={{ fontSize: 10, fill: "#334a3b" }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="Importance" name="Impurity importance" fill="#2d6e47" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Middle Grid: Data Quality Checks + Additional Data Needs (Reference 14) */}
      <div className="overview-grid">
        <Panel>
          <PanelHeading title="Data quality checks" />
          {datasets.dataQuality ? <ul className="bullet-checks">{findings.map((item) => <li key={item.label}><strong>{item.label}: {item.value}.</strong> {item.detail}</li>)}</ul> : <EmptyState title="Data quality summary unavailable" copy="No data quality findings were returned." />}
        </Panel>

        <Panel>
          <PanelHeading title="Data limitations" />
          <ul className="bullet-checks">
            <li><strong>Observed records:</strong> {datasets.dataQuality?.period_start ?? "N/A"}-{datasets.dataQuality?.period_end ?? "N/A"}; forecast values are model outputs.</li>
            <li><strong>Leaf nutrients:</strong> historical samples from {datasets.dataQuality?.leaf_period_start ?? "N/A"}-{datasets.dataQuality?.leaf_period_end ?? "N/A"}, with missing values including Boron; not a current field test.</li>
            <li><strong>Soil:</strong> {datasets.dataQuality?.soil_sample_count ?? "N/A"} distinct block/year samples, with repeated source rows; coverage is sparse.</li>
            <li><strong>Weather:</strong> monthly estate-level context is repeated across blocks and does not support block-specific causal claims.</li>
            <li><strong>Not available:</strong> dated revenue/prices, pest/disease census, and satellite/drone NDVI.</li>
            <li><strong>Analysis limits:</strong> feature importance is not causal evidence; the replant page is a screening indicator only.</li>
          </ul>
        </Panel>
        <Panel>
          <PanelHeading title="Future data requirements" />
          <ul className="bullet-checks">
            <li><strong>Daily rainfall and dry-day counts</strong> to assess water stress at a finer time scale.</li>
            <li><strong>Fertilizer applied</strong> (product, rate, date per block). This turns the nutrient correlations into measured responses and cost-per-tonne ROI.</li>
            <li><strong>Fresh leaf sampling</strong> to keep nutrient analysis current.</li>
            <li><strong>Pest and disease census</strong> (Ganoderma, rats, bagworm) and palm counts, to explain low-performing blocks.</li>
            <li><strong>Harvest rounds, crop losses and bunch counts</strong>, to separate "the palms didn't produce" from "the crop wasn't collected".</li>
            <li><strong>Drone or satellite NDVI</strong> per block, as an early warning between leaf tests.</li>
          </ul>
        </Panel>
      </div>

      {/* Soil Analysis Table (Reference 14) */}
      <Panel className="table-panel">
        <PanelHeading eyebrow="LAB SAMPLES" title="Soil analysis" action={<span className="count-pill">{soil.length} samples</span>} />
        <p className="panel-subtitle">Saved soil observations are sparse and should be treated as a limited sample, not a complete block survey.</p>
        <div className="table-scroll">
          <table className="data-table soil-table">
            <thead>
              <tr>
                <th>BLOCK</th>
                <th>YEAR</th>
                <th>PH (H2O)</th>
                <th>ORG. C %</th>
                <th>AVAIL. P PPM</th>
                <th>EXCH. K</th>
                <th>EXCH. MG</th>
                <th>CEC</th>
                <th>BASE SAT. %</th>
                <th>SAND %</th>
                <th>CLAY %</th>
              </tr>
            </thead>
            <tbody>
              {soil.map((r, i) => {
                const baseSat = Number(r.Base_Saturation_pct);
                const isOver100 = baseSat > 100;
                return (
                  <tr key={i}>
                    <td><strong className="block-id">{r.Block_ID}</strong></td>
                    <td>{r.Sample_Year}</td>
                    <td>{formatNumber(r.pH_H2O, 1)}</td>
                    <td>{formatNumber(r.C_Organic_pct, 2)}</td>
                    <td>{formatNumber(r.P_Available_ppm, 1)}</td>
                    <td>{formatNumber(r.K_exch_me_100g, 1)}</td>
                    <td>{formatNumber(r.Mg_exch_me_100g, 2)}</td>
                    <td>{formatNumber(r.CEC_KTK_me_100g, 2)}</td>
                    <td className={isOver100 ? "text-flag-red" : ""}><strong>{formatNumber(r.Base_Saturation_pct, 1)}</strong></td>
                    <td>{formatNumber(r.Sand_pct, 1)}</td>
                    <td>{formatNumber(r.Clay_pct, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

// =========================================================================
// SHARED UTILITY COMPONENTS
// =========================================================================
function Panel({ className = "", children, ...props }) {
  return <section className={`panel ${className}`} {...props}>{children}</section>;
}

function PanelHeading({ eyebrow, title, action }) {
  return (
    <div className="panel-heading">
      <div>
        {eyebrow && <p className="panel-eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, tone = "green", loading = false, hint }) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-top">
        <span className="metric-label">{title}</span>
        {Icon && <span className="metric-icon"><Icon size={16} /></span>}
      </div>
      {loading ? <div className="skeleton metric-skeleton" /> : <strong className="metric-value">{value}</strong>}
      {hint && <span className="metric-hint">{hint}</span>}
    </article>
  );
}

function LoadingState({ label = "Loading data…" }) {
  return <div className="loading-state" role="status"><span className="spinner" />{label}</div>;
}

function ErrorState({ title, error, onRetry }) {
  return (
    <div className="error-state">
      <span className="error-icon"><AlertTriangle size={18} /></span>
      <div>
        <strong>{title}</strong>
        <p>{error || "Please check that the Palm AI API is running and try again."}</p>
      </div>
      {onRetry && (
        <button className="button-secondary" onClick={onRetry}><RefreshCw size={13} /> Retry</button>
      )}
    </div>
  );
}

function ChartTooltip({ active, payload, label, unit = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((entry) => (
        <span key={entry.dataKey || entry.name}>
          <i style={{ background: entry.color || entry.fill }} />
          {entry.name || entry.dataKey}: <b>{formatNumber(entry.value)}{unit}</b>
          {entry.payload?.__counts?.[entry.dataKey] != null && <small> · n={entry.payload.__counts[entry.dataKey]} block-years</small>}
        </span>
      ))}
    </div>
  );
}

function RiskDistribution({ data, loading, error, onRetry, compact = false }) {
  if (loading && data.length === 0) return <LoadingState label="Loading risk analysis…" />;
  if (error) return <ErrorState title="Unable to load risk distribution" error={error} onRetry={onRetry} />;
  if (!data.length) return <EmptyState title="No risk records available" copy="The risk endpoint returned no classified blocks." />;

  return (
    <div className={`risk-distribution ${compact ? "compact" : ""}`}>
      <div className="donut-wrap">
        <ResponsiveContainer width="100%" height={compact ? 190 : 220}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={compact ? 56 : 68} outerRadius={compact ? 80 : 94} paddingAngle={3} stroke="none">
              {data.map((entry) => <Cell key={entry.name} fill={riskColors[entry.name]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <strong>{data.reduce((sum, row) => sum + row.value, 0)}</strong>
          <span>blocks</span>
        </div>
      </div>
      <div className="risk-legend">
        {data.map((item) => (
          <div key={item.name}>
            <span className="legend-dot" style={{ background: riskColors[item.name] }} />
            <span>{item.name}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchAndFilter({ search, setSearch, riskFilter, setRiskFilter }) {
  return (
    <div className="table-controls">
      <label className="search-box">
        <Search size={15} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by Block ID" aria-label="Search by block ID" />
      </label>
      <label className="filter-box">
        <span>Risk level</span>
        <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
          <option value="ALL">All levels</option>
          <option value="HIGH">High risk</option>
          <option value="MEDIUM">Medium risk</option>
          <option value="LOW">Low risk</option>
        </select>
        <ChevronDown size={14} />
      </label>
    </div>
  );
}

function BlockTable({ rows, loading, error, search, setSearch, riskFilter, setRiskFilter, selectBlock, onRetry, compact = false }) {
  if (loading && rows.length === 0) return <LoadingState label="Loading risk analysis…" />;
  if (error) return <ErrorState title="Unable to load block risk" error={error} onRetry={onRetry} />;

  return (
    <>
      <SearchAndFilter search={search} setSearch={setSearch} riskFilter={riskFilter} setRiskFilter={setRiskFilter} />
      {rows.length === 0 ? (
        <EmptyState title="No blocks match" copy="Try a different Block ID or risk level." />
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Block ID</th>
                <th>Age</th>
                <th>Seed</th>
                <th>Palms/ha</th>
                <th>{rows[0]?.Latest_Year ?? "Latest"} t/ha</th>
                <th>Expected t/ha</th>
                <th>Deviation</th>
                <th>Risk score</th>
                <th>Risk level</th>
                <th>Block risk contributors</th>
              </tr>
            </thead>
            <tbody>
              {(compact ? rows.slice(0, 8) : rows).map((block) => {
                const level = String(block.Multi_Source_Risk_Level ?? block.Block_Risk_Level ?? "UNKNOWN").toUpperCase();
                return (
                  <tr
                    key={block.Block_ID}
                    className="clickable-row"
                    onClick={() => selectBlock(block.Block_ID)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") selectBlock(block.Block_ID); }}
                  >
                    <td><strong className="block-id">{block.Block_ID}</strong></td>
                    <td>{formatNumber(block.Plant_Age_Years, 0)}</td>
                    <td>{block.Seed_Type || "—"}</td>
                    <td>{formatNumber(block.Palms_per_Ha, 1)}</td>
                    <td>{formatNumber(block.Actual_Productivity ?? block.Actual_Yield_t_Ha)}</td>
                    <td>{formatNumber(block.Expected_Yield_t_Ha)}</td>
                    <td className={Number(block.Productivity_Deviation_pct) < 0 ? "text-negative" : ""}>
                      {block.Productivity_Deviation_pct == null ? "—" : `${Number(block.Productivity_Deviation_pct) > 0 ? "+" : ""}${formatNumber(block.Productivity_Deviation_pct, 1)}%`}
                    </td>
                    <td>{formatNumber(block.Multi_Source_Risk_Score, 1)}</td>
                    <td><span className={`risk-badge ${level.toLowerCase()}`}><i />{level}</span></td>
                    <td>{block.Main_Contributing_Indicators || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function DiagnosticMetric({ label, value, suffix }) {
  return (
    <div className="diagnostic-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{suffix}</small>
    </div>
  );
}

function EmptyState({ title, copy }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Database size={18} /></span>
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

function LoadingOrEmpty({ loading, label }) {
  return loading ? <LoadingState label={label} /> : <EmptyState title="No data available" copy="The connected endpoint returned no records." />;
}

export default App;

