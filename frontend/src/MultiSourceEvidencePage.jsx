import React, { useState } from "react";
import {
  ArrowDown, ArrowRight, CheckCircle2, ChevronDown, ChevronUp,
  Compass, Database, FileText, GitMerge, Globe,
  Hash, Info, Layers, MapPin, Scan,
  ShieldAlert, ShieldCheck, TrendingUp, Workflow, XCircle,
} from "lucide-react";

export default function MultiSourceEvidencePage({ datasets, navigate }) {
  const [expanded, setExpanded] = useState({
    palm: false,
    rgb: false,
    multispectral: false,
  });

  const toggleExpand = (key) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const _summary = datasets.multiSourceSummary || {
    palm: {
      status: "available",
      level: "block",
      block_count: 42,
      provenance: "Oil Palm Plantation Division A (Native Operational System)",
      land_cover: "Commercial Oil Palm Plantation (Elaeis guineensis)",
      block_mapping: "native",
      block_mapping_status: "mapped",
      risk_engine: "canonical",
      risk_role: "Core Canonical Risk Model (100%)",
      risk_contribution_pct: 100.0,
    },
    rgb_drone: {
      status: "available",
      level: "image",
      image_count: 500,
      provenance: "MOPAD Site 2 Benchmark (Oil Palm Canopy Aerial RGB)",
      land_cover: "Oil Palm Canopy (Visual RGB Benchmark)",
      mean_health_score: 75.81,
      block_mapping: "unavailable",
      block_mapping_status: "unmapped",
      risk_role: "Independent Visual Evidence (0%)",
      risk_contribution_pct: 0.0,
    },
    multispectral: {
      status: "available",
      level: "tile",
      tile_count: 34,
      provenance: "MSUAV500K Benchmark (Hullerbusch Beech Forest, Germany — Zenodo Record 16743975)",
      land_cover: "Temperate Deciduous Beech Forest (Benchmark Only — NOT Oil Palm)",
      mean_mhs: 92.00,
      block_mapping: "unavailable",
      block_mapping_status: "unmapped",
      risk_role: "Independent Spectral Benchmark (0%)",
      risk_contribution_pct: 0.0,
    },
    coverage_matrix: {
      agronomic_blocks: {
        source: "Palm Agronomic Records",
        total_units: 42,
        unit_type: "Blocks (B001–B042)",
        mapped_units: 42,
        unmapped_units: 0,
        mapping_status: "VERIFIED_MAPPED",
        provenance: "Native Oil Palm Plantation (Division A, 2012–2024)",
        risk_contribution_pct: 100.0,
      },
      drone_imagery: {
        source: "RGB Drone Imagery",
        total_units: 500,
        unit_type: "Aerial Images (43,599 Palms)",
        mapped_units: 0,
        unmapped_units: 500,
        mapping_status: "UNMAPPED_BENCHMARK",
        provenance: "MOPAD Site 2 Benchmark",
        risk_contribution_pct: 0.0,
      },
      multispectral_tiles: {
        source: "Multispectral UAV Rasters",
        total_units: 34,
        unit_type: "Calibrated GeoTIFF Tiles (8.91M Pixels)",
        mapped_units: 0,
        unmapped_units: 34,
        mapping_status: "UNMAPPED_BENCHMARK",
        provenance: "MSUAV500K Beech Forest Benchmark (Hullerbusch, Germany)",
        risk_contribution_pct: 0.0,
      },
    },
    fusion_status: {
      direct_row_level_fusion: false,
      spatial_fusion: false,
      risk_score_fusion: false,
      reason: "No validated spatial linkage between UAV imagery and plantation Block_ID is available. MSUAV500K multispectral data is a German beech-forest benchmark.",
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
      subtext: "Native Operational System",
      provenance: "Oil Palm Plantation Division A (2012–2024)",
      landCover: "Oil Palm (Elaeis guineensis)",
      icon: TrendingUp,
      tone: "green",
      granularity: "Block",
      coverage: "42 Blocks (6,552 Records)",
      indicators: "FFB, Expected Yield Deviations, Foliar Nutrients, DRIS, Soil",
      mapping: "Native (B001–B042)",
      mappingStatus: "available",
      usedInRisk: "YES",
      riskWeight: "100% of Canonical Risk",
      status: "AVAILABLE",
      link: "risk-analysis",
    },
    {
      source: "RGB Drone",
      subtext: "MOPAD Site 2 Benchmark",
      provenance: "MOPAD Site 2 Aerial RGB Dataset",
      landCover: "Oil Palm Canopy (Visual Benchmark)",
      icon: Scan,
      tone: "blue",
      granularity: "Image",
      coverage: "500 Survey Images (43,599 Palms)",
      indicators: "YOLO11n Detections, Mortality / Stunting, Drone Health Score",
      mapping: "Unmapped (0/42 Blocks)",
      mappingStatus: "unavailable",
      usedInRisk: "NO",
      riskWeight: "0% (Independent Evidence)",
      status: "AVAILABLE",
      link: "drone-health",
    },
    {
      source: "Multispectral UAV",
      subtext: "MSUAV500K Benchmark",
      provenance: "Hullerbusch Beech Forest, Germany (Zenodo 16743975)",
      landCover: "Temperate Beech Forest (NOT Oil Palm)",
      icon: Layers,
      tone: "purple",
      granularity: "Tile",
      coverage: "34 Calibrated Tiles (8.91M Pixels)",
      indicators: "Calibrated NDVI, Calibrated NDRE, Canopy Cover %, Uniformity, MHS",
      mapping: "Unmapped (0/42 Blocks)",
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
              3 Independent Pillars
            </span>
            <span className="hero-chip neutral">
              <ShieldCheck size={13} />
              Canonical Risk: 100% Agronomic
            </span>
            <span className="hero-chip warning">
              <ShieldAlert size={13} />
              Multispectral: German Beech Forest Benchmark
            </span>
            <span className="hero-chip neutral">
              <XCircle size={13} />
              Spatial Link: Not Available
            </span>
          </div>
          <h2>Multi-Source Evidence Dashboard</h2>
          <p className="hero-subtitle">
            Three independent diagnostic pillars for plantation intelligence with rigorous spatial decoupling safeguards.
          </p>
        </div>
      </section>

      {/* 2. PROGRESSIVE-DISCLOSURE EVIDENCE MATRIX (CONCISE INITIAL SUMMARIES) */}
      <section className="panel evidence-matrix-panel" aria-label="Evidence Matrix">
        <div className="panel-heading">
          <div>
            <p className="panel-eyebrow">DIAGNOSTIC ARCHITECTURE &amp; EVIDENCE PILLARS</p>
            <h2>Multi-Source Evidence Matrix</h2>
          </div>
          <span className="operational-tag">Progressive Disclosure Protocol</span>
        </div>
        <p className="panel-subtitle">
          Three independent diagnostic pillars with strict spatial decoupling safeguards. Click "View Details &amp; Technical Audit" on any pillar to inspect model metrics, sensor wavelengths, and provenance metadata.
        </p>

        <div className="evidence-summary-grid">
          {/* A. Palm Agronomic Evidence */}
          <article className="evidence-summary-card available">
            <div className="summary-card-header">
              <div className="header-left">
                <span className="pillar-letter-badge available">A</span>
                <div className="pillar-title-block">
                  <span className="pillar-kicker">OPERATIONAL PLANTATION PILLAR</span>
                  <h3>Palm Agronomic Evidence</h3>
                </div>
              </div>
              <span className="evidence-status-pill available">
                <CheckCircle2 size={13} />
                Status: Available
              </span>
            </div>

            {/* Concise Initial Summary */}
            <div className="summary-card-body">
              <div className="summary-meta-grid">
                <div className="meta-item">
                  <span className="meta-label">Coverage</span>
                  <strong className="meta-value">42 blocks</strong>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Period</span>
                  <strong className="meta-value">2012–2024</strong>
                </div>
              </div>
              <div className="summary-meaning-box">
                <span className="meaning-label">Meaning:</span>
                <p className="meaning-text">
                  Historical productivity and available field measurements.
                </p>
              </div>
            </div>

            {/* Expand / Collapse Button */}
            <div className="summary-card-actions">
              <button
                type="button"
                className="toggle-details-btn"
                onClick={() => toggleExpand("palm")}
                aria-expanded={expanded.palm}
              >
                <span>{expanded.palm ? "Hide Details" : "View Details & Technical Audit"}</span>
                {expanded.palm ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>

            {/* Progressive Disclosure Section */}
            {expanded.palm && (
              <div className="summary-expanded-drawer">
                <div className="expanded-spec-grid">
                  <div className="exp-spec-item">
                    <span className="exp-label">EVIDENCE LEVEL</span>
                    <strong>Block Level (B001–B042)</strong>
                  </div>
                  <div className="exp-spec-item">
                    <span className="exp-label">CANONICAL RISK WEIGHT</span>
                    <strong className="text-emerald">100% Core Quantitative Driver</strong>
                  </div>
                  <div className="exp-spec-item">
                    <span className="exp-label">DATASET PROVENANCE</span>
                    <strong>Oil Palm Plantation Division A (2012–2024, 6,552 records)</strong>
                  </div>
                  <div className="exp-spec-item">
                    <span className="exp-label">LAND COVER</span>
                    <strong>Commercial Oil Palm Plantation (Elaeis guineensis)</strong>
                  </div>
                </div>

                <div className="expanded-indicators-box">
                  <span className="exp-box-title">VALIDATED PRIMARY INDICATORS</span>
                  <p>
                    Monthly FFB Weighbridge Production · Expected Cohort Deviations · Frond 17 Leaf Nutrients (N, P, K, Ca, Mg, B) · DRIS Nutritional Balance Indices · Soil Chemistry (7 sampled index blocks, 35 unavailable)
                  </p>
                </div>

                <div className="expanded-footer-row">
                  <div className="audit-note">
                    <ShieldCheck size={14} className="text-emerald" />
                    <span>Sole quantitative source governing screening scores and fertilizer prescriptions.</span>
                  </div>
                  {navigate && (
                    <button
                      type="button"
                      className="expanded-nav-btn"
                      onClick={() => navigate("risk-analysis")}
                    >
                      <span>Explore Risk Screening</span>
                      <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </article>

          {/* B. RGB Drone Evidence */}
          <article className="evidence-summary-card unmapped">
            <div className="summary-card-header">
              <div className="header-left">
                <span className="pillar-letter-badge unmapped">B</span>
                <div className="pillar-title-block">
                  <span className="pillar-kicker">INDEPENDENT VISUAL BENCHMARK</span>
                  <h3>RGB Drone Evidence</h3>
                </div>
              </div>
              <span className="evidence-status-pill unmapped">
                <Info size={13} />
                Status: Unmapped
              </span>
            </div>

            {/* Concise Initial Summary */}
            <div className="summary-card-body">
              <div className="summary-meta-grid">
                <div className="meta-item">
                  <span className="meta-label">Coverage</span>
                  <strong className="meta-value">500 survey images</strong>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Period</span>
                  <strong className="meta-value">Aerial Survey Flight</strong>
                </div>
              </div>
              <div className="summary-meaning-box">
                <span className="meaning-label">Meaning:</span>
                <p className="meaning-text">
                  Visual detections cannot yet be assigned reliably to plantation blocks.
                </p>
              </div>
            </div>

            {/* Expand / Collapse Button */}
            <div className="summary-card-actions">
              <button
                type="button"
                className="toggle-details-btn"
                onClick={() => toggleExpand("rgb")}
                aria-expanded={expanded.rgb}
              >
                <span>{expanded.rgb ? "Hide Details" : "View Details & Technical Audit"}</span>
                {expanded.rgb ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>

            {/* Progressive Disclosure Section */}
            {expanded.rgb && (
              <div className="summary-expanded-drawer">
                <div className="expanded-spec-grid">
                  <div className="exp-spec-item">
                    <span className="exp-label">EVIDENCE LEVEL</span>
                    <strong>Image Level (1024×1024 px Aerial Crops)</strong>
                  </div>
                  <div className="exp-spec-item">
                    <span className="exp-label">CANONICAL RISK WEIGHT</span>
                    <strong className="text-amber">0% (Decoupled / Isolated)</strong>
                  </div>
                  <div className="exp-spec-item">
                    <span className="exp-label">BLOCK MAPPING</span>
                    <strong className="text-amber">0 / 42 Blocks Mapped (Lacks Shapefile Bounds)</strong>
                  </div>
                  <div className="exp-spec-item">
                    <span className="exp-label">DATASET PROVENANCE</span>
                    <strong>MOPAD Site 2 Aerial Survey Dataset</strong>
                  </div>
                </div>

                <div className="expanded-indicators-box">
                  <span className="exp-box-title">VALIDATED MODEL DETECTIONS (YOLO11n)</span>
                  <p>
                    43,599 total palms detected across 500 images: Healthy Palms (78.28%) · Small / Replanted (20.28%) · Dead / Stunted (0.19%) · Mean Drone Health Score: 75.81%
                  </p>
                </div>

                <div className="expanded-footer-row">
                  <div className="audit-note">
                    <ShieldAlert size={14} className="text-amber" />
                    <span>Visual confirmation tool. Strictly decoupled from block screening formulas.</span>
                  </div>
                  {navigate && (
                    <button
                      type="button"
                      className="expanded-nav-btn"
                      onClick={() => navigate("drone-health")}
                    >
                      <span>Explore Drone Health</span>
                      <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </article>

          {/* C. Multispectral Evidence */}
          <article className="evidence-summary-card benchmark">
            <div className="summary-card-header">
              <div className="header-left">
                <span className="pillar-letter-badge benchmark">C</span>
                <div className="pillar-title-block">
                  <span className="pillar-kicker">SENSOR RESEARCH BENCHMARK</span>
                  <h3>Multispectral Evidence</h3>
                </div>
              </div>
              <span className="evidence-status-pill benchmark">
                <ShieldAlert size={13} />
                Status: Demo benchmark only
              </span>
            </div>

            {/* Concise Initial Summary */}
            <div className="summary-card-body">
              <div className="summary-meta-grid">
                <div className="meta-item">
                  <span className="meta-label">Coverage</span>
                  <strong className="meta-value">34 tiles</strong>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Period</span>
                  <strong className="meta-value">Sensor Benchmark</strong>
                </div>
              </div>
              <div className="summary-meaning-box">
                <span className="meaning-label">Meaning:</span>
                <p className="meaning-text">
                  Data represents a German beech forest, not an oil-palm plantation.
                </p>
              </div>
            </div>

            {/* Expand / Collapse Button */}
            <div className="summary-card-actions">
              <button
                type="button"
                className="toggle-details-btn"
                onClick={() => toggleExpand("multispectral")}
                aria-expanded={expanded.multispectral}
              >
                <span>{expanded.multispectral ? "Hide Details" : "View Details & Technical Audit"}</span>
                {expanded.multispectral ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>

            {/* Progressive Disclosure Section */}
            {expanded.multispectral && (
              <div className="summary-expanded-drawer">
                <div className="expanded-spec-grid">
                  <div className="exp-spec-item">
                    <span className="exp-label">EVIDENCE LEVEL</span>
                    <strong>Tile Level (8.91M Calibrated Pixels)</strong>
                  </div>
                  <div className="exp-spec-item">
                    <span className="exp-label">CANONICAL RISK WEIGHT</span>
                    <strong className="text-purple">0% (Decoupled / Isolated)</strong>
                  </div>
                  <div className="exp-spec-item">
                    <span className="exp-label">SENSOR WAVELENGTHS</span>
                    <strong>5-Band Calibrated: 475nm, 560nm, 668nm, 705nm, 842nm</strong>
                  </div>
                  <div className="exp-spec-item">
                    <span className="exp-label">TRUE PROVENANCE</span>
                    <strong className="text-purple">Hullerbusch Beech Forest, Germany (Zenodo 16743975)</strong>
                  </div>
                </div>

                <div className="expanded-indicators-box">
                  <span className="exp-box-title">VALIDATED SPECTRAL INDICES &amp; ECOSYSTEM DISCLAIMER</span>
                  <p>
                    Canopy NDVI: 0.8977 · Red-Edge NDRE: 0.5129 · Canopy Cover: 93.62% · Uniformity: 90.48 · MHS: 92.00. <strong>Demonstrates 5-band sensor mechanics; strictly European beech forest (Fagus sylvatica), NOT oil-palm plantation data.</strong>
                  </p>
                </div>

                <div className="expanded-footer-row">
                  <div className="audit-note">
                    <ShieldAlert size={14} className="text-purple" />
                    <span>Demo benchmark only. Strictly excluded from operational block risk.</span>
                  </div>
                  {navigate && (
                    <button
                      type="button"
                      className="expanded-nav-btn"
                      onClick={() => navigate("multispectral-health")}
                    >
                      <span>Explore Multispectral</span>
                      <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </article>
        </div>
      </section>

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

          <div className="architecture-captions">
            <p className="arch-note primary-note">
              <strong>Canonical Risk Scope:</strong> Canonical risk uses Palm agronomic evidence only.
            </p>
            <p className="arch-note uav-note">
              <strong>UAV Independence:</strong> RGB and Multispectral remain independent evidence.
            </p>
          </div>

          {/* Fusion Status Banner */}
          <div className="fusion-status-bridge">
            <div className="fusion-status-top">
              <GitMerge size={18} />
              <strong>SPATIAL FUSION: NOT AVAILABLE</strong>
            </div>
            <div className="fusion-status-body">
              <span className="fusion-status-pill">
                Spatial Fusion: Not Available
              </span>
              <p>
                Validated GIS/georeferenced linkage is required before UAV evidence can be assigned to plantation Block_ID.
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
          Summary of data granularity, provenance, ecosystem land cover, spatial linkage, and canonical risk participation.
        </p>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>EVIDENCE SOURCE</th>
                <th>DATASET PROVENANCE &amp; ECOSYSTEM</th>
                <th>COVERAGE &amp; GRANULARITY</th>
                <th>BLOCK MAPPING STATUS</th>
                <th>CANONICAL RISK PARTICIPATION</th>
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
                  <td>
                    <div className="provenance-cell-wrap">
                      <span className="prov-cell-title">{row.provenance}</span>
                      <small className="prov-cell-eco">{row.landCover}</small>
                    </div>
                  </td>
                  <td>
                    <strong>{row.granularity} Level</strong>
                    <small className="text-sub-metric"> ({row.coverage})</small>
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
            <h3>Scientific Integrity &amp; Spatial Decoupling Protocol</h3>
            <span className="operational-tag">Strict Anti-Fabrication Safeguard</span>
          </div>
        </div>
        <div className="limitation-body">
          <p className="limitation-lead">
            "UAV datasets are currently independent evidence because validated GIS/georeferenced linkage to plantation Block_ID is unavailable. The existing multispectral data is a German beech-forest benchmark (Hullerbusch, Germany), not oil-palm data. Both drone and multispectral streams are strictly excluded from canonical block-risk scoring (0% risk contribution)."
          </p>
          <p className="limitation-sub">
            "Drone Health Score and Multispectral Health Score are project-derived indicators, not validated disease diagnoses. Canonical block risk is exclusively driven by verified block-level agronomic records."
          </p>
        </div>
      </section>

      {/* GIS READINESS CHECKLIST FOR FUTURE SPATIAL INTEGRATION */}
      <section className="panel gis-readiness-roadmap-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-eyebrow">SPATIAL DATA GOVERNANCE</p>
            <h2>GIS Readiness Checklist for Future Spatial Integration</h2>
          </div>
          <span className="unit-pill">5 Technical Prerequisites · Currently Missing</span>
        </div>
        <p className="panel-subtitle">
          Direct row-level multi-source fusion will only be permitted once all five technical spatial integration prerequisites are satisfied:
        </p>

        <div className="gis-checklist-grid">
          {/* Prerequisite 1: Vector Boundaries */}
          <div className="gis-checklist-card status-missing">
            <div className="gis-card-header">
              <div className="gis-step-num">1</div>
              <div className="gis-card-title">
                <h4>Plantation Vector GIS Boundaries</h4>
                <span className="gis-req-tag">GEOMETRIC PERIMETERS</span>
              </div>
              <span className="gis-status-badge missing">MISSING / REQUIRED</span>
            </div>
            <div className="gis-card-body">
              <p className="gis-spec-text">
                <strong>Specification:</strong> Authoritative vector polygon boundaries (ESRI Shapefile or GeoJSON format) with valid geometries for all 42 operational blocks (B001–B042).
              </p>
              <p className="gis-spec-text">
                <strong>Spatial Role:</strong> Required for point-in-polygon containment, spatial intersection, and zonal aggregation of UAV raster statistics to block boundaries.
              </p>
              <div className="gis-card-status-note">
                <XCircle size={14} className="text-negative" />
                <span>Status: No estate vector boundary polygons exist in the project repository.</span>
              </div>
            </div>
          </div>

          {/* Prerequisite 2: CRS */}
          <div className="gis-checklist-card status-missing">
            <div className="gis-card-header">
              <div className="gis-step-num">2</div>
              <div className="gis-card-title">
                <h4>Coordinate Reference System (CRS)</h4>
                <span className="gis-req-tag">CARTOGRAPHIC DATUM</span>
              </div>
              <span className="gis-status-badge missing">MISSING / REQUIRED</span>
            </div>
            <div className="gis-card-body">
              <p className="gis-spec-text">
                <strong>Specification:</strong> Standard projected coordinate reference system (e.g., WGS 84 / UTM Zone 47N/48N or authoritative national EPSG datum) applied to all GIS layers and drone surveys.
              </p>
              <p className="gis-spec-text">
                <strong>Spatial Role:</strong> Eliminates reprojection distortion, cartographic shear, and inaccurate block hectare calculations during overlay.
              </p>
              <div className="gis-card-status-note">
                <XCircle size={14} className="text-negative" />
                <span>Status: Rasters currently operate in local unprojected image pixel coordinates.</span>
              </div>
            </div>
          </div>

          {/* Prerequisite 3: Georeferenced Oil-Palm Imagery */}
          <div className="gis-checklist-card status-missing">
            <div className="gis-card-header">
              <div className="gis-step-num">3</div>
              <div className="gis-card-title">
                <h4>Georeferenced Oil-Palm Imagery</h4>
                <span className="gis-req-tag">PLANTATION ORTHOMOSAICS</span>
              </div>
              <span className="gis-status-badge missing">MISSING / REQUIRED</span>
            </div>
            <div className="gis-card-body">
              <p className="gis-spec-text">
                <strong>Specification:</strong> Calibrated multi-band orthomosaics with sub-meter spatial precision, embedded Ground Control Points (GCPs), and GeoTIFF spatial headers flown over the oil-palm plantation.
              </p>
              <p className="gis-spec-text">
                <strong>Spatial Role:</strong> Replaces the German beech-forest benchmark (MSUAV500K) with verified tropical oil-palm canopy spectral reflectance.
              </p>
              <div className="gis-card-status-note">
                <XCircle size={14} className="text-negative" />
                <span>Status: Existing 34 multispectral tiles originate from Hullerbusch Beech Forest in Germany.</span>
              </div>
            </div>
          </div>

          {/* Prerequisite 4: Synchronized Timestamps */}
          <div className="gis-checklist-card status-missing">
            <div className="gis-card-header">
              <div className="gis-step-num">4</div>
              <div className="gis-card-title">
                <h4>Flight Telemetry &amp; Timestamps</h4>
                <span className="gis-req-tag">TEMPORAL SYNCHRONIZATION</span>
              </div>
              <span className="gis-status-badge missing">MISSING / REQUIRED</span>
            </div>
            <div className="gis-card-body">
              <p className="gis-spec-text">
                <strong>Specification:</strong> UAV flight logs, flight trajectories, and image capture timestamps synchronized with monthly FFB harvest rounds and annual Frond 17 leaf sampling dates.
              </p>
              <p className="gis-spec-text">
                <strong>Spatial Role:</strong> Aligns transient canopy greenness observations with multi-year agronomic productivity trends and avoids seasonal lag.
              </p>
              <div className="gis-card-status-note">
                <XCircle size={14} className="text-negative" />
                <span>Status: UAV flight dates and estate agronomic harvest calendar are uncoupled.</span>
              </div>
            </div>
          </div>

          {/* Prerequisite 5: Block Identifiers */}
          <div className="gis-checklist-card status-missing">
            <div className="gis-card-header">
              <div className="gis-step-num">5</div>
              <div className="gis-card-title">
                <h4>Verified Block Identifier Association</h4>
                <span className="gis-req-tag">ATTRIBUTION LINKAGE</span>
              </div>
              <span className="gis-status-badge missing">MISSING / REQUIRED</span>
            </div>
            <div className="gis-card-body">
              <p className="gis-spec-text">
                <strong>Specification:</strong> Authoritative spatial join lookup table or relational schema linking flight tiles/orthomosaic extents directly to operational block IDs (B001–B042).
              </p>
              <p className="gis-spec-text">
                <strong>Spatial Role:</strong> Authorizes cross-pillar fusion without synthetic assumptions, preserving scientific integrity in executive reporting.
              </p>
              <div className="gis-card-status-note">
                <XCircle size={14} className="text-negative" />
                <span>Status: Zero spatial linkage exists. Linking unmapped imagery to B001–B042 is prohibited.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="gis-checklist-footer-note">
          <ShieldAlert size={18} className="text-amber" />
          <div>
            <strong>Architectural Governance Policy:</strong>
            <span> Canonical block risk is strictly driven by verified agronomic evidence (100%). Drone and multispectral data are decoupled independent evidence with 0% risk contribution. Fused risk scores will NOT be created without fulfilling all 5 GIS readiness criteria.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
