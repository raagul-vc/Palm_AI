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
  - `scripts/validate_drone_health.py`: Comprehensive threshold validation and sensitivity analysis.
  - `scripts/check_drone_block_mapping.py`: Block_ID mapping audit script.
  - `scripts/audit_multi_source_integration.py`: Multi-source integration and risk readiness audit script.
  - `scripts/verify_integration_artifacts.py`: Data quality check script for integration artifacts.

---

## Drone Health Score Validation

A comprehensive validation and sensitivity analysis was conducted on the frozen YOLO11n checkpoint (`models/palm_yolo_best.pt`) across all **500 validation images** (32,846 ground-truth annotations). The analysis audited feature consistency, quantified cross-threshold stability, analyzed detection confidence profiles, and identified statistical quality and density outliers using transparent statistical rules.

> **Important Operational Disclaimer:**  
> **"Drone Health Score is a model-derived image-level indicator and is not a validated disease diagnosis."**  
> RGB imagery captures phenotypic crown morphology and foliar coloration (such as chlorosis or crown stunting); it does not perform clinical pathology or detect pre-visual infection (e.g., basal stem rot caused by *Ganoderma boninense*) without multispectral/hyperspectral infrared channels.

### 1. Health Score Formula & Audit Verification

$$\text{Drone Health Score} = \text{Healthy Palm \%} = \frac{\text{Healthy Palm Detections}}{\text{Total Palm Detections}} \times 100$$

- **Palm Classes Included:** Healthy (Class 1), Dead (Class 0), Small (Class 3), Yellow (Class 4).
- **Excluded Ground Cover:** Grass (Class 2) is strictly excluded from palm denominators and health scores.
- **Division Safety Rule:** If an image contains 0 palm detections, all percentages and health scores are recorded as `0.0`.
- **Data Quality Audit Results:**
  - 500 validation images inspected in `drone_image_health_features.csv`.
  - Zero NaN or Infinite values across all health and percentage columns.
  - 100% mathematical consistency: $\text{Healthy \%} + \text{Non-Healthy Palm \%} = 100.00\%$ and $\text{Total Detections} = \text{Palms} + \text{Grass}$.
  - Zero-palm detection images: **0** (all 500 validation images possess at least one detected palm).
  - Score bounds: All scores fall strictly within $[0.00\%, 99.09\%]$.

### 2. Confidence Threshold Robustness Experiment

Inference was evaluated across five confidence thresholds ($\tau \in \{0.25, 0.40, 0.50, 0.60, 0.75\}$) using sequential batch size 1:

| Conf Threshold | Total Detections | Palm Detections | Healthy % | Dead % | Small % | Yellow % | Grass % | Mean Health Score | Median Health Score | Zero-Palm Images |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **0.25 (Base)** | 43,779 | 43,599 | 78.28% | 0.19% | 20.28% | 1.25% | 0.41% | **75.81%** | **89.19%** | **0** |
| **0.40** | 41,891 | 41,731 | 77.93% | 0.19% | 20.63% | 1.25% | 0.38% | **75.54%** | **89.27%** | **0** |
| **0.50** | 40,586 | 40,436 | 77.54% | 0.20% | 20.99% | 1.28% | 0.37% | **75.26%** | **88.89%** | **0** |
| **0.60** | 39,217 | 39,077 | 77.16% | 0.20% | 21.36% | 1.29% | 0.36% | **75.01%** | **88.83%** | **0** |
| **0.75** | 37,240 | 37,115 | 76.77% | 0.20% | 21.73% | 1.30% | 0.34% | **74.69%** | **88.59%** | **0** |

*Output artifact:* [outputs/drone_health_threshold_validation.csv](outputs/drone_health_threshold_validation.csv)

### 3. Score Stability & Categorical Robustness

Comparing image-level health scores from each elevated threshold against the operational baseline ($\tau = 0.25$):

| Threshold Comparison | Mean Abs Difference | Median Abs Difference | Pearson Correlation ($r$) | Spearman Rank ($\rho$) | Category Shift Count | Category Shift % | High / Mod / Low Distribution |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **conf=0.25 (Base)** | 0.00% | 0.00% | 1.0000 | 1.0000 | 0 / 500 | 0.0% | 328 / 73 / 99 |
| **conf=0.40 vs 0.25** | 0.58% | 0.24% | 0.9994 | 0.9979 | 6 / 500 | **1.2%** | 327 / 71 / 102 |
| **conf=0.50 vs 0.25** | 0.91% | 0.49% | 0.9986 | 0.9968 | 10 / 500 | **2.0%** | 324 / 73 / 103 |
| **conf=0.60 vs 0.25** | 1.25% | 0.65% | 0.9977 | 0.9950 | 18 / 500 | **3.6%** | 322 / 71 / 107 |
| **conf=0.75 vs 0.25** | 1.69% | 0.89% | 0.9958 | 0.9903 | 22 / 500 | **4.4%** | 320 / 73 / 107 |

*Project Analysis Categories:*
- **HIGH:** Health Score $\ge 80\%$
- **MODERATE:** $60\% \le \text{Health Score} < 80\%$
- **LOW:** $\text{Health Score} < 60\%$
*(These categories are operational project indicators, NOT agronomically or clinically validated disease classifications).*

*Key Finding:* Across all 500 images, 98.8% of tiles maintain identical categories between conf=0.25 and conf=0.40. Even at conf=0.75, Pearson correlation remains exceptionally high at $r = 0.9958$.

*Output artifact:* [outputs/drone_health_score_robustness.csv](outputs/drone_health_score_robustness.csv)

### 4. Image Quality & Detection Coverage Outliers

Outliers were identified using transparent statistical rules (Tukey's fences: $Q_1 - 1.5 \times \text{IQR}$, $Q_3 + 1.5 \times \text{IQR}$ and tail quantiles) on the 500 validation images:

- **Zero-Detection Images:** **0** images with 0 palm detections.
- **Low-Detection Images (< 50 palms):** **17** images (3.4%). These represent plantation boundary tiles, road cuts, or edge blocks with partial canopy coverage (e.g. `44000_16000_3345_454.jpg` with only 3 palms).
- **Detection-Density Outliers ($\ge 107$ palms):** **15** images (3.0%). Represent dense, mature stands with crown overlap (> 97.5th percentile).
- **Statistical Low Health Outliers (Score < 28.34%):** **59** images (11.8%). Driven primarily by juvenile or replanted blocks where crowns are classified as Small, not Healthy. Exactly 22 images exhibit 0% health score because all detected palms are Small/immature crowns.
- **Statistical High Non-Healthy Outliers (> 71.66%):** **59** images (11.8%).

*Outlier Integrity Policy:* **These images are strictly characterized as low-detection images, detection-density outliers, or statistical health outliers. They are NOT diagnosed tree disease.**

*Output artifact:* [outputs/drone_health_outlier_images.csv](outputs/drone_health_outlier_images.csv)

### 5. Detection Confidence Statistics

Confidence distributions across all detections at baseline threshold $\tau = 0.25$:

| Class Name | Detection Count | Mean Conf | Median Conf | P10 | P25 | P75 | P90 | Min Conf | Max Conf | Std Dev |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Healthy** | 34,130 | 0.8578 | **0.9344** | 0.5539 | 0.9040 | 0.9427 | 0.9490 | 0.2501 | 0.9888 | 0.1718 |
| **Dead** | 83 | 0.8810 | **0.9321** | 0.7532 | 0.8764 | 0.9574 | 0.9710 | 0.2993 | 0.9899 | 0.1429 |
| **Small** | 8,841 | 0.8735 | **0.9152** | 0.7845 | 0.8825 | 0.9308 | 0.9404 | 0.2505 | 0.9689 | 0.1249 |
| **Yellow** | 545 | 0.8891 | **0.9449** | 0.7021 | 0.9181 | 0.9561 | 0.9666 | 0.2605 | 0.9904 | 0.1515 |
| **Grass** | 180 | 0.7931 | **0.9124** | 0.3892 | 0.6488 | 0.9600 | 0.9781 | 0.2540 | 0.9999 | 0.2265 |

*Key Finding:* Detection confidence is uniformly high across all classes, with medians exceeding 0.91 for all five classes. Dead palms exhibit high median confidence (0.9321) and P10 (0.7532).

*Output artifact:* [outputs/drone_detection_confidence_summary.csv](outputs/drone_detection_confidence_summary.csv)

### 6. Recommended Operational Confidence Threshold

**Retained Recommendation: $\tau = 0.25$ (Operational Baseline)**

- **Empirical Evidence:** The threshold sensitivity experiment confirms that the Drone Health Score is remarkably stable across thresholds. Elevating threshold from 0.25 to 0.40 results in a negligible mean score difference of only 0.58 percentage points, an almost perfect Pearson correlation ($r = 0.9994$), and 98.8% categorical consistency.
- **Sensitivity Preservation:** Setting threshold higher (e.g. 0.50 or 0.60) discards valid small palms and chlorotic yellow crowns without improving diagnostic reliability.
- **Conclusion:** Confidence 0.25 is retained as the operational standard.

### 7. Limitations & Why Block_ID Integration is Unavailable

1. **RGB Phenotypic Limitation:** RGB imagery provides structural morphology and visible discoloration, but lacks near-infrared (NIR) and red-edge spectral bands. Physiological stress (such as *Ganoderma* basal stem rot) cannot be diagnosed from RGB alone.
2. **Replant Sensitivity:** Replanted blocks (such as the `52000_20000` tile series) register a 0% Drone Health Score under the current formula because immature palms are classified as Small, despite being alive and healthy.
3. **Block_ID Spatial Mapping Unavailable:** The MOPAD Site 2 benchmark tiles use image canvas pixel coordinates (`x_y_...`) rather than real-world georeferenced orthomosaics with CRS and plantation management Block_IDs (`B001`–`B044`). In strict compliance with data integrity policies, **no synthetic Block_IDs or artificial GPS coordinates were fabricated**. Drone health remains an independent, image-level evidence stream.

### 8. Validation Artifacts & Visualizations

- **Threshold Validation Table**: [outputs/drone_health_threshold_validation.csv](outputs/drone_health_threshold_validation.csv)
- **Score Robustness Table**: [outputs/drone_health_score_robustness.csv](outputs/drone_health_score_robustness.csv)
- **Quality & Density Outlier Table**: [outputs/drone_health_outlier_images.csv](outputs/drone_health_outlier_images.csv)
- **Detection Confidence Summary**: [outputs/drone_detection_confidence_summary.csv](outputs/drone_detection_confidence_summary.csv)
- **Full Validation Report (JSON)**: [outputs/drone_health_validation_report.json](outputs/drone_health_validation_report.json)
- **Full Validation Report (TXT)**: [outputs/drone_health_validation_report.txt](outputs/drone_health_validation_report.txt)
- **Validation Visualizations** (`outputs/drone_health_validation/`):
  1. `1_health_score_by_confidence_threshold.png`: Boxplots and mean/median score trajectory across thresholds.
  2. `2_health_score_correlation_across_thresholds.png`: Scatter plots and linear regressions vs operational baseline.
  3. `3_healthy_pct_by_confidence_threshold.png`: Aggregate vs image-level Healthy % across thresholds.
  4. `4_non_healthy_pct_by_confidence_threshold.png`: Breakdown of Small, Yellow, and Dead palms across thresholds.
  5. `5_distribution_of_health_score_changes.png`: Histograms of score shifts ($\Delta = \text{Score}_{\tau} - \text{Score}_{0.25}$).
  6. `6_detection_count_vs_health_score.png`: Scatter plot identifying density and health outlier clusters.

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
