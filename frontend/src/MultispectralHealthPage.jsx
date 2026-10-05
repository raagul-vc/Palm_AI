import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2,
  Database, ExternalLink, Layers, Maximize2,
  RefreshCw, Search, ShieldAlert, Sliders, X,
} from "lucide-react";
import {
  Cell, Pie, PieChart, ResponsiveContainer, Tooltip,
} from "recharts";

const vigourColors = {
  HIGH: "#2d6e47",
  MODERATE: "#d9a726",
  BACKGROUND: "#64748b",
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

export default function MultispectralHealthPage({ datasets, sourceStatus, loadSources }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedChart, setSelectedChart] = useState(null);

  // Tile table filter & search state
  const [searchQuery, setSearchQuery] = useState("");
  const [vigourFilter, setVigourFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("tile_id_asc");

  const summary = datasets.multispectralSummary || {};
  const tiles = useMemo(() => datasets.multispectralTiles || [], [datasets.multispectralTiles]);
  const visualizations = useMemo(() => datasets.multispectralVisualizations || [], [datasets.multispectralVisualizations]);

  const isRefreshing = sourceStatus?.multispectralSummary === "loading";

  // Vigour chart data
  const vigourChartData = useMemo(() => {
    const high = summary.high_vigour_count ?? 30;
    const mod = summary.moderate_vigour_count ?? 3;
    const bg = summary.background_count ?? 1;
    return [
      { name: "HIGH", value: high, pct: ((high / 34) * 100).toFixed(1), label: "High Vigour (≥ 80%)" },
      { name: "MODERATE", value: mod, pct: ((mod / 34) * 100).toFixed(1), label: "Moderate Vigour (60–<80%)" },
      { name: "BACKGROUND", value: bg, pct: ((bg / 34) * 100).toFixed(1), label: "Non-Canopy / Background" },
    ];
  }, [summary.high_vigour_count, summary.moderate_vigour_count, summary.background_count]);

  // Filtered and sorted tiles
  const filteredTiles = useMemo(() => {
    let result = [...tiles];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (t) =>
          String(t.filename || "").toLowerCase().includes(q) ||
          String(t.tile_id || "").includes(q)
      );
    }

    if (vigourFilter !== "ALL") {
      if (vigourFilter === "HIGH") {
        result = result.filter((t) => String(t.vigour_category || "").includes("High"));
      } else if (vigourFilter === "MODERATE") {
        result = result.filter((t) => String(t.vigour_category || "").includes("Moderate"));
      } else if (vigourFilter === "BACKGROUND") {
        result = result.filter((t) =>
          String(t.vigour_category || "").includes("Non-Canopy") ||
          String(t.vigour_category || "").includes("Background")
        );
      }
    }

    result.sort((a, b) => {
      if (sortBy === "mhs_desc") {
        return (Number(b.multispectral_health_score) || 0) - (Number(a.multispectral_health_score) || 0);
      }
      if (sortBy === "mhs_asc") {
        return (Number(a.multispectral_health_score) || 0) - (Number(b.multispectral_health_score) || 0);
      }
      if (sortBy === "ndvi_desc") {
        return (Number(b.canopy_ndvi_mean) || 0) - (Number(a.canopy_ndvi_mean) || 0);
      }
      if (sortBy === "ndvi_asc") {
        return (Number(a.canopy_ndvi_mean) || 0) - (Number(b.canopy_ndvi_mean) || 0);
      }
      if (sortBy === "ndre_desc") {
        return (Number(b.canopy_ndre_mean) || 0) - (Number(a.canopy_ndre_mean) || 0);
      }
      if (sortBy === "ndre_asc") {
        return (Number(a.canopy_ndre_mean) || 0) - (Number(b.canopy_ndre_mean) || 0);
      }
      if (sortBy === "canopy_desc") {
        return (Number(b.canopy_cover_percentage) || 0) - (Number(a.canopy_cover_percentage) || 0);
      }
      if (sortBy === "canopy_asc") {
        return (Number(a.canopy_cover_percentage) || 0) - (Number(b.canopy_cover_percentage) || 0);
      }
      return (Number(a.tile_id) || 0) - (Number(b.tile_id) || 0);
    });

    return result;
  }, [tiles, searchQuery, vigourFilter, sortBy]);

  return (
    <div className="multispectral-health-page">
      {/* STEP 5: PROMINENT EVIDENCE DISCLAIMER BANNER */}
      <div className="multispectral-disclaimer-card" role="region" aria-label="Multispectral Evidence Disclaimer">
        <div className="drone-disclaimer-top">
          <div className="disclaimer-title-group">
            <span className="disclaimer-icon-badge ms-icon-badge">
              <ShieldAlert size={18} />
            </span>
            <div>
              <div className="disclaimer-heading-row">
                <h3>Multispectral Evidence Disclaimer & Decoupling</h3>
                <span className="block-unavailable-badge">
                  Block Mapping: Unavailable
                </span>
                {loadSources && (
                  <button
                    type="button"
                    className="button-secondary refresh-btn-compact"
                    onClick={loadSources}
                    title="Reload Multispectral Data"
                    disabled={isRefreshing}
                  >
                    <RefreshCw size={12} className={isRefreshing ? "spin-icon" : ""} />
                    {isRefreshing ? "Refreshing…" : "Refresh"}
                  </button>
                )}
              </div>
              <p className="disclaimer-quote">
                "Multispectral Health Score is a tile-level spectral indicator derived from calibrated UAV imagery. It is not a validated disease diagnosis and is not mapped to Palm Plantation Block_ID."
              </p>
            </div>
          </div>
        </div>

        <div className="drone-isolation-specs">
          <div className="isolation-item">
            <span className="isolation-label">SPATIAL LINKAGE</span>
            <strong>Local Raster Coordinates (512×512 px)</strong>
            <small>Zenodo benchmark tiles; no GIS shapefiles or Block_IDs</small>
          </div>
          <div className="isolation-item">
            <span className="isolation-label">RISK ENGINE STATUS</span>
            <strong>Strictly Isolated & Decoupled</strong>
            <small>Does not alter palm risk formula or peer comparisons</small>
          </div>
          <div className="isolation-item">
            <span className="isolation-label">SELECTION BEHAVIOR</span>
            <strong>Independent Evidence Module</strong>
            <small>Block selector (B001/B002/B005) does not filter multispectral data</small>
          </div>
        </div>
      </div>

      {/* TOP 6 METRIC KPI CARDS */}
      <div className="stats-grid ms-kpi-grid">
        {/* KPI 1: Mean NDVI */}
        <article className="metric-card tone-green">
          <div className="metric-top">
            <span className="metric-label">MEAN CANOPY NDVI</span>
            <span className="metric-icon"><Layers size={16} /></span>
          </div>
          <strong className="metric-value">
            {formatNumber(summary.mean_ndvi ?? 0.8977, 4)}
          </strong>
          <span className="metric-hint">
            Median: {formatNumber(summary.median_ndvi ?? 0.9231, 4)} · Vegetated tiles
          </span>
        </article>

        {/* KPI 2: Mean NDRE */}
        <article className="metric-card tone-green">
          <div className="metric-top">
            <span className="metric-label">MEAN CANOPY NDRE</span>
            <span className="metric-icon"><Activity size={16} /></span>
          </div>
          <strong className="metric-value">
            {formatNumber(summary.mean_ndre ?? 0.5129, 4)}
          </strong>
          <span className="metric-hint">
            Median: {formatNumber(summary.median_ndre ?? 0.5094, 4)} · Red-edge band
          </span>
        </article>

        {/* KPI 3: Mean Canopy Cover */}
        <article className="metric-card tone-green">
          <div className="metric-top">
            <span className="metric-label">CANOPY COVERAGE</span>
            <span className="metric-icon"><CheckCircle2 size={16} /></span>
          </div>
          <strong className="metric-value">
            {formatNumber(summary.mean_canopy_cover ?? 93.62, 1)}
            <span className="metric-unit">%</span>
          </strong>
          <span className="metric-hint">
            Canopy mask threshold: NDVI ≥ 0.30
          </span>
        </article>

        {/* KPI 4: Mean MHS */}
        <article className="metric-card tone-green">
          <div className="metric-top">
            <span className="metric-label">MEAN HEALTH SCORE (MHS)</span>
            <span className="metric-icon"><Sliders size={16} /></span>
          </div>
          <strong className="metric-value">
            {formatNumber(summary.mean_mhs ?? 92.00, 2)}
          </strong>
          <span className="metric-hint">
            Median: {formatNumber(summary.median_mhs ?? 96.64, 2)} · Range: 29.7–99.5
          </span>
        </article>

        {/* KPI 5: Canopy Uniformity */}
        <article className="metric-card tone-orange">
          <div className="metric-top">
            <span className="metric-label">CANOPY UNIFORMITY</span>
            <span className="metric-icon"><Activity size={16} /></span>
          </div>
          <strong className="metric-value">
            {formatNumber(summary.mean_canopy_uniformity ?? 90.48, 1)}
            <span className="metric-unit">/100</span>
          </strong>
          <span className="metric-hint">
            Within-canopy spectral homogeneity
          </span>
        </article>

        {/* KPI 6: Calibrated Imagery Coverage */}
        <article className="metric-card">
          <div className="metric-top">
            <span className="metric-label">EVALUATED TILES</span>
            <span className="metric-icon"><Database size={16} /></span>
          </div>
          <strong className="metric-value">
            {summary.tile_count ?? 34}
            <span className="metric-unit"> tiles</span>
          </strong>
          <span className="metric-hint">
            8.91M calibrated pixels (MicaSense Altum)
          </span>
        </article>
      </div>

      {/* SUBTAB NAVIGATION */}
      <div className="subtab-bar ms-subtab-bar">
        <button
          type="button"
          className={`subtab-btn ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Summary & Canopy Vigour
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeTab === "indicators" ? "active" : ""}`}
          onClick={() => setActiveTab("indicators")}
        >
          Spectral Indicators (NDVI / NDRE / MHS)
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeTab === "visualizations" ? "active" : ""}`}
          onClick={() => setActiveTab("visualizations")}
        >
          Visual Evidence Charts ({visualizations.length || 7})
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeTab === "tiles" ? "active" : ""}`}
          onClick={() => setActiveTab("tiles")}
        >
          Tile-Level Analysis ({tiles.length || 34} Tiles)
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUBTAB 1: OVERVIEW & CANOPY VIGOUR */}
      {/* ========================================================================= */}
      {activeTab === "overview" && (
        <div className="drone-tab-content">
          <div className="overview-grid">
            {/* Canopy Vigour Categories Card */}
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-eyebrow">SPECTRAL CLASSIFICATION</p>
                  <h2>Canopy Vigour Categories</h2>
                </div>
                <span className="operational-tag">
                  Operational thresholds · Not disease diagnoses
                </span>
              </div>
              <p className="panel-subtitle">
                Tiles classified into operational vigour tiers based on composite Multispectral Health Score and canopy coverage.
              </p>

              <div className="category-donut-container">
                <div className="donut-wrap">
                  <ResponsiveContainer width="100%" height={210}>
                    <PieChart>
                      <Pie
                        data={vigourChartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={62}
                        outerRadius={86}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {vigourChartData.map((entry) => (
                          <Cell key={entry.name} fill={vigourColors[entry.name]} />
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
                    <strong>34</strong>
                    <span>tiles</span>
                  </div>
                </div>

                <div className="category-legend-list">
                  {vigourChartData.map((cat) => (
                    <div key={cat.name} className="category-legend-card">
                      <div className="cat-header">
                        <span className="cat-color-dot" style={{ background: vigourColors[cat.name] }} />
                        <strong>{cat.label}</strong>
                        <span className="cat-count">{cat.value} tiles</span>
                      </div>
                      <div className="cat-bar-track">
                        <div
                          className="cat-bar-fill"
                          style={{
                            width: `${cat.pct}%`,
                            background: vigourColors[cat.name],
                          }}
                        />
                      </div>
                      <div className="cat-footer">
                        <span>{cat.pct}% of dataset</span>
                        <small>
                          {cat.name === "HIGH" && "Full dense canopy (MHS ≥ 80, cover > 90%)"}
                          {cat.name === "MODERATE" && "Transitional canopy (60 ≤ MHS < 80, cover 54-78%)"}
                          {cat.name === "BACKGROUND" && "Tile 28: Water / deep shadow / non-vegetated"}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Sensor Band Configuration */}
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-eyebrow">PHYSICAL CALIBRATION</p>
                  <h2>MicaSense Altum 5-Band Sensor</h2>
                </div>
                <span className="unit-pill">5 Calibrated Channels</span>
              </div>
              <p className="panel-subtitle">
                Calibrated surface reflectance wavelengths evaluated at 512×512 pixel resolution.
              </p>

              <div className="detection-class-list">
                <div className="detection-class-item">
                  <div className="class-row-top">
                    <span className="class-badge ms-blue">Band 0 · Blue</span>
                    <strong>475 nm</strong>
                    <span className="class-pct">32 nm FWHM</span>
                  </div>
                  <small className="class-note">Atmospheric scattering baseline</small>
                </div>

                <div className="detection-class-item">
                  <div className="class-row-top">
                    <span className="class-badge ms-green">Band 1 · Green</span>
                    <strong>560 nm</strong>
                    <span className="class-pct">27 nm FWHM</span>
                  </div>
                  <small className="class-note">Chlorophyll green peak reflectance</small>
                </div>

                <div className="detection-class-item">
                  <div className="class-row-top">
                    <span className="class-badge ms-red">Band 2 · Red</span>
                    <strong>668 nm</strong>
                    <span className="class-pct">16 nm FWHM</span>
                  </div>
                  <small className="class-note">Chlorophyll absorption peak (Critical for NDVI)</small>
                </div>

                <div className="detection-class-item">
                  <div className="class-row-top">
                    <span className="class-badge ms-rededge">Band 3 · RedEdge</span>
                    <strong>717 nm</strong>
                    <span className="class-pct">12 nm FWHM</span>
                  </div>
                  <small className="class-note">Transition edge sensitive to chlorophyll & nitrogen (Critical for NDRE)</small>
                </div>

                <div className="detection-class-item">
                  <div className="class-row-top">
                    <span className="class-badge ms-nir">Band 4 · NIR</span>
                    <strong>842 nm</strong>
                    <span className="class-pct">57 nm FWHM</span>
                  </div>
                  <small className="class-note">Leaf cellular mesophyll structure reflectance plateau (Critical for NDVI/NDRE)</small>
                </div>
              </div>
            </section>
          </div>

          {/* Aggregate Canopy Strata Composition */}
          <section className="panel data-says-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-eyebrow">CANOPY STRATA BREAKDOWN</p>
                <h2>Pixel-Level Foliage & Background Composition</h2>
              </div>
            </div>
            <div className="ms-strata-grid">
              <div className="strata-box">
                <span className="strata-label">HIGH VIGOUR CANOPY</span>
                <strong>91.14%</strong>
                <small>NDVI &gt; 0.70 &amp; NDRE &gt; 0.35</small>
              </div>
              <div className="strata-box">
                <span className="strata-label">MODERATE VIGOUR CANOPY</span>
                <strong>2.30%</strong>
                <small>0.50 ≤ NDVI ≤ 0.70</small>
              </div>
              <div className="strata-box">
                <span className="strata-label">DEPRESSED CANOPY</span>
                <strong>0.23%</strong>
                <small>0.30 ≤ NDVI &lt; 0.50</small>
              </div>
              <div className="strata-box">
                <span className="strata-label">NON-VEGETATED BACKGROUND</span>
                <strong>6.33%</strong>
                <small>Soil, shade, or water bodies</small>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 2: SPECTRAL INDICATORS GUIDE */}
      {/* ========================================================================= */}
      {activeTab === "indicators" && (
        <div className="drone-tab-content">
          <div className="spectral-indicators-grid">
            {/* NDVI Card */}
            <article className="panel spectral-card">
              <div className="panel-heading">
                <div>
                  <p className="panel-eyebrow">VEGETATION GREENNESS</p>
                  <h2>NDVI: Normalized Difference Vegetation Index</h2>
                </div>
                <span className="unit-pill">Formula: (NIR - Red) / (NIR + Red)</span>
              </div>
              <div className="spectral-body">
                <p>
                  <strong>Physical Meaning:</strong> NDVI measures the contrast between strong red absorption by chlorophyll ($668\text{ nm}$) and high near-infrared reflectance by leaf mesophyll cellular structures ($842\text{ nm}$).
                </p>
                <p>
                  <strong>Role in Oil Palm:</strong> Evaluates overall foliage density, canopy greenness, and photosynthetic capacity. In dense multi-layered mature oil palm crowns, NDVI can saturate above 0.85–0.90, making secondary red-edge indices critical.
                </p>
                <div className="spectral-stat-strip">
                  <span>Vegetated Tiles Mean: <strong>0.8977</strong></span>
                  <span>Median: <strong>0.9231</strong></span>
                  <span>Range: <strong>0.30 – 1.00</strong></span>
                </div>
              </div>
            </article>

            {/* NDRE Card */}
            <article className="panel spectral-card">
              <div className="panel-heading">
                <div>
                  <p className="panel-eyebrow">RED-EDGE CHLOROPHYLL SENSITIVITY</p>
                  <h2>NDRE: Normalized Difference Red Edge</h2>
                </div>
                <span className="unit-pill">Formula: (NIR - RedEdge) / (NIR + RedEdge)</span>
              </div>
              <div className="spectral-body">
                <p>
                  <strong>Physical Meaning:</strong> Replaces the red band with the narrow red-edge transition channel ($717\text{ nm}$). Red-edge light penetrates deeper into dense palm canopies without optical saturation.
                </p>
                <p>
                  <strong>Role in Oil Palm:</strong> Extremely sensitive to variations in canopy chlorophyll concentrations and foliar nitrogen status, capturing subtle physiological shifts that NDVI misses when saturated.
                </p>
                <div className="spectral-stat-strip">
                  <span>Vegetated Tiles Mean: <strong>0.5129</strong></span>
                  <span>Median: <strong>0.5094</strong></span>
                  <span>Range: <strong>-0.50 – 1.00</strong></span>
                </div>
              </div>
            </article>

            {/* MHS Card */}
            <article className="panel spectral-card">
              <div className="panel-heading">
                <div>
                  <p className="panel-eyebrow">PROJECT-DERIVED COMPOSITE</p>
                  <h2>MHS: Multispectral Health Score (0–100)</h2>
                </div>
                <span className="unit-pill">Composite Spectral Health</span>
              </div>
              <div className="spectral-body">
                <p>
                  <strong>Physical Meaning:</strong> A weighted composite score combining canopy cover percentage ($40\%$), canopy NDVI mean ($25\%$), canopy NDRE mean ($20\%$), and within-canopy spatial uniformity ($15\%$).
                </p>
                <p>
                  <strong>Role in Oil Palm:</strong> Provides an integrated single-metric baseline for comparing aerial survey tiles without confounding bare ground background or edge clipping.
                </p>
                <div className="spectral-stat-strip">
                  <span>Mean MHS: <strong>92.00</strong></span>
                  <span>Median MHS: <strong>96.64</strong></span>
                  <span>Std: <strong>13.90</strong></span>
                </div>
              </div>
            </article>
          </div>

          {/* Scientific Disclaimer Notice */}
          <section className="panel data-says-panel alert-says-panel">
            <div className="panel-heading">
              <div className="disclaimer-title-group">
                <span className="disclaimer-icon-badge">
                  <AlertTriangle size={18} />
                </span>
                <div>
                  <p className="panel-eyebrow">DIAGNOSTIC LIMITATION</p>
                  <h2>No Specific Disease or Nutrient Etiology Claimed</h2>
                </div>
              </div>
            </div>
            <div className="data-says-body">
              <p>
                <strong>Scientific Attribution Principle:</strong> Multispectral vegetation indices quantify physical surface optical reflectance. While they reliably detect anomalies in chlorophyll absorption, biomass density, and photosynthetic activity, <strong>they do NOT diagnose specific biological pathogens (e.g., Ganoderma root rot, Curvularia, or Pestalotiopsis) or exact chemical deficiencies (e.g., Nitrogen vs Magnesium chlorosis).</strong>
              </p>
              <p>
                Depressed index values can arise from water deficit, soil compaction, mechanical frond pruning, or natural senescence. Conclusive agronomic attribution requires field-level ground truthing, laboratory foliar tissue analysis (Frond 17 sampling), and soil chemistry audits.
              </p>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 3: VISUAL EVIDENCE CHARTS */}
      {/* ========================================================================= */}
      {activeTab === "visualizations" && (
        <div className="drone-tab-content">
          <div className="gallery-header-row">
            <div>
              <p className="panel-eyebrow">EMPIRICAL VALIDATION PLOTS</p>
              <h2>Calibrated Multispectral Evidence Gallery</h2>
              <p className="panel-subtitle">
                Seven verified visualization charts generated from 34 five-band GeoTIFF tiles (MicaSense Altum UAV sensor). Click any chart to expand.
              </p>
            </div>
            <span className="unit-pill">{visualizations.length || 7} Verified Plots</span>
          </div>

          <div className="drone-charts-grid">
            {(visualizations.length ? visualizations : [
              {
                id: "ndvi_ndre_spatial_maps",
                title: "1. NDVI & NDRE Spatial Reflectance Maps",
                filename: "ndvi_ndre_spatial_maps.png",
                url: "/api/multispectral/visualizations/ndvi_ndre_spatial_maps.png",
                description: "Raster false-color maps across all 34 tiles comparing NDVI canopy vigor with NDRE red-edge chlorophyll transition.",
              },
              {
                id: "ndvi_ndre_distributions",
                title: "2. Pixel-Level NDVI and NDRE Distribution Curves",
                filename: "ndvi_ndre_distributions.png",
                url: "/api/multispectral/visualizations/ndvi_ndre_distributions.png",
                description: "Kernel density and histograms comparing distribution profiles of NDVI and NDRE across 8.9M evaluated pixels.",
              },
              {
                id: "tile_health_comparison",
                title: "3. Tile Health & Canopy Cover Comparison",
                filename: "tile_health_comparison.png",
                url: "/api/multispectral/visualizations/tile_health_comparison.png",
                description: "Comparative bar breakdown of canopy cover percentage and vegetation vigor classification across each tile.",
              },
              {
                id: "canopy_health_score_distribution",
                title: "4. Multispectral Health Score (MHS) Distribution",
                filename: "canopy_health_score_distribution.png",
                url: "/api/multispectral/visualizations/canopy_health_score_distribution.png",
                description: "Distribution of composite Multispectral Health Scores showing the 92.00% mean and 96.64% median.",
              },
              {
                id: "canopy_strata_breakdown",
                title: "5. Canopy Strata & Background Composition",
                filename: "canopy_strata_breakdown.png",
                url: "/api/multispectral/visualizations/canopy_strata_breakdown.png",
                description: "Stacked proportion of high-vigor canopy, moderate-vigor canopy, depressed canopy, bare soil, and shadow/water.",
              },
              {
                id: "canopy_ndvi_vs_ndre_scatter",
                title: "6. Canopy NDVI vs NDRE Correlation Landscape",
                filename: "canopy_ndvi_vs_ndre_scatter.png",
                url: "/api/multispectral/visualizations/canopy_ndvi_vs_ndre_scatter.png",
                description: "Tile-level scatter plot of canopy NDVI vs NDRE illustrating the non-linear saturation dynamic in dense foliage.",
              },
              {
                id: "canopy_heterogeneity_vs_vigour",
                title: "7. Canopy Heterogeneity vs Health Vigor",
                filename: "canopy_heterogeneity_vs_vigour.png",
                url: "/api/multispectral/visualizations/canopy_heterogeneity_vs_vigour.png",
                description: "Uniformity score versus Multispectral Health Score highlighting canopy variance across flight lines.",
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
                    Artifact: drone/multispectral/outputs/visualizations/{selectedChart.filename}
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
      {/* SUBTAB 4: TILE-LEVEL ANALYSIS (34 TILES) */}
      {/* ========================================================================= */}
      {activeTab === "tiles" && (
        <div className="drone-tab-content">
          {/* Controls Bar */}
          <div className="table-controls explorer-controls">
            <label className="search-box">
              <Search size={15} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tile ID or filename (e.g. 1, 1072_1543)"
                aria-label="Search tile filename"
              />
            </label>

            <label className="filter-box">
              <span>Vigour Tier</span>
              <select
                value={vigourFilter}
                onChange={(e) => setVigourFilter(e.target.value)}
              >
                <option value="ALL">All Vigour Tiers (34)</option>
                <option value="HIGH">High Vigour (30)</option>
                <option value="MODERATE">Moderate Vigour (3)</option>
                <option value="BACKGROUND">Background / Non-Canopy (1)</option>
              </select>
            </label>

            <label className="filter-box">
              <span>Sort by</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="tile_id_asc">Tile ID (Ascending)</option>
                <option value="mhs_desc">MHS Score (Highest First)</option>
                <option value="mhs_asc">MHS Score (Lowest First)</option>
                <option value="ndvi_desc">Canopy NDVI (Highest First)</option>
                <option value="ndvi_asc">Canopy NDVI (Lowest First)</option>
                <option value="ndre_desc">Canopy NDRE (Highest First)</option>
                <option value="ndre_asc">Canopy NDRE (Lowest First)</option>
                <option value="canopy_desc">Canopy Cover (Highest First)</option>
                <option value="canopy_asc">Canopy Cover (Lowest First)</option>
              </select>
            </label>
          </div>

          <div className="explorer-status-row">
            <span>
              Showing <strong>{filteredTiles.length}</strong> of <strong>{tiles.length || 34}</strong> calibrated multispectral tiles
              {vigourFilter !== "ALL" && ` · Tier: ${vigourFilter}`}
            </span>
          </div>

          {/* Interactive Tiles Table */}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>TILE ID</th>
                  <th>FILENAME</th>
                  <th>CANOPY COVER</th>
                  <th>CANOPY NDVI</th>
                  <th>CANOPY NDRE</th>
                  <th>UNIFORMITY</th>
                  <th>MHS SCORE</th>
                  <th>VIGOUR CATEGORY</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {filteredTiles.map((tile) => {
                  const mhs = Number(tile.multispectral_health_score);
                  const isBg = String(tile.vigour_category || "").includes("Non-Canopy") || String(tile.vigour_category || "").includes("Background");
                  const isMod = String(tile.vigour_category || "").includes("Moderate");
                  const isHigh = String(tile.vigour_category || "").includes("High");

                  const badgeClass = isHigh ? "high" : isMod ? "moderate" : "low";

                  return (
                    <tr key={tile.tile_id}>
                      <td><strong className="block-id">Tile {tile.tile_id}</strong></td>
                      <td>
                        <span className="ms-filename" title={tile.filename}>
                          {tile.filename}
                        </span>
                      </td>
                      <td>
                        <strong>{formatNumber(tile.canopy_cover_percentage, 1)}%</strong>
                      </td>
                      <td>
                        <strong>{formatNumber(tile.canopy_ndvi_mean, 4)}</strong>
                        <small className="text-sub-metric"> (med: {formatNumber(tile.canopy_ndvi_median, 3)})</small>
                      </td>
                      <td>
                        <strong>{formatNumber(tile.canopy_ndre_mean, 4)}</strong>
                        <small className="text-sub-metric"> (med: {formatNumber(tile.canopy_ndre_median, 3)})</small>
                      </td>
                      <td>{formatNumber(tile.canopy_uniformity_score, 1)}</td>
                      <td>
                        <strong className={isBg ? "text-negative" : ""}>
                          {formatNumber(mhs, 2)}
                        </strong>
                      </td>
                      <td>
                        <span className={`risk-badge ${badgeClass}`}>
                          <i />{tile.vigour_category || "Unknown"}
                        </span>
                      </td>
                      <td>
                        {isBg ? (
                          <span className="outlier-tag low-det">Background Water/Shadow</span>
                        ) : isMod ? (
                          <span className="outlier-tag density-out">Transitional Cover</span>
                        ) : (
                          <span className="outlier-tag high-vig">Optimal Canopy</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
