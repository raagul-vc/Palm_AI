# ALM AI — Complete Multi-Source Dataset Audit & Compatibility Report

**Report Date**: 2026-10-27  
**System**: Palm AI / ALM Plantation Intelligence System  
**Evaluation Standard**: Strict scientific defensibility, zero data falsification, decoupled multi-source architecture.  

---

## Executive Summary

A rigorous audit was conducted across all raw tabular datasets, integrated master records, drone RGB YOLO models, and multispectral GeoTIFF imagery.

### Key Findings:
1. **Pillar 1 (Palm Agronomic Data)** is 100% verified and operational across **42 commercial blocks (B001–B042)** in Division_A from 2012–2024 (6,552 records). All relational joins across productivity, block characteristics, leaf sampling events (2015–2022), and soil sampling events (2017, 2020) succeed at 100%.
2. **Pillar 2 (Drone RGB UAV Data)** is validated using a custom-trained **YOLO11n model** with 5 classes (`Dead`, `Healthy`, `Grass`, `Small`, `Yellow`). However, images originate from the **MOPAD Site 2** research flight in Peninsular Malaysia and operate on local canvas pixel coordinates. Because **no GPS coordinates or operational block boundary shapefiles** exist, drone RGB detections are evaluated at the image level and **strictly marked as UNMAPPED** to blocks B001–B042.
3. **Pillar 3 (Multispectral UAV Data)** originates from the **MSUAV500K benchmark** (Hullerbusch, Germany). Forensic inspection confirmed that the imagery represents a **German temperate beech forest (*Fagus sylvatica*)**, NOT an oil-palm plantation. While 5 calibrated bands (Blue, Green, Red, RedEdge, NIR) enable rigorous technical computation of NDVI and NDRE, the imagery has **zero spatial connection** to the tropical plantation. It is clearly labeled as **DEMO ONLY / BENCHMARK / UNMATCHED** and excluded from block risk scores.
4. **Screening Risk Methodology**: The canonical screening formula (Yield gap 40%, Nutrient status 25%, DRIS 15%, normalized by available weights) is strictly preserved without corruption from unmapped UAV imagery.

---

## 1. Tabular Dataset Audit & Relational Compatibility

| Dataset File | Records | Date Range | Primary / Join Key | Join Success Rate | Missing / Duplicate Summary | Provenance & Limitations |
|---|---|---|---|---|---|---|
| `productivity_monthly.csv` | 6,552 | 2012–2024 | `[Year, Month_Number, Block_ID]` | 100% | 0 missing, 0 duplicates | Ground-truth monthly harvest scale weights across 42 blocks (B001–B042). |
| `block_characteristics.csv` | 42 | 2000–2016 plant | `[Block_ID]` | 100% | 0 missing, 0 duplicates | Stand age, seed type (PPKS, Lonsum), area (10–35 ha, total 928 ha). |
| `leaf_sampling_event.csv` | 257 | 2015–2022 | `[KCD_Event_ID]` | 100% | Boron missing in 173 rows (67.3%); N,P,K,Ca,Mg 100% complete | Annual foliar assays (Frond 17). Sparse Boron handled without score corruption. |
| `kcd_block_membership.csv` | 295 | 2015–2022 | `[KCD_Event_ID, Block_ID]` | 100% | 0 missing, 0 duplicates | Bridge table linking KCD events to blocks (single & composite sampling). |
| `soil_sampling_event.csv` | 24 | 2017, 2020 | `[Soil_Event_ID]` | 100% | Base Saturation >100% in 2 events (flagged for review) | Chemical soil surveys (pH, C, N, P, CEC, exchangeable bases). |
| `soil_block_membership.csv` | 9 | 2017, 2020 | `[Soil_Event_ID, Block_ID]` | 100% | Sparse: exactly 7 blocks sampled in Division_A | Only B004, B006, B008, B015, B026, B031, B041 have soil data. Remaining 35 report 'unavailable'. |
| `NASA_POWER_Monthly_Weather_Clean.csv` | 156 | 2012–2024 | `[Year, Month]` | 100% | 0 missing, 0 duplicates | Estate-level station averages. Repeated identically across all blocks; zero spatial discrimination. Excluded from block risk. |
| `Palm_AI_Master_FFB_Leaf_Soil_Weather.csv` | 6,552 | 2012–2024 | `[Year, Month, Block_ID]` | 100% | Denormalized master | Standardized integration master dataset backing dashboard analytics. |

---

## 2. Drone RGB YOLO Model & Class Audit

- **Model Checkpoint**: `drone/models/palm_yolo_best.pt` (YOLO11n, Ultralytics, 50 epochs, mAP50=0.9799).
- **Trained Classes**:
  * `Class 0`: **Dead** (mortality, stumps, canopy loss)
  * `Class 1`: **Healthy** (dense photosynthetic green palm crowns)
  * `Class 2`: **Grass** (understory weed / grass patches)
  * `Class 3`: **Small** (stunted or young replanted palm crowns)
  * `Class 4`: **Yellow** (chlorotic, yellowing, or nutrient-stressed crowns)
- **Extracted Features (500 validation images)**:
  * Mean Drone Health Score: 75.81%
  * Mean Palm Detection Confidence: 0.7766 (Threshold: 0.25)
  * Total Palm Detections: 32,846
  * Class proportions: Healthy 78.28%, Small 20.28%, Yellow 1.25%, Grass 0.41%, Dead 0.19%
- **Block Mapping Audit**:
  * Verification: Filenames represent pixel coordinates from Site 2 orthomosaic canvas (e.g. `44000_16000_1013_87.jpg`).
  * GPS / Georeferencing: **None** (no EXIF tags, no WGS84 coordinates).
  * Block Boundaries: **None** (no shapefile or GeoJSON defining B001–B042 perimeters).
  * **Verdict**: Block-level mapping is **UNAVAILABLE**. Detections remain strictly at the image-tile level without pretending they belong to an operational block.

---

## 3. Multispectral UAV Imagery Audit & Provenance Verification

- **Dataset Files**: 34 GeoTIFF rasters in `drone/multispectral/data/` (`ALTUM_CAL_altum_beechforest_Hullerbusch_...tif`).
- **Sensor**: MicaSense Altum (5 spectral bands):
  * Band 1: Blue (475 nm)
  * Band 2: Green (560 nm)
  * Band 3: Red (668 nm) — chlorophyll absorption
  * Band 4: RedEdge (717 nm) — transition edge
  * Band 5: NIR (842 nm) — cellular reflection
- **Provenance Check**:
  * Source: MSUAV500K Benchmark Dataset (Zenodo DOI: 10.5281/zenodo.16743974).
  * Location: Hullerbusch, Mecklenburg-Vorpommern, Germany.
  * Ecosystem: **Temperate Beech Forest (*Fagus sylvatica*)**.
  * **Critical Integrity Rule**: This imagery is European beech forest, **NOT oil palm**. It is retained purely as a technical demonstration of 5-band NDVI/NDRE calculation capability.
- **Calculated Metrics (34 tiles)**:
  * Pure-Canopy NDVI Mean: 0.8859 (using NDVI >= 0.3 threshold)
  * Pure-Canopy NDRE Mean: 0.5069
  * Pure-Canopy Cover: 93.62%
- **Operational Integration Status**: Marked **DEMO ONLY / BENCHMARK / UNMATCHED**. Excluded completely from block-level risk scoring.

---

## 4. Screening Risk Methodology Compliance

The project screening risk methodology is preserved verbatim:
- **Yield Gap Component (40%)**: Compares latest annual yield against peer cohort median (palms within +/- 2 years of age). Stepwise scores: <5% = 20, 5–<10% = 40, 10–<20% = 60, 20–<30% = 75, >=30% = 90.
- **Foliar Nutrient Component (25%)**: Ratio of deficient nutrients (below Q25) to measured nutrients. Requires at least 3 of 6 nutrients measured.
- **DRIS Imbalance Component (15%)**: Limiting nutrient count ratio (`min(5, Limiting_Count) / 5 * 100`) based on pairwise DRIS norms.
- **Weight Renormalization**: Available weights are dynamically renormalized per block to ensure the composite score is bounded in [0, 100].
- **Risk Bands**: Low (<40), Medium (40–<70), High (>=70).
- **Weather Policy**: Station averages repeated identically; offers zero block spatial discrimination; strictly excluded from block score.
- **Soil Policy**: Observed values reported where sampled (7 blocks); reported as unavailable for remaining 35 blocks.

---

## 5. Next Steps for Complete Ground Integration

To achieve true row-level fusion of drone RGB and multispectral UAV imagery with operational blocks B001–B042, the estate must acquire:
1. **GIS Block Boundary Polygons**: ESRI Shapefile or GeoJSON in EPSG:4326 / UTM defining exact perimeters of blocks B001–B042.
2. **Targeted Orthomosaics**: Georeferenced drone orthomosaics flown directly over the target plantation blocks with embedded GeoTIFF coordinates.
3. **Synchronized Flight Dates**: UAV flight campaigns scheduled within 30 days of monthly harvest and foliar tissue collection.
4. **Zonal Polygon Aggregation**: Standard zonal extraction (e.g. `rasterstats` / polygon intersection) computing mean NDVI, NDRE, and YOLO crown counts per operational block boundary.

