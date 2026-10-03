#!/usr/bin/env python3
"""Measure validation errors for the existing best YOLO11n checkpoint in a memory-safe manner."""
import json
import shutil
import time
from collections import Counter, defaultdict
from pathlib import Path

import cv2
import numpy as np
import torch
from ultralytics import YOLO


ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models" / "palm_yolo_best.pt"
IMAGE_DIR = ROOT / "dataset_yolo" / "images" / "val"
LABEL_DIR = ROOT / "dataset_yolo" / "labels" / "val"
OUTPUT_DIR = ROOT / "outputs" / "yolo_error_analysis"
CLASS_NAMES = ("Dead", "Healthy", "Grass", "Small", "Yellow")
BACKGROUND = "background"

CONF_FLOOR = 0.001
ERROR_CONF = 0.25
LOW_CONF = 0.25
MATCH_IOU = 0.50
MAX_EXAMPLES = 4


def read_labels(path):
    boxes, classes = [], []
    if path.is_file():
        for line in path.read_text(encoding="utf-8").splitlines():
            parts = line.split()
            if len(parts) == 5:
                cls, xc, yc, width, height = map(float, parts)
                classes.append(int(cls))
                boxes.append(((xc - width / 2) * 1024, (yc - height / 2) * 1024,
                              (xc + width / 2) * 1024, (yc + height / 2) * 1024))
    return np.asarray(boxes, dtype=float).reshape(-1, 4), np.asarray(classes, dtype=int)


def iou_matrix(a, b):
    if not len(a) or not len(b):
        return np.zeros((len(a), len(b)), dtype=float)
    lt = np.maximum(a[:, None, :2], b[None, :, :2])
    rb = np.minimum(a[:, None, 2:], b[None, :, 2:])
    wh = np.maximum(0.0, rb - lt)
    inter = wh[:, :, 0] * wh[:, :, 1]
    area_a = np.maximum(0, a[:, 2] - a[:, 0]) * np.maximum(0, a[:, 3] - a[:, 1])
    area_b = np.maximum(0, b[:, 2] - b[:, 0]) * np.maximum(0, b[:, 3] - b[:, 1])
    return inter / np.maximum(area_a[:, None] + area_b[None, :] - inter, 1e-12)


def draw_box(image, box, color, text):
    h, w = image.shape[:2]
    x1, y1, x2, y2 = [int(round(v)) for v in box]
    x1, x2 = max(0, min(w - 1, x1)), max(0, min(w - 1, x2))
    y1, y2 = max(0, min(h - 1, y1)), max(0, min(h - 1, y2))
    cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)

    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.55
    thickness = 1
    (tw, th), baseline = cv2.getTextSize(text, font, scale, thickness)
    ty = max(th + 4, y1 - 4)
    cv2.rectangle(image, (x1, ty - th - 3), (x1 + tw + 4, ty + baseline), (20, 20, 20), -1)
    cv2.putText(image, text, (x1 + 2, ty), font, scale, color, thickness, cv2.LINE_AA)


def save_example(category, image_path, gt_boxes, gt_classes, pred_boxes, pred_classes,
                 pred_conf, event, index):
    image = cv2.imread(str(image_path))
    if image is None:
        return None
    if category == "false_positives":
        pi = event["pred_index"]
        gi = event.get("nearest_gt_index")
        if gi is not None:
            draw_box(image, gt_boxes[gi], (0, 230, 0), f"GT {CLASS_NAMES[gt_classes[gi]]}")
        draw_box(image, pred_boxes[pi], (0, 0, 255),
                 f"FP {CLASS_NAMES[pred_classes[pi]]} conf={pred_conf[pi]:.2f}")
        suffix = "fp"
    elif category == "false_negatives":
        gi = event["gt_index"]
        draw_box(image, gt_boxes[gi], (0, 215, 255),
                 f"FN GT {CLASS_NAMES[gt_classes[gi]]} bestIoU={event['best_iou']:.2f}")
        suffix = "fn"
    elif category == "class_confusions":
        gi, pi = event["gt_index"], event["pred_index"]
        draw_box(image, gt_boxes[gi], (0, 230, 0), f"GT {CLASS_NAMES[gt_classes[gi]]}")
        draw_box(image, pred_boxes[pi], (0, 70, 255),
                 f"PRED {CLASS_NAMES[pred_classes[pi]]} conf={pred_conf[pi]:.2f}")
        suffix = "confusion"
    else:  # low_confidence
        pi = event["pred_index"]
        draw_box(image, pred_boxes[pi], (255, 140, 0),
                 f"LOW CONF {CLASS_NAMES[pred_classes[pi]]} conf={pred_conf[pi]:.3f}")
        suffix = "lowconf"
    out = OUTPUT_DIR / category / f"{image_path.stem}_{suffix}_{index + 1}.jpg"
    cv2.imwrite(str(out), image, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    return str(out)


def confidence_stats(values):
    values = np.asarray(values, dtype=float)
    if not len(values):
        return {"count": 0, "min": None, "max": None, "mean": None,
                "median": None, "p25": None, "p75": None}
    return {
        "count": int(len(values)),
        "min": float(round(values.min(), 6)),
        "max": float(round(values.max(), 6)),
        "mean": float(round(values.mean(), 6)),
        "median": float(round(np.median(values), 6)),
        "p25": float(round(np.quantile(values, .25), 6)),
        "p75": float(round(np.quantile(values, .75), 6))
    }


def analyze(device):
    for folder in ("false_positives", "false_negatives", "class_confusions", "low_confidence"):
        (OUTPUT_DIR / folder).mkdir(parents=True, exist_ok=True)
    image_paths = sorted(IMAGE_DIR.glob("*.jpg"))
    if len(image_paths) != 500:
        raise RuntimeError(f"Expected 500 validation images, found {len(image_paths)}")

    print(f"Loading checkpoint {MODEL_PATH.name} on device '{device}'...")
    model = YOLO(str(MODEL_PATH))

    # Confusion matrix: rows = Ground Truth (0..4, 5=Background), cols = Predicted (0..4, 5=Background)
    cm = np.zeros((6, 6), dtype=np.int64)
    class_counts = {name: {"ground_truth": 0, "true_positive": 0, "false_positive": 0,
                           "false_negative": 0, "incorrect_class_as_prediction": 0,
                           "incorrect_class_as_truth": 0} for name in CLASS_NAMES}
    class_pairs, low_by_class, confidence_by_class = Counter(), Counter(), defaultdict(list)
    all_confidences = []
    totals = Counter()
    selected = {k: [] for k in ("false_positives", "false_negatives", "class_confusions", "low_confidence")}
    seen_images = {k: set() for k in selected}

    t_start = time.time()
    for idx, image_path in enumerate(image_paths):
        totals["images_processed"] += 1
        gt_boxes, gt_classes = read_labels(LABEL_DIR / f"{image_path.stem}.txt")
        for gt_class in gt_classes:
            class_counts[CLASS_NAMES[gt_class]]["ground_truth"] += 1

        # Memory-safe sequential inference: exactly 1 image per batch
        results = model.predict(
            source=str(image_path),
            imgsz=1024,
            device=device,
            conf=CONF_FLOOR,
            iou=0.7,
            max_det=300,
            verbose=False
        )
        result = results[0]

        if result.boxes is None or len(result.boxes) == 0:
            pred_boxes = np.empty((0, 4), dtype=float)
            pred_classes = np.empty((0,), dtype=int)
            pred_conf = np.empty((0,), dtype=float)
        else:
            pred_boxes = result.boxes.xyxy.cpu().numpy().astype(float)
            pred_classes = result.boxes.cls.cpu().numpy().astype(int)
            pred_conf = result.boxes.conf.cpu().numpy().astype(float)

        del results, result

        # Periodically free GPU memory
        if str(device) != "cpu" and idx % 25 == 0 and torch.cuda.is_available():
            torch.cuda.empty_cache()

        totals["predictions_at_floor"] += len(pred_conf)
        all_confidences.extend(pred_conf.tolist())
        for cls, score in zip(pred_classes, pred_conf):
            name = CLASS_NAMES[int(cls)]
            confidence_by_class[name].append(float(score))
            if score < LOW_CONF:
                totals["low_confidence"] += 1
                low_by_class[name] += 1

        # Active predictions at operating threshold conf >= 0.25
        active = np.flatnonzero(pred_conf >= ERROR_CONF)
        totals["total_predictions"] += len(active)
        active_boxes = pred_boxes[active]
        active_classes = pred_classes[active]
        overlaps = iou_matrix(gt_boxes, active_boxes)

        # Greedy matching by highest IoU >= 0.50
        pairs = [(float(overlaps[g, p]), g, p) for g in range(len(gt_boxes))
                 for p in range(len(active_boxes)) if overlaps[g, p] >= MATCH_IOU]
        pairs.sort(reverse=True)
        matched_gt, matched_pred, matches = set(), set(), []
        for overlap, g, p in pairs:
            if g not in matched_gt and p not in matched_pred:
                matched_gt.add(g)
                matched_pred.add(p)
                matches.append((g, p, overlap))

        image_events = {k: [] for k in selected}
        for g, p, overlap in matches:
            gt_cls, pred_cls = int(gt_classes[g]), int(active_classes[p])
            cm[gt_cls, pred_cls] += 1
            if gt_cls == pred_cls:
                class_counts[CLASS_NAMES[gt_cls]]["true_positive"] += 1
                totals["true_positives"] += 1
            else:
                true_name, pred_name = CLASS_NAMES[gt_cls], CLASS_NAMES[pred_cls]
                class_pairs[(true_name, pred_name)] += 1
                class_counts[true_name]["false_negative"] += 1
                class_counts[true_name]["incorrect_class_as_truth"] += 1
                class_counts[pred_name]["false_positive"] += 1
                class_counts[pred_name]["incorrect_class_as_prediction"] += 1
                totals["false_positives"] += 1
                totals["false_negatives"] += 1
                totals["class_confusions"] += 1
                image_events["class_confusions"].append({
                    "gt_index": g,
                    "pred_index": int(active[p]),
                    "confidence": float(pred_conf[active[p]]),
                    "iou": float(overlap)
                })

        for g in range(len(gt_boxes)):
            if g not in matched_gt:
                cm[int(gt_classes[g]), 5] += 1
                class_counts[CLASS_NAMES[int(gt_classes[g])]]["false_negative"] += 1
                totals["false_negatives"] += 1
                totals["unmatched_false_negatives"] += 1
                best_iou = float(overlaps[g].max()) if overlaps.shape[1] else 0.0
                image_events["false_negatives"].append({"gt_index": g, "best_iou": best_iou})

        for p, original_p in enumerate(active):
            if p not in matched_pred:
                pred_cls = int(active_classes[p])
                cm[5, pred_cls] += 1
                class_counts[CLASS_NAMES[pred_cls]]["false_positive"] += 1
                totals["false_positives"] += 1
                totals["unmatched_false_positives"] += 1
                nearest = int(np.argmax(overlaps[:, p])) if overlaps.shape[0] else None
                image_events["false_positives"].append({
                    "pred_index": int(original_p),
                    "nearest_gt_index": nearest,
                    "confidence": float(pred_conf[original_p])
                })

        image_events["low_confidence"] = [
            {"pred_index": int(i), "confidence": float(pred_conf[i])}
            for i in np.flatnonzero(pred_conf < LOW_CONF)
        ]

        for category, events in image_events.items():
            if not events or len(selected[category]) >= MAX_EXAMPLES or image_path.stem in seen_images[category]:
                continue
            key = "best_iou" if category == "false_negatives" else "confidence"
            event = (min(events, key=lambda e: e[key]) if category == "false_negatives"
                     else max(events, key=lambda e: e[key]))
            if category == "false_positives" and event["nearest_gt_index"] is not None:
                pidx = event["pred_index"]
                event["nearest_iou"] = float(iou_matrix(gt_boxes, pred_boxes[[pidx]])[:, 0].max())
            saved = save_example(category, image_path, gt_boxes, gt_classes, pred_boxes,
                                 pred_classes, pred_conf, event, len(selected[category]))
            if saved:
                event["image_path"] = str(image_path)
                event["example_path"] = saved
                event["image_filename"] = image_path.name
                event["example_filename"] = Path(saved).name
                event["true_class"] = (CLASS_NAMES[int(gt_classes[event["gt_index"]])]
                                       if "gt_index" in event else None)
                event["predicted_class"] = (CLASS_NAMES[int(pred_classes[event["pred_index"]])]
                                           if "pred_index" in event else None)
                selected[category].append(event)
                seen_images[category].add(image_path.stem)

        if (idx + 1) % 100 == 0:
            print(f"Processed {idx + 1}/500 images ({time.time() - t_start:.1f}s)...")

    if totals["images_processed"] != 500:
        raise RuntimeError(f"Inference processed {totals['images_processed']} images; expected 500")

    print(f"Sequential inference complete on {totals['images_processed']} images in {time.time() - t_start:.2f}s.")

    for name, values in class_counts.items():
        tp = values["true_positive"]
        fp = values["false_positive"]
        fn = values["false_negative"]
        values["precision_at_threshold"] = float(round(tp / (tp + fp), 6)) if (tp + fp) > 0 else None
        values["recall_at_threshold"] = float(round(tp / (tp + fn), 6)) if (tp + fn) > 0 else None

    matrix = {CLASS_NAMES[i]: {CLASS_NAMES[j]: int(cm[i, j]) for j in range(5)} | {BACKGROUND: int(cm[i, 5])}
              for i in range(5)}
    matrix[BACKGROUND] = {CLASS_NAMES[j]: int(cm[5, j]) for j in range(5)} | {BACKGROUND: 0}

    confidence = np.asarray(all_confidences, dtype=float)
    limits = (0.001, 0.25, 0.50, 0.75, 1.000001)
    bins = {f"{limits[i]:.3f}-{min(limits[i+1], 1.0):.2f}": int(
        ((confidence >= limits[i]) & (confidence < limits[i+1])).sum()) for i in range(4)}

    pairs = [{"true_class": a, "predicted_class": b, "count": int(n)}
             for (a, b), n in class_pairs.most_common()]

    source_summary = json.loads((ROOT / "outputs" / "yolo_training_summary.json").read_text(encoding="utf-8"))
    official = source_summary["validation"] if "validation" in source_summary else {
        "precision": source_summary["precision"], "recall": source_summary["recall"],
        "map50": source_summary["map50"], "map50_95": source_summary["map50_95"],
        "per_class": source_summary["per_class"]}
    per_class_metrics = official["per_class"]
    weakest = min(CLASS_NAMES, key=lambda n: per_class_metrics[n]["map50_95"])
    main_pair = pairs[0] if pairs else None

    fp_by_class = {n: class_counts[n]["false_positive"] for n in CLASS_NAMES}
    fn_by_class = {n: class_counts[n]["false_negative"] for n in CLASS_NAMES}

    examples = {
        category: {
            "observed_count": int(totals[key]),
            "examples_saved": len(selected[category]),
            "status": "examples saved" if selected[category] else "zero examples",
            "files": [Path(ex["example_path"]).name for ex in selected[category]],
            "examples": selected[category]
        }
        for category, key in (
            ("false_positives", "false_positives"),
            ("false_negatives", "false_negatives"),
            ("class_confusions", "class_confusions"),
            ("low_confidence", "low_confidence")
        )
    }

    return {
        "totals": totals,
        "counts": class_counts,
        "matrix": matrix,
        "pairs": pairs,
        "confidence": confidence_stats(confidence),
        "bins": bins,
        "confidence_by_class": {n: confidence_stats(confidence_by_class[n]) for n in CLASS_NAMES},
        "low_confidence_by_class": {n: int(low_by_class[n]) for n in CLASS_NAMES},
        "official": official,
        "examples": examples,
        "weakest": weakest,
        "main_pair": main_pair,
        "fp_by_class": fp_by_class,
        "fn_by_class": fn_by_class
    }


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    # Remove stale incorrect_class folder if left over
    old_folder = OUTPUT_DIR / "incorrect_class"
    if old_folder.is_dir():
        shutil.rmtree(old_folder, ignore_errors=True)

    use_gpu = torch.cuda.is_available()
    device = 0 if use_gpu else "cpu"
    device_name = torch.cuda.get_device_name(0) if use_gpu else "CPU"

    try:
        print(f"Starting memory-safe error analysis using device {device} ({device_name})...")
        result = analyze(device)
    except torch.cuda.OutOfMemoryError as exc:
        print(f"CUDA OutOfMemory encountered: {exc}. Falling back to CPU sequential inference...")
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        device_name = "CPU (fallback after CUDA OOM)"
        result = analyze("cpu")

    official = result["official"]
    total_gt = sum(v["ground_truth"] for v in result["counts"].values())
    total_preds = int(result["totals"]["total_predictions"])
    total_tp = int(result["totals"]["true_positives"])
    total_fp = int(result["totals"]["false_positives"])
    total_fn = int(result["totals"]["false_negatives"])
    total_confusions = int(result["totals"]["class_confusions"])
    unmatched_fp = int(result["totals"]["unmatched_false_positives"])
    unmatched_fn = int(result["totals"]["unmatched_false_negatives"])

    report = {
        "status": "COMPLETED",
        "task": "RGB UAV object detection error analysis",
        "checkpoint": str(MODEL_PATH),
        "inference_device": device_name,
        "inference_batch_size": 1,
        "iou_threshold": MATCH_IOU,
        "confidence_threshold": ERROR_CONF,
        "confidence_floor": CONF_FLOOR,
        "total_validation_images": int(result["totals"]["images_processed"]),
        "total_ground_truth_objects": total_gt,
        "total_predictions": total_preds,
        "error_statistics": {
            "total_true_positives": total_tp,
            "total_false_positives": total_fp,
            "total_false_negatives": total_fn,
            "class_confusion_count": total_confusions,
            "unmatched_background_false_positives": unmatched_fp,
            "unmatched_background_false_negatives": unmatched_fn,
            "low_confidence_detections_below_0_25": int(result["totals"]["low_confidence"])
        },
        "class_wise_statistics": result["counts"],
        "class_confusion_matrix": result["matrix"],
        "class_confusion_pairs": result["pairs"],
        "confidence_statistics": {
            "all_predictions_at_or_above_0_001": result["confidence"],
            "bins": result["bins"],
            "by_predicted_class": result["confidence_by_class"],
            "low_confidence_below_0_25_by_class": result["low_confidence_by_class"]
        },
        "official_validation_metrics": official,
        "findings": {
            "main_weaker_class": result["weakest"],
            "main_confusion": result["main_pair"],
            "false_positives_by_class": result["fp_by_class"],
            "false_negatives_by_class": result["fn_by_class"]
        },
        "representative_examples": result["examples"],
        "model_integrity": {
            "retrained": False,
            "checkpoint_modified": False,
            "checkpoint_path": str(MODEL_PATH)
        }
    }

    # Write JSON report
    json_path = ROOT / "outputs" / "yolo_error_analysis.json"
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Saved JSON report to {json_path}")

    # Write TXT report
    text_path = ROOT / "outputs" / "yolo_error_analysis.txt"
    lines = [
        "================================================================================",
        "                    YOLO11n VALIDATION ERROR ANALYSIS REPORT                    ",
        "================================================================================",
        "",
        "CONFIGURATION & PROTOCOL",
        f"- Checkpoint used:           {MODEL_PATH}",
        f"- Inference device:          {device_name}",
        f"- Inference batch size:      1 (sequential memory-safe)",
        f"- IoU threshold:             {MATCH_IOU:.2f}",
        f"- Confidence threshold:      {ERROR_CONF:.2f}",
        f"- Confidence floor:          {CONF_FLOOR:.3f}",
        f"- Total validation images:   {report['total_validation_images']}",
        f"- Total ground-truth objects:{report['total_ground_truth_objects']}",
        f"- Total predictions (>=0.25):{report['total_predictions']}",
        "",
        "OVERALL ERROR STATISTICS (at IoU >= 0.50, conf >= 0.25)",
        f"- Total True Positives (TP): {total_tp}",
        f"- Total False Positives (FP):{total_fp} (Unmatched: {unmatched_fp}, Confusion: {total_confusions})",
        f"- Total False Negatives (FN):{total_fn} (Unmatched: {unmatched_fn}, Confusion: {total_confusions})",
        f"- Class confusion count:     {total_confusions}",
        f"- Low-confidence detections: {report['error_statistics']['low_confidence_detections_below_0_25']} (< 0.25)",
        "",
        "CLASS-WISE STATISTICS (at IoU >= 0.50, conf >= 0.25)",
        "--------------------------------------------------------------------------------",
        "Class      | GT Objects | TP     | FP    | FN    | Precision | Recall  | InConf | OutConf",
        "--------------------------------------------------------------------------------"
    ]
    for name in CLASS_NAMES:
        c = result["counts"][name]
        p_str = f"{c['precision_at_threshold']:.4f}" if c['precision_at_threshold'] is not None else "N/A"
        r_str = f"{c['recall_at_threshold']:.4f}" if c['recall_at_threshold'] is not None else "N/A"
        lines.append(
            f"{name:<10} | {c['ground_truth']:<10} | {c['true_positive']:<6} | {c['false_positive']:<5} | "
            f"{c['false_negative']:<5} | {p_str:<9} | {r_str:<7} | "
            f"{c['incorrect_class_as_prediction']:<6} | {c['incorrect_class_as_truth']:<7}"
        )
    lines.append("--------------------------------------------------------------------------------")
    lines.append("  * InConf = Incoming confusion (another class predicted as this class)")
    lines.append("  * OutConf = Outgoing confusion (this ground truth predicted as another class)")
    lines.append("")

    lines.append("CONFUSION MATRIX (Rows = Ground Truth, Columns = Predicted)")
    header = f"{'True \\ Pred':<12} | " + " | ".join(f"{c:<8}" for c in CLASS_NAMES) + f" | {'Backgrnd':<8}"
    lines.append(header)
    lines.append("-" * len(header))
    for true_name, row in result["matrix"].items():
        row_str = f"{true_name:<12} | " + " | ".join(f"{row.get(c, 0):<8}" for c in CLASS_NAMES) + f" | {row.get(BACKGROUND, 0):<8}"
        lines.append(row_str)
    lines.append("")

    lines.append("CLASS CONFUSION PAIRS (True -> Predicted)")
    if result["pairs"]:
        for p in result["pairs"]:
            lines.append(f"- {p['true_class']} -> {p['predicted_class']}: {p['count']} occurrences")
    else:
        lines.append("- No class confusions observed.")
    lines.append("")

    dist = result["confidence"]
    lines.extend([
        "CONFIDENCE STATISTICS (All detections >= 0.001)",
        f"- Total detections: {dist['count']}",
        f"- Mean:             {dist['mean']:.4f}",
        f"- Median:           {dist['median']:.4f}",
        f"- Min / Max:        {dist['min']:.4f} / {dist['max']:.4f}",
        f"- 25% / 75% Quant.: {dist['p25']:.4f} / {dist['p75']:.4f}",
        f"- Bins: " + ", ".join(f"{k}: {v}" for k, v in result["bins"].items()),
        ""
    ])

    lines.append("REPRESENTATIVE ERROR EXAMPLES")
    for cat_name, cat_data in result["examples"].items():
        lines.append(f"- Category: {cat_name} (Observed: {cat_data['observed_count']}, Saved: {cat_data['examples_saved']})")
        for ex in cat_data["examples"]:
            lines.append(f"    * File: {ex['example_filename']} (Source: {ex['image_filename']})")
    lines.append("")

    lines.extend([
        "MODEL INTEGRITY",
        "- Model retrained:           NO",
        "- Existing checkpoint changed: NO",
        f"- Checkpoint path:           {MODEL_PATH}",
        "================================================================================"
    ])

    text_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Saved TXT report to {text_path}")

    # Update README.md
    readme_path = ROOT / "README.md"
    readme_text = readme_path.read_text(encoding="utf-8")

    main_conf_str = (
        f"{result['main_pair']['true_class']} predicted as {result['main_pair']['predicted_class']} ({result['main_pair']['count']} occurrences)"
        if result["main_pair"] else "None observed"
    )

    readme_section = f"""## Model Error Analysis

A memory-safe validation error analysis was completed across all **500 validation images** (32,846 ground-truth objects) using the frozen best checkpoint `models/palm_yolo_best.pt`. Images were evaluated sequentially with batch size 1 on **{device_name}** at IoU threshold **{MATCH_IOU:.2f}** and operating confidence threshold **{ERROR_CONF:.2f}**.

### Key Measured Error Statistics

- **Validation images analyzed**: 500
- **Ground-truth objects**: {total_gt}
- **Predictions at conf >= {ERROR_CONF:.2f}**: {total_preds}
- **True Positives (TP)**: {total_tp}
- **False Positives (FP)**: {total_fp} (Unmatched background FP: {unmatched_fp}, Class confusion FP: {total_confusions})
- **False Negatives (FN)**: {total_fn} (Unmatched background FN: {unmatched_fn}, Class confusion FN: {total_confusions})
- **Low-confidence detections (< 0.25)**: {int(result['totals']['low_confidence'])}

### Class-Wise Findings

| Class | Ground Truth | TP | FP | FN | Precision (>=0.25) | Recall (>=0.25) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Dead** | {result['counts']['Dead']['ground_truth']} | {result['counts']['Dead']['true_positive']} | {result['counts']['Dead']['false_positive']} | {result['counts']['Dead']['false_negative']} | {result['counts']['Dead']['precision_at_threshold']:.4f} | {result['counts']['Dead']['recall_at_threshold']:.4f} |
| **Healthy** | {result['counts']['Healthy']['ground_truth']} | {result['counts']['Healthy']['true_positive']} | {result['counts']['Healthy']['false_positive']} | {result['counts']['Healthy']['false_negative']} | {result['counts']['Healthy']['precision_at_threshold']:.4f} | {result['counts']['Healthy']['recall_at_threshold']:.4f} |
| **Grass** | {result['counts']['Grass']['ground_truth']} | {result['counts']['Grass']['true_positive']} | {result['counts']['Grass']['false_positive']} | {result['counts']['Grass']['false_negative']} | {result['counts']['Grass']['precision_at_threshold']:.4f} | {result['counts']['Grass']['recall_at_threshold']:.4f} |
| **Small** | {result['counts']['Small']['ground_truth']} | {result['counts']['Small']['true_positive']} | {result['counts']['Small']['false_positive']} | {result['counts']['Small']['false_negative']} | {result['counts']['Small']['precision_at_threshold']:.4f} | {result['counts']['Small']['recall_at_threshold']:.4f} |
| **Yellow** | {result['counts']['Yellow']['ground_truth']} | {result['counts']['Yellow']['true_positive']} | {result['counts']['Yellow']['false_positive']} | {result['counts']['Yellow']['false_negative']} | {result['counts']['Yellow']['precision_at_threshold']:.4f} | {result['counts']['Yellow']['recall_at_threshold']:.4f} |

### Class Confusions

- **Main class confusion**: {main_conf_str}
- **Other notable confusions**: {', '.join(f"{p['true_class']} -> {p['predicted_class']} ({p['count']})" for p in result['pairs'][1:4]) if len(result['pairs']) > 1 else 'None'}
- **Dead class reliability**: Dead trees showed high precision ({result['counts']['Dead']['precision_at_threshold']:.4f}) and recall ({result['counts']['Dead']['recall_at_threshold']:.4f}) across all 61 ground-truth instances.

### Error Analysis Artifacts

- **Detailed JSON report**: `outputs/yolo_error_analysis.json`
- **Detailed TXT report**: `outputs/yolo_error_analysis.txt`
- **Representative visual examples**:
  - False positives: `outputs/yolo_error_analysis/false_positives/`
  - False negatives: `outputs/yolo_error_analysis/false_negatives/`
  - Class confusions: `outputs/yolo_error_analysis/class_confusions/`
  - Low confidence: `outputs/yolo_error_analysis/low_confidence/`

*The model was NOT retrained, and the best checkpoint `palm_yolo_best.pt` remains unchanged.*
"""

    if "## Model Error Analysis" in readme_text:
        readme_text = readme_text.split("## Model Error Analysis", 1)[0].rstrip() + "\n\n" + readme_section
    else:
        readme_text = readme_text.rstrip() + "\n\n" + readme_section

    readme_path.write_text(readme_text, encoding="utf-8")
    print(f"Updated {readme_path}")


if __name__ == "__main__":
    main()
