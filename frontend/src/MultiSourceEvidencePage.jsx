import {
  ArrowDown, ArrowRight, CheckCircle2,
  GitMerge, Info,
  Layers, Scan, ShieldAlert, ShieldCheck,
  TrendingUp, Workflow, XCircle,
} from "lucide-react";

export default function MultiSourceEvidencePage({ datasets, navigate }) {
  const summary = datasets.multiSourceSummary || {
    palm: {
      status: "available",
      level: "block",
      block_count: 42,
      block_mapping: "native",
      risk_engine: "canonical",
    },
    rgb_drone: {
      status: "available",
      level: "image",
      image_count: 500,
      mean_health_score: 75.81,
      block_mapping: "unavailable",
    },
    multispectral: {
      status: "available",
      level: "tile",
      tile_count: 34,
      mean_mhs: 92.00,
      block_mapping: "unavailable",
    },
    fusion_status: {
      direct_row_level_fusion: false,
      spatial_fusion: false,
      risk_score_fusion: false,
      reason: "No validated spatial linkage between UAV imagery and plantation Block_ID is available.",
    },
    future_requirements: [
      "Estate Block GIS boundaries",
      "Georeferenced UAV orthomosaics",
      "Synchronized UAV telemetry or acquisition timestamps",
    ],
  };

  const evidenceRows = [
    {
      source: "Palm Agronomic",
      subtext: "Primary Operational System",
      icon: TrendingUp,
      tone: "green",
      granularity: "Block",
      indicators: "FFB, Productivity, Nutrients, DRIS",
      mapping: "Available (Native)",
      mappingStatus: "available",
      usedInRisk: "YES",
      riskWeight: "100% of Canonical Risk",
      status: "AVAILABLE",
      link: "risk-analysis",
    },
    {
      source: "RGB Drone",
      subtext: "MOPAD Site 2 Benchmark",
      icon: Scan,
      tone: "blue",
      granularity: "Image",
      indicators: "Healthy, Small, Yellow, Dead, Drone Health Score",
      mapping: "Unavailable",
      mappingStatus: "unavailable",
      usedInRisk: "NO",
      riskWeight: "0% (Independent Evidence)",
      status: "AVAILABLE",
      link: "drone-health",
    },
    {
      source: "Multispectral",
      subtext: "MSUAV500K Benchmark",
      icon: Layers,
      tone: "purple",
      granularity: "Tile",
      indicators: "NDVI, NDRE, Canopy Cover, MHS",
      mapping: "Unavailable",
      mappingStatus: "unavailable",
      usedInRisk: "NO",
      riskWeight: "0% (Independent Evidence)",
      status: "AVAILABLE",
      link: "multispectral-health",
    },
  ];

  return (
    <div className="multi-source-evidence-page">
      {/* EXECUTIVE TOP HEADER */}
      <section className="evidence-hero-panel">
        <div className="hero-content">
          <div className="hero-tag-row">
            <span className="hero-chip primary">
              <Workflow size={13} />
              EXECUTIVE EVIDENCE CONSOLIDATION
            </span>
            <span className="hero-chip warning">
              SPATIAL FUSION: UNAVAILABLE
            </span>
            <span className="hero-chip neutral">
              CANONICAL RISK: 100% AGRONOMIC
            </span>
          </div>
          <h2>Multi-Source Evidence Integration</h2>
          <p className="hero-subtitle">
            Independent agronomic, RGB UAV, and multispectral evidence — validated without fabricated spatial linkage.
          </p>
        </div>
      </section>

      {/* THREE LARGE EVIDENCE PILLAR CARDS */}
      <div className="evidence-pillars-grid">
        {/* PILLAR 1: PALM AGRONOMIC */}
        <article className="pillar-hero-card palm-pillar">
          <div className="pillar-header">
            <div className="pillar-icon-box palm">
              <TrendingUp size={22} />
            </div>
            <div className="pillar-title-wrap">
              <span className="pillar-tag">PILLAR 1 · PRIMARY SYSTEM</span>
              <h3>Palm Agronomic Evidence</h3>
            </div>
            <span className="status-badge-available">AVAILABLE</span>
          </div>

          <div className="pillar-body">
            <div className="pillar-spec-grid">
              <div className="spec-item">
                <span className="spec-label">EVIDENCE LEVEL</span>
                <strong>BLOCK</strong>
              </div>
              <div className="spec-item">
                <span className="spec-label">COVERAGE</span>
                <strong>42 Plantation Blocks</strong>
              </div>
              <div className="spec-item">
                <span className="spec-label">TEMPORAL RANGE</span>
                <strong>2012–2024 (13 Years)</strong>
              </div>
              <div className="spec-item">
                <span className="spec-label">BLOCK MAPPING</span>
                <strong className="text-green-bold">NATIVE BLOCK_ID</strong>
              </div>
            </div>

            <div className="pillar-indicators-box">
              <span className="box-title">VALIDATED PRIMARY INDICATORS</span>
              <p>
                Monthly FFB Production · Expected Yield Deviations · Foliar Nutrients (N, P, K, Ca, Mg, B) · DRIS Balance Indices · Soil Chemistry
              </p>
            </div>

            <div className="pillar-risk-status active">
              <ShieldCheck size={16} />
              <div>
                <strong>Canonical Risk: ACTIVE (100%)</strong>
                <small>Sole quantitative driver of plantation management risk</small>
              </div>
            </div>
          </div>

          <div className="pillar-footer">
            {navigate && (
              <button
                type="button"
                className="button-secondary pillar-nav-btn"
                onClick={() => navigate("risk-analysis")}
              >
                <span>Explore Risk Analysis</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </article>

        {/* PILLAR 2: RGB DRONE */}
        <article className="pillar-hero-card rgb-pillar">
          <div className="pillar-header">
            <div className="pillar-icon-box rgb">
              <Scan size={22} />
            </div>
            <div className="pillar-title-wrap">
              <span className="pillar-tag">PILLAR 2 · INDEPENDENT EVIDENCE</span>
              <h3>RGB Drone UAV Evidence</h3>
            </div>
            <span className="status-badge-available">AVAILABLE</span>
          </div>

          <div className="pillar-body">
            <div className="pillar-spec-grid">
              <div className="spec-item">
                <span className="spec-label">EVIDENCE LEVEL</span>
                <strong>IMAGE (TILE)</strong>
              </div>
              <div className="spec-item">
                <span className="spec-label">COVERAGE</span>
                <strong>500 Survey Images</strong>
              </div>
              <div className="spec-item">
                <span className="spec-label">YOLO PALMS</span>
                <strong>43,599 Palms</strong>
              </div>
              <div className="spec-item">
                <span className="spec-label">BLOCK MAPPING</span>
                <strong className="text-amber-bold">UNAVAILABLE</strong>
              </div>
            </div>

            <div className="pillar-indicators-box">
              <span className="box-title">VALIDATED PRIMARY INDICATORS</span>
              <p>
                YOLO11n Object Detections · Healthy Palms (78.28%) · Dead Palms (0.19%) · Small/Replanted (20.28%) · Drone Health Score (75.81%)
              </p>
            </div>

            <div className="pillar-risk-status isolated">
              <XCircle size={16} />
              <div>
                <strong>Canonical Risk: ISOLATED (0%)</strong>
                <small>Standalone visual evidence; not merged into block risk</small>
              </div>
            </div>
          </div>

          <div className="pillar-footer">
            {navigate && (
              <button
                type="button"
                className="button-secondary pillar-nav-btn"
                onClick={() => navigate("drone-health")}
              >
                <span>Explore Drone Health</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </article>

        {/* PILLAR 3: MULTISPECTRAL */}
        <article className="pillar-hero-card ms-pillar">
          <div className="pillar-header">
            <div className="pillar-icon-box ms">
              <Layers size={22} />
            </div>
            <div className="pillar-title-wrap">
              <span className="pillar-tag">PILLAR 3 · INDEPENDENT EVIDENCE</span>
              <h3>Multispectral UAV Evidence</h3>
            </div>
            <span className="status-badge-available">AVAILABLE</span>
          </div>

          <div className="pillar-body">
            <div className="pillar-spec-grid">
              <div className="spec-item">
                <span className="spec-label">EVIDENCE LEVEL</span>
                <strong>TILE (RASTER)</strong>
              </div>
              <div className="spec-item">
                <span className="spec-label">COVERAGE</span>
                <strong>34 Calibrated Tiles</strong>
              </div>
              <div className="spec-item">
                <span className="spec-label">EVALUATED PIXELS</span>
                <strong>8.91M Pixels (5-Band)</strong>
              </div>
              <div className="spec-item">
                <span className="spec-label">BLOCK MAPPING</span>
                <strong className="text-amber-bold">UNAVAILABLE</strong>
              </div>
            </div>

            <div className="pillar-indicators-box">
              <span className="box-title">VALIDATED PRIMARY INDICATORS</span>
              <p>
                Canopy NDVI (0.8977) · Red-Edge NDRE (0.5129) · Canopy Cover (93.62%) · Uniformity (90.48) · Multispectral Health Score (92.00)
              </p>
            </div>

            <div className="pillar-risk-status isolated">
              <XCircle size={16} />
              <div>
                <strong>Canonical Risk: ISOLATED (0%)</strong>
                <small>Standalone spectral evidence; not merged into block risk</small>
              </div>
            </div>
          </div>

          <div className="pillar-footer">
            {navigate && (
              <button
                type="button"
                className="button-secondary pillar-nav-btn"
                onClick={() => navigate("multispectral-health")}
              >
                <span>Explore Multispectral</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </article>
      </div>

      {/* EVIDENCE ARCHITECTURE VISUAL FLOW */}
      <section className="panel evidence-flow-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-eyebrow">SCIENTIFIC WORKFLOW</p>
            <h2>Evidence Architecture & Separation of Concerns</h2>
          </div>
          <span className="operational-tag">Rigorous Decoupled Design</span>
        </div>

        <div className="architecture-flow-diagram">
          <div className="flow-columns-grid">
            {/* Column 1: Palm Agronomic */}
            <div className="flow-column palm-col">
              <div className="flow-node top-node">
                <TrendingUp size={16} />
                <span>PALM AGRONOMIC</span>
              </div>
              <ArrowDown size={18} className="flow-arrow" />
              <div className="flow-node mid-node">
                <ShieldCheck size={16} />
                <span>BLOCK-LEVEL CANONICAL RISK</span>
              </div>
              <ArrowDown size={18} className="flow-arrow" />
              <div className="flow-node bottom-node primary">
                <CheckCircle2 size={16} />
                <span>PRIMARY MANAGEMENT EVIDENCE</span>
                <small>Directly guides fertilizer, DRIS &amp; harvest plans</small>
              </div>
            </div>

            {/* Column 2: RGB Drone */}
            <div className="flow-column rgb-col">
              <div className="flow-node top-node">
                <Scan size={16} />
                <span>RGB UAV</span>
              </div>
              <ArrowDown size={18} className="flow-arrow" />
              <div className="flow-node mid-node">
                <Info size={16} />
                <span>IMAGE-LEVEL VISUAL HEALTH</span>
              </div>
              <ArrowDown size={18} className="flow-arrow" />
              <div className="flow-node bottom-node independent">
                <ShieldAlert size={16} />
                <span>INDEPENDENT EVIDENCE</span>
                <small>Visual verification without block spatial coupling</small>
              </div>
            </div>

            {/* Column 3: Multispectral UAV */}
            <div className="flow-column ms-col">
              <div className="flow-node top-node">
                <Layers size={16} />
                <span>MULTISPECTRAL UAV</span>
              </div>
              <ArrowDown size={18} className="flow-arrow" />
              <div className="flow-node mid-node">
                <Info size={16} />
                <span>TILE-LEVEL SPECTRAL HEALTH</span>
              </div>
              <ArrowDown size={18} className="flow-arrow" />
              <div className="flow-node bottom-node independent">
                <ShieldAlert size={16} />
                <span>INDEPENDENT EVIDENCE</span>
                <small>Red-edge chlorophyll &amp; NDVI canopy monitoring</small>
              </div>
            </div>
          </div>

          {/* Fusion Status Banner */}
          <div className="fusion-status-bridge">
            <div className="fusion-status-top">
              <GitMerge size={18} />
              <strong>FINAL FUSION STATUS</strong>
            </div>
            <div className="fusion-status-body">
              <span className="fusion-status-pill">
                Evidence available, but spatial fusion unavailable
              </span>
              <p>
                {summary.fusion_status?.reason ||
                  "No validated spatial linkage between UAV imagery and plantation Block_ID is available. Direct row-level fusion is strictly rejected to preserve scientific integrity."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* EVIDENCE MATRIX TABLE */}
      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-eyebrow">CROSS-SOURCE REGISTRY</p>
            <h2>Consolidated Evidence Matrix</h2>
          </div>
          <span className="unit-pill">3 Independent Diagnostic Pillars</span>
        </div>
        <p className="panel-subtitle">
          Summary of data granularity, indicator coverage, spatial linkage, and canonical risk participation.
        </p>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>EVIDENCE SOURCE</th>
                <th>GRANULARITY</th>
                <th>MAIN INDICATORS</th>
                <th>BLOCK MAPPING</th>
                <th>USED IN RISK</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {evidenceRows.map((row) => (
                <tr key={row.source}>
                  <td>
                    <div className="evidence-source-cell">
                      <span className={`source-icon-wrap ${row.tone}`}>
                        <row.icon size={15} />
                      </span>
                      <div>
                        <strong>{row.source}</strong>
                        <small>{row.subtext}</small>
                      </div>
                    </div>
                  </td>
                  <td><strong>{row.granularity}</strong></td>
                  <td>
                    <span className="indicators-text">{row.indicators}</span>
                  </td>
                  <td>
                    <span className={`mapping-badge ${row.mappingStatus}`}>
                      {row.mapping}
                    </span>
                  </td>
                  <td>
                    <span className={`risk-participate-badge ${row.usedInRisk === "YES" ? "yes" : "no"}`}>
                      {row.usedInRisk} ({row.riskWeight})
                    </span>
                  </td>
                  <td>
                    <span className="status-badge-available">
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SCIENTIFIC LIMITATION CALLOUT PANEL */}
      <section className="panel scientific-limitation-panel" role="region" aria-label="Scientific Limitation Notice">
        <div className="limitation-header">
          <span className="limitation-icon">
            <ShieldAlert size={22} />
          </span>
          <div>
            <h3>Scientific Integrity & Spatial Decoupling Protocol</h3>
            <span className="operational-tag">Strict Anti-Fabrication Safeguard</span>
          </div>
        </div>
        <div className="limitation-body">
          <p className="limitation-lead">
            "Current UAV datasets cannot be spatially assigned to Palm Plantation Block_ID because validated GIS boundaries and georeferenced cross-source linkage are unavailable. Therefore, RGB and multispectral evidence is presented independently and is not included in the canonical Palm block-risk score."
          </p>
          <p className="limitation-sub">
            "Drone Health Score and Multispectral Health Score are project-derived indicators. They are not validated disease diagnoses."
          </p>
        </div>
      </section>

      {/* FUTURE INTEGRATION ROADMAP */}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="panel-eyebrow">ROADMAP TO FUSION</p>
            <h2>Future Prerequisites for Validated Spatial Fusion</h2>
          </div>
          <span className="unit-pill">3 Technical Prerequisites</span>
        </div>
        <p className="panel-subtitle">
          Direct row-level multi-source fusion will only be implemented once all three prerequisites are satisfied:
        </p>

        <div className="requirements-grid">
          <div className="req-card">
            <div className="req-num">1</div>
            <h4>Estate Block GIS Boundaries</h4>
            <p>
              Verified ESRI Shapefile / GeoJSON boundary polygons with EPSG/CRS spatial reference systems for each operational block (B001–B044).
            </p>
          </div>
          <div className="req-card">
            <div className="req-num">2</div>
            <h4>Georeferenced UAV Orthomosaics</h4>
            <p>
              Complete stitched multi-band GeoTIFF rasters with Ground Control Points (GCPs) and sub-meter spatial precision covering the target plantation.
            </p>
          </div>
          <div className="req-card">
            <div className="req-num">3</div>
            <h4>Synchronized Acquisition Timestamps</h4>
            <p>
              UAV flight missions flown co-temporally with monthly FFB harvest cycles and annual Frond 17 foliar nutrient laboratory sampling dates.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
