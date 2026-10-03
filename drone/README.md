# Drone RGB UAV dataset

This isolated module prepares and verifies the MOPAD Site 2 RGB UAV COCO dataset. It does not change Palm AI production code or the original source annotations and images. Model training has **not** started.

## Source locations

- Training annotations: `C:\Users\iRaagul\Downloads\instances_train2017.json`
- Validation annotations: `C:\Users\iRaagul\Downloads\instances_val2017.json`
- Training images: `C:\Users\iRaagul\OneDrive\Documents\Airei\Plantation\train2017`
- Validation images: `C:\Users\iRaagul\OneDrive\Documents\Airei\Plantation\val2017`

Categories are read from the COCO JSON: Dead, Healthy, Grass, Small, Yellow. Images are RGB, 1024×1024, with COCO bounding boxes. This dataset is not multispectral; NDVI is not applicable.

## Dataset Preparation Status

The source train annotation references **3,999 images** and **262,811 annotations**. The local Site 2 train image folder contains **1,803** corresponding image files. The clean train split therefore includes only those 1,803 physically available images and their **118,740** annotations. The source JSON and images remain unchanged. This is a locally available subset, not a claim that the source data is corrupt.

The validation annotation references **500 images** and **32,846 annotations**; all 500 validation image files are present and included in the clean dataset.

Clean train classes (annotation counts): Dead 234, Healthy 89,958, Grass 431, Small 26,644, Yellow 1,473. Clean validation classes: Dead 61, Healthy 24,884, Grass 95, Small 7,395, Yellow 411. All clean images are 1024×1024. Both splits passed checks for image existence and readability, dimensions, COCO references, bounding boxes, category IDs, duplicate IDs, duplicate filenames, and annotations per image. Each image has at least one annotation. Final clean dataset status: **PASS**. Model training is **COMPLETED**; see the results below.

## Clean dataset layout

```text
drone/dataset_clean/
  train2017/                         # 1,803 copied source images
  val2017/                           # 500 copied source images
  annotations/
    instances_train2017_clean.json
    instances_val2017_clean.json
```

The preparation script refuses to overwrite an existing `dataset_clean` directory. It copies the images without changing them, filters image records to physically present files, and retains the original annotation records for those image IDs.

## Verification and visualizations

Run from the project root in PowerShell:

```powershell
.\venv\Scripts\python.exe drone/scripts/prepare_clean_coco_dataset.py
.\venv\Scripts\python.exe drone/scripts/verify_clean_coco_dataset.py
.\venv\Scripts\python.exe drone/scripts/visualize_clean_annotations.py --per-split 3 --seed 20260930
```

The verifier writes [clean_dataset_summary.json](outputs/clean_dataset_summary.json) and [clean_dataset_summary.txt](outputs/clean_dataset_summary.txt). The seeded visualizer writes three annotated images per split, with boxes, class labels, and source filename, under `outputs/visualizations/`; `visualization_manifest.json` records the chosen images and annotation counts. The current run generated:

- Train: `train2017_52000_20000_1009_1058_annotated.jpg`, `train2017_44000_4000_1443_3933_annotated.jpg`, `train2017_44000_16000_2392_630_annotated.jpg`
- Validation: `val2017_44000_4000_806_90_annotated.jpg`, `val2017_44000_4000_968_2614_annotated.jpg`, `val2017_44000_4000_2304_815_annotated.jpg`

Pillow must be installed in the project virtual environment to run verification and visualization. No YOLO, PyTorch, TensorFlow, or other training framework is used or installed for this preparation stage.

## YOLO dataset preparation

The verified clean COCO data is converted to the isolated `dataset_yolo/` layout:

```text
drone/dataset_yolo/
  images/train/   # 1,803 JPEGs
  images/val/     # 500 JPEGs
  labels/train/   # one YOLO .txt per train image
  labels/val/     # one YOLO .txt per validation image
  data.yaml
```

YOLO class mapping is fixed as `0: Dead`, `1: Healthy`, `2: Grass`, `3: Small`, `4: Yellow`. COCO category IDs are mapped by their JSON category names. Each COCO `[x, y, width, height]` box is converted to normalized YOLO `class_id x_center y_center width height`; the source COCO JSON and `dataset_clean/` are read-only inputs.

Run from the Palm_AI project root:

```powershell
.\venv\Scripts\python.exe drone/scripts/convert_coco_to_yolo.py
.\venv\Scripts\python.exe drone/scripts/verify_yolo_dataset.py
```

The converter is safe to rerun: identical existing image copies and labels are reused; conflicting image copies, labels, or a differing `data.yaml` are not overwritten. Generated labels are deterministic. The verifier writes [yolo_dataset_summary.json](outputs/yolo_dataset_summary.json) and [yolo_dataset_summary.txt](outputs/yolo_dataset_summary.txt).

Current YOLO verification: **PASS**. Train has 1,803 images, 1,803 label files, and 118,740 objects. Validation has 500 images, 500 label files, and 32,846 objects. Both splits have zero invalid labels, missing labels, and orphan labels; all images are readable 1024×1024 RGB JPEGs. Model training is **COMPLETED**; see the results below.

## YOLO11n training and validation results

This is **RGB UAV object detection**. The current classes are **Dead, Healthy, Grass, Small, and Yellow**. Multispectral analysis has **NOT** been implemented yet. Model training is **COMPLETED** after a successful 50-epoch run.

Configuration: YOLO11n pretrained, image size 1024, 50 epochs, patience 15, seed 42, batch size 2, device NVIDIA GeForce RTX 3050 Laptop GPU.

Validation was run on all 500 images (32,846 objects):

- Precision: 0.959810
- Recall: 0.989883
- mAP50: 0.979909
- mAP50-95: 0.888404

Per-class validation metrics (precision / recall / mAP50 / mAP50-95):

- Dead: 0.992757 / 1.000000 / 0.995000 / 0.886230
- Healthy: 0.995885 / 0.991985 / 0.994851 / 0.949234
- Grass: 0.831866 / 0.989474 / 0.921145 / 0.757454
- Small: 0.994748 / 0.982556 / 0.994083 / 0.919445
- Yellow: 0.983798 / 0.985401 / 0.994466 / 0.929657

Best model: `models/palm_yolo_best.pt`  
Training run and checkpoints: `outputs/yolo_training/yolo11n_site2_50e_seed42/`  
Evaluation plots: `outputs/yolo_evaluation/best_1024_val/`  
Annotated validation predictions: `outputs/yolo_predictions/val_samples/`  
Summary: `outputs/yolo_training_summary.json` and `outputs/yolo_training_summary.txt`

## Model Error Analysis

A memory-safe validation error analysis was completed across all **500 validation images** (32,846 ground-truth objects) using the frozen best checkpoint `models/palm_yolo_best.pt`. Images were evaluated sequentially with batch size 1 on **NVIDIA GeForce RTX 3050 Laptop GPU** at IoU threshold **0.50** and operating confidence threshold **0.25**.

### Key Measured Error Statistics

- **Validation images analyzed**: 500
- **Ground-truth objects**: 32846
- **Predictions at conf >= 0.25**: 43778
- **True Positives (TP)**: 32830
- **False Positives (FP)**: 10948 (Unmatched background FP: 10936, Class confusion FP: 12)
- **False Negatives (FN)**: 16 (Unmatched background FN: 4, Class confusion FN: 12)
- **Low-confidence detections (< 0.25)**: 36301

### Class-Wise Findings

| Class | Ground Truth | TP | FP | FN | Precision (>=0.25) | Recall (>=0.25) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Dead** | 61 | 61 | 22 | 0 | 0.7349 | 1.0000 |
| **Healthy** | 24884 | 24878 | 9252 | 6 | 0.7289 | 0.9998 |
| **Grass** | 95 | 94 | 86 | 1 | 0.5222 | 0.9895 |
| **Small** | 7395 | 7387 | 1453 | 8 | 0.8356 | 0.9989 |
| **Yellow** | 411 | 410 | 135 | 1 | 0.7523 | 0.9976 |

### Class Confusions

- **Main class confusion**: Healthy predicted as Grass (4 occurrences)
- **Other notable confusions**: Small -> Grass (3), Grass -> Healthy (1), Yellow -> Small (1)
- **Dead class reliability**: Dead trees showed high precision (0.7349) and recall (1.0000) across all 61 ground-truth instances.

### Error Analysis Artifacts

- **Detailed JSON report**: `outputs/yolo_error_analysis.json`
- **Detailed TXT report**: `outputs/yolo_error_analysis.txt`
- **Representative visual examples**:
  - False positives: `outputs/yolo_error_analysis/false_positives/`
  - False negatives: `outputs/yolo_error_analysis/false_negatives/`
  - Class confusions: `outputs/yolo_error_analysis/class_confusions/`
  - Low confidence: `outputs/yolo_error_analysis/low_confidence/`

*The model was NOT retrained, and the best checkpoint `palm_yolo_best.pt` remains unchanged.*

## Drone Health Feature Extraction

This module converts trained Drone YOLO11n object detections into structured **image-level Drone Health Features**.

> **Important scientific disclaimer:**  
> **This is RGB UAV object detection. It is not multispectral analysis.**  
> RGB imagery captures standard visible wavelengths (red, green, blue) and does not include near-infrared (NIR) or red-edge bands required for multispectral vegetation indices (such as NDVI, NDRE, or EVI). The health features described here reflect visible phenotypic conditions (canopy discoloration, crown stunting, and tree mortality) as identified by the trained object detection model.

### Extraction Protocol & Configuration

- **Model checkpoint**: `models/palm_yolo_best.pt` (frozen best checkpoint, unchanged)
- **Validation dataset**: `dataset_yolo/` (all 500 validation images, 1024×1024)
- **Inference device**: CPU / GPU sequential batch size = 1 (memory-safe execution)
- **Confidence threshold**: `0.25`
- **NMS IoU threshold**: `0.70`
- **Maximum detections per image**: `300`

### Palm Health Classes & Categorization

Detections are categorized into two structural domains:
1. **Palm health categories**:
   - **Healthy** (Class 1): Normal green foliage, full crown morphology.
   - **Small** (Class 3): Stunted, immature, or re-planted palm crown.
   - **Yellow** (Class 4): Chlorotic canopy indicating nutrient deficiency, disease, or stress.
   - **Dead** (Class 0): Standing trunk with completely desiccated or missing fronds.
2. **Non-palm ground cover**:
   - **Grass / Weed** (Class 2): Ground cover vegetation. **Grass is NOT a palm health category** and is strictly excluded from palm health denominator calculations.

### Feature Formulations

For each validation image:
- **Total Detections**: $\text{Total} = \text{Healthy} + \text{Dead} + \text{Small} + \text{Yellow} + \text{Grass}$
- **Palm Detections**: $\text{Palms} = \text{Healthy} + \text{Dead} + \text{Small} + \text{Yellow}$
- **Healthy %**: $\frac{\text{Healthy}}{\text{Palms}} \times 100$
- **Dead %**: $\frac{\text{Dead}}{\text{Palms}} \times 100$
- **Small %**: $\frac{\text{Small}}{\text{Palms}} \times 100$
- **Yellow %**: $\frac{\text{Yellow}}{\text{Palms}} \times 100$
- **Stress %**: $\text{Small \%} + \text{Yellow \%}$
- **Non-Healthy Palm %**: $\frac{\text{Dead} + \text{Small} + \text{Yellow}}{\text{Palms}} \times 100 = 100\% - \text{Healthy \%}$

*Division safety convention:* If an image contains $\text{Palms} = 0$, all percentages and health scores are recorded as `0.0`.

### Drone Health Score Definition

$$\text{Drone Health Score} = \text{Healthy \%} = \frac{\text{Healthy}}{\text{Palm Detections}} \times 100$$

The **Drone Health Score** is a transparent, bounded $[0, 100]$ indicator representing the percentage of detected palms in an image classified as Healthy.  
*Disclaimer:* This is a **model-derived image-level indicator**, not a scientifically validated agricultural index or yield forecast.

### Validation Dataset Summary (500 Images)

- **Total Detections**: 43,779
- **Total Palm Detections**: 43,599
- **Class Counts**:
  - Healthy: 34,130 (78.28% of palms)
  - Small: 8,841 (20.28% of palms)
  - Yellow: 545 (1.25% of palms)
  - Dead: 83 (0.19% of palms)
  - Grass: 180 (excluded from palm population)
- **Aggregate Palm Health Profile**:
  - Healthy %: **78.28%**
  - Stress % (Small + Yellow): **21.53%**
  - Dead %: **0.19%**
  - Non-Healthy Palm %: **21.72%**
- **Average Drone Health Score**: **75.81%** (Median: **89.19%**)
- **Mean Detection Confidence**: **0.8612** (Overall median: 0.9315)

### Block_ID Mapping Audit Result

- **Block_ID mapping available:** **NO**
- **Audit findings:** An exhaustive check of image filenames (e.g. `44000_16000_...`), COCO JSON metadata, binary EXIF headers, and core agronomic tables showed that no geographic coordinate metadata, georeferenced orthomosaic boundaries, or cross-reference lookup keys link the MOPAD Site 2 image tiles to Palm_AI management Block_IDs (`B001`, `B002`, etc.).
- **Data integrity policy:** In compliance with project integrity rules, **no synthetic or fabricated Block_IDs were created**. All drone health features remain strictly at the image level.
- **Audit status document:** `outputs/drone_block_mapping_status.txt` details missing GIS shapefiles, affine geotransforms, and flight telemetry logs required for any future spatial block aggregation.

### Artifacts and Deliverables

- **Feature CSV (500 rows)**: [outputs/drone_image_health_features.csv](outputs/drone_image_health_features.csv)
- **Summary JSON**: [outputs/drone_health_summary.json](outputs/drone_health_summary.json)
- **Block Mapping Audit**: [outputs/drone_block_mapping_status.txt](outputs/drone_block_mapping_status.txt)
- **Visualizations** (`outputs/drone_health_visualizations/`):
  1. `class_distribution.png`: Total detection counts across all 5 classes.
  2. `healthy_vs_non_healthy.png`: Population proportion of healthy vs stressed/dead palms.
  3. `stress_and_mortality_distribution.png`: Detailed breakdown of Small, Yellow, and Dead palms.
  4. `detection_confidence_distribution.png`: Boxplots of detection confidence across classes.
  5. `drone_health_score_distribution.png`: Distribution of Drone Health Scores across all 500 images.
- **Reproducible Scripts**:
  - `scripts/extract_drone_health_features.py`: Batch-1 sequential feature extraction.
  - `scripts/check_drone_block_mapping.py`: Block_ID mapping audit script.
  - `scripts/audit_multi_source_integration.py`: Multi-source integration and risk readiness audit script.
  - `scripts/verify_integration_artifacts.py`: Data quality check script for integration artifacts.

---

## Multi-Source Integration & Risk Readiness Audit

A formal integration audit was performed across all three data streams of `Palm_AI`:
1. **Palm Plantation agronomic evidence** (`data/Palm_AI_Master_FFB_Leaf_Soil_Weather.csv`, 6,552 records)
2. **RGB Drone evidence** (`drone/outputs/drone_image_health_features.csv`, 500 images)
3. **Multispectral spectral evidence** (`drone/multispectral/outputs/multispectral_tile_health_features.csv`, 34 tiles)

### Integration Audit Findings:

- **Common Identifier Audit:**
  - **Block_ID:** Exists only in Palm Plantation records (`B001`–`B044`). Absent in RGB Drone (canvas offsets) and Multispectral (chip offsets).
  - **Temporal Alignment:** Monthly series (2012–2024) exists only in Palm records. UAV datasets are static single-flight benchmarks.
  - **Spatial Overlap:** Disjoint geographies. Palm Plantation is an operational Southeast Asian estate; RGB Drone is from MOPAD Site 2 (Malaysia); Multispectral is from the MSUAV500K benchmark (Hullerbusch, Germany).
- **Direct Row-Level Fusion Verdict:** **NOT SCIENTIFICALLY FEASIBLE (BLOCKED)**.
  - In compliance with strict scientific integrity rules, **no synthetic Block_IDs, artificial GPS coordinates, or forced row merges were fabricated**.
  - Direct concatenation of unrelated rows is prohibited.

### Architecture for Multi-Source Risk Analysis:

The three sources operate as **decoupled, multi-layered evidence streams**:
1. **Palm Plantation agronomic evidence (Block Level):** Core predictive foundation providing baseline yield targets, DRIS nutritional indices, foliar deficiencies, and historical soil health.
2. **RGB Drone evidence (Image Level):** Structural canopy health evidence providing visual mortality rates (`dead_percentage`), foliar chlorosis (`yellow_percentage`), and stunting.
3. **Multispectral spectral evidence (Tile Level):** Physiological canopy vigour evidence providing pure-canopy photosynthetic capacity (`canopy_ndvi_mean`), deep-foliage chlorophyll / nitrogen sensitivity (`canopy_ndre_mean`), and spatial stand uniformity (`canopy_uniformity_score`).

### Integration Deliverables

- **Feature Catalog (31 features)**: [outputs/multi_source_feature_catalog.csv](outputs/multi_source_feature_catalog.csv)
- **Integration Status JSON**: [outputs/multi_source_integration_status.json](outputs/multi_source_integration_status.json)
- **Integration Status TXT**: [outputs/multi_source_integration_status.txt](outputs/multi_source_integration_status.txt)
- **Risk Readiness Assessment**: [outputs/multi_source_risk_readiness.json](outputs/multi_source_risk_readiness.json)
- **Integration Visualizations** (`outputs/multi_source_integration_visualizations/`):
  1. `source_feature_coverage_comparison.png`: Comparison of observation volume and feature dimensionality.
  2. `rgb_feature_distributions.png`: Detection and health score profiles across the 500 RGB images.
  3. `multispectral_feature_distributions.png`: Spectral index distributions across 34 multispectral tiles.
  4. `multi_source_readiness_matrix.png`: Multi-source readiness and integration prerequisite matrix.

### Prerequisites to Unlock Future Row-Level / Block-Level Spatial Fusion:
1. Plantation GIS block boundary shapefile / GeoJSON.
2. Georeferenced UAV orthomosaics with embedded CRS and affine geotransforms covering the target estate blocks.
3. Synchronized flight telemetry logs with acquisition timestamps.
