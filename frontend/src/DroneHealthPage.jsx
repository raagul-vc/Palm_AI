import { useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight,
  Database, ExternalLink, Maximize2, RefreshCw,
  Scan, Search, ShieldAlert, Sliders, X,
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
  const [activeTab, setActiveTab] = useState("overview");
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
      {/* STEP 5: PROMINENT EVIDENCE DISCLAIMER BANNER */}
      <div className="drone-disclaimer-card" role="region" aria-label="Drone Evidence Disclaimer">
        <div className="drone-disclaimer-top">
          <div className="disclaimer-title-group">
            <span className="disclaimer-icon-badge">
              <ShieldAlert size={18} />
            </span>
            <div>
              <div className="disclaimer-heading-row">
                <h3>Drone Health Evidence Disclaimer</h3>
                <span className="block-unavailable-badge">
                  Block Mapping: Unavailable
                </span>
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
              <p className="disclaimer-quote">
                "Drone Health Score is a model-derived image-level indicator. It is not a validated disease diagnosis and is not mapped to Palm Plantation Block_ID."
              </p>
            </div>
          </div>
        </div>

        <div className="drone-isolation-specs">
          <div className="isolation-item">
            <span className="isolation-label">SPATIAL LINKAGE</span>
            <strong>Canvas Pixel Coordinates Only</strong>
            <small>MOPAD Site 2 benchmark tiles; no GIS shapefile or Block_ID</small>
          </div>
          <div className="isolation-item">
            <span className="isolation-label">RISK ENGINE STATUS</span>
            <strong>Strictly Isolated & Decoupled</strong>
            <small>Does not alter palm risk formula or peer comparisons</small>
          </div>
          <div className="isolation-item">
            <span className="isolation-label">SELECTION BEHAVIOR</span>
            <strong>Independent Evidence Module</strong>
            <small>Block selector (B001/B002/B005) does not filter drone data</small>
          </div>
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
            <span className="metric-label">DETECTION QUALITY</span>
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
          <div className="overview-grid">
            {/* Operational Health Categories Card */}
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-eyebrow">DISTRIBUTION</p>
                  <h2>Project Analysis Categories</h2>
                </div>
                <span className="operational-tag">
                  Operational thresholds · Not agronomically validated
                </span>
              </div>
              <p className="panel-subtitle">
                Tiles classified into operational categories based on ratio of healthy palms to total palms.
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
                          `${val} tiles (${item.payload.pct}%)`,
                          item.payload.label,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center">
                    <strong>500</strong>
                    <span>images</span>
                  </div>
                </div>

                <div className="category-legend-list">
                  {categoryChartData.map((cat) => (
                    <div key={cat.name} className="category-legend-card">
                      <div className="cat-header">
                        <span className="cat-color-dot" style={{ background: categoryColors[cat.name] }} />
                        <strong>{cat.label}</strong>
                        <span className="cat-count">{cat.value} tiles</span>
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

          {/* Statistical Distribution Insights Panel */}
          <section className="panel data-says-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-eyebrow">DISTRIBUTION CHARACTERISTICS</p>
                <h2>Agronomic & Statistical Insights</h2>
              </div>
            </div>
            <div className="data-says-body">
              <p>
                <strong>Bimodal Distribution Dynamics:</strong> The validated Drone Health Score displays a distinct positive skew where the <strong>Median (89.19%)</strong> is significantly higher than the <strong>Arithmetic Mean (75.81%)</strong>. This separation is driven by 22 validation tiles that have <em>0.00% healthy palms</em> because they represent newly replanted / immature blocks with 100% "small" palms, rather than canopy disease.
              </p>
              <p>
                <strong>Detection Coverage:</strong> Zero images have zero detections (0/500). Mean detection density is <strong>87.2 palms/tile</strong> (min: 25, max: 138), demonstrating high UAV flight path overlap and thorough coverage across the survey canvas.
              </p>
            </div>
          </section>
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
                  Drone Health Score &lt; 28.34% (Q1 - 1.5×IQR). 22 tiles have 0% healthy palms because they consist exclusively of young replanted palms.
                </p>
              </div>

              <div className="rule-card">
                <span className="rule-badge density-out">RULE 3: Detection-Density Outliers</span>
                <strong className="rule-metric">15 images</strong>
                <p className="rule-detail">
                  Palms &ge; 107 per image (Q3 + 1.5×IQR). Indicates tight planting spacing or flight overlap at tile borders.
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
                            ? "Flight Line Boundary / Partial Tile"
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
      {/* SUBTAB 5: IMAGE-LEVEL EXPLORER (500 TILES) */}
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
    </div>
  );
}
