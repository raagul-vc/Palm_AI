import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ClipboardCheck, Download, Filter, CheckCircle2, Clock3, CircleAlert,
  Sprout, ScanSearch, Layers3, ArrowUpRight, ArrowRight, RotateCcw, Sparkles,
  ShieldAlert, Info, Calendar, ChevronRight, AlertTriangle, UserCheck,
  FileText, ExternalLink, ShieldCheck, CheckSquare, Square, Search, XCircle,
  ArrowUpDown, Check, RefreshCw
} from "lucide-react";
import "./FieldActionCenter.css";

const STORAGE_KEY = "palm-ai-field-action-status-v2";
const statusOptions = ["OPEN", "IN REVIEW", "VERIFYING IN FIELD", "COMPLETED"];
const priorityOptions = ["CRITICAL", "ELEVATED", "ROUTINE"];

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
 * Natural numerical/alphabetical sort key: B001 -> 1, B010 -> 10, B042 -> 42
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

  // 1. Build lookup maps for foliar, dris, soil, and risk
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

  // 2. Process all 42 operational blocks from multiRisk or risk
  const baseBlocks = datasets.multiRisk && datasets.multiRisk.length > 0
    ? datasets.multiRisk
    : (datasets.risk || []);

  const processedBlocks = baseBlocks.map((r) => {
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
    const leafYear = nutRow.Year || nutRow.Leaf_Sampling_Year || 2024;
    const lowNutrients = [];
    ["N", "P", "K", "Ca", "Mg", "B"].forEach((elem) => {
      if (nutRow[`${elem}_pct_Status`] === "LOW" || nutRow[`${elem}_ppm_Status`] === "LOW") {
        lowNutrients.push(elem);
      }
    });

    // DRIS limitations
    const limitingNutrients = [];
    const excessNutrients = [];
    if (drisRow.Limitation_1 && drisRow.Limitation_1 !== "None") limitingNutrients.push(drisRow.Limitation_1);
    if (drisRow.Limitation_2 && drisRow.Limitation_2 !== "None") limitingNutrients.push(drisRow.Limitation_2);
    if (drisRow.Limitation_3 && drisRow.Limitation_3 !== "None") limitingNutrients.push(drisRow.Limitation_3);
    if (drisRow.Excess_1 && drisRow.Excess_1 !== "None") excessNutrients.push(drisRow.Excess_1);

    // Soil status (strictly only 7 blocks have observed soil tests)
    const hasSoil = soilRow.status === "observed" || soilRow.pH_H2O != null;

    // Data coverage limitations
    const limitations = [];
    if (nutRow.B_ppm == null || nutRow.B_ppm === "") {
      limitations.push("Boron (B) foliar analysis unrecorded for this sample round.");
    }
    if (!hasSoil) {
      limitations.push("No block-specific soil sample; estate soil survey restricted to 7 index blocks only.");
    }
    limitations.push("Weather telemetry is an estate-wide average; excluded from block screening score.");
    limitations.push("Drone RGB and multispectral UAV imagery lack block georeferencing (0% risk contribution).");

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
    let agronomicRationale = "";
    if (!recommendedAction) {
      if (riskLevel === "HIGH") {
        const limStr = limitingNutrients.length > 0 ? `DRIS identifies ${limitingNutrients.join(", ")} limitation.` : "Productivity gap is the primary constraint.";
        agronomicRationale = `Observed production of ${fmt(actualYield)} t/ha correlates with nutritional deficit. ${limStr} ${drisRow.Prescription || ""}`;
        recommendedAction = `Convene joint agronomy audit for Block ${bid}. Review weed circle upkeep, check field drainage channels, and execute prescribed foliar balancing: ${drisRow.Prescription || "Consult estate agronomist for targeted foliar correction."}`;
      } else if (riskLevel === "MEDIUM") {
        agronomicRationale = `Foliar diagnostic flags ${lowNutrients.length > 0 ? lowNutrients.join(", ") : "mild nutritional variation"}. ${drisRow.Prescription || ""}`;
        recommendedAction = `Verify field application logs for Block ${bid} and schedule spot canopy greenness inspection. Follow recommendation: ${drisRow.Prescription || "Review nutrient distribution and broadcast uniformity."}`;
      } else {
        agronomicRationale = "Nutritional ratios and yield trends align with age-cohort baseline expectations with no critical limiting constraints.";
        recommendedAction = "Maintain standard circular weeding, weed circle upkeep, and scheduled standard fertilizer broadcast rounds.";
      }
    } else {
      agronomicRationale = riskLevel === "HIGH"
        ? `Production deficit correlates with diagnostic flags (${limitingNutrients.length > 0 ? limitingNutrients.join(", ") : "yield lag"}). Ground verification required.`
        : "Operational telemetry within expected variance bounds for age cohort.";
    }

    // Follow-up protocol
    const followUpProtocol = riskLevel === "HIGH"
      ? "Target quarterly bunch census count and conduct Frond 17 foliar re-sampling at 60–90 days."
      : riskLevel === "MEDIUM"
        ? "Monitor monthly bunch delivery weights across the upcoming 3 harvest rounds."
        : "Routine annual foliar assay and standard monthly harvest weight tracking.";

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
      agronomicRationale,
      followUpProtocol,
      dataLimitations: limitations,
      remoteSensingStatus: {
        droneRgb: {
          hasValidMapping: false,
          status: "Unmapped Benchmark",
          badge: "No Block Georeferencing",
          reason: "MOPAD Site 2 benchmark imagery lacks GPS block boundaries for operational blocks B001–B042 (0% weight)."
        },
        multispectral: {
          hasValidMapping: false,
          status: "Unavailable Benchmark",
          badge: "German Beech Forest",
          reason: "MSUAV500K benchmark was collected over Hullerbusch Beech Forest in Germany (NOT oil palm); 0% weight."
        }
      },
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
          excess: excessNutrients,
          prescription: drisRow.Prescription || "Maintain balanced fertilizer application.",
          sampleYear: drisRow.Year || 2024,
        },
        soil: {
          hasSample: hasSoil,
          ph: safeNum(soilRow.pH_H2O),
          cOrg: safeNum(soilRow.C_Organic_pct),
          pAvail: safeNum(soilRow.P_Available_ppm),
          status: hasSoil ? "Observed Field Sample" : "Unavailable (Unsampled Block)",
          note: hasSoil ? "Measured chemical survey on index block" : "Sparse survey restricted to 7 blocks in estate"
        },
        stand: {
          age: plantAge,
          seed: seedType,
          planted: plantingYear,
        }
      },
      provenance: "Ground-truth harvest weighbridge scale records (2012–2024) & certified commercial Frond 17 foliar laboratory assays."
    };
  });

  items.push(...processedBlocks);

  // 3. RGB UAV Benchmark items (Strictly isolated with unmapped status)
  const droneOutliers = [...(datasets.droneImages || [])]
    .filter((r) => r.is_outlier || String(r.health_category || "").toUpperCase() === "LOW" || (safeNum(r.drone_health_score) ?? 100) < 60)
    .sort((a, b) => (safeNum(a.drone_health_score) ?? 100) - (safeNum(b.drone_health_score) ?? 100))
    .slice(0, 6);

  droneOutliers.forEach((r) => {
    items.push({
      id: `drone-${r.image_filename || r.image_id}`,
      source: "RGB UAV Benchmark (MOPAD Site 2)",
      sourceType: "rgb_uav",
      type: "Image Tile Review (Unmapped)",
      target: r.image_filename || `Image ${r.image_id}`,
      blockId: null,
      hasValidBlockMapping: false,
      dataAvailabilityStatus: "UNMAPPED BENCHMARK · NO BLOCK MAPPING",
      riskLevel: (safeNum(r.drone_health_score) ?? 100) < 40 ? "HIGH" : "MEDIUM",
      riskScore: safeNum(r.drone_health_score),
      priority: (safeNum(r.drone_health_score) ?? 100) < 40 ? "CRITICAL" : "ELEVATED",
      urgency: "Visual Inspection (Research Demonstration Only)",
      mainIndicators: r.outlier_categories || `${r.non_healthy_palm_percentage ?? "N/A"}% non-healthy detected palms`,
      recommendedAction: "Review bounding box crown annotations on UAV image canvas; inspect flagged palm crowns during scheduled field inspection.",
      agronomicRationale: "Technical demonstration of deep-learning palm crown anomaly detection. Decoupled from operational block risk.",
      followUpProtocol: "Technical benchmark validation; ground-truth canopy condition with GPS-tagged inspection.",
      dataLimitations: ["Tile lacks GPS EXIF tags and is not mapped to operational plantation blocks B001–B042."],
      provenance: "MOPAD Site 2 aerial survey crop (1024x1024 px); independent visual evidence, not an operational block record.",
      observations: null,
    });
  });

  // 4. Multispectral UAV Benchmark items (Strictly isolated with German Beech Forest disclaimer)
  const spectralTiles = [...(datasets.multispectralTiles || [])]
    .filter((r) => /moderate|depressed|background/i.test(String(r.vigour_category || "")) || (safeNum(r.multispectral_health_score) ?? 100) < 80)
    .sort((a, b) => (safeNum(a.multispectral_health_score) ?? 100) - (safeNum(b.multispectral_health_score) ?? 100))
    .slice(0, 4);

  spectralTiles.forEach((r) => {
    items.push({
      id: `spectral-${r.tile_id}`,
      source: "Multispectral UAV Benchmark (MSUAV500K)",
      sourceType: "multispectral",
      type: "GeoTIFF Tile Review (Demo Only)",
      target: r.tile_id ? `Tile ${r.tile_id}` : (r.filename || "GeoTIFF Tile"),
      blockId: null,
      hasValidBlockMapping: false,
      dataAvailabilityStatus: "UNMAPPED BENCHMARK · GERMAN BEECH FOREST",
      riskLevel: (safeNum(r.multispectral_health_score) ?? 100) < 60 ? "HIGH" : "MEDIUM",
      riskScore: safeNum(r.multispectral_health_score),
      priority: (safeNum(r.multispectral_health_score) ?? 100) < 60 ? "CRITICAL" : "ELEVATED",
      urgency: "Algorithmic Verification (Research Benchmark)",
      mainIndicators: `${r.vigour_category || "Canopy flag"}; Mean NDVI ${fmt(r.canopy_ndvi_mean, 3)}; NDRE ${fmt(r.canopy_ndre_mean, 3)}`,
      recommendedAction: "Inspect pure-canopy vegetation indices and verify surface reflectance calibration across the 5 spectral bands.",
      agronomicRationale: "Technical demonstration of 5-band multispectral canopy extraction. Strictly decoupled from operational plantation risk.",
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
    "Recommended Action", "Agronomic Rationale", "Follow-up Protocol",
    "Drone Data Status", "Multispectral Data Status", "Data Coverage Limitations",
    "Verification Status", "Inspector Name", "Inspection Date", "Field Notes",
    "Completed At", "Data Provenance"
  ];

  const quote = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;

  const rows = items.map((t) => {
    const rec = records[t.id] || {};
    const droneStatus = t.remoteSensingStatus?.droneRgb?.status || t.dataAvailabilityStatus || "N/A";
    const msStatus = t.remoteSensingStatus?.multispectral?.status || t.dataAvailabilityStatus || "N/A";
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
      t.agronomicRationale || "",
      t.followUpProtocol,
      droneStatus,
      msStatus,
      (t.dataLimitations || []).join(" | "),
      rec.status || "OPEN",
      rec.inspector || "",
      rec.inspectionDate || "",
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

export default function FieldActionCenter({ datasets, onNavigateBlock, currentUser, authToken }) {
  const allItems = useMemo(() => buildActionItems(datasets), [datasets]);

  // Persistent storage for field verification statuses and follow-up tracking
  const [records, setRecords] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  });

  // Filter and sorting states
  const [sortBy, setSortBy] = useState("alphabetical"); // "alphabetical", "alphabetical_desc", "priority", "score_desc", "status"
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("agronomic"); // Default to Operational Blocks
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedNotesId, setExpandedNotesId] = useState(null);
  const [aiRecommendations, setAiRecommendations] = useState({});
  const [loadingAi, setLoadingAi] = useState({});
  const [saveFeedback, setSaveFeedback] = useState({});

  // Synchronize with server-side SQLite tasks
  useEffect(() => {
    async function loadServerTasks() {
      try {
        const headers = {};
        if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
        const res = await fetch("/api/tasks", { headers });
        if (res.ok) {
          const data = await res.json();
          if (data?.tasks && data.tasks.length > 0) {
            setRecords((prev) => {
              const updated = { ...prev };
              data.tasks.forEach((t) => {
                const key = `block-${t.block_id}`;
                const serverStatus = t.status === "COMPLETED"
                  ? "COMPLETED"
                  : (t.status === "SUBMITTED"
                    ? "VERIFYING IN FIELD"
                    : (t.status === "IN_PROGRESS" || t.status === "ASSIGNED" ? "IN REVIEW" : "OPEN"));
                updated[key] = {
                  ...(updated[key] || {}),
                  status: serverStatus,
                  notes: t.worker_findings || updated[key]?.notes || "",
                  inspector: t.assignee_name || updated[key]?.inspector || "",
                  inspectionDate: t.worker_inspection_date || updated[key]?.inspectionDate || "",
                  completedAt: t.completed_at ? new Date(t.completed_at).toLocaleString() : updated[key]?.completedAt,
                  serverTaskId: t.task_id
                };
              });
              return updated;
            });
          }
        }
      } catch (err) {
        console.warn("Server task sync notice:", err);
      }
    }
    loadServerTasks();
  }, [authToken]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      // Graceful fallback
    }
  }, [records]);

  // Update status for a specific item
  const updateStatus = useCallback((id, newStatus) => {
    const completedTimestamp = newStatus === "COMPLETED" ? new Date().toLocaleString() : null;
    setRecords((prev) => {
      const current = prev[id] || {};
      return {
        ...prev,
        [id]: {
          ...current,
          status: newStatus,
          completedAt: newStatus === "COMPLETED" ? (current.completedAt || completedTimestamp) : null,
        }
      };
    });

    // Server-side synchronization
    if (id.startsWith("block-")) {
      const bid = id.replace("block-", "");
      fetch(`/api/tasks?block_id=${bid}`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.tasks && data.tasks[0]) {
            const taskId = data.tasks[0].task_id;
            const headers = { "Content-Type": "application/json" };
            if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
            if (newStatus === "COMPLETED") {
              fetch(`/api/tasks/${taskId}/review`, {
                method: "POST",
                headers,
                body: JSON.stringify({ decision: "APPROVE", comments: "Verified via Field Action Center" })
              }).catch(() => {});
            }
          }
        })
        .catch(() => {});
    }
  }, [authToken]);

  // Update inspector name, date, and notes
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

  // Save follow-up tracking feedback
  const handleSaveFollowUp = (id) => {
    setSaveFeedback((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setSaveFeedback((prev) => ({ ...prev, [id]: false }));
    }, 2500);
  };

  // Fetch server-side recommendation on demand (OpenAI or deterministic fallback)
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

  // Filtered and sorted item list
  const filteredItems = useMemo(() => {
    const list = allItems.filter((item) => {
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

    // Sorting Logic
    const priorityRank = { CRITICAL: 0, ELEVATED: 1, ROUTINE: 2 };
    const statusRank = { OPEN: 0, "IN REVIEW": 1, "VERIFYING IN FIELD": 2, COMPLETED: 3 };

    return list.sort((a, b) => {
      if (sortBy === "alphabetical") {
        if (a.blockId && b.blockId) {
          return naturalSortKey(a.blockId) - naturalSortKey(b.blockId);
        }
        return a.target.localeCompare(b.target);
      }
      if (sortBy === "alphabetical_desc") {
        if (a.blockId && b.blockId) {
          return naturalSortKey(b.blockId) - naturalSortKey(a.blockId);
        }
        return b.target.localeCompare(a.target);
      }
      if (sortBy === "priority") {
        const diff = (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9);
        if (diff !== 0) return diff;
        if (b.riskScore !== a.riskScore) return (b.riskScore || 0) - (a.riskScore || 0);
        return naturalSortKey(a.blockId) - naturalSortKey(b.blockId);
      }
      if (sortBy === "score_desc") {
        if (b.riskScore !== a.riskScore) return (b.riskScore || 0) - (a.riskScore || 0);
        return naturalSortKey(a.blockId) - naturalSortKey(b.blockId);
      }
      if (sortBy === "score_asc") {
        if (a.riskScore !== b.riskScore) return (a.riskScore || 0) - (b.riskScore || 0);
        return naturalSortKey(a.blockId) - naturalSortKey(b.blockId);
      }
      if (sortBy === "status") {
        const stA = records[a.id]?.status || "OPEN";
        const stB = records[b.id]?.status || "OPEN";
        const diff = (statusRank[stA] ?? 9) - (statusRank[stB] ?? 9);
        if (diff !== 0) return diff;
        return naturalSortKey(a.blockId) - naturalSortKey(b.blockId);
      }
      return 0;
    });
  }, [allItems, records, statusFilter, sourceFilter, priorityFilter, searchQuery, sortBy]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const operationalBlocks = allItems.filter((i) => i.sourceType === "agronomic");
    const total = operationalBlocks.length;
    let completed = 0;
    let inReview = 0;
    let criticalOpen = 0;
    let elevatedOpen = 0;

    operationalBlocks.forEach((item) => {
      const rec = records[item.id] || {};
      const status = rec.status || "OPEN";
      if (status === "COMPLETED") completed++;
      else if (status === "IN REVIEW" || status === "VERIFYING IN FIELD") inReview++;

      if (status !== "COMPLETED") {
        if (item.priority === "CRITICAL") criticalOpen++;
        else if (item.priority === "ELEVATED") elevatedOpen++;
      }
    });

    return { total, completed, inReview, criticalOpen, elevatedOpen };
  }, [allItems, records]);

  return (
    <div className="field-action-container">
      {/* 1. HERO HEADER */}
      <section className="fac-hero-banner">
        <div className="fac-hero-content">
          <div className="fac-eyebrow">
            <ClipboardCheck size={16} className="text-emerald" />
            <span>OPERATIONAL FIELD ACTION CENTER · ALM AI PLATFORM</span>
          </div>
          <h1 className="fac-title">Field Action Center</h1>
          <p className="fac-subtitle">
            Turn verified empirical observations into actionable field directives. Track verification progress, record agronomist inspection notes, inspect evidence grounding, and export audit-ready handoffs.
          </p>

          {/* 7-Step Operational Workflow Stepper */}
          <div className="fac-workflow-stepper" role="navigation" aria-label="Operational Workflow Stepper">
            <div className="fac-stepper-header">
              <span className="fac-stepper-title">Operational Workflow:</span>
              <span className="fac-stepper-hint">Action Queue → Block Resolution Protocol</span>
            </div>
            <div className="fac-stepper-track">
              <span className="fac-step-item current">
                <span className="fac-step-badge">1</span>
                <span className="fac-step-label">Action Queue</span>
              </span>
              <span className="fac-step-arrow" aria-hidden="true">→</span>
              <span className="fac-step-item">
                <span className="fac-step-badge">2</span>
                <span className="fac-step-label">Block ID</span>
              </span>
              <span className="fac-step-arrow" aria-hidden="true">→</span>
              <span className="fac-step-item">
                <span className="fac-step-badge">3</span>
                <span className="fac-step-label">Risk Reason</span>
              </span>
              <span className="fac-step-arrow" aria-hidden="true">→</span>
              <span className="fac-step-item">
                <span className="fac-step-badge">4</span>
                <span className="fac-step-label">Observed Facts</span>
              </span>
              <span className="fac-step-arrow" aria-hidden="true">→</span>
              <span className="fac-step-item">
                <span className="fac-step-badge">5</span>
                <span className="fac-step-label">Recommendation</span>
              </span>
              <span className="fac-step-arrow" aria-hidden="true">→</span>
              <span className="fac-step-item">
                <span className="fac-step-badge">6</span>
                <span className="fac-step-label">Field Follow-up</span>
              </span>
              <span className="fac-step-arrow" aria-hidden="true">→</span>
              <span className="fac-step-item">
                <span className="fac-step-badge">7</span>
                <span className="fac-step-label">Verification</span>
              </span>
            </div>
          </div>

          <div className="fac-boundary-notice">
            <Info size={15} className="text-amber" />
            <span>
              <strong>Scientific Protocol & Boundary Integrity:</strong> Facts (harvest scale yields & Frond 17 foliar laboratory assays) are preserved separately from AI suggestions. Remote sensing UAV datasets are unmapped technical benchmarks (0% screening influence).
            </span>
          </div>
        </div>

        <div className="fac-hero-stats">
          <div className="fac-stat-box">
            <span className="fac-stat-label">Operational Blocks</span>
            <strong className="fac-stat-val">{metrics.total}</strong>
            <span className="fac-stat-sub">B001 – B042 (Division A)</span>
          </div>

          <div className="fac-stat-box urgent">
            <span className="fac-stat-label">Critical Priority Open</span>
            <strong className="fac-stat-val text-ruby">{metrics.criticalOpen}</strong>
            <span className="fac-stat-sub">Intervention &lt;48 hours</span>
          </div>

          <div className="fac-stat-box elevated">
            <span className="fac-stat-label">Elevated Priority Open</span>
            <strong className="fac-stat-val text-gold">{metrics.elevatedOpen}</strong>
            <span className="fac-stat-sub">Targeted audit &lt;14 days</span>
          </div>

          <div className="fac-stat-box completed">
            <span className="fac-stat-label">Verified & Completed</span>
            <strong className="fac-stat-val text-emerald">{metrics.completed}</strong>
            <span className="fac-stat-sub">Logged in field session</span>
          </div>
        </div>
      </section>

      {/* 2. TOOLBAR & CONTROLS (SORTING, FILTERING, SEARCH, EXPORT) */}
      <section className="fac-toolbar">
        <div className="fac-toolbar-left">
          <div className="fac-search-box">
            <Search size={15} className="fac-search-icon" />
            <input
              type="text"
              placeholder="Search by Block ID, deficiency (e.g. N, K), or directive..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button type="button" className="fac-clear-search" onClick={() => setSearchQuery("")}>×</button>
            )}
          </div>

          {/* Quick Sort Toggle Buttons */}
          <div className="fac-quick-sort-pills" role="group" aria-label="Quick Sort Options">
            <span className="fac-sort-label"><ArrowUpDown size={13} /> Sort:</span>
            <button
              type="button"
              className={`fac-sort-pill ${sortBy === "alphabetical" ? "active" : ""}`}
              onClick={() => setSortBy("alphabetical")}
              title="Sort blocks alphabetically (A to Z: B001 to B042)"
            >
              Block ID (A → Z)
            </button>
            <button
              type="button"
              className={`fac-sort-pill ${sortBy === "priority" ? "active" : ""}`}
              onClick={() => setSortBy("priority")}
              title="Sort by risk priority (Critical -> Elevated -> Routine)"
            >
              Risk Priority
            </button>
            <button
              type="button"
              className={`fac-sort-pill ${sortBy === "score_desc" ? "active" : ""}`}
              onClick={() => setSortBy("score_desc")}
              title="Sort by screening risk score descending"
            >
              Risk Score
            </button>
            <button
              type="button"
              className={`fac-sort-pill ${sortBy === "status" ? "active" : ""}`}
              onClick={() => setSortBy("status")}
              title="Sort by action status (Open -> In Review -> Completed)"
            >
              Status
            </button>
          </div>

          <div className="fac-filter-group">
            <label className="fac-filter-label">
              <span>Status:</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="ALL">All Statuses</option>
                {statusOptions.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </label>

            <label className="fac-filter-label">
              <span>Source:</span>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="agronomic">Operational Blocks (42)</option>
                <option value="ALL">All Evidence Streams</option>
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

      {/* Advisory Banner for Unmapped Benchmark Streams (Requirement 5) */}
      {(sourceFilter === "rgb" || sourceFilter === "spectral" || (sourceFilter === "ALL" && filteredItems.some((i) => !i.blockId))) && (
        <div className="fac-benchmark-advisory-banner">
          <AlertTriangle size={18} className="text-amber flex-shrink-0" />
          <div className="fac-benchmark-advisory-text">
            <strong>Remote Sensing Data Availability Advisory:</strong> RGB UAV Imagery (MOPAD Site 2) and Multispectral GeoTIFFs (Hullerbusch Beech Forest) lack spatial block mapping and georeferenced coordinates for operational plantation blocks B001–B042. Because no verified block mapping and source metadata exist, these research benchmarks are isolated with 0% risk contribution and do not generate operational block directives.
          </div>
        </div>
      )}

      {/* 3. DIRECTIVES ACTION LIST */}
      <section className="fac-items-grid">
        {filteredItems.length === 0 ? (
          <div className="fac-empty-state">
            <ClipboardCheck size={36} className="text-emerald" />
            <h3>No Directives Match Current Filter Criteria</h3>
            <p>Adjust your search query, priority, or action status filter to view directives.</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const rec = records[item.id] || {};
            const currentStatus = rec.status || "OPEN";
            const isCompleted = currentStatus === "COMPLETED";
            const isNotesExpanded = expandedNotesId === item.id;
            const aiData = item.blockId ? aiRecommendations[item.blockId] : null;
            const isAiLoading = item.blockId ? loadingAi[item.blockId] : false;
            const isSaved = saveFeedback[item.id];

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
                        <span>Open Block {item.blockId} View</span>
                        <ArrowRight size={13} />
                      </button>
                    ) : (
                      <span className="fac-unmapped-tag" title="This research benchmark is not georeferenced to operational blocks">
                        Unmapped Benchmark · Demo Only
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

                {/* REMOTE SENSING DATA AVAILABILITY STATUS (Requirement 5) */}
                {item.remoteSensingStatus && (
                  <div className="fac-remote-sensing-row">
                    <div className="fac-rs-item">
                      <span className="fac-rs-title">RGB Drone:</span>
                      <span className="fac-rs-status unmapped" title={item.remoteSensingStatus.droneRgb.reason}>
                        <XCircle size={12} />
                        {item.remoteSensingStatus.droneRgb.status} (0% Weight)
                      </span>
                    </div>
                    <div className="fac-rs-item">
                      <span className="fac-rs-title">Multispectral:</span>
                      <span className="fac-rs-status unavailable" title={item.remoteSensingStatus.multispectral.reason}>
                        <XCircle size={12} />
                        {item.remoteSensingStatus.multispectral.status} (0% Weight)
                      </span>
                    </div>
                  </div>
                )}

                {/* EVIDENCE & DIRECTIVE BODY (3 VISUALLY SEPARATED TIERS: FACTS vs PREDICTIONS vs RECOMMENDATIONS) */}
                <div className="fac-card-body">
                  {/* TIER 1: CONFIRMED FIELD OBSERVATIONS (VERIFIED GROUND-TRUTH FACTS) */}
                  <div className="fac-tier-block observation-tier">
                    <div className="fac-tier-tag text-emerald">
                      <CheckCircle2 size={13} />
                      <span>FACTS: VERIFIED FIELD TELEMETRY & LAB OBSERVATIONS (GROUND TRUTH)</span>
                    </div>

                    <div className="fac-obs-content">
                      <p className="fac-indicator-summary">
                        <strong>Evidence-Backed Risk Reason:</strong> {item.mainIndicators}
                      </p>

                      {item.observations && (
                        <div className="fac-evidence-chips">
                          {item.observations.yield.actual != null && (
                            <span className="fac-chip yield">
                              <strong>2024 FFB Yield:</strong> {fmt(item.observations.yield.actual)} t/ha
                              {item.observations.yield.gap != null && (
                                <em className={item.observations.yield.gap < 0 ? "neg" : "pos"}>
                                  {" "}({fmt(item.observations.yield.gap)}% vs peer cohort)
                                </em>
                              )}
                            </span>
                          )}

                          <span className="fac-chip leaf">
                            <strong>Frond 17 Foliar Assay ({item.observations.foliar.year}):</strong>{" "}
                            {item.observations.foliar.lowList.length > 0 ? (
                              <span className="text-ruby">Deficient in {item.observations.foliar.lowList.join(", ")}</span>
                            ) : (
                              <span className="text-emerald">All measured nutrients in standard reference range</span>
                            )}
                          </span>

                          <span className="fac-chip dris">
                            <strong>DRIS Nutrient Diagnosis:</strong>{" "}
                            {item.observations.dris.limiting.length > 0
                              ? `Limiting: ${item.observations.dris.limiting.join(", ")}`
                              : "Balanced nutritional ratios"}
                          </span>

                          <span className={`fac-chip soil ${item.observations.soil.hasSample ? "sampled" : "unsampled"}`}>
                            <strong>Soil Chemistry Survey:</strong> {item.observations.soil.status}{" "}
                            {item.observations.soil.hasSample && `(pH ${item.observations.soil.ph}, Org C ${item.observations.soil.cOrg}%)`}
                          </span>
                        </div>
                      )}
                      <span className="fac-facts-disclaimer">
                        * Empirical observations from harvest weighbridge scale records and certified Frond 17 laboratory assays. Unaltered ground truth.
                      </span>
                    </div>
                  </div>

                  {/* TIER 2: CANONICAL SCREENING MODEL & DATA QUALITY AUDIT */}
                  <div className="fac-tier-block prediction-tier">
                    <div className="fac-tier-tag text-amber">
                      <ShieldAlert size={13} />
                      <span>MODEL EVALUATION: SCREENING SCORE & QUALITY AUDIT</span>
                    </div>

                    <div className="fac-pred-content">
                      <div className="fac-pred-row">
                        <span>
                          <strong>Risk Classification:</strong> {item.riskLevel}{" "}
                          <em>(Screening Formula: Yield Gap 40%, Foliar Assay 25%, DRIS 15%)</em>
                        </span>
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

                  {/* TIER 3: RECOMMENDED AGRONOMIC DIRECTIVES & DECISION SUPPORT */}
                  <div className="fac-tier-block action-tier">
                    <div className="fac-tier-tag text-emerald">
                      <Sprout size={13} />
                      <span>RECOMMENDED ACTIONS & FOLLOW-UP PROTOCOL (DECISION SUPPORT)</span>
                    </div>

                    <div className="fac-action-content">
                      <p className="fac-prescribed-action">
                        <strong>Action Directive:</strong> {item.recommendedAction}
                      </p>

                      {item.agronomicRationale && (
                        <p className="fac-agronomic-rationale">
                          <strong>Agronomic Rationale:</strong> {item.agronomicRationale}
                        </p>
                      )}

                      <p className="fac-protocol">
                        <strong>Follow-up Verification Protocol (60–90 Days):</strong> {item.followUpProtocol}
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
                          <span>{isAiLoading ? "Synthesizing Verified Telemetry..." : "Consult AI Agronomist Synthesis"}</span>
                        </button>
                      ) : (
                        <div className="fac-ai-card">
                          <div className="fac-ai-header">
                            <span className="fac-ai-badge">
                              <Sparkles size={13} />
                              {aiData.is_ai_generated ? "OpenAI Agronomic Synthesis" : "Deterministic Rules Engine Fallback"}
                            </span>
                            <span className="fac-ai-model">Model: {aiData.model}</span>
                          </div>

                          <div className="fac-ai-body">
                            <p><strong>Observed Finding:</strong> {aiData.recommendation?.observed_finding}</p>
                            <p><strong>Agronomic Rationale:</strong> {aiData.recommendation?.agronomic_rationale}</p>
                            <p><strong>Recommended Action:</strong> {aiData.recommendation?.recommended_action}</p>
                            <p><strong>Validation Protocol:</strong> {aiData.recommendation?.validation_protocol}</p>
                            <span className="fac-ai-footer-note">
                              {aiData.note} Never exposes API credentials to frontend.
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* CARD FOOTER: INTERACTIVE WORKFLOW STATUS & FOLLOW-UP TRACKING */}
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
                        <span>Inspect Block {item.blockId} →</span>
                      </button>
                    ) : (
                      <div className="fac-unmapped-pill-note">
                        <XCircle size={13} className="text-amber" />
                        <span>Unmapped Benchmark · Isolated from blocks B001–B042</span>
                      </div>
                    )}

                    <div className="fac-status-selector">
                      <span className="fac-status-label">Action Status:</span>
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
                        title={isCompleted ? "Click to reopen directive" : "Click to mark directive completed"}
                      >
                        {isCompleted ? <CheckSquare size={16} /> : <Square size={16} />}
                        <span>{isCompleted ? "Completed" : "Mark Complete"}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      className="fac-toggle-notes-btn"
                      onClick={() => setExpandedNotesId(isNotesExpanded ? null : item.id)}
                    >
                      <FileText size={14} />
                      <span>{isNotesExpanded ? "Hide Follow-up" : "Follow-up Tracking"}</span>
                    </button>
                  </div>

                  {/* EXPANDABLE INSPECTOR NOTES & FOLLOW-UP TRACKING DRAWER */}
                  {isNotesExpanded && (
                    <div className="fac-notes-expanded-drawer">
                      <div className="fac-drawer-header">
                        <h4><Calendar size={14} /> Follow-Up Tracking & Agronomist Field Verification</h4>
                        {rec.serverTaskId && (
                          <span className="fac-task-badge">Task ID: {rec.serverTaskId}</span>
                        )}
                      </div>

                      <div className="fac-notes-grid">
                        <div className="fac-field-group">
                          <label>
                            <UserCheck size={14} />
                            <span>Assigned Inspector / Agronomist:</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Field Agronomist A. Siregar"
                            value={rec.inspector || ""}
                            onChange={(e) => updateDetails(item.id, "inspector", e.target.value)}
                          />
                        </div>

                        <div className="fac-field-group">
                          <label>
                            <Calendar size={14} />
                            <span>Inspection Date:</span>
                          </label>
                          <input
                            type="date"
                            value={rec.inspectionDate || ""}
                            onChange={(e) => updateDetails(item.id, "inspectionDate", e.target.value)}
                          />
                        </div>

                        <div className="fac-field-group span-full">
                          <label>
                            <FileText size={14} />
                            <span>Field Verification Observations & Corrective Work Order:</span>
                          </label>
                          <textarea
                            rows={3}
                            placeholder="Record observed field conditions, weed circle cleanliness, drainage checks, bunch census results, or work order reference..."
                            value={rec.notes || ""}
                            onChange={(e) => updateDetails(item.id, "notes", e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="fac-drawer-actions">
                        <button
                          type="button"
                          className="fac-save-notes-btn"
                          onClick={() => handleSaveFollowUp(item.id)}
                        >
                          {isSaved ? <Check size={14} className="text-emerald" /> : <RefreshCw size={14} />}
                          <span>{isSaved ? "Saved & Synchronized" : "Save Follow-up Notes"}</span>
                        </button>

                        {rec.completedAt && (
                          <div className="fac-completed-timestamp">
                            <CheckCircle2 size={14} className="text-emerald" />
                            <span>Verification marked completed on: {rec.completedAt}</span>
                          </div>
                        )}
                      </div>
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
