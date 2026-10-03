# Palm_AI Multispectral Module

This isolated module manages multispectral remote sensing data, sensor calibration, and vegetation index calculations (NDVI, NDRE) for oil palm plantation health monitoring.

---

## Strict Development Constraints & Scientific Integrity Rules

In compliance with project directives:
1. **DO NOT modify the existing RGB Drone module:** The YOLO11n object detection module remains isolated and frozen.
2. **DO NOT calculate NDVI or NDRE yet:** Calculation of vegetation indices is prohibited until genuine multispectral raster files with physical Red and Near-Infrared (NIR) bands are acquired and verified.
3. **DO NOT use RGB images as multispectral data:** Standard RGB images lack near-infrared (NIR) and red-edge channels. False NDVI approximations derived from RGB color spaces (e.g., VARI or GLI) must never be mislabeled as NDVI.
4. **DO NOT fabricate missing bands:** Missing spectral channels will never be synthesized or invented.
5. **Work exclusively inside `drone/multispectral/`:** Backend, frontend, and existing drone modules remain untouched.

---

## Local Dataset Audit & Findings

An audit was performed across all local directories (`drone/`, `data/`, `OneDrive/Documents/Airei/`, `Downloads/`):

1. **MOPAD Site 2 Dataset (`drone/dataset_yolo/`):**
   - Format: 8-bit RGB JPEGs ($1024 \times 1024$)
   - Channels: 3 bands (`'R', 'G', 'B'`)
   - Genuine Multispectral: **NO**
   - Conclusion: High-resolution visible RGB imagery designed for object detection. Lacks NIR and Red-Edge.

2. **Mendeley Data — Oil Palm Tree Detection for Anomaly Identification (`Downloads/`):**
   - DOI: [10.17632/nh7d23dgnw.1](https://doi.org/10.17632/nh7d23dgnw.1) (Roboflow export)
   - Format: 8-bit RGB JPEGs ($800 \times 600$)
   - Channels: 3 bands (`'R', 'G', 'B'`)
   - Genuine Multispectral: **NO**
   - Conclusion: Although aerial surveys were flown using a DJI Phantom 4 Multispectral drone, the published dataset exported only 3-channel RGB images. Raw radiometric calibration TIFFs and separate NIR/Red-Edge bands were omitted from the public export.

3. **MSUAV500K Acquired Subset (`drone/multispectral/data/`):**
   - Source: Zenodo DOI [10.5281/zenodo.16743974](https://doi.org/10.5281/zenodo.16743974) (Record 16743975)
   - Format: 5-band stacked GeoTIFF rasters ($512 \times 512$ tiles)
   - Total Files: 34 verified multispectral raster tiles
   - Verified Bands: 5 calibrated spectral channels:
     * Band 0 (Blue): 475 nm
     * Band 1 (Green): 560 nm
     * Band 2 (Red): 668 nm (Chlorophyll absorption - **Critical for NDVI**)
     * Band 3 (Red Edge): 717 nm (Chlorophyll transition - **Critical for NDRE**)
     * Band 4 (NIR): 842 nm (Leaf mesophyll reflectance - **Critical for NDVI/NDRE**)
   - Radiometric Depth: Calibrated surface reflectance (uint8, [0, 255])
   - Genuine Multispectral: **YES**

**Result: Genuine multispectral data acquired and verified locally under `drone/multispectral/data/`.**

---

## MSUAV500K Official Zenodo Record & Download Strategy

- **Dataset Name:** MSUAV500K: Foundational Dataset for Multispectral and RGB Uncrewed Aerial Vehicle Imagery
- **Official Source:** *Data in Brief* (2025) / Zenodo Archive
- **Source URL / DOI:** [https://doi.org/10.5281/zenodo.16743974](https://doi.org/10.5281/zenodo.16743974) (Record [16743975](https://zenodo.org/records/16743975))
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0)
- **Total Published Size:** 169.1 GB compressed (185 GB processed) across 598,300 images.

### Official Zenodo Archives Breakdown:

| Archive Name | File Size | Format | Multispectral Content | Included in Palm_AI? |
| :--- | :---: | :---: | :---: | :---: |
| **`MS.zip`** | 15.2 GB | ZIP (GeoTIFFs) | **YES** (18,629 multispectral-only images from 13 projects) | **YES** (Representative verified subset downloaded) |
| **`msdata-repo.zip`** | 11.0 MB | ZIP (Code/Metadata) | Calibration procedures, alignment scripts & manifests | **YES** (Audited & inspected) |
| **`RGBMS.zip`** | 108.1 GB | ZIP (Pairs) | **YES** (136,652 aligned MS-RGB pairs) | Excluded (Exceeds local disk capacity; 83 GB available) |
| **`RGB.zip`** | 45.7 GB | ZIP (RGB JPEGs) | **NO** (443,017 RGB-only images) | Excluded (Strictly prohibited per project rules) |

### Download Strategy Enforced:
1. Blindly downloading all 185 GB was rejected to prevent disk exhaustion.
2. RGB-only data (`RGB.zip`, 45.7 GB) was completely excluded.
3. A verified lightweight representative subset of 34 complete 5-band GeoTIFF tiles (44.6 MB total uncompressed, 25 MB stream chunk) was acquired from `MS.zip` into `drone/multispectral/data/`.

---

## Verified Spectral Band Specifications

The acquired tiles feature calibrated bands from high-performance multispectral UAV sensors:

| Band Index | Band Name | Center Wavelength | Bandwidth | Scientific Role in Vegetation Indices |
| :---: | :--- | :---: | :---: | :--- |
| **0** | **Blue** | 475 nm | 32 nm | Atmospheric scattering baseline |
| **1** | **Green** | 560 nm | 27 nm | Chlorophyll green reflectance peak |
| **2** | **Red** | 668 nm | 16 nm | **Critical for NDVI:** Chlorophyll absorption peak |
| **3** | **Red Edge** | 717 nm | 12 nm | **Critical for NDRE:** Transition zone sensitive to canopy nitrogen & chlorophyll |
| **4** | **NIR (Near-Infrared)** | 842 nm | 57 nm | **Critical for NDVI & NDRE:** Internal leaf cellular structure reflectance |

---

## Vegetation Index Calculation & Empirical Validation

### Band Structure & Empirical Confirmation

Before calculation, the band structure was confirmed both through sensor documentation (MicaSense Altum) and empirical statistical profiling across all 34 tiles (subsampled across pixels):

- **Band 0 (Blue, 475 nm):** Mean reflectance $7.54 \pm 13.30$ (High atmospheric scattering baseline, strongly correlated with Red $r=0.995$)
- **Band 1 (Green, 560 nm):** Mean reflectance $13.88 \pm 13.24$ (Chlorophyll green peak reflectance)
- **Band 2 (Red, 668 nm):** Mean reflectance $8.94 \pm 13.78$ (Chlorophyll absorption dip; critical for NDVI)
- **Band 3 (Red Edge, 717 nm):** Mean reflectance $34.44 \pm 14.19$ (Chlorophyll transition edge; critical for NDRE)
- **Band 4 (NIR, 842 nm):** Mean reflectance $88.82 \pm 21.22$ (Leaf mesophyll internal light scattering plateau; critical for NDVI/NDRE)

### Mathematical Formulation & Safe Floating-Point Computation

$$\text{NDVI} = \frac{\text{NIR} - \text{Red}}{\text{NIR} + \text{Red}} = \frac{\text{Band}_4 - \text{Band}_2}{\text{Band}_4 + \text{Band}_2}$$

$$\text{NDRE} = \frac{\text{NIR} - \text{Red Edge}}{\text{NIR} + \text{Red Edge}} = \frac{\text{Band}_4 - \text{Band}_3}{\text{Band}_4 + \text{Band}_3}$$

- **Numerical Precision:** Rasters are loaded as `float32` prior to calculation to prevent integer truncation or underflow.
- **Division-by-Zero Safety:** Zero-denominator (background/shadow) pixels are safely masked: $\text{where}(\text{denominator} > 0, \text{numerator}/\text{denominator}, 0.0)$.

### Dataset-Wide Validation Results (All 34 Tiles Evaluated)

| Metric | NDVI (Normalized Difference Vegetation Index) | NDRE (Normalized Difference Red Edge Index) |
| :--- | :---: | :---: |
| **Mean of Means** | **$0.7958 \pm 0.3581$** | **$0.4792 \pm 0.1655$** |
| **Median of Medians** | **$0.9216$** | **$0.5094$** |
| **Empirical Range** | $[-1.0000, 1.0000]$ | $[-1.0000, 1.0000]$ |
| **Theoretical Bounds Check** | **PASSED** (100% within $[-1.0, 1.0]$) | **PASSED** (100% within $[-1.0, 1.0]$) |
| **Zero NaN / Inf Errors** | **PASSED** (0 numerical errors across 8.91M pixels) | **PASSED** (0 numerical errors across 8.91M pixels) |

### Canopy Health Classification Breakdown

- **High Health Canopy ($\text{NDVI} \ge 0.6$):** **$91.14\%$** of analyzed canopy
- **Moderate Health Canopy ($0.4 \le \text{NDVI} < 0.6$):** **$2.30\%$**
- **Low Health / Stressed ($0.2 \le \text{NDVI} < 0.4$):** **$0.23\%$**
- **Non-vegetation / Soil / Shadow ($\text{NDVI} < 0.2$):** **$6.33\%$**

---

## Tile-Level Multispectral Vegetation-Health Features

The continuous pixel rasters are converted into **43 structured agronomic features per tile** stored in `drone/multispectral/outputs/multispectral_tile_health_features.csv`:

### 1. Land-Cover & Canopy Strata Proportions
- `canopy_cover_percentage`: Fraction of tile surface covered by active photosynthetic canopy ($\text{NDVI} \ge 0.30$).
- `high_vigour_canopy_percentage`: Dense canopy with optimal chlorophyll absorption ($\text{NDVI} \ge 0.70$).
- `moderate_vigour_canopy_percentage`: Adequate physiological canopy ($0.50 \le \text{NDVI} < 0.70$).
- `depressed_vigour_canopy_percentage`: Thinning foliage or chlorosis ($0.30 \le \text{NDVI} < 0.50$).
- `bare_soil_background_percentage`: Exposed non-vegetative ground ($0.0 \le \text{NDVI} < 0.30$).
- `water_or_deep_shadow_percentage`: Negative NDVI surface (lake water / extreme shadow, $\text{NDVI} < 0.0$).

### 2. Pure-Canopy Masked Health Metrics ($\text{NDVI} \ge 0.30$)
Separating canopy foliage from non-vegetative ground avoids artificial dilution of canopy vigour:
- **Canopy Photosynthetic Vigour (NDVI):** `canopy_ndvi_mean` ($0.8977$), `canopy_ndvi_median` ($0.9189$), `canopy_ndvi_std`, `canopy_ndvi_iqr`.
- **Canopy Chlorophyll & Nitrogen Sensitivity (NDRE):** `canopy_ndre_mean` ($0.5129$), `canopy_ndre_median` ($0.5047$), `canopy_ndre_std`, `canopy_ndre_iqr`.
- **Canopy Spatial Heterogeneity (CV):** Coefficient of variation ($\sigma / \mu$) for NDVI and NDRE, measuring stand uniformity vs canopy gap fragmentation.

### 3. Composite Multispectral Health Score (MHS, 0 - 100)
A standardized multi-criteria metric representing overall physiological canopy vigour:

$$\text{MHS} = \left( 0.40 \cdot \text{NDVI}_{\text{norm}} + 0.30 \cdot \text{NDRE}_{\text{norm}} + 0.20 \cdot \text{Cover}_{\text{norm}} + 0.10 \cdot \text{Uniformity}_{\text{norm}} \right) \times 100$$

- **Dataset Mean MHS:** **$92.00 / 100$** (Median: $96.64$)
- **High Vigour Canopy ($\text{MHS} \ge 80$):** **30 tiles ($88.2\%$)**
- **Moderate Vigour Canopy ($60 \le \text{MHS} < 80$):** **3 tiles ($8.8\%$)**
- **Non-Canopy / Water Background:** **1 tile ($2.9\%$, lake surface)**

---

## Mandatory Scientific & Agronomic Integrity Disclaimer

> [!IMPORTANT]
> **Non-Diagnostic Scope Limitation:**
> Multispectral vegetation indices (NDVI, NDRE) quantify optical surface reflectance and canopy absorption properties. While they reliably detect anomalies in chlorophyll content, biomass density, and photosynthetic activity, **they do NOT indicate specific biological or chemical etiologies**. Depressed index values can be caused by drought stress, nitrogen deficiency, vascular root rot (*Ganoderma boninense*), pest herbivory (*Metisa plana* / Bagworms), soil compaction, or physical pruning. Diagnostic attribution requires in-situ agronomist inspection, leaf tissue laboratory analysis, or soil sampling. In compliance with project rules, **no synthetic Block_IDs or unverified disease diagnoses have been invented**.

---

## Directory Structure

```text
drone/multispectral/
├── README.md                                    # Comprehensive module documentation
├── data/                                        # 34 verified MSUAV500K multispectral GeoTIFF rasters (512x512)
│   ├── ALTUM_CAL_altum_beechforest_..._1072_1031.tif
│   └── ... (34 verified 5-band tiles)
├── scripts/
│   ├── verify_multispectral_dataset.py          # Band, metadata, and data type validation script
│   ├── download_msuav_subset.py                 # Zenodo stream chunk acquisition pipeline
│   ├── calculate_vegetation_indices.py          # Vectorized NDVI/NDRE calculation pipeline
│   └── extract_multispectral_health_features.py # Tile-level feature engineering & MHS scoring
└── outputs/
    ├── multispectral_dataset_summary.json       # Dataset verification manifest
    ├── multispectral_dataset_summary.txt        # Dataset verification plain-text report
    ├── multispectral_vegetation_indices.csv     # Raw per-tile NDVI/NDRE metrics (34 rows)
    ├── multispectral_tile_health_features.csv   # Comprehensive 43-column tile health feature table
    ├── multispectral_tile_health_features_summary.json # Aggregate health feature summary
    ├── multispectral_tile_health_features_summary.txt  # Human-readable feature report
    └── visualizations/
        ├── ndvi_ndre_spatial_maps.png           # 4-panel comparison: RGB vs CIR vs NDVI vs NDRE
        ├── ndvi_ndre_distributions.png          # Pixel value density histograms
        ├── tile_health_comparison.png           # Per-tile NDVI and NDRE mean comparisons
        ├── canopy_health_score_distribution.png # Multispectral Health Score distribution
        ├── canopy_strata_breakdown.png          # Land-cover & vigour strata per tile
        ├── canopy_ndvi_vs_ndre_scatter.png      # Optical relationship between NDVI and NDRE
        └── canopy_heterogeneity_vs_vigour.png   # Stand heterogeneity (CV) vs health score
```

---

## Execution Instructions

To re-run the complete multispectral pipeline:

```powershell
# 1. Verify dataset integrity
.\venv\Scripts\python.exe drone/multispectral/scripts/verify_multispectral_dataset.py

# 2. Calculate pixel-level NDVI and NDRE rasters
.\venv\Scripts\python.exe drone/multispectral/scripts/calculate_vegetation_indices.py

# 3. Extract tile-level vegetation-health features
.\venv\Scripts\python.exe drone/multispectral/scripts/extract_multispectral_health_features.py
```

---

## Multi-Source Integration Audit Status

In the project-wide Multi-Source Integration Audit:
- **Multispectral spectral evidence** provides tile-level pure-canopy photosynthetic vigour (`canopy_ndvi_mean`), deep-foliage chlorophyll and nitrogen sensitivity (`canopy_ndre_mean`), and canopy uniformity scores.
- **Palm Plantation agronomic evidence** provides block-level monthly yield, soil chemistry, DRIS nutritional diagnosis, and weather stress.
- **RGB Drone evidence** provides crown-level YOLO detections of mortality, foliar yellowing, and stunted palms.

### Current Integration Status:
- **Direct Row-Level Fusion:** **BLOCKED (NOT SCIENTIFICALLY FEASIBLE)**.
  - No common Block_ID exists between the deciduous forest benchmark tiles (Hullerbusch, Germany) and the tropical oil palm plantation (Southeast Asia).
  - Fusing unrelated rows is scientifically invalid and prohibited.
- **Decoupled Architecture:**
  - Multispectral metrics serve as an independent, decoupled layer of physiological evidence for multi-source risk analysis.
  - To achieve block-level spatial fusion in the future, co-registered multispectral UAV imagery flown directly over the target plantation blocks with georeferenced GIS boundaries must be acquired.

Full audit documentation is available at [drone/outputs/multi_source_integration_status.txt](../outputs/multi_source_integration_status.txt) and [drone/outputs/multi_source_feature_catalog.csv](../outputs/multi_source_feature_catalog.csv).




