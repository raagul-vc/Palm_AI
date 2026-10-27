import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ClipboardCheck, Download, Filter, CheckCircle2, Clock3, CircleAlert,
  Sprout, ScanSearch, Layers3, ArrowUpRight, ArrowRight, RotateCcw, Sparkles,
  ShieldAlert, Info, Calendar, ChevronRight, AlertTriangle, UserCheck,
  FileText, ExternalLink, ShieldCheck, CheckSquare, Square, Search, XCircle
} from "lucide-react";
import "./FieldActionCenter.css";

const STORAGE_KEY = "palm-ai-field-action-status-v2";
const statusOptions = ["OPEN", "IN REVIEW", "VERIFYING IN FIELD", "COMPLETED"];

function safeNum(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(value, digits = 1, fallback = "N/A") {
  const n = safeNum(value);
  if (n == null) return fallback;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Natural numerical sort for operational blocks: B001, B002 ... B010 ... B042
 */
function naturalSortKey(bid) {
  const match = String(bid || "").match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

/**
 * Builds rich, evidence-grounded action items for all blocks and benchmark tiles.
 */
function buildActionItems(datasets) {
  const items = [];

  // 1. Build lookup maps for foliar, dris, and soil
  const nutMap = new Map();
  (datasets.nutrients || []).forEach((n) => {
    const bid = String(n.Block_ID || "").trim().toUpperCase();
    if (bid) nutMap.set(bid, n);
  });

  const drisMap = new Map();
  (datasets.dris || []).forEach((d) => {
    const bid = String(d.Block_ID || "").trim().toUpperCase();
    if (bid) drisMap.set(bid, d);
  });

  const soilMap = new Map();
  (datasets.soil || []).forEach((s) => {
    const bid = String(s.Block_ID || "").trim().toUpperCase();
    if (bid) soilMap.set(bid, s);
  });

  const riskMap = new Map();
  (datasets.risk || []).forEach((r) => {
    const bid = String(r.Block_ID || "").trim().toUpperCase();
    if (bid) riskMap.set(bid, r);
  });

  // 2. Process all operational blocks from multiRisk or risk
  const processedBlocks = [...(datasets.multiRisk || datasets.risk || [])].map((r) => {
    const bid = String(r.Block_ID || "").trim().toUpperCase();
    const riskRow = riskMap.get(bid) || {};
    const nutRow = nutMap.get(bid) || {};
    const drisRow = drisMap.get(bid) || {};
    const soilRow = soilMap.get(bid) || {};

    const riskLevel = String(r.Multi_Source_Risk_Level || r.Risk_Level || "LOW").toUpperCase();
    const riskScore = safeNum(r.Multi_Source_Risk_Score ?? r.Risk_Score, 0.0);
    const actualYield = safeNum(r.Actual_Productivity ?? riskRow.Actual_Yield_t_Ha);
    const expectedYield = safeNum(riskRow.Expected_Yield_t_Ha);
    const yieldGap = safeNum(r.Productivity_Deviation_pct ?? riskRow.Yield_Gap_pct);
    const plantAge = safeNum(riskRow.Plant_Age_Years, 12);
    const seedType = riskRow.Seed_Type || "DxP Hybrid";
    const plantingYear = riskRow.Planting_Year || "2012";

    // Foliar status
    const leafYear = nutRow.Year || nutRow.Leaf_Sampling_Year || 2022;
    const lowNutrients = [];
    ["N", "P", "K", "Ca", "Mg", "B"].forEach((elem) => {
      if (nutRow[`${elem}_pct_Status`] === "LOW" || nutRow[`${elem}_ppm_Status`] === "LOW") {
        lowNutrients.push(elem);
      }
    });

    // DRIS limitations
    const limitingNutrients = [];
    if (drisRow.Limitation_1 && drisRow.Limitation_1 !== "None") limitingNutrients.push(drisRow.Limitation_1);
    if (drisRow.Limitation_2 && drisRow.Limitation_2 !== "None") limitingNutrients.push(drisRow.Limitation_2);
    if (drisRow.Limitation_3 && drisRow.Limitation_3 !== "None") limitingNutrients.push(drisRow.Limitation_3);

    // Soil status (strictly only 7 blocks have observed soil tests)
    const hasSoil = soilRow.status === "observed" || soilRow.pH_H2O != null;

    // Data coverage limitations
    const limitations = [];
    if (nutRow.B_ppm == null || nutRow.B_ppm === "") {
      limitations.append ? limitations.push("Boron (B) foliar analysis unrecorded.") : limitations.push("Boron (B) foliar analysis unrecorded.");
    }
    if (!hasSoil) {
      limitations.push("No block soil sample (estate survey conducted on 7 index blocks only).");
    }
    limitations.push("Weather is estate-wide average (excluded from block risk).");
    limitations.push("Drone RGB & multispectral imagery are unmapped benchmarks (0% risk influence).");

    // Priority & Urgency
    let priority = "ROUTINE";
    let urgency = "Standard Schedule (Quarterly Review)";
    if (riskLevel === "HIGH") {
      priority = "CRITICAL";
      urgency = "Immediate Intervention (Within 48 Hours)";
    } else if (riskLevel === "MEDIUM") {
      priority = "ELEVATED";
      urgency = "Targeted Audit (Within 14 Days)";
    }

    // Recommended Action (strictly evidence grounded)
    let recommendedAction = r.Recommended_Action;
    if (!recommendedAction) {
      if (riskLevel === "HIGH") {
        recommendedAction = `Convene joint agronomy audit for Block ${bid}. Review weed circle upkeep, check field drainage channels, and execute prescribed foliar balancing: ${drisRow.Prescription || "Consult estate agronomist for targeted foliar correction."}`;
      } else if (riskLevel === "MEDIUM") {
        recommendedAction = `Verify field application logs for Block ${bid} and schedule spot canopy greenness inspection. Follow recommendation: ${drisRow.Prescription || "Review nutrient distribution and broadcast uniformity."}`;
      } else {
        recommendedAction = "Maintain standard circular weeding, weed circle upkeep, and scheduled standard fertilizer broadcast rounds.";
      }
    }

    // Follow-up protocol
    const followUpProtocol = riskLevel === "HIGH"
      ? "Conduct Frond 17 foliar re-sampling at 60–90 days; target quarterly bunch census count."
      : riskLevel === "MEDIUM"
        ? "Monitor monthly bunch delivery weights across the upcoming 3 harvest rounds."
        : "Routine annual foliar assay and standard monthly yield tracking.";

    // Contributing indicators text
    const contributor = r.Main_Contributing_Indicators || r.Risk_Contributor || (
      yieldGap != null && yieldGap < -10 ? `Yield deficit (${fmt(yieldGap)}% vs peer baseline)` : "Nutrient ratio balance"
    );

    return {
      id: `block-${bid}`,
      source: "PALM AI Operational Plantation",
      sourceType: "agronomic",
      type: "Operational Block Directive",
      blockId: bid,
      target: `Block ${bid}`,
      riskLevel,
      riskScore,
      priority,
      urgency,
      mainIndicators: contributor,
      recommendedAction,
      followUpProtocol,
      dataLimitations: limitations,
      observations: {
        yield: {
          actual: actualYield,
          expected: expectedYield,
          gap: yieldGap,
          year: 2024,
        },
        foliar: {
          year: leafYear,
          n: safeNum(nutRow.N_pct),
          p: safeNum(nutRow.P_pct),
          k: safeNum(nutRow.K_pct),
          ca: safeNum(nutRow.Ca_pct),
          mg: safeNum(nutRow.Mg_pct),
          b: safeNum(nutRow.B_ppm),
          lowCount: lowNutrients.length,
          lowList: lowNutrients,
        },
        dris: {
          limiting: limitingNutrients,
          prescription: drisRow.Prescription || "Maintain balanced fertilizer application.",
          sampleYear: drisRow.Year || 2022,
        },
        soil: {
          hasSample: hasSoil,
          ph: safeNum(soilRow.pH_H2O),
          cOrg: safeNum(soilRow.C_Organic_pct),
          pAvail: safeNum(soilRow.P_Available_ppm),
          status: hasSoil ? "Observed Field Sample" : "Unavailable (Unsampled Block)",
        },
        stand: {
          age: plantAge,
          seed: seedType,
          planted: plantingYear,
        }
      },
      provenance: "Ground-truth harvest scales (2012–2024) & certified commercial foliar laboratory assays (Frond 17)."
    };
  });

  // Sort blocks: High risk first, then Medium, then Low, with natural numerical secondary sort
  processedBlocks.sort((a, b) => {
    if (b.riskScore !== a.riskScore) return (b.riskScore || 0) - (a.riskScore || 0);
    return naturalSortKey(a.blockId) - naturalSortKey(b.blockId);
  });

  items.push(...processedBlocks);

  // 3. RGB UAV Benchmark items (Unmapped)
  const droneOutliers = [...(datasets.droneImages || [])]
    .filter((r) => r.is_outlier || String(r.health_category || "").toUpperCase() === "LOW" || (safeNum(r.drone_health_score) ?? 100) < 60)
    .sort((a, b) => (safeNum(a.drone_health_score) ?? 100) - (safeNum(b.drone_health_score) ?? 100))
    .slice(0, 8);

  droneOutliers.forEach((r) => {
    items.push({
      id: `drone-${r.image_filename || r.image_id}`,
      source: "RGB UAV Benchmark (MOPAD Site 2)",
      sourceType: "rgb_uav",
      type: "Image Tile Review (Unmapped)",
      target: r.image_filename || `Image ${r.image_id}`,
      blockId: null,
      riskLevel: (safeNum(r.drone_health_score) ?? 100) < 40 ? "HIGH" : "MEDIUM",
      riskScore: safeNum(r.drone_health_score),
      priority: (safeNum(r.drone_health_score) ?? 100) < 40 ? "CRITICAL" : "ELEVATED",
      urgency: "Visual Inspection (Research Benchmark)",
      mainIndicators: r.outlier_categories || `${r.non_healthy_palm_percentage ?? "N/A"}% non-healthy detected palms`,
      recommendedAction: "Review annotated bounding boxes on the UAV image canvas; inspect flagged palm crowns during scheduled field inspection before applying corrective maintenance.",
      followUpProtocol: "Ground-truth canopy condition with GPS-tagged inspection and compare against operational harvest scale records.",
      dataLimitations: ["Tile lacks GPS EXIF tags and is not mapped to operational plantation blocks B001–B042."],
      provenance: "MOPAD Site 2 aerial survey crop (1024x1024 px); independent visual evidence, not an operational block record.",
      observations: null,
    });
  });

  // 4. Multispectral UAV Benchmark items (Unmapped, German Beech Forest)
  const spectralTiles = [...(datasets.multispectralTiles || [])]
    .filter((r) => /moderate|depressed|background/i.test(String(r.vigour_category || "")) || (safeNum(r.multispectral_health_score) ?? 100) < 80)
    .sort((a, b) => (safeNum(a.multispectral_health_score) ?? 100) - (safeNum(b.multispectral_health_score) ?? 100))
    .slice(0, 6);

  spectralTiles.forEach((r) => {
    items.push({
      id: `spectral-${r.tile_id}`,
      source: "Multispectral UAV Benchmark (MSUAV500K)",
      sourceType: "multispectral",
      type: "GeoTIFF Tile Review (Demo Only)",
      target: r.tile_id ? `Tile ${r.tile_id}` : (r.filename || "GeoTIFF Tile"),
      blockId: null,
      riskLevel: (safeNum(r.multispectral_health_score) ?? 100) < 60 ? "HIGH" : "MEDIUM",
      riskScore: safeNum(r.multispectral_health_score),
      priority: (safeNum(r.multispectral_health_score) ?? 100) < 60 ? "CRITICAL" : "ELEVATED",
      urgency: "Algorithmic Verification (Research Benchmark)",
      mainIndicators: `${r.vigour_category || "Canopy flag"}; Mean NDVI ${fmt(r.canopy_ndvi_mean, 3)}; NDRE ${fmt(r.canopy_ndre_mean, 3)}`,
      recommendedAction: "Inspect pure-canopy vegetation indices and verify surface reflectance calibration across the 5 spectral bands.",
      followUpProtocol: "Technical benchmark validation of NDVI/NDRE algorithms. Strictly decoupled from plantation operational risk.",
      dataLimitations: [
        "BENCHMARK ONLY: Collected over Hullerbusch Beech Forest in Germany (Fagus sylvatica). NOT oil palm.",
        "Zero spatial or temporal overlap with Indonesian operational blocks B001–B042."
      ],
      provenance: "MSUAV500K Altum 5-band stacked GeoTIFF (512x512); technical demo of spectral vigour calculation.",
      observations: null,
    });
  });

  return items;
}

/**
 * Exports complete inspection queue to CSV including completion records.
 */
function exportDirectivesCsv(items, records) {
  const headers = [
    "Task ID", "Evidence Source", "Target", "Block ID", "Risk Level",
    "Screening Score", "Priority", "Urgency", "Main Indicators",
    "Recommended Action", "Follow-up Protocol", "Data Coverage Limitations",
    "Verification Status", "Inspector Name", "Field Notes", "Completed At", "Data Provenance"
  ];

  const quote = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;

  const rows = items.map((t) => {
    const rec = records[t.id] || {};
    return [
      t.id,
      t.source,
      t.target,
      t.blockId || "N/A",
      t.riskLevel,
      t.riskScore != null ? t.riskScore.toFixed(1) : "N/A",
      t.priority,
      t.urgency,
      t.mainIndicators,
      t.recommendedAction,
      t.followUpProtocol,
      (t.dataLimitations || []).join(" | "),
      rec.status || "OPEN",
      rec.inspector || "",
      rec.notes || "",
      rec.completedAt || "",
      t.provenance
    ];
  });

  const csvContent = [headers, ...rows].map((r) => r.map(quote).join(",")).join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `palm-ai-field-action-queue-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function FieldActionCenter({ datasets, onNavigateBlock }) {
  const allItems = useMemo(() => buildActionItems(datasets), [datasets]);

  // Local storage for field verification statuses and notes
  const [records, setRecords] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  });

  // Filter and search state
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedNotesId, setExpandedNotesId] = useState(null);
  const [aiRecommendations, setAiRecommendations] = useState({});
  const [loadingAi, setLoadingAi] = useState({});

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      // Graceful fallback
    }
  }, [records]);

  // Update status for a specific item
  const updateStatus = useCallback((id, newStatus) => {
    setRecords((prev) => {
      const current = prev[id] || {};
      const completedAt = newStatus === "COMPLETED" ? new Date().toISOString() : current.completedAt;
      return {
        ...prev,
        [id]: {
          ...current,
          status: newStatus,
          completedAt: newStatus === "COMPLETED" ? (current.completedAt || new Date().toLocaleString()) : null,
        }
      };
    });
  }, []);

  // Update inspector name and notes
  const updateDetails = useCallback((id, field, value) => {
    setRecords((prev) => {
      const current = prev[id] || {};
      return {
        ...prev,
        [id]: {
          ...current,
          [field]: value
        }
      };
    });
  }, []);

  // Fetch server-side recommendation on demand
  const fetchBlockAiSynthesis = async (bid) => {
    if (!bid) return;
    setLoadingAi((prev) => ({ ...prev, [bid]: true }));
    try {
      const res = await fetch(`/api/recommendations/${bid}`);
      if (res.ok) {
        const data = await res.json();
        setAiRecommendations((prev) => ({ ...prev, [bid]: data }));
      }
    } catch (err) {
      console.warn("Failed to fetch recommendation for", bid, err);
    } finally {
      setLoadingAi((prev) => ({ ...prev, [bid]: false }));
    }
  };

  // Filtered item list
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const rec = records[item.id] || {};
      const currentStatus = rec.status || "OPEN";

      const matchStatus = statusFilter === "ALL" || currentStatus === statusFilter;
      const matchSource = sourceFilter === "ALL" ||
        (sourceFilter === "agronomic" && item.sourceType === "agronomic") ||
        (sourceFilter === "rgb" && item.sourceType === "rgb_uav") ||
        (sourceFilter === "spectral" && item.sourceType === "multispectral");
      const matchPriority = priorityFilter === "ALL" || item.priority === priorityFilter;
      const matchSearch = !searchQuery ||
        item.target.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.mainIndicators.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.recommendedAction.toLowerCase().includes(searchQuery.toLowerCase());

      return matchStatus && matchSource && matchPriority && matchSearch;
    });
  }, [allItems, records, statusFilter, sourceFilter, priorityFilter, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = allItems.length;
    let completed = 0;
    let inReview = 0;
    let highUrgentOpen = 0;

    allItems.forEach((item) => {
      const rec = records[item.id] || {};
      const status = rec.status || "OPEN";
      if (status === "COMPLETED") completed++;
      else if (status === "IN REVIEW" || status === "VERIFYING IN FIELD") inReview++;

      if (status !== "COMPLETED" && item.priority === "CRITICAL") {
        highUrgentOpen++;
      }
    });

    return { total, completed, inReview, highUrgentOpen };
  }, [allItems, records]);

  return (
    <div className="field-action-container">
      {/* 1. HERO HEADER */}
      <section className="fac-hero-banner">
        <div className="fac-hero-content">
          <div className="fac-eyebrow">
            <ClipboardCheck size={16} className="text-emerald" />
            <span>OPERATIONAL FIELD INTELLIGENCE</span>
          </div>
          <h1 className="fac-title">Field Action Center</h1>
          <p className="fac-subtitle">
            Turn verified empirical evidence into actionable field inspection directives. Track verification progress, record agronomist findings, and export audit-ready handoffs for field teams.
          </p>

          {/* Block-Centric Operational Workflow Stepper */}
          <div className="fac-workflow-stepper">
            <span className="stepper-title">Operational Workflow:</span>
            <div className="stepper-track">
              <span className="step-pill current">1. Action Queue</span>
              <span className="step-arrow">→</span>
              <span className="step-pill">2. Select Block</span>
              <span className="step-arrow">→</span>
              <span className="step-pill">3. Understand Issue</span>
              <span className="step-arrow">→</span>
              <span className="step-pill">4. Review Evidence</span>
              <span className="step-arrow">→</span>
              <span className="step-pill">5. Recommended Solution</span>
              <span className="step-arrow">→</span>
              <span className="step-pill">6. Record Inspection</span>
              <span className="step-arrow">→</span>
              <span className="step-pill">7. Complete</span>
            </div>
          </div>

          <div className="fac-boundary-notice">
            <Info size={15} className="text-amber" />
            <span>
              <strong>Scientific Protocol:</strong> Directives are strictly grounded in verified block telemetry (FFB scale yields & Frond 17 foliar assays). No chemical doses or pest treatments are fabricated. Unmapped UAV benchmarks are kept in separate review streams.
            </span>
          </div>
        </div>

        <div className="fac-hero-stats">
          <div className="fac-stat-box">
            <span className="fac-stat-label">Total Queue Items</span>
            <strong className="fac-stat-val">{metrics.total}</strong>
            <span className="fac-stat-sub">Across 3 Evidence Streams</span>
          </div>

          <div className="fac-stat-box urgent">
            <span className="fac-stat-label">Critical / Urgent Open</span>
            <strong className="fac-stat-val text-ruby">{metrics.highUrgentOpen}</strong>
            <span className="fac-stat-sub">Action required &lt;48h</span>
          </div>

          <div className="fac-stat-box">
            <span className="fac-stat-label">Under Verification</span>
            <strong className="fac-stat-val text-gold">{metrics.inReview}</strong>
            <span className="fac-stat-sub">Active field checks</span>
          </div>

          <div className="fac-stat-box completed">
            <span className="fac-stat-label">Verified & Completed</span>
            <strong className="fac-stat-val text-emerald">{metrics.completed}</strong>
            <span className="fac-stat-sub">Recorded in browser session</span>
          </div>
        </div>
      </section>

      {/* 2. TOOLBAR & CONTROLS */}
      <section className="fac-toolbar">
        <div className="fac-toolbar-left">
          <div className="fac-search-box">
            <Search size={15} className="fac-search-icon" />
            <input
              type="text"
              placeholder="Search by Block ID, nutrient, or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button type="button" className="fac-clear-search" onClick={() => setSearchQuery("")}>×</button>
            )}
          </div>

          <div className="fac-filter-group">
            <label className="fac-filter-label">
              <span>Status:</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="ALL">All Statuses ({allItems.length})</option>
                {statusOptions.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </label>

            <label className="fac-filter-label">
              <span>Source:</span>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="ALL">All Evidence Streams</option>
                <option value="agronomic">Operational Blocks (42)</option>
                <option value="rgb">RGB UAV Benchmark (MOPAD)</option>
                <option value="spectral">Multispectral Benchmark (Altum)</option>
              </select>
            </label>

            <label className="fac-filter-label">
              <span>Priority:</span>
              <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                <option value="ALL">All Priorities</option>
                <option value="CRITICAL">Critical Priority</option>
                <option value="ELEVATED">Elevated Priority</option>
                <option value="ROUTINE">Routine Priority</option>
              </select>
            </label>
          </div>
        </div>

        <div className="fac-toolbar-right">
          <button
            type="button"
            className="fac-export-btn"
            onClick={() => exportDirectivesCsv(allItems, records)}
            title="Download full directives queue with agronomist completion notes"
          >
            <Download size={15} />
            <span>Export Directives CSV</span>
          </button>
        </div>
      </section>

      {/* 3. DIRECTIVES ACTION LIST */}
      <section className="fac-items-grid">
        {filteredItems.length === 0 ? (
          <div className="fac-empty-state">
            <ClipboardCheck size={36} className="text-emerald" />
            <h3>No Directives Match the Current Filter Criteria</h3>
            <p>Adjust your search query, status, or evidence source filter to view items.</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const rec = records[item.id] || {};
            const currentStatus = rec.status || "OPEN";
            const isCompleted = currentStatus === "COMPLETED";
            const isNotesExpanded = expandedNotesId === item.id;
            const aiData = item.blockId ? aiRecommendations[item.blockId] : null;
            const isAiLoading = item.blockId ? loadingAi[item.blockId] : false;

            return (
              <article
                key={item.id}
                className={`fac-directive-card ${item.priority.toLowerCase()} ${isCompleted ? "is-completed" : ""}`}
              >
                {/* CARD TOP HEADER */}
                <div className="fac-card-topbar">
                  <div className="fac-card-target-cluster">
                    <span className={`fac-source-badge ${item.sourceType}`}>
                      {item.source}
                    </span>
                    <h3
                      className={`fac-target-title ${item.blockId ? "clickable" : ""}`}
                      onClick={() => item.blockId && onNavigateBlock && onNavigateBlock(item.blockId, item.id)}
                      title={item.blockId ? `Click to open Block ${item.blockId} Detail View` : undefined}
                    >
                      {item.target}
                    </h3>
                    {item.blockId && onNavigateBlock ? (
                      <button
                        type="button"
                        className="fac-open-block-link"
                        onClick={() => onNavigateBlock(item.blockId, item.id)}
                        title={`Open complete inspection and resolution workflow for Block ${item.blockId}`}
                      >
                        <span>Open Block {item.blockId}</span>
                        <ArrowRight size={13} />
                      </button>
                    ) : (
                      <span className="fac-unmapped-tag" title="This research benchmark is not georeferenced to operational blocks">
                        Unmapped Benchmark
                      </span>
                    )}
                  </div>

                  <div className="fac-card-risk-cluster">
                    <span className={`fac-priority-badge ${item.priority.toLowerCase()}`}>
                      {item.priority} PRIORITY
                    </span>
                    <div className="fac-score-pill">
                      <span>Screening Score:</span>
                      <strong>{item.riskScore != null ? fmt(item.riskScore, 1) : "N/A"}</strong>
                    </div>
                  </div>
                </div>

                {/* EVIDENCE & DIRECTIVE BODY (3 CLEAR TIERS) */}
                <div className="fac-card-body">
                  {/* TIER 1: CONFIRMED FIELD OBSERVATION */}
                  <div className="fac-tier-block observation-tier">
                    <div className="fac-tier-tag text-emerald">
                      <CheckCircle2 size={13} />
                      <span>CONFIRMED FIELD OBSERVATIONS (LAB & HARVEST SCALES)</span>
                    </div>

                    <div className="fac-obs-content">
                      <p className="fac-indicator-summary">
                        <strong>Primary Flag:</strong> {item.mainIndicators}
                      </p>

                      {item.observations && (
                        <div className="fac-evidence-chips">
                          {item.observations.yield.actual != null && (
                            <span className="fac-chip yield">
                              <strong>2024 Yield:</strong> {fmt(item.observations.yield.actual)} t/ha
                              {item.observations.yield.gap != null && (
                                <em className={item.observations.yield.gap < 0 ? "neg" : "pos"}>
                                  {" "}({fmt(item.observations.yield.gap)}% vs cohort)
                                </em>
                              )}
                            </span>
                          )}

                          <span className="fac-chip leaf">
                            <strong>Frond 17 Foliar ({item.observations.foliar.year}):</strong>{" "}
                            {item.observations.foliar.lowList.length > 0 ? (
                              <span className="text-ruby">Low in {item.observations.foliar.lowList.join(", ")}</span>
                            ) : (
                              <span className="text-emerald">All measured nutrients in standard range</span>
                            )}
                          </span>

                          <span className="fac-chip dris">
                            <strong>DRIS Norms:</strong>{" "}
                            {item.observations.dris.limiting.length > 0
                              ? `Limiting: ${item.observations.dris.limiting.join(", ")}`
                              : "No acute nutrient limiting index"}
                          </span>

                          <span className={`fac-chip soil ${item.observations.soil.hasSample ? "sampled" : "unsampled"}`}>
                            <strong>Soil Survey:</strong> {item.observations.soil.status}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* TIER 2: CANONICAL MODEL PREDICTIONS & LIMITATIONS */}
                  <div className="fac-tier-block prediction-tier">
                    <div className="fac-tier-tag text-amber">
                      <ShieldAlert size={13} />
                      <span>CANONICAL SCREENING MODEL & DATA QUALITY AUDIT</span>
                    </div>

                    <div className="fac-pred-content">
                      <div className="fac-pred-row">
                        <span><strong>Risk Classification:</strong> {item.riskLevel} (Canonical Screening Formula: Yield 40%, Foliar 25%, DRIS 15%)</span>
                        <span className="fac-urgency-badge"><strong>Urgency:</strong> {item.urgency}</span>
                      </div>

                      {item.dataLimitations && item.dataLimitations.length > 0 && (
                        <div className="fac-limitations-list">
                          <span className="limit-title"><Info size={12} /> Coverage Limitations:</span>
                          <ul>
                            {item.dataLimitations.map((lim, lIdx) => (
                              <li key={lIdx}>• {lim}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* TIER 3: RECOMMENDED ACTION & VERIFICATION PROTOCOL */}
                  <div className="fac-tier-block action-tier">
                    <div className="fac-tier-tag text-emerald">
                      <Sprout size={13} />
                      <span>RECOMMENDED AGRONOMIC INTERVENTION</span>
                    </div>

                    <div className="fac-action-content">
                      <p className="fac-prescribed-action">
                        <strong>Action Directive:</strong> {item.recommendedAction}
                      </p>

                      <p className="fac-protocol">
                        <strong>Verification Protocol (60–90 Days):</strong> {item.followUpProtocol}
                      </p>
                    </div>
                  </div>

                  {/* OPTIONAL AI AGRONOMIST SYNTHESIS (SERVER-SIDE OPENAI / DETERMINISTIC FALLBACK) */}
                  {item.blockId && (
                    <div className="fac-ai-synthesis-section">
                      {!aiData ? (
                        <button
                          type="button"
                          className="fac-fetch-ai-btn"
                          onClick={() => fetchBlockAiSynthesis(item.blockId)}
                          disabled={isAiLoading}
                        >
                          <Sparkles size={14} className={isAiLoading ? "animate-spin" : "text-emerald"} />
                          <span>{isAiLoading ? "Synthesizing Telemetry..." : "Consult AI Agronomist Synthesis"}</span>
                        </button>
                      ) : (
                        <div className="fac-ai-card">
                          <div className="fac-ai-header">
                            <span className="fac-ai-badge">
                              <Sparkles size={13} />
                              {aiData.is_ai_generated ? "OpenAI Synthesis" : "Deterministic Agronomic Rules Engine"}
                            </span>
                            <span className="fac-ai-model">{aiData.model}</span>
                          </div>

                          <div className="fac-ai-body">
                            <p><strong>Observed Finding:</strong> {aiData.recommendation?.observed_finding}</p>
                            <p><strong>Agronomic Rationale:</strong> {aiData.recommendation?.agronomic_rationale}</p>
                            <p><strong>Recommended Action:</strong> {aiData.recommendation?.recommended_action}</p>
                            <p><strong>Validation Protocol:</strong> {aiData.recommendation?.validation_protocol}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* CARD FOOTER: INTERACTIVE WORKFLOW STATUS & Agronomist Notes */}
                <div className="fac-card-footer">
                  <div className="fac-status-workflow-row">
                    {/* Primary Block Workflow CTA */}
                    {item.blockId && onNavigateBlock ? (
                      <button
                        type="button"
                        className="fac-workflow-primary-btn"
                        onClick={() => onNavigateBlock(item.blockId, item.id)}
                        title={`Open block detail view and execute inspection workflow for Block ${item.blockId}`}
                      >
                        <Sprout size={14} />
                        <span>Inspect Block {item.blockId} & Record Findings →</span>
                      </button>
                    ) : (
                      <div className="fac-unmapped-pill-note">
                        <XCircle size={13} className="text-amber" />
                        <span>Unmapped Benchmark · Not linked to blocks B001–B042</span>
                      </div>
                    )}

                    <div className="fac-status-selector">
                      <span className="fac-status-label">Status:</span>
                      <select
                        value={currentStatus}
                        onChange={(e) => updateStatus(item.id, e.target.value)}
                        className={`fac-select-status ${currentStatus.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {statusOptions.map((st) => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </div>

                    <div className="fac-quick-complete-toggle">
                      <button
                        type="button"
                        className={`fac-complete-btn ${isCompleted ? "completed" : ""}`}
                        onClick={() => updateStatus(item.id, isCompleted ? "OPEN" : "COMPLETED")}
                      >
                        {isCompleted ? <CheckSquare size={16} /> : <Square size={16} />}
                        <span>{isCompleted ? "Marked as Completed" : "Mark Complete"}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      className="fac-toggle-notes-btn"
                      onClick={() => setExpandedNotesId(isNotesExpanded ? null : item.id)}
                    >
                      <FileText size={14} />
                      <span>{isNotesExpanded ? "Hide Field Notes" : "Inspector Notes"}</span>
                    </button>
                  </div>

                  {/* EXPANDABLE INSPECTOR NOTES & COMPLETION VERIFICATION */}
                  {isNotesExpanded && (
                    <div className="fac-notes-expanded-drawer">
                      <div className="fac-notes-grid">
                        <div className="fac-field-group">
                          <label>
                            <UserCheck size={14} />
                            <span>Inspector / Agronomist Name:</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Field Agronomist A. Siregar"
                            value={rec.inspector || ""}
                            onChange={(e) => updateDetails(item.id, "inspector", e.target.value)}
                          />
                        </div>

                        <div className="fac-field-group span-full">
                          <label>
                            <FileText size={14} />
                            <span>Field Verification Notes & Corrective Work Order:</span>
                          </label>
                          <textarea
                            rows={3}
                            placeholder="Record observed field conditions, weed circle status, drainage checks, foliar re-sampling dates, or work order numbers..."
                            value={rec.notes || ""}
                            onChange={(e) => updateDetails(item.id, "notes", e.target.value)}
                          />
                        </div>
                      </div>

                      {rec.completedAt && (
                        <div className="fac-completed-timestamp">
                          <CheckCircle2 size={14} className="text-emerald" />
                          <span>Verification recorded completed on: {rec.completedAt}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
