#!/usr/bin/env python3
"""
Extract image-level Drone Health Features from the trained YOLO11n checkpoint.
Processes all 500 validation images sequentially (batch size 1) in a memory-safe manner.
Generates:
  1. drone/outputs/drone_image_health_features.csv
  2. drone/outputs/drone_health_summary.json
  3. drone/outputs/drone_health_visualizations/
"""
import csv
import json
import time
from collections import defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # Non-interactive backend
import matplotlib.pyplot as plt
import numpy as np
import torch
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models" / "palm_yolo_best.pt"
VAL_DIR = ROOT / "dataset_yolo" / "images" / "val"
OUTPUT_DIR = ROOT / "outputs"
CSV_PATH = OUTPUT_DIR / "drone_image_health_features.csv"
JSON_PATH = OUTPUT_DIR / "drone_health_summary.json"
VIZ_DIR = OUTPUT_DIR / "drone_health_visualizations"

CONF_THRESHOLD = 0.25
CLASS_NAMES = {0: "Dead", 1: "Healthy", 2: "Grass", 3: "Small", 4: "Yellow"}
PALM_CLASSES = {0: "Dead", 1: "Healthy", 3: "Small", 4: "Yellow"}


def run_feature_extraction():
    VIZ_DIR.mkdir(parents=True, exist_ok=True)
    image_paths = sorted(VAL_DIR.glob("*.jpg"))
    if len(image_paths) != 500:
        raise RuntimeError(f"Expected 500 validation images, found {len(image_paths)}")

    use_gpu = torch.cuda.is_available()
    device = 0 if use_gpu else "cpu"
    device_name = torch.cuda.get_device_name(0) if use_gpu else "CPU"
    print(f"Loading checkpoint {MODEL_PATH.name} on {device_name} (batch=1, conf={CONF_THRESHOLD})...")
    model = YOLO(str(MODEL_PATH))

    records = []
    dataset_class_counts = defaultdict(int)
    dataset_class_confs = defaultdict(list)
    all_confs = []

    t0 = time.time()
    for idx, img_path in enumerate(image_paths):
        # Sequential inference: 1 image at a time
        results = model.predict(
            source=str(img_path),
            imgsz=1024,
            device=device,
            conf=CONF_THRESHOLD,
            iou=0.7,
            max_det=300,
            verbose=False
        )
        res = results[0]

        if res.boxes is None or len(res.boxes) == 0:
            pred_classes = np.empty((0,), dtype=int)
            pred_confs = np.empty((0,), dtype=float)
        else:
            pred_classes = res.boxes.cls.cpu().numpy().astype(int)
            pred_confs = res.boxes.conf.cpu().numpy().astype(float)

        del results, res
        if use_gpu and idx % 25 == 0:
            torch.cuda.empty_cache()

        # Counts
        healthy_c = int((pred_classes == 1).sum())
        dead_c = int((pred_classes == 0).sum())
        small_c = int((pred_classes == 3).sum())
        yellow_c = int((pred_classes == 4).sum())
        grass_c = int((pred_classes == 2).sum())

        total_detections = len(pred_confs)
        palm_detections = healthy_c + dead_c + small_c + yellow_c

        # Palm Health percentages
        # Convention: If palm_detections == 0, percentages are recorded as 0.0
        if palm_detections > 0:
            healthy_pct = round((healthy_c / palm_detections) * 100.0, 4)
            dead_pct = round((dead_c / palm_detections) * 100.0, 4)
            small_pct = round((small_c / palm_detections) * 100.0, 4)
            yellow_pct = round((yellow_c / palm_detections) * 100.0, 4)
            non_healthy_pct = round(((dead_c + small_c + yellow_c) / palm_detections) * 100.0, 4)
        else:
            healthy_pct = 0.0
            dead_pct = 0.0
            small_pct = 0.0
            yellow_pct = 0.0
            non_healthy_pct = 0.0

        # Drone Health Score = Healthy % (model-derived image-level indicator)
        drone_health_score = healthy_pct

        # Confidence statistics
        if total_detections > 0:
            mean_conf = round(float(pred_confs.mean()), 4)
            median_conf = round(float(np.median(pred_confs)), 4)
            min_conf = round(float(pred_confs.min()), 4)
            max_conf = round(float(pred_confs.max()), 4)
        else:
            mean_conf = ""
            median_conf = ""
            min_conf = ""
            max_conf = ""

        # Per-class mean confidence
        per_class_mean = {}
        for cls_id, cls_name in CLASS_NAMES.items():
            mask = pred_classes == cls_id
            if mask.sum() > 0:
                c_mean = round(float(pred_confs[mask].mean()), 4)
                per_class_mean[cls_name] = c_mean
                dataset_class_confs[cls_name].extend(pred_confs[mask].tolist())
            else:
                per_class_mean[cls_name] = ""

        # Global aggregations
        dataset_class_counts["Healthy"] += healthy_c
        dataset_class_counts["Dead"] += dead_c
        dataset_class_counts["Small"] += small_c
        dataset_class_counts["Yellow"] += yellow_c
        dataset_class_counts["Grass"] += grass_c
        all_confs.extend(pred_confs.tolist())

        # Store record
        records.append({
            "image_filename": img_path.name,
            "image_id": img_path.stem,
            "total_detections": total_detections,
            "palm_detections": palm_detections,
            "healthy_count": healthy_c,
            "dead_count": dead_c,
            "small_count": small_c,
            "yellow_count": yellow_c,
            "grass_count": grass_c,
            "healthy_percentage": healthy_pct,
            "dead_percentage": dead_pct,
            "small_percentage": small_pct,
            "yellow_percentage": yellow_pct,
            "non_healthy_palm_percentage": non_healthy_pct,
            "mean_confidence": mean_conf,
            "median_confidence": median_conf,
            "min_confidence": min_conf,
            "max_confidence": max_conf,
            "healthy_mean_confidence": per_class_mean["Healthy"],
            "dead_mean_confidence": per_class_mean["Dead"],
            "small_mean_confidence": per_class_mean["Small"],
            "yellow_mean_confidence": per_class_mean["Yellow"],
            "grass_mean_confidence": per_class_mean["Grass"],
            "drone_health_score": drone_health_score
        })

        if (idx + 1) % 100 == 0:
            print(f"Extracted health features for {idx + 1}/500 images ({time.time() - t0:.1f}s)...")

    print(f"Feature extraction complete on 500 images in {time.time() - t0:.2f}s.")

    # 1. Write CSV
    fieldnames = [
        "image_filename", "image_id", "total_detections", "palm_detections",
        "healthy_count", "dead_count", "small_count", "yellow_count", "grass_count",
        "healthy_percentage", "dead_percentage", "small_percentage", "yellow_percentage",
        "non_healthy_palm_percentage", "mean_confidence", "median_confidence",
        "min_confidence", "max_confidence", "healthy_mean_confidence",
        "dead_mean_confidence", "small_mean_confidence", "yellow_mean_confidence",
        "grass_mean_confidence", "drone_health_score"
    ]
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)
    print(f"Saved CSV with {len(records)} rows to {CSV_PATH}")

    # 2. Dataset Summary Calculations
    total_detections = sum(r["total_detections"] for r in records)
    total_palms = sum(r["palm_detections"] for r in records)
    total_healthy = dataset_class_counts["Healthy"]
    total_dead = dataset_class_counts["Dead"]
    total_small = dataset_class_counts["Small"]
    total_yellow = dataset_class_counts["Yellow"]
    total_grass = dataset_class_counts["Grass"]

    overall_healthy_pct = round((total_healthy / total_palms) * 100.0, 4) if total_palms > 0 else 0.0
    overall_dead_pct = round((total_dead / total_palms) * 100.0, 4) if total_palms > 0 else 0.0
    overall_small_pct = round((total_small / total_palms) * 100.0, 4) if total_palms > 0 else 0.0
    overall_yellow_pct = round((total_yellow / total_palms) * 100.0, 4) if total_palms > 0 else 0.0
    overall_non_healthy_pct = round(((total_dead + total_small + total_yellow) / total_palms) * 100.0, 4) if total_palms > 0 else 0.0
    overall_stress_pct = round((overall_small_pct + overall_yellow_pct), 4)

    avg_health_score = round(float(np.mean([r["drone_health_score"] for r in records])), 4)
    median_health_score = round(float(np.median([r["drone_health_score"] for r in records])), 4)

    confs_arr = np.asarray(all_confs, dtype=float)
    conf_stats = {
        "overall": {
            "count": int(len(confs_arr)),
            "mean": round(float(confs_arr.mean()), 4),
            "median": round(float(np.median(confs_arr)), 4),
            "min": round(float(confs_arr.min()), 4),
            "max": round(float(confs_arr.max()), 4),
            "std": round(float(confs_arr.std()), 4)
        },
        "per_class": {}
    }
    for c_name, c_vals in dataset_class_confs.items():
        arr = np.asarray(c_vals, dtype=float)
        conf_stats["per_class"][c_name] = {
            "count": int(len(arr)),
            "mean": round(float(arr.mean()), 4),
            "median": round(float(np.median(arr)), 4),
            "min": round(float(arr.min()), 4),
            "max": round(float(arr.max()), 4)
        }

    summary = {
        "task": "Drone RGB UAV Health Feature Extraction",
        "model_checkpoint": str(MODEL_PATH),
        "inference_device": device_name,
        "confidence_threshold": CONF_THRESHOLD,
        "number_of_images_processed": len(records),
        "total_detections": total_detections,
        "total_palm_detections": total_palms,
        "counts": {
            "healthy": total_healthy,
            "dead": total_dead,
            "small": total_small,
            "yellow": total_yellow,
            "grass": total_grass
        },
        "health_percentages": {
            "overall_healthy_percentage": overall_healthy_pct,
            "overall_dead_percentage": overall_dead_pct,
            "overall_small_percentage": overall_small_pct,
            "overall_yellow_percentage": overall_yellow_pct,
            "overall_stress_percentage": overall_stress_pct,
            "overall_non_healthy_palm_percentage": overall_non_healthy_pct
        },
        "drone_health_score": {
            "formula": "Healthy % = (Healthy / Palm detections) * 100",
            "average": avg_health_score,
            "median": median_health_score,
            "nature": "Model-derived image-level indicator (not a scientifically validated agricultural index)"
        },
        "confidence_statistics": conf_stats,
        "division_safety_convention": "If palm_detections == 0, health percentages and health score are set to 0.0",
        "block_id_mapping": {
            "available": False,
            "status_file": str(OUTPUT_DIR / "drone_block_mapping_status.txt")
        }
    }

    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"Saved dataset summary to {JSON_PATH}")

    # 3. Visualizations
    generate_visualizations(records, dataset_class_counts, dataset_class_confs, summary)
    return summary, records


def generate_visualizations(records, class_counts, class_confs, summary):
    palette = {
        "Healthy": "#27ae60",
        "Dead": "#2c3e50",
        "Grass": "#16a085",
        "Small": "#2980b9",
        "Yellow": "#f39c12"
    }

    # Chart 1: Class Distribution
    fig, ax = plt.subplots(figsize=(8, 5), dpi=300)
    classes = ["Healthy", "Small", "Yellow", "Grass", "Dead"]
    counts = [class_counts[c] for c in classes]
    colors = [palette[c] for c in classes]
    bars = ax.bar(classes, counts, color=colors, edgecolor="#1c2833", linewidth=1.2, width=0.55)
    ax.set_title("Drone UAV Detection Count by Class (conf >= 0.25)", fontsize=13, fontweight="bold", pad=12)
    ax.set_ylabel("Total Detections", fontsize=11, labelpad=8)
    ax.grid(axis="y", linestyle="--", alpha=0.4)
    for bar in bars:
        h = bar.get_height()
        ax.annotate(f"{h:,}", xy=(bar.get_x() + bar.get_width() / 2, h),
                    xytext=(0, 4), textcoords="offset points", ha="center", va="bottom",
                    fontsize=10, fontweight="semibold")
    ax.set_ylim(0, max(counts) * 1.12)
    plt.tight_layout()
    chart1_path = VIZ_DIR / "class_distribution.png"
    plt.savefig(chart1_path)
    plt.close()
    print(f"Saved {chart1_path.name}")

    # Chart 2: Healthy vs Non-Healthy Palm Percentage
    fig, ax = plt.subplots(figsize=(7, 6), dpi=300)
    total_palms = summary["total_palm_detections"]
    h_pct = summary["health_percentages"]["overall_healthy_percentage"]
    non_h_pct = summary["health_percentages"]["overall_non_healthy_palm_percentage"]
    labels = [f"Healthy Palms\n({h_pct:.2f}%)", f"Non-Healthy Palms\n({non_h_pct:.2f}%)"]
    sizes = [summary["counts"]["healthy"], summary["counts"]["dead"] + summary["counts"]["small"] + summary["counts"]["yellow"]]
    colors = ["#2ecc71", "#e74c3c"]
    wedges, texts, autotexts = ax.pie(
        sizes, labels=labels, autopct="%1.1f%%", startangle=140,
        colors=colors, explode=(0.04, 0.04),
        wedgeprops=dict(width=0.45, edgecolor="white", linewidth=2)
    )
    plt.setp(autotexts, size=11, weight="bold", color="white")
    plt.setp(texts, size=11, weight="medium")
    ax.set_title(f"Palm Population Health Composition\n(Total Palm Detections: {total_palms:,})",
                 fontsize=13, fontweight="bold", pad=14)
    plt.tight_layout()
    chart2_path = VIZ_DIR / "healthy_vs_non_healthy.png"
    plt.savefig(chart2_path)
    plt.close()
    print(f"Saved {chart2_path.name}")

    # Chart 3: Dead / Small / Yellow Distribution (Stress & Mortality Breakdown)
    fig, ax = plt.subplots(figsize=(8, 5), dpi=300)
    stress_classes = ["Small (Stunted / Young)", "Yellow (Chlorosis / Stress)", "Dead (Mortality)"]
    stress_counts = [summary["counts"]["small"], summary["counts"]["yellow"], summary["counts"]["dead"]]
    stress_colors = ["#3498db", "#f39c12", "#34495e"]
    bars = ax.barh(stress_classes, stress_counts, color=stress_colors, edgecolor="#1a252f", linewidth=1.1, height=0.5)
    ax.set_title("Stress & Mortality Breakdown Across Detected Palms", fontsize=13, fontweight="bold", pad=12)
    ax.set_xlabel("Detections Count", fontsize=11, labelpad=8)
    ax.grid(axis="x", linestyle="--", alpha=0.4)
    for bar in bars:
        w = bar.get_width()
        pct_of_palms = (w / total_palms) * 100.0
        ax.annotate(f"{w:,} ({pct_of_palms:.2f}%)", xy=(w, bar.get_y() + bar.get_height() / 2),
                    xytext=(6, 0), textcoords="offset points", ha="left", va="center",
                    fontsize=10, fontweight="semibold")
    ax.set_xlim(0, max(stress_counts) * 1.25)
    plt.tight_layout()
    chart3_path = VIZ_DIR / "stress_and_mortality_distribution.png"
    plt.savefig(chart3_path)
    plt.close()
    print(f"Saved {chart3_path.name}")

    # Chart 4: Detection Confidence Distribution by Class
    fig, ax = plt.subplots(figsize=(9, 5.5), dpi=300)
    box_data = [class_confs[c] for c in ["Healthy", "Small", "Yellow", "Grass", "Dead"] if len(class_confs[c]) > 0]
    box_labels = ["Healthy", "Small", "Yellow", "Grass", "Dead"]
    bp = ax.boxplot(box_data, tick_labels=box_labels, patch_artist=True,
                    boxprops=dict(linewidth=1.2), medianprops=dict(color="black", linewidth=1.8),
                    whiskerprops=dict(linewidth=1.2), capprops=dict(linewidth=1.2),
                    flierprops=dict(marker="o", markersize=3, alpha=0.3, markeredgecolor="gray"))
    for patch, c_name in zip(bp["boxes"], box_labels):
        patch.set_facecolor(palette[c_name])
        patch.set_alpha(0.8)
    ax.set_title("Detection Confidence Distribution by Class (conf >= 0.25)", fontsize=13, fontweight="bold", pad=12)
    ax.set_ylabel("Confidence Score", fontsize=11, labelpad=8)
    ax.set_ylim(0.20, 1.02)
    ax.grid(axis="y", linestyle="--", alpha=0.4)
    plt.tight_layout()
    chart4_path = VIZ_DIR / "detection_confidence_distribution.png"
    plt.savefig(chart4_path)
    plt.close()
    print(f"Saved {chart4_path.name}")

    # Chart 5: Drone Health Score Distribution
    fig, ax = plt.subplots(figsize=(8.5, 5), dpi=300)
    health_scores = [r["drone_health_score"] for r in records]
    n, bins, patches = ax.hist(health_scores, bins=25, range=(0, 100),
                               color="#27ae60", edgecolor="#145a32", alpha=0.85, linewidth=1.1)
    ax.axvline(summary["drone_health_score"]["average"], color="#c0392b", linestyle="--", linewidth=2,
               label=f"Mean: {summary['drone_health_score']['average']:.1f}%")
    ax.axvline(summary["drone_health_score"]["median"], color="#2980b9", linestyle=":", linewidth=2,
               label=f"Median: {summary['drone_health_score']['median']:.1f}%")
    ax.set_title("Distribution of Image-Level Drone Health Scores (N=500)", fontsize=13, fontweight="bold", pad=12)
    ax.set_xlabel("Drone Health Score (Healthy Palm %)", fontsize=11, labelpad=8)
    ax.set_ylabel("Number of Validation Images", fontsize=11, labelpad=8)
    ax.grid(axis="y", linestyle="--", alpha=0.4)
    ax.legend(fontsize=10, loc="upper left")
    plt.tight_layout()
    chart5_path = VIZ_DIR / "drone_health_score_distribution.png"
    plt.savefig(chart5_path)
    plt.close()
    print(f"Saved {chart5_path.name}")


if __name__ == "__main__":
    run_feature_extraction()
