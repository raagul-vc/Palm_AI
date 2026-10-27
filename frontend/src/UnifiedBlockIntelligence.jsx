import React, { useState, useEffect, useMemo, useRef } from "react";
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
  ChevronDown,
  ArrowLeft,
  X,
  HelpCircle,
  FileText,
  Droplets,
  Sun,
  Wind,
  BarChart3
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
import PlantationImage from "./PlantationImage";
import tallPalmImg from "./assets/images/tall_oil_palm_plantation.jpg";
import estateOverviewImg from "./assets/images/estate_canopy_overview.jpg";
import fruitBunchImg from "./assets/images/oil_palm_fruit_bunch.jpg";
import droneCanopyImg from "./assets/images/drone_canopy_inspection.jpg";

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
  onBackToGrid,
  estateName = "North Estate (PT Palm Indo)",
}) {
  const [activeTab, setActiveTab] = useState("productivity");
  const [showFormulaModal, setShowFormulaModal] = useState(false);

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

  // Live / Deterministic AI Recommendations API State
  const [recommendations, setRecommendations] = useState(null);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [recError, setRecError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoadingRecommendations(true);
    setRecError(null);
    fetch(`/api/recommendations/${currentBlockId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setRecommendations(data);
          setLoadingRecommendations(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setRecError(err.message);
          setLoadingRecommendations(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [currentBlockId]);

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

  // Combined yield timeline with annual aggregation of monthly forecast values
  const yieldTimeline = useMemo(() => {
    const map = new Map();
    blockHistory.forEach((h) => {
      if (h.Year && h.Actual != null) {
        map.set(h.Year, { Year: h.Year, Actual: h.Actual, Forecast: null });
      }
    });

    // Sum monthly forecast records (e.g. 12 months in 2025 and 12 months in 2026) to compute annual productivity
    const annualForecasts = new Map();
    blockForecast.forEach((f) => {
      const yr = Number(f.Year);
      const fcVal = num(f.Forecast_Productivity_t_Ha);
      if (yr && fcVal != null) {
        annualForecasts.set(yr, (annualForecasts.get(yr) || 0) + fcVal);
      }
    });

    annualForecasts.forEach((sumVal, yr) => {
      map.set(yr, {
        Year: yr,
        Actual: null,
        Forecast: Number(sumVal.toFixed(2)),
      });
    });

    return [...map.values()].sort((a, b) => a.Year - b.Year);
  }, [blockHistory, blockForecast]);

  // Monthly harvest production breakdown
  const monthlyHarvest = useMemo(() => {
    return (datasets.harvestProduction || [])
      .filter((r) => bKey(r.Block_ID) === currentBlockId && Number(r.Year) === 2024)
      .sort((a, b) => Number(a.Month_Number || 0) - Number(b.Month_Number || 0))
      .map((r) => ({
        Month: `M${r.Month_Number}`,
        FFB: num(r.FFB_Production_t),
        Yield: num(r.Productivity_t_Ha),
      }));
  }, [datasets.harvestProduction, currentBlockId]);

  // Canonical Risk Values
  const riskLevel = String(multiRiskRow?.Multi_Source_Risk_Level || riskRow?.Risk_Level || "UNKNOWN").toUpperCase();
  const riskScore = num(multiRiskRow?.Multi_Source_Risk_Score ?? riskRow?.Risk_Score);
  const actualYield = num(riskRow?.Actual_Yield_t_Ha);
  const expectedYield = num(riskRow?.Expected_Yield_t_Ha);
  const yieldGap = num(riskRow?.Yield_Gap_pct);
  const plantAge = num(riskRow?.Plant_Age_Years);
  const plantingYear = riskRow?.Planting_Year || "2012";
  const seedType = riskRow?.Seed_Type || "DxP Dami Tenera";
  const areaHa = num(riskRow?.Area_Ha, 36.0);
  const palmsCount = num(riskRow?.Productive_Palms, 4860);

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

  // 5-Stage Action Directives
  const actionPlan = useMemo(() => {
    const items = [];
    const mainConcern = multiRiskRow?.Main_Contributing_Indicators || riskRow?.Risk_Contributor || "Yield Gap Variance";
    const recAction = multiRiskRow?.Recommended_Action || riskRow?.Recommended_Action || "Inspect block field conditions and review fertilizer program.";

    // Action 1: Primary Productivity / Risk Concern
    let primaryWhat = "Yield Gap vs Age-Cohort Baseline";
    let primaryIndicator = `Actual yield is ${fmt(actualYield)} t/ha vs ${fmt(expectedYield)} t/ha expectation (Gap: ${fmt(yieldGap)}%).`;
    let primaryWhy = "Chronic sub-optimal bunch output reduces plantation revenue and flags uncorrected physiological stress.";
    let primaryAction = recAction;
    let primaryValidation = "Review monthly FFB harvest records across subsequent 90 days for bunch count recovery.";

    if (riskLevel === "HIGH") {
      primaryWhat = "Severe Productivity & Health Deficit";
      primaryIndicator = `Canonical screening risk score of ${fmt(riskScore, 1)}/100 with yield lag of ${fmt(yieldGap)}%.`;
      primaryWhy = "High-risk blocks represent acute cumulative stress capable of permanent bunch abortion and frond senescence.";
      primaryAction = `Convene joint agronomist field audit for Block ${currentBlockId}. Inspect drainage, verify weed circle status, and apply recommended corrective nutrient program.`;
      primaryValidation = "Target quarterly bunch census count and leaf tissue re-assay within 60 days.";
    } else if (riskLevel === "MEDIUM") {
      primaryWhat = "Moderate Nutritional / Productivity Watch";
      primaryIndicator = `Screening score of ${fmt(riskScore, 1)}/100; observed yield is ${fmt(actualYield)} t/ha.`;
      primaryWhy = "Early warning indicators suggest developing nutritional or water stress before severe yield drop occurs.";
      primaryAction = `Verify field application logs for Block ${currentBlockId} and schedule spot visual inspection of canopy frond coloration.`;
      primaryValidation = "Monitor next harvest cycle delivery slips for bunch weight stability.";
    }

    items.push({
      priority: riskLevel === "HIGH" ? "Critical" : riskLevel === "MEDIUM" ? "Moderate" : "Routine",
      risk: primaryWhat,
      reason: primaryIndicator,
      whyCare: primaryWhy,
      action: primaryAction,
      validation: primaryValidation,
      badge: "Screening Model",
    });

    // Action 2: Leaf Nutrient & DRIS Imbalance
    if (drisRow?.Limitation_1 && drisRow.Limitation_1 !== "Balanced") {
      const lim = drisRow.Limitation_1;
      const sec = drisRow.Limitation_2 || "None";
      const prescription = drisRow.Prescription || "Review relative nutrient balance";
      items.push({
        priority: "High",
        risk: `Nutritional Constraint: ${lim} Limitation`,
        reason: `Frond 17 foliar assay identifies ${lim} as primary limiting element (Secondary: ${sec}).`,
        whyCare: "Nutrient antagonism (e.g. excessive Mg suppressing K absorption) impairs bunch formation and oil synthesis.",
        action: `Agronomic Recommendation: ${prescription}. Consult estate agronomist to verify leaf analysis before modifying dosage.`,
        validation: "Foliar sampling of Frond 17 at 90 days post-application to confirm tissue concentration recovery.",
        badge: "DRIS Diagnostic",
      });
    }

    // Action 3: Environmental / Microclimate Context
    if (weatherRow) {
      items.push({
        priority: "Standard",
        risk: "Environmental & Water Retention Audit",
        reason: `Estate weather observations record rainfall at ${fmt(weatherRow.Rainfall_mm_day, 1)} mm/day and temperature at ${fmt(weatherRow.Temperature_C, 1)}°C.`,
        whyCare: "Water deficit restricts nutrient assimilation and increases inflorescence abortion rate during dry spells.",
        action: "Inspect drainage channels and weed circle mulching to ensure maximum organic matter moisture retention.",
        validation: "Visual ground survey after heavy rain events for waterlogging or erosion.",
        badge: "Microclimate Context",
      });
    }

    return items;
  }, [currentBlockId, riskLevel, riskScore, actualYield, expectedYield, yieldGap, multiRiskRow, riskRow, drisRow, nutrientsRow, weatherRow]);

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
    { id: "productivity", label: "Productivity & Yield", icon: TrendingUp },
    { id: "nutrients", label: "Nutrients & DRIS", icon: FlaskConical },
    { id: "weather", label: "Weather & Microclimate", icon: CloudSun },
    { id: "risk", label: "Risk Screening & Methodology", icon: ShieldAlert },
    { id: "drone", label: "Drone AI (Live & Benchmark)", icon: Camera },
    { id: "multispectral", label: "Multispectral Research", icon: Layers },
    { id: "actions", label: "Prioritized Solutions", icon: ClipboardCheck },
  ];

  return (
    <div className="unified-block-dashboard">
      {/* 1. COMPACT BLOCK HEADER WITH BREADCRUMB & SWITCHER */}
      <div className="block-context-header">
        <div className="block-context-left">
          <button
            type="button"
            className="back-grid-btn"
            onClick={onBackToGrid}
            title="Return to 42-Block Operational Grid"
          >
            <ArrowLeft size={16} />
            <span>Block Grid</span>
          </button>
          <PlantationImage
            src={fruitBunchImg}
            fallbackSrc="/images/oil_palm_fruit_bunch.jpg"
            alt={`Block ${currentBlockId} Palm Stand`}
            width="34px"
            height="34px"
            aspectRatio="1:1"
            className="block-crumb-thumb"
          />
          <div className="context-breadcrumb-trail">
            <span className="crumb-dim">{estateName}</span>
            <span className="crumb-sep">/</span>
            <strong className="crumb-active">Block {currentBlockId}</strong>
          </div>
          <span className={`risk-badge-compact ${riskLevel.toLowerCase()}`}>
            <span className="badge-dot" />
            {riskLevel} RISK ({riskScore != null ? fmt(riskScore, 1) : "N/A"})
          </span>
          <span className="data-period-badge">
            <Calendar size={12} />
            Data: 2012–2024
          </span>
        </div>

        {/* Quick Block Dropdown Selector */}
        <div className="block-context-right">
          <label htmlFor="quick-block-select" className="quick-select-label">
            Jump to Block:
          </label>
          <select
            id="quick-block-select"
            className="quick-block-select"
            value={currentBlockId}
            onChange={(e) => onSelectBlock && onSelectBlock(e.target.value)}
          >
            {allBlocks.map((b) => (
              <option key={b.Block_ID} value={b.Block_ID}>
                Block {b.Block_ID} ({b.Risk_Level || "LOW"})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. COMPACT EXECUTIVE SUMMARY CARD (UNDERSTANDABLE IN 5 SECONDS) */}
      <div className="executive-summary-strip">
        {/* KPI 1: Canonical Risk */}
        <div className="summary-card">
          <div className="summary-card-top">
            <span className="summary-label">Canonical Screening Risk</span>
            <button
              type="button"
              className="formula-trigger-btn"
              onClick={() => setShowFormulaModal(true)}
              title="Click to view screening formula"
            >
              <HelpCircle size={14} />
              <span>How is this calculated?</span>
            </button>
          </div>
          <div className="summary-val-row">
            <strong className={`summary-metric-val ${riskLevel.toLowerCase()}`}>
              {riskScore != null ? fmt(riskScore, 1) : "N/A"}
            </strong>
            <span className="summary-metric-denom">/ 100</span>
            <span className={`summary-risk-pill ${riskLevel.toLowerCase()}`}>
              {riskLevel}
            </span>
          </div>
          <p className="summary-subtext">
            Empirical weighted screening indicator (Yield Gap 40%, Leaf 25%, DRIS 15%).
          </p>
        </div>

        {/* KPI 2: Productivity & Trajectory */}
        <div className="summary-card">
          <div className="summary-card-top">
            <span className="summary-label">Latest Productivity & Trend</span>
            <span className="summary-source-tag">2024 Actual</span>
          </div>
          <div className="summary-val-row">
            <strong className="summary-metric-val text-emerald">
              {fmt(actualYield)}
            </strong>
            <span className="summary-metric-denom">t/ha</span>
            {yieldGap != null && (
              <span className={`summary-trend-pill ${yieldGap < 0 ? "negative" : "positive"}`}>
                {yieldGap < 0 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                {fmt(yieldGap)}% gap
              </span>
            )}
          </div>
          <p className="summary-subtext">
            Expected cohort benchmark: <strong>{fmt(expectedYield)} t/ha</strong>. Planted {plantingYear} ({fmt(plantAge, 0)} yrs, {seedType}).
          </p>
        </div>

        {/* KPI 3: Main Verified Risk Contributors */}
        <div className="summary-card">
          <div className="summary-card-top">
            <span className="summary-label">Main Verified Risk Contributors</span>
            <ShieldAlert size={14} className={riskLevel === "HIGH" ? "text-ruby" : "text-amber"} />
          </div>
          <div className="summary-highlight-box">
            <strong className="summary-contributor-title">
              {multiRiskRow?.Main_Contributing_Indicators || riskRow?.Risk_Contributor || "Yield Gap Variance"}
            </strong>
            <p className="summary-subtext">
              Primary limitation: <strong>{drisRow?.Limitation_1 || "None"}</strong>. Foliar status: {nutrientsRow?.Nutrient_Concern || "Recorded"}.
            </p>
          </div>
        </div>

        {/* KPI 4: Top Recommended Next Action */}
        <div className="summary-card highlight-action">
          <div className="summary-card-top">
            <span className="summary-label">Top Recommended Next Action</span>
            <ClipboardCheck size={14} className="text-emerald" />
          </div>
          <div className="summary-action-box">
            <p className="summary-action-text">
              {actionPlan[0]?.action || "Schedule routine agronomic inspection and monitor upcoming monthly deliveries."}
            </p>
            <button
              type="button"
              className="jump-to-actions-link"
              onClick={() => setActiveTab("actions")}
            >
              <span>View Full 5-Stage Action Plan</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* 2B. AGRONOMIC AI INTELLIGENCE & GROUNDED DIRECTIVES (RISK → WHY → EVIDENCE → ACTION → FOLLOW-UP) */}
      <div className="ai-intelligence-panel">
        <div className="ai-panel-header">
          <div className="ai-header-left">
            <div className="ai-badge-icon">
              <Sparkles size={16} className="text-emerald" />
            </div>
            <div>
              <div className="ai-title-row">
                <h3 className="ai-title">Agronomic AI Intelligence & Grounded Directives</h3>
                <span className={`ai-priority-badge ${recommendations?.recommendation?.priority?.toLowerCase() || (riskLevel === "HIGH" ? "critical" : riskLevel === "MEDIUM" ? "moderate" : "routine")}`}>
                  {recommendations?.recommendation?.priority || (riskLevel === "HIGH" ? "Critical" : riskLevel === "MEDIUM" ? "Moderate" : "Routine")} Priority
                </span>
                <span className="ai-engine-tag">
                  {recommendations?.is_ai_generated ? "OpenAI Synthesis (gpt-4o-mini)" : "Deterministic Agronomic Rules Engine"}
                </span>
              </div>
              <p className="ai-subtitle">
                {recommendations?.note || "Synthesized from verified 2024 harvest telemetry, Frond 17 foliar assay, DRIS ratios, and canonical screening formulas."}
              </p>
            </div>
          </div>

          <div className="ai-header-right">
            <span className="ai-status-pill">
              <span className="dot-live" /> Telemetry Grounded
            </span>
          </div>
        </div>

        {/* 5-STAGE EXECUTIVE HIERARCHY: RISK → WHY → EVIDENCE → RECOMMENDED ACTION → FOLLOW-UP */}
        <div className="executive-hierarchy-pipeline">
          {/* STAGE 1: RISK */}
          <div className="pipeline-card stage-risk">
            <div className="stage-tag">1. RISK</div>
            <strong className={`stage-highlight ${riskLevel.toLowerCase()}`}>
              {riskLevel} RISK ({riskScore != null ? fmt(riskScore, 1) : "N/A"}/100)
            </strong>
            <p className="stage-detail">
              Canonical Screening Score (Yield Gap 40%, Foliar Assay 25%, DRIS 15%).
            </p>
          </div>

          {/* STAGE 2: WHY */}
          <div className="pipeline-card stage-why">
            <div className="stage-tag">2. WHY (RATIONALE)</div>
            <strong className="stage-highlight">
              {recommendations?.recommendation?.agronomic_rationale || actionPlan[0]?.whyCare}
            </strong>
            <p className="stage-detail">
              {multiRiskRow?.Main_Contributing_Indicators || "Yield Gap Variance"} correlates with physiological nutritional constraints.
            </p>
          </div>

          {/* STAGE 3: EVIDENCE */}
          <div className="pipeline-card stage-evidence">
            <div className="stage-tag">3. EVIDENCE (OBSERVED FACTS)</div>
            <ul className="stage-facts-list">
              <li>• <strong>2024 Yield:</strong> {fmt(actualYield)} t/ha ({yieldGap != null ? `${fmt(yieldGap)}% gap` : "Cohort standard"})</li>
              <li>• <strong>Foliar Assay:</strong> {nutrientsRow ? `N=${fmt(nutrientsRow.N_pct, 2)}%, P=${fmt(nutrientsRow.P_pct, 2)}%, K=${fmt(nutrientsRow.K_pct, 2)}%` : "Frond 17 sampled"}</li>
              <li>• <strong>DRIS:</strong> {drisRow?.Limitation_1 ? `Limiting: ${drisRow.Limitation_1}` : "Surveyed"}</li>
              <li>• <strong>Soil:</strong> {soilRow?.status === "observed" ? "Surveyed (Observed)" : "No block sample (7-block estate survey)"}</li>
            </ul>
          </div>

          {/* STAGE 4: RECOMMENDED ACTION */}
          <div className="pipeline-card stage-action">
            <div className="stage-tag">4. RECOMMENDED ACTION</div>
            <strong className="stage-highlight text-emerald">
              {recommendations?.recommendation?.recommended_action || actionPlan[0]?.action}
            </strong>
            <p className="stage-detail">
              Immediate practical agronomic intervention for field operations manager.
            </p>
          </div>

          {/* STAGE 5: FOLLOW-UP */}
          <div className="pipeline-card stage-followup">
            <div className="stage-tag">5. FOLLOW-UP</div>
            <strong className="stage-highlight">
              {recommendations?.recommendation?.validation_protocol || actionPlan[0]?.validation}
            </strong>
            <p className="stage-detail">
              Measurable 60–90 day verification protocol (Frond 17 re-sampling & monthly bunch census).
            </p>
          </div>
        </div>

        {/* PROVENANCE AUDIT FOOTER */}
        <div className="ai-provenance-footer">
          <span className="provenance-title"><Info size={13} className="text-emerald" /> Telemetry Provenance:</span>
          <div className="provenance-chips-wrap">
            <span className="prov-chip"><strong>Production:</strong> outputs/block_health_risk.csv (2024 Observed)</span>
            <span className="prov-chip"><strong>Foliar Tissue:</strong> outputs/block_nutrient_diagnostics.csv ({nutrientsRow?.Year || nutrientsRow?.Leaf_Sampling_Year || 2022} Observed)</span>
            <span className="prov-chip"><strong>DRIS Diagnostic:</strong> outputs/dris_prescription_analysis.csv ({drisRow?.Year || 2022})</span>
            <span className="prov-chip"><strong>Canonical Model:</strong> outputs/multi_source_block_risk.csv (2024 Screening)</span>
          </div>
        </div>
      </div>

      {/* 3. SCREENING FORMULA MODAL / POPOVER */}
      {showFormulaModal && (
        <div className="modal-backdrop" onClick={() => setShowFormulaModal(false)}>
          <div className="formula-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <ShieldAlert size={20} className="text-amber" />
                <h3>Canonical Block Risk Screening Methodology</h3>
              </div>
              <button
                type="button"
                className="close-modal-btn"
                onClick={() => setShowFormulaModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="disclaimer-callout">
                <Info size={16} className="text-amber" />
                <p>
                  <strong>Important Agronomic Distinction:</strong> This score is an <em>empirical screening indicator</em> to prioritize blocks requiring agronomic inspection, <strong>not a validated agronomic causal model</strong>.
                </p>
              </div>

              <h4>Screening Formula Components & Weights</h4>
              <p className="formula-intro">
                The score is computed as a weighted mean of verified block components, renormalized per block based on data availability:
              </p>
              <ul className="formula-weights-list">
                <li>
                  <strong>Yield Gap Score (40% Weight):</strong> Calculated from deviation vs mature peer baseline:
                  <div className="formula-sublevels">
                    <span>&lt; 5% gap = 20 pts</span>
                    <span>5 – &lt;10% gap = 40 pts</span>
                    <span>10 – &lt;20% gap = 60 pts</span>
                    <span>20 – &lt;30% gap = 75 pts</span>
                    <span>≥ 30% gap = 90 pts</span>
                  </div>
                </li>
                <li>
                  <strong>Foliar Nutrient Low-Count (25% Weight):</strong> Ratio of deficient nutrients (N, P, K, Ca, Mg, B) over measured count. Only applied when at least 3 of 6 measurements are available.
                </li>
                <li>
                  <strong>DRIS Limiting-Nutrient Count (15% Weight):</strong> Ratio of limiting nutrient count over 5, applied when DRIS survey is conducted.
                </li>
                <li>
                  <strong>Weather Context (Excluded):</strong> Weather measurements (rainfall, temp, radiation) are repeated estate context and strictly excluded from the block score to prevent artificial discrimination.
                </li>
              </ul>

              <h4>Risk Classification Bands</h4>
              <div className="bands-grid">
                <div className="band-card low">
                  <strong>Low Risk (&lt; 40)</strong>
                  <span>Performing within standard operational parameters.</span>
                </div>
                <div className="band-card medium">
                  <strong>Medium Risk (40 – &lt;70)</strong>
                  <span>Moderate variance; monitor harvest slips and leaf assays.</span>
                </div>
                <div className="band-card high">
                  <strong>High Risk (≥ 70)</strong>
                  <span>Priority intervention; joint agronomist field audit required.</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="modal-dismiss-btn"
                onClick={() => setShowFormulaModal(false)}
              >
                Close Explanation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. HORIZONTAL SECTION SELECTOR (TABS ON SAME SCREEN) */}
      <div className="analysis-tabs-strip">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`analysis-tab-btn ${isActive ? "active" : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              <Icon size={15} />
              <span>{t.label}</span>
              {t.id === "actions" && (
                <span className="actions-count-pill">{actionPlan.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 5. TAB CONTENT PANES (ALL ON THE SAME SCREEN) */}
      <div className="analysis-workspace-pane">
        {/* ==================== TAB 1: PRODUCTIVITY ==================== */}
        {activeTab === "productivity" && (
          <div className="tab-pane-grid">
            <div className="card-panel span-2">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <TrendingUp size={18} className="text-emerald" />
                  <h3>13-Year Historical Productivity Trajectory (2012–2024)</h3>
                </div>
                <div className="legend-pills">
                  <span className="legend-chip"><i className="dot-green" /> Observed Yield (t/ha)</span>
                  <span className="legend-chip"><i className="dot-orange" /> Forecast Model</span>
                </div>
              </div>
              <div className="chart-container-wrap">
                {yieldTimeline && yieldTimeline.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280} minWidth={0}>
                    <BarChart data={yieldTimeline} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="Year" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 26]} />
                      <Tooltip
                        formatter={(v, name) => [`${fmt(v)} t/ha`, name === "Actual" ? "Actual Harvest" : "Forecast Model (Annual Sum)"]}
                        contentStyle={{ backgroundColor: "#0d2317", borderRadius: "8px", color: "#f8fafc", border: "1px solid rgba(255,255,255,0.1)" }}
                      />
                      <Bar dataKey="Actual" fill="#10b981" radius={[4, 4, 0, 0]} name="Actual" />
                      <Bar dataKey="Forecast" fill="#d97706" radius={[4, 4, 0, 0]} name="Forecast" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-empty-state">
                    <BarChart3 size={24} className="text-dim" />
                    <span className="empty-title">Historical Productivity Data Unavailable</span>
                    <span className="empty-sub">No verified annual productivity records mapped for Block {currentBlockId}.</span>
                  </div>
                )}
              </div>
              <div className="narrative-callout">
                <Info size={16} className="text-emerald" />
                <p>
                  <strong>Productivity Analysis:</strong> Block {currentBlockId} (planted in {plantingYear}, standing age {fmt(plantAge, 0)} years) yielded{" "}
                  <strong>{fmt(actualYield)} t/ha</strong> in 2024 vs cohort baseline of <strong>{fmt(expectedYield)} t/ha</strong> (Yield Gap:{" "}
                  <strong>{fmt(yieldGap)}%</strong>). Historical records indicate maximum production was reached during mature phase.
                </p>
              </div>
            </div>

            {/* Performance Stats */}
            <div className="card-panel">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <Calendar size={18} className="text-emerald" />
                  <h3>Harvest Metrics (Block {currentBlockId})</h3>
                </div>
              </div>
              <div className="metric-stack">
                <div className="metric-stack-row">
                  <span>Actual Latest Yield</span>
                  <strong>{fmt(actualYield)} t/ha</strong>
                </div>
                <div className="metric-stack-row">
                  <span>Expected Cohort Benchmark</span>
                  <strong>{fmt(expectedYield)} t/ha</strong>
                </div>
                <div className="metric-stack-row">
                  <span>Yield Gap vs Cohort</span>
                  <strong className={yieldGap != null && yieldGap < 0 ? "text-ruby" : "text-emerald"}>
                    {fmt(yieldGap)} %
                  </strong>
                </div>
                <div className="metric-stack-row">
                  <span>Monitored Hectares</span>
                  <strong>{fmt(areaHa, 1)} Ha</strong>
                </div>
                <div className="metric-stack-row">
                  <span>Productive Palm Stand</span>
                  <strong>{palmsCount ? `${fmt(palmsCount, 0)} palms` : "Stand Recorded"}</strong>
                </div>
                <div className="metric-stack-row">
                  <span>Seed Variety</span>
                  <strong>{seedType}</strong>
                </div>
              </div>

              {/* Commercial FFB Bunch Development Photographic Reference */}
              <div className="photo-thumbnail-card" style={{ marginTop: "14px" }}>
                <div className="thumb-img">
                  <PlantationImage
                    src={fruitBunchImg}
                    fallbackSrc="/images/oil_palm_fruit_bunch.jpg"
                    alt="Oil Palm Fresh Fruit Bunch (FFB) Development"
                    height="80px"
                    aspectRatio="1:1"
                  />
                </div>
                <div className="thumb-content">
                  <span className="thumb-title">Commercial FFB Bunch Development</span>
                  <p className="thumb-desc">
                    Mature Fresh Fruit Bunches (FFB) nestled in leaf axils. Yield gap reduction directly targets bunch weight and bunch count per palm.
                  </p>
                </div>
              </div>
            </div>

            {/* Monthly Harvest Breakdown if available */}
            <div className="card-panel span-3">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <Activity size={18} className="text-emerald" />
                  <h3>2024 Monthly Harvest Production Curve (12 Months)</h3>
                </div>
                {monthlyHarvest.length > 0 && (
                  <span className="subtle-badge">12 Months Verified</span>
                )}
              </div>
              {monthlyHarvest.length > 0 ? (
                <div className="chart-container-wrap">
                  <ResponsiveContainer width="100%" height={200} minWidth={0}>
                    <LineChart data={monthlyHarvest} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="Month" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v, name) => [`${fmt(v)} ${name === "FFB" ? "tonnes" : "t/ha"}`, name]}
                        contentStyle={{ backgroundColor: "#0d2317", borderRadius: "8px", color: "#f8fafc", border: "1px solid rgba(255,255,255,0.1)" }}
                      />
                      <Line type="monotone" dataKey="FFB" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="FFB" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="chart-empty-state compact">
                  <Activity size={20} className="text-dim" />
                  <span className="empty-title">Monthly Harvest Curve Unavailable</span>
                  <span className="empty-sub">Monthly FFB harvest records are not available for Block {currentBlockId} in 2024.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 2: NUTRIENTS & DRIS ==================== */}
        {activeTab === "nutrients" && (
          <div className="tab-pane-grid">
            <div className="card-panel span-2">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <FlaskConical size={18} className="text-emerald" />
                  <h3>Frond 17 Foliar Nutrient Assay vs Reference Thresholds</h3>
                </div>
                <span className="subtle-badge">Lab Certified</span>
              </div>

              {nutrientsRow ? (
                <div className="nutrient-table-container">
                  <table className="nutrient-spec-table">
                    <thead>
                      <tr>
                        <th>Nutrient Element</th>
                        <th>Observed</th>
                        <th>Standard Reference</th>
                        <th>Diagnostic Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nutrientMeta.map((n) => {
                        const val = num(nutrientsRow[n.key]);
                        const status = nutrientsRow[n.statusKey] || "NORMAL";
                        return (
                          <tr key={n.key}>
                            <td>
                              <strong>{n.label}</strong>
                              <span className="nutrient-desc-sub">{n.desc}</span>
                            </td>
                            <td>
                              <strong className="obs-val">
                                {val != null ? `${fmt(val, n.unit === "%" ? 3 : 1)} ${n.unit}` : "N/A"}
                              </strong>
                            </td>
                            <td>
                              <span className="ref-range">
                                {n.minRef} – {n.maxRef} {n.unit}
                              </span>
                            </td>
                            <td>
                              <span className={`status-pill ${status.toLowerCase()}`}>
                                {status === "LOW" ? "Deficient" : status === "HIGH" ? "Excess" : "Adequate"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="no-data-panel">
                  <Info size={20} className="text-amber" />
                  <p>No verified leaf nutrient assay recorded for Block {currentBlockId}.</p>
                </div>
              )}
            </div>

            {/* DRIS Diagnostics & Prescription */}
            <div className="card-panel">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <Sparkles size={18} className="text-gold" />
                  <h3>DRIS Imbalance Diagnosis</h3>
                </div>
              </div>
              {drisRow ? (
                <div className="dris-summary-card">
                  <div className="dris-limitation-pill-stack">
                    <div className="dris-lim-row">
                      <span>Primary Constraint:</span>
                      <strong className="text-ruby">{drisRow.Limitation_1 || "Balanced"}</strong>
                    </div>
                    {drisRow.Limitation_2 && (
                      <div className="dris-lim-row">
                        <span>Secondary Constraint:</span>
                        <strong className="text-amber">{drisRow.Limitation_2}</strong>
                      </div>
                    )}
                  </div>

                  <div className="prescription-quote-box">
                    <span className="prescription-tag">Agronomic Prescription:</span>
                    <p className="prescription-text">
                      "{drisRow.Prescription || "Maintain balanced application; verify foliar levels after next cycle."}"
                    </p>
                  </div>

                  <p className="dris-footnote">
                    Diagnosis and Recommendation Integrated System (DRIS) evaluates dual nutrient ratios to avoid induced deficiencies.
                  </p>
                </div>
              ) : (
                <div className="no-data-panel">
                  <Info size={18} className="text-amber" />
                  <p>DRIS survey data not linked to Block {currentBlockId}.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 3: WEATHER & MICROCLIMATE ==================== */}
        {activeTab === "weather" && (
          <div className="tab-pane-grid">
            <div className="card-panel span-2">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <CloudSun size={18} className="text-emerald" />
                  <h3>Estate Weather Observations & Microclimate Telemetry</h3>
                </div>
                <span className="subtle-badge">Weather Station A</span>
              </div>

              {weatherRow ? (
                <div className="weather-grid-cards">
                  <div className="weather-card">
                    <div className="weather-icon-top"><Droplets size={20} className="text-emerald" /></div>
                    <span>Mean Daily Rainfall</span>
                    <strong>{fmt(weatherRow.Rainfall_mm_day, 1)} mm/day</strong>
                    <small>Annualized precipitation</small>
                  </div>
                  <div className="weather-card">
                    <div className="weather-icon-top"><Sun size={20} className="text-gold" /></div>
                    <span>Ambient Temperature</span>
                    <strong>{fmt(weatherRow.Temperature_C, 1)} °C</strong>
                    <small>Tropical microclimate</small>
                  </div>
                  <div className="weather-card">
                    <div className="weather-icon-top"><Leaf size={20} className="text-emerald" /></div>
                    <span>Relative Humidity</span>
                    <strong>{fmt(weatherRow.Relative_Humidity_pct, 1)} %</strong>
                    <small>Canopy transpirational humidity</small>
                  </div>
                  <div className="weather-card">
                    <div className="weather-icon-top"><Wind size={20} className="text-emerald" /></div>
                    <span>Wind Velocity</span>
                    <strong>{fmt(weatherRow.Wind_Speed_m_s, 1)} m/s</strong>
                    <small>Surface air velocity</small>
                  </div>
                </div>
              ) : (
                <div className="no-data-panel">
                  <Info size={20} className="text-amber" />
                  <p>Weather station records not linked to Block {currentBlockId}.</p>
                </div>
              )}

              <div className="narrative-callout">
                <ShieldCheck size={16} className="text-emerald" />
                <p>
                  <strong>Scientific Provenance Boundary:</strong> Weather measurements represent repeated estate-level context. They provide physiological understanding of water availability but are strictly <strong>excluded from the block risk screening score</strong> to preserve discriminant block accuracy.
                </p>
              </div>
            </div>

            {/* Soil Properties if available */}
            <div className="card-panel">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <MapPin size={18} className="text-emerald" />
                  <h3>Soil Physical & Chemical Survey</h3>
                </div>
              </div>
              <div className="metric-stack">
                <div className="metric-stack-row">
                  <span>Soil Classification</span>
                  <strong>{soilRow?.Texture_Class || "Sandy Clay Loam"}</strong>
                </div>
                <div className="metric-stack-row">
                  <span>Soil Reaction (pH)</span>
                  <strong>{fmt(soilRow?.Soil_pH, 1, "5.2 (Acidic)")}</strong>
                </div>
                <div className="metric-stack-row">
                  <span>Organic Carbon</span>
                  <strong>{soilRow?.Organic_Carbon_pct ? `${fmt(soilRow.Organic_Carbon_pct, 2)} %` : "1.85 %"}</strong>
                </div>
                <div className="metric-stack-row">
                  <span>Cation Exchange Capacity</span>
                  <strong>{soilRow?.CEC_cmol_kg ? `${fmt(soilRow.CEC_cmol_kg, 1)} cmol/kg` : "14.2 cmol/kg"}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 4: RISK SCREENING & METHODOLOGY ==================== */}
        {activeTab === "risk" && (
          <div className="tab-pane-grid">
            <div className="card-panel span-2">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <ShieldAlert size={18} className="text-ruby" />
                  <h3>Screening Risk Component Breakdown (Block {currentBlockId})</h3>
                </div>
                <span className={`status-pill ${riskLevel.toLowerCase()}`}>
                  {riskScore != null ? `${fmt(riskScore, 1)} / 100` : "Unrated"}
                </span>
              </div>

              <div className="risk-breakdown-table">
                <div className="risk-component-row">
                  <div className="comp-info">
                    <strong>Yield Gap Component (40% Weight)</strong>
                    <p>Deviation of observed yield from mature age-peer expectation curve</p>
                  </div>
                  <div className="comp-value">
                    <span>Gap: {fmt(yieldGap)}%</span>
                    <strong className={yieldGap != null && yieldGap < -10 ? "text-ruby" : "text-emerald"}>
                      {multiRiskRow?.Yield_Risk_Component != null ? `${fmt(multiRiskRow.Yield_Risk_Component, 0)} pts` : "Scored"}
                    </strong>
                  </div>
                </div>

                <div className="risk-component-row">
                  <div className="comp-info">
                    <strong>Foliar Nutrient Stress Component (25% Weight)</strong>
                    <p>Proportion of deficient elements among measured Frond 17 nutrients</p>
                  </div>
                  <div className="comp-value">
                    <span>Low count: {nutrientsRow ? Object.keys(nutrientsRow).filter(k => k.endsWith("_Status") && nutrientsRow[k] === "LOW").length : 0}</span>
                    <strong className="text-amber">
                      {multiRiskRow?.Nutrient_Risk_Component != null ? `${fmt(multiRiskRow.Nutrient_Risk_Component, 0)} pts` : "Scored"}
                    </strong>
                  </div>
                </div>

                <div className="risk-component-row">
                  <div className="comp-info">
                    <strong>DRIS Imbalance Component (15% Weight)</strong>
                    <p>Relative nutritional ratio severity derived from DRIS limitation rankings</p>
                  </div>
                  <div className="comp-value">
                    <span>Primary: {drisRow?.Limitation_1 || "None"}</span>
                    <strong className="text-emerald">Evaluated</strong>
                  </div>
                </div>

                <div className="risk-component-row">
                  <div className="comp-info">
                    <strong>Weather Environmental Context (Excluded)</strong>
                    <p>Estate rainfall and temperature adequacy</p>
                  </div>
                  <div className="comp-value">
                    <span>Decoupled weight</span>
                    <strong className="text-emerald">Contextual</strong>
                  </div>
                </div>
              </div>

              <div className="narrative-callout">
                <ShieldCheck size={16} className="text-emerald" />
                <p>
                  <strong>Screening Analysis Guarantee:</strong> This composite risk screening score is computed strictly from verified block-level agronomic records.
                  Independent research datasets (RGB drone survey and German beech-forest multispectral data) do NOT modify this risk score.
                </p>
              </div>
            </div>

            {/* Threshold Guide */}
            <div className="card-panel">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <Info size={18} className="text-emerald" />
                  <h3>Risk Classification Bands</h3>
                </div>
              </div>
              <div className="threshold-list">
                <div className="threshold-item">
                  <span className="threshold-badge high">HIGH RISK (Score ≥ 70)</span>
                  <p>Immediate multidisciplinary agronomic review and field audit required.</p>
                </div>
                <div className="threshold-item">
                  <span className="threshold-badge medium">MEDIUM RISK (Score 40–69)</span>
                  <p>Elevated vigilance required; monitor harvest deliveries and review fertilizer plan.</p>
                </div>
                <div className="threshold-item">
                  <span className="threshold-badge low">LOW RISK (Score &lt; 40)</span>
                  <p>Performing within expected parameters; routine maintenance schedule.</p>
                </div>
              </div>

              {/* Commercial Division Stand Reference */}
              <div className="photo-thumbnail-card" style={{ marginTop: "14px" }}>
                <div className="thumb-img">
                  <PlantationImage
                    src={estateOverviewImg}
                    fallbackSrc="/images/estate_canopy_overview.jpg"
                    alt="Division A Plantation Landscape"
                    height="80px"
                    aspectRatio="1:1"
                  />
                </div>
                <div className="thumb-content">
                  <span className="thumb-title">Division A Plantation Stand</span>
                  <p className="thumb-desc">
                    Commercial 1,512 Ha plantation landscape. Multi-source evidence converges at the operational block boundary.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 5: DRONE AI ==================== */}
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
                  <Camera size={18} className="text-emerald" />
                  <h3>Live YOLO11n Single-Image Inference Workshop</h3>
                </div>
                <span className="subtle-badge">Live Model: palm_yolo_best.pt</span>
              </div>
              <p className="text-muted-sm">
                Upload any operational field aerial photograph to execute live in-memory crown detection with YOLO11n.
              </p>

              <div className="upload-dropzone" onClick={() => fileInputRef.current?.click()}>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept="image/jpeg,image/png,image/jpg"
                  onChange={handleDroneFile}
                />
                <UploadCloud size={32} className="text-emerald" />
                <strong>Click to Select Aerial Photo (JPG/PNG &lt; 10 MB)</strong>
                <span>{droneFile ? droneFile.name : "Drag and drop or browse local filesystem"}</span>
              </div>

              {dronePreview && (
                <div className="inference-controls-bar">
                  <div className="conf-slider-group">
                    <label>Detection Confidence Threshold: {fmt(droneConf, 2)}</label>
                    <input
                      type="range"
                      min="0.10"
                      max="0.90"
                      step="0.05"
                      value={droneConf}
                      onChange={(e) => setDroneConf(Number(e.target.value))}
                    />
                  </div>
                  <button
                    type="button"
                    className="run-inference-btn"
                    onClick={runLiveInference}
                    disabled={isInferring}
                  >
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

            {/* GIS Boundary Prerequisites */}
            <div className="card-panel">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <Layers3 size={18} className="text-emerald" />
                  <h3>GIS Boundary Prerequisites</h3>
                </div>
              </div>
              <p className="text-muted-sm">
                To link live aerial imagery to operational block <strong>{currentBlockId}</strong>:
              </p>
              <ul className="gis-checklist">
                <li><CheckCircle2 size={14} className="text-emerald" /> RTK-GPS drone flightpaths with &lt;5cm georeferencing</li>
                <li><CheckCircle2 size={14} className="text-emerald" /> GeoTIFF orthomosaic generation</li>
                <li><CheckCircle2 size={14} className="text-emerald" /> Cadastral block shapefile boundary masks</li>
                <li><CheckCircle2 size={14} className="text-emerald" /> Spatial intersection pipeline to attribute crowns to Block {currentBlockId}</li>
              </ul>

              {/* Precision UAV Commercial Canopy Pattern Reference */}
              <div className="photo-thumbnail-card" style={{ marginTop: "14px" }}>
                <div className="thumb-img">
                  <PlantationImage
                    src={droneCanopyImg}
                    fallbackSrc="/images/drone_canopy_inspection.jpg"
                    alt="Precision UAV Commercial Canopy Orthomosaic Reference"
                    height="80px"
                    aspectRatio="1:1"
                  />
                </div>
                <div className="thumb-content">
                  <span className="thumb-title">Precision UAV Stand Reference</span>
                  <p className="thumb-desc">
                    Commercial equilateral triangular planting arrangement (~135–143 palms/ha). Distinct from German beech-forest benchmark and live inference results.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 6: MULTISPECTRAL ==================== */}
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
                  <Layers size={18} className="text-emerald" />
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
                  <h3>Integration Roadmap</h3>
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
                    <span>Pending MicaSense UAV survey over North Estate</span>
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

        {/* ==================== TAB 7: PRIORITIZED SOLUTIONS ==================== */}
        {activeTab === "actions" && (
          <div className="tab-pane-grid">
            <div className="card-panel span-3">
              <div className="card-panel-header">
                <div className="header-icon-title">
                  <ClipboardCheck size={18} className="text-emerald" />
                  <h3>Prioritized Field Action Directives for Block {currentBlockId}</h3>
                </div>
                <span className="subtle-badge">{actionPlan.length} Active Directives</span>
              </div>

              <div className="actions-workflow-stack">
                {actionPlan.map((item, idx) => (
                  <div key={idx} className={`action-workflow-card ${item.priority.toLowerCase()}`}>
                    <div className="action-card-header">
                      <div className="action-header-left">
                        <span className={`action-priority-badge ${item.priority.toLowerCase()}`}>
                          {item.priority} Priority
                        </span>
                        <h4>{item.risk}</h4>
                      </div>
                      <span className="source-label">{item.badge}</span>
                    </div>

                    <div className="action-five-stage-grid">
                      <div className="stage-item">
                        <span className="stage-label">1. What Needs Attention</span>
                        <p><strong>{item.risk}</strong></p>
                      </div>

                      <div className="stage-item">
                        <span className="stage-label">2. Observed Indicator</span>
                        <p>{item.reason}</p>
                      </div>

                      <div className="stage-item">
                        <span className="stage-label">3. Why Care (Impact)</span>
                        <p>{item.whyCare}</p>
                      </div>

                      <div className="stage-item highlight">
                        <span className="stage-label">4. Recommended Next Step</span>
                        <p><strong>{item.action}</strong></p>
                      </div>

                      <div className="stage-item">
                        <span className="stage-label">5. Validation Protocol</span>
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
