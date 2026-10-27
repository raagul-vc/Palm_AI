import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Camera, CheckCircle2, ChevronLeft, ChevronRight,
  Database, ExternalLink, Eye, Maximize2, RefreshCw, RotateCcw,
  Scan, Search, ShieldAlert, Sliders, UploadCloud, X,
} from "lucide-react";
import {
  Cell, Pie, PieChart, ResponsiveContainer, Tooltip,
} from "recharts";

const categoryColors = {
  HIGH: "#2d6e47",
  MODERATE: "#d9a726",
  LOW: "#c75242",
  UNKNOWN: "#89958c",
};

function formatNumber(value, digits = 2) {
  if (value == null || value === "") return "N/A";
  const num = Number(value);
  if (!Number.isFinite(num)) return "N/A";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function DroneHealthPage({ datasets, sourceStatus, loadSources }) {
  const [activeTab, setActiveTab] = useState("predict");
  const [selectedChart, setSelectedChart] = useState(null);

  // Image Explorer filter state
  const [explorerSearch, setExplorerSearch] = useState("");
  const [explorerCategory, setExplorerCategory] = useState("ALL");
  const [explorerOutlierOnly, setExplorerOutlierOnly] = useState(false);
  const [explorerSort, setExplorerSort] = useState("filename_asc");
  const [explorerPage, setExplorerPage] = useState(1);
  const pageSize = 25;

  // Outlier Audit filter state
  const [outlierFilter, setOutlierFilter] = useState("ALL");
  const [outlierSearch, setOutlierSearch] = useState("");

  // Live Single-Image Inference state
  const [selectedFile, setSelectedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.25);
  const [isPredicting, setIsPredicting] = useState(false);
  const [predictResult, setPredictResult] = useState(null);
  const [predictError, setPredictError] = useState(null);
  const [viewMode, setViewMode] = useState("annotated");
  const [showDetectionList, setShowDetectionList] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const validateAndSetFile = (file) => {
    if (!file) return;

    const allowedExtensions = [".jpg", ".jpeg", ".png"];
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/jpg"];

    if (!allowedExtensions.includes(ext) && !allowedMimeTypes.includes(file.type)) {
      setPredictError(`Unsupported file format '${ext}'. Please upload a JPG, JPEG, or PNG image.`);
      setSelectedFile(null);
      setImagePreview(null);
      setPredictResult(null);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setPredictError(`Selected file exceeds the 10 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`);
      setSelectedFile(null);
      setImagePreview(null);
      setPredictResult(null);
      return;
    }

    setSelectedFile(file);
    setPredictError(null);
    setPredictResult(null);

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result);
    };
    reader.onerror = () => {
      setPredictError("Failed to read image file.");
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    validateAndSetFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    validateAndSetFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleResetPrediction = () => {
    setSelectedFile(null);
    setImagePreview(null);
    setPredictResult(null);
    setPredictError(null);
    setViewMode("annotated");
    setShowDetectionList(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRunInference = async () => {
    if (!selectedFile) {
      setPredictError("Please select or drop an aerial JPG, JPEG, or PNG image first.");
      return;
    }

    setIsPredicting(true);
    setPredictError(null);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      formData.append("conf", String(confidenceThreshold));

      const apiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
      const res = await fetch(`${apiBase}/drone/predict`, {
        method: "POST",
        body: formData,
      });

      const contentType = res.headers.get("content-type") || "";

      let data;
      if (contentType.includes("application/json")) {
        try {
          data = await res.json();
        } catch (jsonErr) {
          throw new Error(`Failed to parse server JSON response: ${jsonErr.message}`);
        }
      } else {
        const textResponse = await res.text();
        const snippet = textResponse.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
        throw new Error(
          `Server returned HTTP ${res.status} (${res.statusText || "Unexpected Response"}) with non-JSON content (${contentType || "unknown"}). ${
            snippet ? `Message: "${snippet}"` : "Please verify the backend API service is running and accessible."
          }`
        );
      }

      if (!res.ok) {
        throw new Error(data?.error || `Server responded with HTTP ${res.status}`);
      }

      setPredictResult(data);
      setViewMode("annotated");
    } catch (err) {
      console.error("Drone prediction error:", err);
      setPredictError(err.message || "Failed to execute inference on the image.");
    } finally {
      setIsPredicting(false);
    }
  };

  const summary = datasets.droneSummary || {};
  const validation = datasets.droneValidation || {};
  const outliersData = datasets.droneOutliers || {};
  const images = useMemo(() => datasets.droneImages || [], [datasets.droneImages]);
  const visualizations = useMemo(() => datasets.droneVisualizations || [], [datasets.droneVisualizations]);

  const isRefreshing = sourceStatus?.droneSummary === "loading";

  // Category chart data
  const categoryChartData = useMemo(() => {
    if (!summary.health_categories) {
      return [
        { name: "HIGH", value: 328, pct: 65.6, label: "High (≥ 80%)" },
        { name: "MODERATE", value: 73, pct: 14.6, label: "Moderate (60–<80%)" },
        { name: "LOW", value: 99, pct: 19.8, label: "Low (< 60%)" },
      ];
    }
    const hc = summary.health_categories;
    return [
      { name: "HIGH", value: hc.HIGH?.count ?? 328, pct: hc.HIGH?.percentage ?? 65.6, label: "High (≥ 80%)" },
      { name: "MODERATE", value: hc.MODERATE?.count ?? 73, pct: hc.MODERATE?.percentage ?? 14.6, label: "Moderate (60–<80%)" },
      { name: "LOW", value: hc.LOW?.count ?? 99, pct: hc.LOW?.percentage ?? 19.8, label: "Low (< 60%)" },
    ];
  }, [summary.health_categories]);

  // Filtered and sorted images for Image Explorer
  const filteredImages = useMemo(() => {
    let result = [...images];

    if (explorerSearch.trim()) {
      const q = explorerSearch.trim().toLowerCase();
      result = result.filter((img) =>
        String(img.image_filename || "").toLowerCase().includes(q)
      );
    }

    if (explorerCategory !== "ALL") {
      result = result.filter(
        (img) => String(img.health_category || "").toUpperCase() === explorerCategory
      );
    }

    if (explorerOutlierOnly) {
      result = result.filter((img) => img.is_outlier);
    }

    result.sort((a, b) => {
      if (explorerSort === "score_desc") {
        return (Number(b.drone_health_score) || 0) - (Number(a.drone_health_score) || 0);
      }
      if (explorerSort === "score_asc") {
        return (Number(a.drone_health_score) || 0) - (Number(b.drone_health_score) || 0);
      }
      if (explorerSort === "palms_desc") {
        return (Number(b.palm_detections) || 0) - (Number(a.palm_detections) || 0);
      }
      if (explorerSort === "palms_asc") {
        return (Number(a.palm_detections) || 0) - (Number(b.palm_detections) || 0);
      }
      return String(a.image_filename || "").localeCompare(String(b.image_filename || ""));
    });

    return result;
  }, [images, explorerSearch, explorerCategory, explorerOutlierOnly, explorerSort]);

  const totalPages = Math.ceil(filteredImages.length / pageSize) || 1;
  const paginatedImages = useMemo(() => {
    const start = (explorerPage - 1) * pageSize;
    return filteredImages.slice(start, start + pageSize);
  }, [filteredImages, explorerPage, pageSize]);

  // Outliers list filtering
  const outlierItems = useMemo(() => {
    const list = outliersData.outliers || [];
    let filtered = list;

    if (outlierFilter === "LOW_DETECTION") {
      filtered = filtered.filter((item) =>
        (item.outlier_categories || "").includes("Low-Detection")
      );
    } else if (outlierFilter === "HEALTH_OUTLIER") {
      filtered = filtered.filter((item) =>
        (item.outlier_categories || "").includes("Health-Outlier")
      );
    } else if (outlierFilter === "DENSITY_OUTLIER") {
      filtered = filtered.filter((item) =>
        (item.outlier_categories || "").includes("Density-Outlier")
      );
    }

    if (outlierSearch.trim()) {
      const q = outlierSearch.trim().toLowerCase();
      filtered = filtered.filter((item) =>
        String(item.image_filename || "").toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [outliersData.outliers, outlierFilter, outlierSearch]);

  return (
    <div className="drone-health-page">
      {/* COMPACT EVIDENCE DISCLAIMER BANNER */}
      <div className="compact-disclaimer-banner" role="region" aria-label="Drone Evidence Disclaimer">
        <div className="disclaimer-content-wrap">
          <ShieldAlert size={16} className="disclaimer-accent-icon" />
          <p className="disclaimer-text">
            "Drone Health Score is a model-derived image-level indicator, not a validated disease diagnosis. Images are not spatially mapped to plantation Block_ID."
          </p>
        </div>
        <div className="disclaimer-actions">
          <span className="unmapped-pill">Spatial Link: Not Available</span>
          {loadSources && (
            <button
              type="button"
              className="button-secondary refresh-btn-compact"
              onClick={loadSources}
              title="Reload Drone Health Data"
              disabled={isRefreshing}
            >
              <RefreshCw size={12} className={isRefreshing ? "spin-icon" : ""} />
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </button>
          )}
        </div>
      </div>

      {/* TOP 5 METRIC KPI CARDS */}
      <div className="stats-grid drone-kpi-grid">
        {/* KPI 1: Mean Health Score */}
        <article className="metric-card tone-green">
          <div className="metric-top">
            <span className="metric-label">MEAN DRONE HEALTH SCORE</span>
            <span className="metric-icon"><Scan size={16} /></span>
          </div>
          <strong className="metric-value">
            {formatNumber(summary.mean_health_score, 2)}
            <span className="metric-unit">%</span>
          </strong>
          <span className="metric-hint">
            Median: {formatNumber(summary.median_health_score, 2)}% · Range: {formatNumber(summary.min_health_score, 1)}%–{formatNumber(summary.max_health_score, 1)}%
          </span>
        </article>

        {/* KPI 2: Healthy Palm Detections */}
        <article className="metric-card tone-green">
          <div className="metric-top">
            <span className="metric-label">HEALTHY PALMS (CANOPY)</span>
            <span className="metric-icon"><CheckCircle2 size={16} /></span>
          </div>
          <strong className="metric-value">
            {formatNumber(summary.healthy_percentage, 2)}
            <span className="metric-unit">%</span>
          </strong>
          <span className="metric-hint">
            34,139 of 43,599 detected palms
          </span>
        </article>

        {/* KPI 3: Non-Healthy Detections */}
        <article className="metric-card tone-amber">
          <div className="metric-top">
            <span className="metric-label">NON-HEALTHY PALMS</span>
            <span className="metric-icon"><AlertTriangle size={16} /></span>
          </div>
          <strong className="metric-value">
            {formatNumber(summary.non_healthy_percentage, 2)}
            <span className="metric-unit">%</span>
          </strong>
          <span className="metric-hint">
            Small: {formatNumber(summary.small_percentage, 1)}% · Yellow: {formatNumber(summary.yellow_percentage, 2)}% · Dead: {formatNumber(summary.dead_percentage, 2)}%
          </span>
        </article>

        {/* KPI 4: Coverage & Quality */}
        <article className="metric-card">
          <div className="metric-top">
            <span className="metric-label">SURVEY IMAGES</span>
            <span className="metric-icon"><Database size={16} /></span>
          </div>
          <strong className="metric-value">
            {summary.image_count ?? 500}
            <span className="metric-unit"> images</span>
          </strong>
          <span className="metric-hint">
            43,599 palms · 0 zero-detection · 17 low-detection
          </span>
        </article>

        {/* KPI 5: Model Threshold & Stability */}
        <article className="metric-card tone-orange">
          <div className="metric-top">
            <span className="metric-label">THRESHOLD & STABILITY</span>
            <span className="metric-icon"><Sliders size={16} /></span>
          </div>
          <strong className="metric-value">
            conf {formatNumber(summary.baseline_confidence ?? 0.25, 2)}
          </strong>
          <span className="metric-hint">
            Rec: {formatNumber(summary.recommended_confidence ?? 0.25, 2)} · Pearson r = 0.9994
          </span>
        </article>
      </div>

      {/* SUBTAB NAVIGATION */}
      <div className="subtab-bar drone-subtab-bar">
        <button
          type="button"
          className={`subtab-btn ${activeTab === "predict" ? "active" : ""}`}
          onClick={() => setActiveTab("predict")}
        >
          <Camera size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Live Drone AI Prediction
          <span className="subtab-live-pill">LIVE</span>
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview & Categories
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeTab === "validation" ? "active" : ""}`}
          onClick={() => setActiveTab("validation")}
        >
          Validation & Robustness
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeTab === "visualizations" ? "active" : ""}`}
          onClick={() => setActiveTab("visualizations")}
        >
          Visual Evidence Charts ({visualizations.length || 6})
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeTab === "outliers" ? "active" : ""}`}
          onClick={() => setActiveTab("outliers")}
        >
          Statistical Outlier Audit ({summary.total_outliers_flagged ?? 89})
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeTab === "explorer" ? "active" : ""}`}
          onClick={() => setActiveTab("explorer")}
        >
          Image-Level Explorer ({images.length || 500})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUBTAB 1: OVERVIEW & HEALTH CATEGORIES */}
      {/* ========================================================================= */}
      {activeTab === "overview" && (
        <div className="drone-tab-content">
          {/* PROMINENT LIVE DRONE AI PREDICTION HERO BANNER IN OVERVIEW */}
          <div className="drone-live-predict-hero">
            <div className="hero-left">
              <div className="hero-badge-row">
                <span className="hero-live-badge"><Camera size={13} /> LIVE DRONE AI PREDICTION</span>
                <span className="hero-sub-badge">YOLO11n Real-Time Inference</span>
              </div>
              <h3>Upload & Detect Palm Crowns with Live Drone AI</h3>
              <p>
                Run live canopy detection on any RGB aerial survey image (JPG, JPEG, PNG).
                Our trained YOLO11n model detects crowns, classifies health (Healthy, Small, Yellow, Dead), and generates an annotated image with foliar scoring in seconds.
              </p>
            </div>
            <div className="hero-actions">
              <button
                type="button"
                className="button-primary hero-launch-btn"
                onClick={() => setActiveTab("predict")}
              >
                <Camera size={16} />
                <span>Open Live Drone AI Prediction</span>
              </button>
            </div>
          </div>

          <div className="overview-grid">
            {/* Operational Health Categories Card */}
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-eyebrow">DISTRIBUTION</p>
                  <h2>Project Analysis Categories</h2>
                </div>
                <span className="operational-tag">
                  Project analysis categories — not agronomically validated
                </span>
              </div>
              <p className="panel-subtitle">
                Images classified into operational categories based on ratio of healthy palms to total palms.
              </p>

              <div className="category-donut-container">
                <div className="donut-wrap">
                  <ResponsiveContainer width="100%" height={210}>
                    <PieChart>
                      <Pie
                        data={categoryChartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={62}
                        outerRadius={86}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {categoryChartData.map((entry) => (
                          <Cell key={entry.name} fill={categoryColors[entry.name]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val, name, item) => [
                          `${val} images (${item.payload.pct}%)`,
                          item.payload.label,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center">
                    <strong>500</strong>
                    <span>Images</span>
                  </div>
                </div>

                <div className="category-legend-list">
                  {categoryChartData.map((cat) => (
                    <div key={cat.name} className="category-legend-card">
                      <div className="cat-header">
                        <span className="cat-color-dot" style={{ background: categoryColors[cat.name] }} />
                        <strong>{cat.label}</strong>
                        <span className="cat-count">{cat.value} images</span>
                      </div>
                      <div className="cat-bar-track">
                        <div
                          className="cat-bar-fill"
                          style={{
                            width: `${cat.pct}%`,
                            background: categoryColors[cat.name],
                          }}
                        />
                      </div>
                      <div className="cat-footer">
                        <span>{cat.pct}% of dataset</span>
                        <small>
                          {cat.name === "HIGH" && "Dominant healthy mature canopy"}
                          {cat.name === "MODERATE" && "Mixed canopy or scattered small palms"}
                          {cat.name === "LOW" && "Immature replanted or sparse canopy"}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* YOLO Class Breakdown */}
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-eyebrow">YOLO11N INVENTORY</p>
                  <h2>Detected Canopy Classes</h2>
                </div>
                <span className="unit-pill">43,779 Total Detections</span>
              </div>
              <p className="panel-subtitle">
                Object detections at confidence 0.25 across all 500 aerial validation images.
              </p>

              <div className="detection-class-list">
                <div className="detection-class-item">
                  <div className="class-row-top">
                    <span className="class-badge healthy">Healthy Palm</span>
                    <strong>34,139</strong>
                    <span className="class-pct">78.28%</span>
                  </div>
                  <div className="cat-bar-track">
                    <div className="cat-bar-fill" style={{ width: "78.28%", background: "#2d6e47" }} />
                  </div>
                  <small className="class-note">Standard full green mature canopy</small>
                </div>

                <div className="detection-class-item">
                  <div className="class-row-top">
                    <span className="class-badge small">Small Palm</span>
                    <strong>8,835</strong>
                    <span className="class-pct">20.28%</span>
                  </div>
                  <div className="cat-bar-track">
                    <div className="cat-bar-fill" style={{ width: "20.28%", background: "#4a7bb0" }} />
                  </div>
                  <small className="class-note">Immature, young replanted, or stunted palms</small>
                </div>

                <div className="detection-class-item">
                  <div className="class-row-top">
                    <span className="class-badge yellow">Yellow Palm</span>
                    <strong>544</strong>
                    <span className="class-pct">1.25%</span>
                  </div>
                  <div className="cat-bar-track">
                    <div className="cat-bar-fill" style={{ width: "1.25%", background: "#d9a726" }} />
                  </div>
                  <small className="class-note">Chlorotic or nutrient-deficient canopy</small>
                </div>

                <div className="detection-class-item">
                  <div className="class-row-top">
                    <span className="class-badge dead">Dead Palm</span>
                    <strong>81</strong>
                    <span className="class-pct">0.19%</span>
                  </div>
                  <div className="cat-bar-track">
                    <div className="cat-bar-fill" style={{ width: "0.19%", background: "#c75242" }} />
                  </div>
                  <small className="class-note">Defoliated standing trunks or dead crowns</small>
                </div>

                <div className="detection-class-item">
                  <div className="class-row-top">
                    <span className="class-badge grass">Ground Grass</span>
                    <strong>180</strong>
                    <span className="class-pct">0.41%</span>
                  </div>
                  <div className="cat-bar-track">
                    <div className="cat-bar-fill" style={{ width: "0.41%", background: "#88988e" }} />
                  </div>
                  <small className="class-note">Inter-row vegetation (excluded from palm count)</small>
                </div>
              </div>
            </section>
          </div>

          {/* STATISTICAL INSIGHTS: TWO COMPACT CARDS */}
          <div className="stats-insights-grid">
            <div className="insight-card">
              <span className="insight-label">DISTRIBUTION</span>
              <p>
                Median health score (89.19%) is above the mean (75.81%), influenced by young/replanted imagery with high Small-Palm detections.
              </p>
            </div>
            <div className="insight-card">
              <span className="insight-label">DETECTION COVERAGE</span>
              <p>
                All 500 images contain detections. Mean detection density: 87.2 palms/image.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 2: THRESHOLD VALIDATION & ROBUSTNESS */}
      {/* ========================================================================= */}
      {activeTab === "validation" && (
        <div className="drone-tab-content">
          {/* Robustness Key Callout Strip */}
          <div className="robustness-summary-strip">
            <div className="robustness-card">
              <span className="rob-label">RECOMMENDED THRESHOLD</span>
              <strong>conf = 0.25</strong>
              <small>Preserves small and dead palm detection recall</small>
            </div>
            <div className="robustness-card">
              <span className="rob-label">PEARSON CORRELATION (r)</span>
              <strong>0.9994</strong>
              <small>Between conf 0.25 and 0.40 across 500 images</small>
            </div>
            <div className="robustness-card">
              <span className="rob-label">SPEARMAN RANK (ρ)</span>
              <strong>0.9979</strong>
              <small>Near-perfect image rank order stability</small>
            </div>
            <div className="robustness-card">
              <span className="rob-label">CATEGORY AGREEMENT</span>
              <strong>98.8%</strong>
              <small>494 of 500 images retain identical health tier</small>
            </div>
            <div className="robustness-card">
              <span className="rob-label">MEAN ABSOLUTE ERROR</span>
              <strong>0.58%</strong>
              <small>Score delta between conf 0.25 and 0.40</small>
            </div>
          </div>

          {/* Cross-Threshold Sensitivity Table */}
          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-eyebrow">SENSITIVITY EXPERIMENT</p>
                <h2>Threshold Sensitivity & Performance Stability</h2>
              </div>
              <span className="unit-pill">5 Confidence Levels Tested</span>
            </div>
            <p className="panel-subtitle">
              Evaluating Drone Health Score consistency across confidence thresholds 0.25, 0.40, 0.50, 0.60, and 0.75.
            </p>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>CONFIDENCE</th>
                    <th>PALM DETECTIONS</th>
                    <th>MEAN HEALTH</th>
                    <th>MEDIAN HEALTH</th>
                    <th>HIGH (≥80%)</th>
                    <th>MODERATE</th>
                    <th>LOW (&lt;60%)</th>
                    <th>ZERO DETECTIONS</th>
                    <th>CATEGORY STABILITY</th>
                  </tr>
                </thead>
                <tbody>
                  {(validation.threshold_comparison || [
                    { confidence_threshold: 0.25, total_palms_detected: 43599, mean_health_score: 75.81, median_health_score: 89.19, high_category_count: 328, moderate_category_count: 73, low_category_count: 99, zero_detection_images: 0 },
                    { confidence_threshold: 0.40, total_palms_detected: 43232, mean_health_score: 75.63, median_health_score: 88.89, high_category_count: 326, moderate_category_count: 75, low_category_count: 99, zero_detection_images: 0 },
                    { confidence_threshold: 0.50, total_palms_detected: 42721, mean_health_score: 75.29, median_health_score: 88.64, high_category_count: 323, moderate_category_count: 76, low_category_count: 101, zero_detection_images: 0 },
                    { confidence_threshold: 0.60, total_palms_detected: 41818, mean_health_score: 74.83, median_health_score: 88.24, high_category_count: 317, moderate_category_count: 81, low_category_count: 102, zero_detection_images: 0 },
                    { confidence_threshold: 0.75, total_palms_detected: 38870, mean_health_score: 73.49, median_health_score: 87.10, high_category_count: 301, moderate_category_count: 90, low_category_count: 109, zero_detection_images: 0 },
                  ]).map((row) => {
                    const isBaseline = Number(row.confidence_threshold) === 0.25;
                    const stability =
                      Number(row.confidence_threshold) === 0.25 ? "100.0% (Baseline)" :
                      Number(row.confidence_threshold) === 0.40 ? "98.8%" :
                      Number(row.confidence_threshold) === 0.50 ? "96.6%" :
                      Number(row.confidence_threshold) === 0.60 ? "93.8%" : "87.2%";

                    return (
                      <tr key={row.confidence_threshold} className={isBaseline ? "baseline-highlight-row" : ""}>
                        <td>
                          <strong>{formatNumber(row.confidence_threshold, 2)}</strong>
                          {isBaseline && <span className="baseline-tag">Recommended Baseline</span>}
                        </td>
                        <td>{formatNumber(row.total_palms_detected, 0)}</td>
                        <td><strong>{formatNumber(row.mean_health_score, 2)}%</strong></td>
                        <td>{formatNumber(row.median_health_score, 2)}%</td>
                        <td><span className="count-pill high">{row.high_category_count} ({formatNumber(row.high_category_count / 5, 1)}%)</span></td>
                        <td><span className="count-pill moderate">{row.moderate_category_count} ({formatNumber(row.moderate_category_count / 5, 1)}%)</span></td>
                        <td><span className="count-pill low">{row.low_category_count} ({formatNumber(row.low_category_count / 5, 1)}%)</span></td>
                        <td>{row.zero_detection_images}</td>
                        <td><strong>{stability}</strong></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* YOLO Detection Confidence by Class */}
          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="panel-eyebrow">CLASS-LEVEL CONFIDENCE</p>
                <h2>YOLO Detection Confidence Distributions</h2>
              </div>
              <span className="operational-tag">Why retain conf = 0.25?</span>
            </div>
            <p className="panel-subtitle">
              Distribution of raw model confidence per class, demonstrating why 0.25 remains optimal for operational monitoring.
            </p>

            <div className="confidence-class-grid">
              <div className="confidence-stat-box">
                <span className="conf-class-badge healthy">Healthy Palm</span>
                <div className="conf-stat-row">
                  <span>Detections: <strong>34,139</strong></span>
                  <span>Mean Conf: <strong>0.871</strong></span>
                </div>
                <div className="conf-bar-track"><div className="conf-bar-fill" style={{ width: "87.1%" }} /></div>
                <small>High model certainty; resilient to threshold shifts.</small>
              </div>

              <div className="confidence-stat-box">
                <span className="conf-class-badge small">Small Palm</span>
                <div className="conf-stat-row">
                  <span>Detections: <strong>8,835</strong></span>
                  <span>Mean Conf: <strong>0.758</strong></span>
                </div>
                <div className="conf-bar-track"><div className="conf-bar-fill" style={{ width: "75.8%" }} /></div>
                <small>Immature or replanted palms; well-calibrated.</small>
              </div>

              <div className="confidence-stat-box">
                <span className="conf-class-badge yellow">Yellow Palm</span>
                <div className="conf-stat-row">
                  <span>Detections: <strong>544</strong></span>
                  <span>Mean Conf: <strong>0.638</strong></span>
                </div>
                <div className="conf-bar-track"><div className="conf-bar-fill" style={{ width: "63.8%" }} /></div>
                <small>Subtle chlorosis signatures; sensitive to higher thresholds.</small>
              </div>

              <div className="confidence-stat-box alert-box">
                <span className="conf-class-badge dead">Dead Palm</span>
                <div className="conf-stat-row">
                  <span>Detections: <strong>81</strong></span>
                  <span>Mean Conf: <strong>0.468</strong></span>
                </div>
                <div className="conf-bar-track"><div className="conf-bar-fill" style={{ width: "46.8%", background: "#c75242" }} /></div>
                <small>
                  <strong>Critical Finding:</strong> Raising threshold to 0.50 prunes 44% of dead palm detections while changing mean health score by only 0.52%. Retaining conf=0.25 preserves detection of critical mortality.
                </small>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 3: VISUALIZATION GALLERY */}
      {/* ========================================================================= */}
      {activeTab === "visualizations" && (
        <div className="drone-tab-content">
          <div className="gallery-header-row">
            <div>
              <p className="panel-eyebrow">EMPIRICAL VALIDATION CHARTS</p>
              <h2>Publication-Quality Visual Evidence</h2>
              <p className="panel-subtitle">
                Six verified visualization charts generated directly from the 500-image cross-threshold validation pipeline. Click any chart to expand.
              </p>
            </div>
            <span className="unit-pill">{visualizations.length || 6} Verified Artifacts</span>
          </div>

          <div className="drone-charts-grid">
            {(visualizations.length ? visualizations : [
              {
                id: "1_health_score_by_confidence_threshold",
                title: "1. Health Score by Confidence Threshold",
                filename: "1_health_score_by_confidence_threshold.png",
                url: "/api/drone/visualizations/1_health_score_by_confidence_threshold.png",
                description: "Mean and median Drone Health Score stability across 5 confidence thresholds (0.25 to 0.75).",
              },
              {
                id: "2_health_score_correlation_across_thresholds",
                title: "2. Health Score Correlation Across Thresholds",
                filename: "2_health_score_correlation_across_thresholds.png",
                url: "/api/drone/visualizations/2_health_score_correlation_across_thresholds.png",
                description: "Scatter and Pearson r correlation matrix confirming near-linear rank stability (r=0.9994).",
              },
              {
                id: "3_healthy_pct_by_confidence_threshold",
                title: "3. Healthy Palm % Stability Across Thresholds",
                filename: "3_healthy_pct_by_confidence_threshold.png",
                url: "/api/drone/visualizations/3_healthy_pct_by_confidence_threshold.png",
                description: "Healthy palm percentage curves demonstrating bounded variation across confidence levels.",
              },
              {
                id: "4_non_healthy_pct_by_confidence_threshold",
                title: "4. Non-Healthy Palm % by Threshold",
                filename: "4_non_healthy_pct_by_confidence_threshold.png",
                url: "/api/drone/visualizations/4_non_healthy_pct_by_confidence_threshold.png",
                description: "Proportion of non-healthy palm detections (small, yellow, dead) across sensitivity levels.",
              },
              {
                id: "5_distribution_of_health_score_changes",
                title: "5. Distribution of Health Score Changes",
                filename: "5_distribution_of_health_score_changes.png",
                url: "/api/drone/visualizations/5_distribution_of_health_score_changes.png",
                description: "Histogram of score shifts (Δ score) when moving from conf 0.25 to 0.40 (MAE = 0.58%).",
              },
              {
                id: "6_detection_count_vs_health_score",
                title: "6. Detection Count vs Health Score Landscape",
                filename: "6_detection_count_vs_health_score.png",
                url: "/api/drone/visualizations/6_detection_count_vs_health_score.png",
                description: "Palms per image vs Health Score with transparent outlier boundaries (17 low, 59 health, 15 density).",
              },
            ]).map((chart) => (
              <div
                key={chart.id}
                className="drone-chart-card clickable"
                onClick={() => setSelectedChart(chart)}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") setSelectedChart(chart); }}
              >
                <div className="chart-preview-wrap">
                  <img
                    src={chart.url}
                    alt={chart.title}
                    className="chart-preview-img"
                    loading="lazy"
                  />
                  <div className="chart-overlay-hint">
                    <Maximize2 size={18} />
                    <span>Expand Chart</span>
                  </div>
                </div>
                <div className="chart-info">
                  <h4>{chart.title}</h4>
                  <p>{chart.description}</p>
                  <span className="chart-filename-tag">{chart.filename}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Lightbox Modal */}
          {selectedChart && (
            <div className="modal-backdrop" onClick={() => setSelectedChart(null)}>
              <div className="modal-window chart-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <h3>{selectedChart.title}</h3>
                    <p className="modal-sub">{selectedChart.description}</p>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setSelectedChart(null)}
                    aria-label="Close chart modal"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="modal-body-chart">
                  <img
                    src={selectedChart.url}
                    alt={selectedChart.title}
                    className="modal-full-img"
                  />
                </div>
                <div className="modal-footer">
                  <span className="file-origin-badge">
                    Artifact: drone/outputs/drone_health_validation/{selectedChart.filename}
                  </span>
                  <a
                    href={selectedChart.url}
                    target="_blank"
                    rel="noreferrer"
                    className="button-secondary"
                  >
                    <ExternalLink size={13} /> Open Image in New Tab
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 4: STATISTICAL OUTLIER AUDIT (89 FLAGGED IMAGES) */}
      {/* ========================================================================= */}
      {activeTab === "outliers" && (
        <div className="drone-tab-content">
          <div className="outlier-intro-banner">
            <div className="outlier-intro-top">
              <span className="outlier-alert-icon"><AlertTriangle size={18} /></span>
              <div>
                <h4>Transparent Statistical Outlier Criteria (89 Total Flagged Images)</h4>
                <p>
                  <strong>Critical Clarification:</strong> These images are identified through non-parametric distribution statistics (Tukey’s IQR rule) and flight geometry boundaries. <em>They are NOT confirmed canopy diseases.</em> For instance, statistical health outliers represent replanted young palm blocks with 100% "small" crowns.
                </p>
              </div>
            </div>

            <div className="rules-grid">
              <div className="rule-card">
                <span className="rule-badge low-det">RULE 1: Low-Detection Images</span>
                <strong className="rule-metric">17 images</strong>
                <p className="rule-detail">
                  Detections &lt; 50 palms. Caused by flight line boundaries, edge clipping, or heavy canopy shadow. No zero-detection images exist.
                </p>
              </div>

              <div className="rule-card">
                <span className="rule-badge health-out">RULE 2: Statistical Health Outliers</span>
                <strong className="rule-metric">59 images</strong>
                <p className="rule-detail">
                  Drone Health Score &lt; 28.34% (Q1 - 1.5×IQR). 22 images have 0% healthy palms because they consist exclusively of young replanted palms.
                </p>
              </div>

              <div className="rule-card">
                <span className="rule-badge density-out">RULE 3: Detection-Density Outliers</span>
                <strong className="rule-metric">15 images</strong>
                <p className="rule-detail">
                  Palms &ge; 107 per image (Q3 + 1.5×IQR). Indicates tight planting spacing or flight overlap at image borders.
                </p>
              </div>
            </div>
          </div>

          {/* Outliers Table Controls */}
          <div className="table-controls outlier-controls">
            <div className="filter-button-group">
              <button
                type="button"
                className={`filter-btn ${outlierFilter === "ALL" ? "active" : ""}`}
                onClick={() => setOutlierFilter("ALL")}
              >
                All Flagged ({outliersData.total_flagged_images ?? 89})
              </button>
              <button
                type="button"
                className={`filter-btn ${outlierFilter === "LOW_DETECTION" ? "active" : ""}`}
                onClick={() => setOutlierFilter("LOW_DETECTION")}
              >
                Low Detection (17)
              </button>
              <button
                type="button"
                className={`filter-btn ${outlierFilter === "HEALTH_OUTLIER" ? "active" : ""}`}
                onClick={() => setOutlierFilter("HEALTH_OUTLIER")}
              >
                Health Outlier (59)
              </button>
              <button
                type="button"
                className={`filter-btn ${outlierFilter === "DENSITY_OUTLIER" ? "active" : ""}`}
                onClick={() => setOutlierFilter("DENSITY_OUTLIER")}
              >
                Density Outlier (15)
              </button>
            </div>

            <label className="search-box">
              <Search size={15} />
              <input
                value={outlierSearch}
                onChange={(e) => setOutlierSearch(e.target.value)}
                placeholder="Search image (e.g. 0081, 0425)"
                aria-label="Search outlier image"
              />
            </label>
          </div>

          {/* Outliers Table */}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>IMAGE FILENAME</th>
                  <th>PALM DETECTIONS</th>
                  <th>HEALTHY</th>
                  <th>SMALL</th>
                  <th>YELLOW</th>
                  <th>DEAD</th>
                  <th>HEALTH SCORE</th>
                  <th>STATISTICAL OUTLIER REASON</th>
                  <th>OPERATIONAL INTERPRETATION</th>
                </tr>
              </thead>
              <tbody>
                {outlierItems.map((item) => {
                  const isZero = Number(item.drone_health_score) === 0;
                  const isLowDet = (item.outlier_categories || "").includes("Low-Detection");
                  const isHealthOut = (item.outlier_categories || "").includes("Health-Outlier");
                  const isDensityOut = (item.outlier_categories || "").includes("Density-Outlier");

                  return (
                    <tr key={item.image_filename}>
                      <td><strong className="block-id">{item.image_filename}</strong></td>
                      <td>
                        <strong>{item.palm_detections}</strong>
                        {isLowDet && <small className="text-flag-red"> (&lt; 50)</small>}
                        {isDensityOut && <small className="text-flag-orange"> (&ge; 107)</small>}
                      </td>
                      <td>{item.healthy_count}</td>
                      <td>{item.small_count}</td>
                      <td>{item.yellow_count}</td>
                      <td>{item.dead_count}</td>
                      <td className={isZero ? "text-negative" : ""}>
                        <strong>{formatNumber(item.drone_health_score, 2)}%</strong>
                      </td>
                      <td>
                        <div className="outlier-badge-stack">
                          {isLowDet && <span className="outlier-tag low-det">Low Detection (&lt;50)</span>}
                          {isHealthOut && <span className="outlier-tag health-out">Health Outlier (&lt;28.3%)</span>}
                          {isDensityOut && <span className="outlier-tag density-out">Density Outlier (&ge;107)</span>}
                        </div>
                      </td>
                      <td>
                        <span className="operational-note">
                          {isZero && Number(item.small_count) > 0
                            ? "Immature / Replanted Block (100% Small Palms)"
                            : isLowDet
                            ? "Flight Line Boundary / Partial Image"
                            : isDensityOut
                            ? "High Planting Density / Flight Overlap"
                            : item.operational_interpretation || "Statistical Tail Observation"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 5: IMAGE-LEVEL EXPLORER (500 IMAGES) */}
      {/* ========================================================================= */}
      {activeTab === "explorer" && (
        <div className="drone-tab-content">
          {/* Controls Bar */}
          <div className="table-controls explorer-controls">
            <label className="search-box">
              <Search size={15} />
              <input
                value={explorerSearch}
                onChange={(e) => {
                  setExplorerSearch(e.target.value);
                  setExplorerPage(1);
                }}
                placeholder="Search by image filename (e.g. 0001, 0350)"
                aria-label="Search image filename"
              />
            </label>

            <label className="filter-box">
              <span>Category</span>
              <select
                value={explorerCategory}
                onChange={(e) => {
                  setExplorerCategory(e.target.value);
                  setExplorerPage(1);
                }}
              >
                <option value="ALL">All Categories (500)</option>
                <option value="HIGH">High (≥ 80%) [328]</option>
                <option value="MODERATE">Moderate (60–&lt;80%) [73]</option>
                <option value="LOW">Low (&lt; 60%) [99]</option>
              </select>
            </label>

            <label className="filter-box">
              <span>Sort by</span>
              <select
                value={explorerSort}
                onChange={(e) => setExplorerSort(e.target.value)}
              >
                <option value="filename_asc">Filename (Ascending)</option>
                <option value="score_desc">Health Score (Highest First)</option>
                <option value="score_asc">Health Score (Lowest First)</option>
                <option value="palms_desc">Palm Count (Highest First)</option>
                <option value="palms_asc">Palm Count (Lowest First)</option>
              </select>
            </label>

            <button
              type="button"
              className={`outlier-toggle-btn ${explorerOutlierOnly ? "active" : ""}`}
              onClick={() => {
                setExplorerOutlierOnly(!explorerOutlierOnly);
                setExplorerPage(1);
              }}
            >
              <AlertTriangle size={14} />
              <span>{explorerOutlierOnly ? "Showing Outliers Only" : "Filter Outliers (89)"}</span>
            </button>
          </div>

          {/* Results Summary */}
          <div className="explorer-status-row">
            <span>
              Showing <strong>{filteredImages.length}</strong> of <strong>{images.length || 500}</strong> validated images
              {explorerOutlierOnly && " (Outliers Only)"}
              {explorerCategory !== "ALL" && ` · Category: ${explorerCategory}`}
            </span>
            <span className="pagination-info">
              Page <strong>{explorerPage}</strong> of <strong>{totalPages}</strong>
            </span>
          </div>

          {/* Image Records Table */}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>IMAGE FILENAME</th>
                  <th>PALM DETECTIONS</th>
                  <th>HEALTHY</th>
                  <th>HEALTHY %</th>
                  <th>SMALL</th>
                  <th>YELLOW</th>
                  <th>DEAD</th>
                  <th>GRASS</th>
                  <th>DRONE HEALTH SCORE</th>
                  <th>PROJECT CATEGORY</th>
                  <th>OUTLIER STATUS</th>
                </tr>
              </thead>
              <tbody>
                {paginatedImages.map((img) => {
                  const cat = img.health_category || "UNKNOWN";
                  const score = Number(img.drone_health_score);

                  return (
                    <tr key={img.image_filename}>
                      <td><strong className="block-id">{img.image_filename}</strong></td>
                      <td><strong>{img.palm_detections}</strong></td>
                      <td>{img.healthy_count}</td>
                      <td>{formatNumber(img.healthy_percentage, 1)}%</td>
                      <td>{img.small_count}</td>
                      <td>{img.yellow_count}</td>
                      <td>{img.dead_count}</td>
                      <td>{img.grass_count}</td>
                      <td>
                        <strong>{formatNumber(score, 2)}%</strong>
                      </td>
                      <td>
                        <span className={`risk-badge ${cat.toLowerCase()}`}>
                          <i />{cat}
                        </span>
                      </td>
                      <td>
                        {img.is_outlier ? (
                          <span className="outlier-pill">
                            <AlertTriangle size={11} /> Flagged
                          </span>
                        ) : (
                          <span className="text-muted-dash">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="pagination-bar">
              <button
                type="button"
                className="button-secondary"
                disabled={explorerPage <= 1}
                onClick={() => setExplorerPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={15} /> Previous
              </button>
              <div className="page-numbers">
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  let p = i + 1;
                  if (totalPages > 7) {
                    if (explorerPage > 4) {
                      p = explorerPage - 3 + i;
                    }
                    if (p > totalPages) return null;
                  }
                  return (
                    <button
                      key={p}
                      type="button"
                      className={`page-num-btn ${explorerPage === p ? "active" : ""}`}
                      onClick={() => setExplorerPage(p)}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="button-secondary"
                disabled={explorerPage >= totalPages}
                onClick={() => setExplorerPage((p) => Math.min(totalPages, p + 1))}
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB: LIVE DRONE AI PREDICTION */}
      {/* ========================================================================= */}
      {activeTab === "predict" && (
        <div className="drone-tab-content drone-predict-tab" id="live-drone-ai-prediction">
          {/* Scientific Provenance Banner */}
          <div className="drone-predict-notice">
            <div className="drone-notice-icon">
              <Camera size={20} />
            </div>
            <div className="drone-notice-body">
              <strong>Live Drone AI Prediction — YOLO11n Canopy Health Engine</strong>
              <p>
                Run live, in-memory single-image palm crown detection using the project's trained YOLO11n weights (<code>palm_yolo_best.pt</code>).
                Detections classify visible crown morphology into 5 classes: <strong>Healthy</strong> (green canopy), <strong>Small</strong> (juvenile/stunted), <strong>Yellow</strong> (chlorotic stress), <strong>Dead</strong> (standing desiccated trunks), and <strong>Grass</strong> (ground weed cover).
                This is visual RGB object detection and does <em>NOT</em> provide clinical pathology diagnosis (e.g. <em>Ganoderma</em> root rot).
                Uploaded imagery is evaluated in-memory on CPU and is <strong>not mapped to any PALM AI management block</strong>.
              </p>
            </div>
          </div>

          {/* Upload and Control Card */}
          <section className="panel drone-upload-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-eyebrow">IMAGE INGESTION & CONFIGURATION</p>
                <h2>Live Drone AI Prediction</h2>
              </div>
              <div className="panel-heading-badges" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <span className="operational-tag">Model: YOLO11n (palm_yolo_best.pt)</span>
                <span className="operational-tag">In-Memory Inference (Max 10 MB)</span>
              </div>
            </div>

            <div className="drone-upload-grid">
              {/* Left Column: Dropzone & Parameters */}
              <div className="drone-upload-col">
                <div
                  className={`drone-dropzone ${selectedFile ? "has-file" : ""} ${isDragging ? "drag-over" : ""}`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => !selectedFile && fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload aerial drone image"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="drone-file-input"
                    className="drone-file-input"
                    accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                    onChange={handleFileChange}
                  />

                  {imagePreview ? (
                    <div className="drone-preview-wrapper">
                      <img src={imagePreview} alt="Selected preview" className="drone-preview-img" />
                      <div className="drone-preview-overlay">
                        <span>Click "Change" or drag another image to replace</span>
                      </div>
                    </div>
                  ) : (
                    <div className="drone-dropzone-empty">
                      <div className="dropzone-icon-circle">
                        <UploadCloud size={32} />
                      </div>
                      <strong>Drag & drop aerial image here, or click to browse</strong>
                      <p>Supports JPG, JPEG, and PNG (up to 10 MB · Recommended 1024×1024 px)</p>
                      <button
                        type="button"
                        className="button-secondary button-sm dropzone-browse-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                      >
                        Select Image File
                      </button>
                    </div>
                  )}
                </div>

                {/* Controls Card */}
                <div className="drone-controls-card">
                  <div className="control-group">
                    <div className="control-header">
                      <label htmlFor="conf-threshold-slider">Confidence Threshold (conf)</label>
                      <span className="control-val-badge">conf = {confidenceThreshold.toFixed(2)}</span>
                    </div>
                    <input
                      id="conf-threshold-slider"
                      type="range"
                      min="0.05"
                      max="0.85"
                      step="0.05"
                      value={confidenceThreshold}
                      onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                      className="drone-slider"
                    />
                    <div className="slider-labels">
                      <span>0.10 (Sensitive)</span>
                      <span className="baseline-tag">0.25 (Validated Standard)</span>
                      <span>0.85 (Strict)</span>
                    </div>
                    <small className="control-hint">
                      Confidence 0.25 is the validated operational standard that retains small juvenile and chlorotic yellow crowns without noise.
                    </small>
                  </div>

                  {selectedFile && (
                    <div className="file-info-badge">
                      <CheckCircle2 size={14} className="text-emerald" />
                      <span className="file-name" title={selectedFile.name}>{selectedFile.name}</span>
                      <span className="file-size">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                      <button
                        type="button"
                        className="file-change-link"
                        onClick={() => fileInputRef.current?.click()}
                        title="Choose a different image"
                      >
                        Change
                      </button>
                    </div>
                  )}

                  {predictError && (
                    <div className="drone-error-banner" role="alert">
                      <AlertTriangle size={16} />
                      <span className="error-text">{predictError}</span>
                      <button
                        type="button"
                        className="error-dismiss-btn"
                        onClick={() => setPredictError(null)}
                        aria-label="Dismiss error"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  <div className="drone-btn-row">
                    <button
                      type="button"
                      className="button-primary drone-predict-btn"
                      disabled={!selectedFile || isPredicting}
                      onClick={handleRunInference}
                    >
                      {isPredicting ? (
                        <>
                          <RefreshCw size={16} className="spin-icon" />
                          <span>Analyzing with YOLO11n...</span>
                        </>
                      ) : (
                        <>
                          <Camera size={16} />
                          <span>Analyze Image</span>
                        </>
                      )}
                    </button>

                    {selectedFile && (
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={handleResetPrediction}
                        disabled={isPredicting}
                        title="Clear current image and results"
                      >
                        <RotateCcw size={14} />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Dynamic Results / Empty State / Loading */}
              <div className="drone-results-col">
                {isPredicting && (
                  <div className="drone-loading-card">
                    <div className="loading-state">
                      <span className="spinner" />
                      <div>
                        <strong>Running YOLO11n Crown Detection & Health Classification...</strong>
                        <p>Inference executing in-memory on CPU at 1024×1024 resolution.</p>
                      </div>
                    </div>
                  </div>
                )}

                {!isPredicting && !predictResult && (
                  <div className="drone-empty-instructions-card">
                    <div className="instructions-header">
                      <Scan size={24} className="text-emerald" />
                      <h3>How Live Drone AI Prediction Works</h3>
                    </div>
                    <ul className="instructions-list">
                      <li>
                        <strong>1. Select or Drop an Image:</strong> Upload any high-resolution RGB aerial orthomosaic crop or drone survey photo (JPG, JPEG, or PNG up to 10 MB).
                      </li>
                      <li>
                        <strong>2. Configure Confidence:</strong> Baseline threshold 0.25 is pre-calibrated to preserve detection recall for small juvenile and chlorotic crowns.
                      </li>
                      <li>
                        <strong>3. Click "Analyze Image":</strong> In-memory YOLO11n extracts crown bounding boxes and computes the Drone Health Score.
                      </li>
                      <li>
                        <strong>4. Review Outputs:</strong> Examine annotated bounding boxes, detected palm count, class distribution, and individual confidence scores.
                      </li>
                    </ul>

                    <div className="model-specs-strip">
                      <div className="spec-pill"><strong>Model:</strong> YOLO11n-seg/det</div>
                      <div className="spec-pill"><strong>Weights:</strong> palm_yolo_best.pt</div>
                      <div className="spec-pill"><strong>Input:</strong> 1024×1024 RGB</div>
                      <div className="spec-pill"><strong>5 Classes:</strong> Healthy, Small, Yellow, Dead, Grass</div>
                    </div>
                  </div>
                )}

                {!isPredicting && predictResult && (
                  <div className="drone-prediction-outcome">
                    {/* Summary Header */}
                    <div className="result-quick-header">
                      <div>
                        <span className="result-status-tag">Inference Complete</span>
                        <h3>Foliar Health & Crown Assessment</h3>
                      </div>
                      <div className="result-quick-meta">
                        <span>{predictResult.filename}</span>
                        <span>{predictResult.dimensions.width}×{predictResult.dimensions.height} px</span>
                        <span>conf ≥ {predictResult.confidence_threshold}</span>
                      </div>
                    </div>

                    {/* Health Summary Banner */}
                    <div className={`health-summary-banner tone-${predictResult.drone_health_score >= 80 ? 'green' : predictResult.drone_health_score >= 60 ? 'amber' : 'red'}`}>
                      <div className="banner-left">
                        <span className="health-badge">
                          {predictResult.drone_health_score >= 80 ? 'HIGH HEALTH TIER' : predictResult.drone_health_score >= 60 ? 'MODERATE HEALTH TIER' : 'LOW HEALTH TIER'}
                        </span>
                        <p className="summary-desc">
                          {predictResult.healthy_count} of {predictResult.palm_detections} detected palm crowns ({predictResult.drone_health_score}%) exhibit normal green canopy morphology.
                          {predictResult.small_count > 0 && ` Flagged ${predictResult.small_count} juvenile/stunted crown${predictResult.small_count > 1 ? 's' : ''}.`}
                          {predictResult.yellow_count > 0 && ` Detected ${predictResult.yellow_count} chlorotic/yellow crown${predictResult.yellow_count > 1 ? 's' : ''}.`}
                          {predictResult.dead_count > 0 && ` Found ${predictResult.dead_count} standing dead trunk${predictResult.dead_count > 1 ? 's' : ''}.`}
                        </p>
                      </div>
                      <div className="banner-score">
                        <span className="score-num">{predictResult.drone_health_score}%</span>
                        <span className="score-lbl">Health Score</span>
                      </div>
                    </div>

                    {/* KPI 6-Grid */}
                    <div className="predict-kpi-grid">
                      <article className="metric-card tone-green">
                        <div className="metric-top">
                          <span className="metric-label">DRONE HEALTH SCORE</span>
                          <CheckCircle2 size={16} />
                        </div>
                        <strong className="metric-value">
                          {formatNumber(predictResult.drone_health_score, 1)}
                          <span className="metric-unit">%</span>
                        </strong>
                        <span className="metric-hint">Healthy canopy ratio</span>
                      </article>

                      <article className="metric-card">
                        <div className="metric-top">
                          <span className="metric-label">DETECTED PALMS</span>
                          <Scan size={16} />
                        </div>
                        <strong className="metric-value">
                          {predictResult.palm_detections}
                          <span className="metric-unit"> crowns</span>
                        </strong>
                        <span className="metric-hint">Excludes ground grass</span>
                      </article>

                      <article className="metric-card tone-emerald">
                        <div className="metric-top">
                          <span className="metric-label">HEALTHY PALMS</span>
                          <span className="class-dot dot-healthy" />
                        </div>
                        <strong className="metric-value">
                          {predictResult.healthy_count}
                          <span className="metric-unit"> palms</span>
                        </strong>
                        <span className="metric-hint">
                          {predictResult.palm_detections > 0 ? ((predictResult.healthy_count / predictResult.palm_detections) * 100).toFixed(1) : 0}% of palms
                        </span>
                      </article>

                      <article className="metric-card tone-amber">
                        <div className="metric-top">
                          <span className="metric-label">SMALL / STUNTED</span>
                          <span className="class-dot dot-small" />
                        </div>
                        <strong className="metric-value">
                          {predictResult.small_count}
                          <span className="metric-unit"> palms</span>
                        </strong>
                        <span className="metric-hint">
                          {predictResult.palm_detections > 0 ? ((predictResult.small_count / predictResult.palm_detections) * 100).toFixed(1) : 0}% of palms
                        </span>
                      </article>

                      <article className="metric-card tone-orange">
                        <div className="metric-top">
                          <span className="metric-label">YELLOW / CHLOROTIC</span>
                          <span className="class-dot dot-yellow" />
                        </div>
                        <strong className="metric-value">
                          {predictResult.yellow_count}
                          <span className="metric-unit"> palms</span>
                        </strong>
                        <span className="metric-hint">
                          {predictResult.palm_detections > 0 ? ((predictResult.yellow_count / predictResult.palm_detections) * 100).toFixed(1) : 0}% of palms
                        </span>
                      </article>

                      <article className="metric-card tone-red">
                        <div className="metric-top">
                          <span className="metric-label">DEAD PALMS</span>
                          <span className="class-dot dot-dead" />
                        </div>
                        <strong className="metric-value">
                          {predictResult.dead_count}
                          <span className="metric-unit"> palms</span>
                        </strong>
                        <span className="metric-hint">
                          {predictResult.palm_detections > 0 ? ((predictResult.dead_count / predictResult.palm_detections) * 100).toFixed(1) : 0}% of palms
                        </span>
                      </article>
                    </div>

                    {/* Class Breakdown Bars */}
                    <div className="predict-breakdown-card">
                      <div className="breakdown-header">
                        <strong>Class-Wise Detection Breakdown</strong>
                        <span className="total-badge">Total Detections: {predictResult.total_detections} (incl. {predictResult.grass_count} ground grass)</span>
                      </div>
                      <div className="breakdown-rows">
                        {[
                          { label: "Healthy Palm", count: predictResult.healthy_count, color: "#2d6e47", dotClass: "dot-healthy", isPalm: true },
                          { label: "Small / Stunted", count: predictResult.small_count, color: "#d9a726", dotClass: "dot-small", isPalm: true },
                          { label: "Yellow / Chlorotic", count: predictResult.yellow_count, color: "#eab308", dotClass: "dot-yellow", isPalm: true },
                          { label: "Dead Palm", count: predictResult.dead_count, color: "#c75242", dotClass: "dot-dead", isPalm: true },
                          { label: "Ground Grass (weed)", count: predictResult.grass_count, color: "#94a3b8", dotClass: "dot-grass", isPalm: false },
                        ].map((cls, idx) => {
                          const pct = predictResult.palm_detections > 0 && cls.isPalm
                            ? ((cls.count / predictResult.palm_detections) * 100).toFixed(1)
                            : predictResult.total_detections > 0
                            ? ((cls.count / predictResult.total_detections) * 100).toFixed(1)
                            : 0;
                          return (
                            <div key={idx} className="breakdown-item">
                              <div className="breakdown-item-top">
                                <span className="item-label">
                                  <span className={`class-dot ${cls.dotClass}`} />
                                  {cls.label}
                                </span>
                                <span className="item-counts">
                                  <strong>{cls.count}</strong>
                                  <span className="item-pct">({pct}%)</span>
                                </span>
                              </div>
                              <div className="cat-bar-track">
                                <div className="cat-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: cls.color }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Annotated Image Viewer */}
                    <div className="drone-image-viewer-container">
                      <div className="viewer-toolbar">
                        <div className="viewer-mode-buttons">
                          <button
                            type="button"
                            className={`mode-btn ${viewMode === "annotated" ? "active" : ""}`}
                            onClick={() => setViewMode("annotated")}
                          >
                            <Eye size={14} />
                            <span>Annotated Image (YOLO Bounding Boxes)</span>
                          </button>
                          <button
                            type="button"
                            className={`mode-btn ${viewMode === "original" ? "active" : ""}`}
                            onClick={() => setViewMode("original")}
                          >
                            <span>Original Image</span>
                          </button>
                        </div>

                        <div className="viewer-meta-info">
                          <span>Threshold: conf ≥ {predictResult.confidence_threshold}</span>
                          <button
                            type="button"
                            className="button-secondary button-sm"
                            onClick={() => setShowDetectionList(!showDetectionList)}
                          >
                            {showDetectionList ? "Hide Detections Table" : `Show All ${predictResult.total_detections} Detections`}
                          </button>
                        </div>
                      </div>

                      <div className="annotated-image-box">
                        {viewMode === "annotated" && predictResult.annotated_image ? (
                          <img
                            src={predictResult.annotated_image}
                            alt="Annotated detection results with bounding boxes"
                            className="drone-full-annotated-img"
                          />
                        ) : (
                          <img
                            src={imagePreview}
                            alt="Original uploaded image"
                            className="drone-full-annotated-img"
                          />
                        )}
                      </div>
                    </div>

                    {/* Detailed Detections Table */}
                    {showDetectionList && (
                      <div className="predict-detections-table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Class</th>
                              <th>Confidence Score</th>
                              <th>Bounding Box [x1, y1, x2, y2]</th>
                            </tr>
                          </thead>
                          <tbody>
                            {predictResult.detections.map((det, idx) => (
                              <tr key={idx}>
                                <td>{idx + 1}</td>
                                <td>
                                  <span className={`status-chip class-chip-${det.class_name.toLowerCase()}`}>
                                    {det.class_name}
                                  </span>
                                </td>
                                <td>
                                  <strong>{(det.confidence * 100).toFixed(1)}%</strong>
                                  <small className="text-muted" style={{ marginLeft: 6 }}>({det.confidence})</small>
                                </td>
                                <td className="code-text font-mono text-xs">
                                  [{det.bbox.join(", ")}]
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
