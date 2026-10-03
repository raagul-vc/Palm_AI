#!/usr/bin/env python3
"""Train/evaluate YOLO11n on the verified drone YOLO dataset and save artifacts."""
import csv
import json
import os
import random
import shutil
import time
from pathlib import Path

DRONE = Path(__file__).resolve().parents[1]
PROJECT = DRONE.parent
DATA_YAML = DRONE / "dataset_yolo" / "data.yaml"
PRETRAINED = DRONE / "models" / "yolo11n.pt"
BEST_OUTPUT = DRONE / "models" / "palm_yolo_best.pt"
SUMMARY_JSON = DRONE / "outputs" / "yolo_training_summary.json"
SUMMARY_TXT = DRONE / "outputs" / "yolo_training_summary.txt"
CLASS_NAMES = ("Dead", "Healthy", "Grass", "Small", "Yellow")
EPOCHS, IMGSZ, PATIENCE, SEED, BATCH = 50, 1024, 15, 42, 1

# Keep Ultralytics/Matplotlib configuration inside the isolated drone module.
CONFIG_ROOT = DRONE / ".ultralytics"
CONFIG_ROOT.mkdir(parents=True, exist_ok=True)
MPL_ROOT = DRONE / ".mplconfig"
MPL_ROOT.mkdir(parents=True, exist_ok=True)
os.environ["YOLO_CONFIG_DIR"] = str(CONFIG_ROOT)
os.environ["MPLCONFIGDIR"] = str(MPL_ROOT)

import numpy as np
import torch
from ultralytics import YOLO


def seed_everything(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def training_epochs(save_dir):
    csv_path = Path(save_dir) / "results.csv"
    if not csv_path.is_file():
        return 0
    with csv_path.open(newline="", encoding="utf-8") as f:
        return sum(1 for _ in csv.DictReader(f))


def get_per_class(metrics):
    box = metrics.box
    result = {}
    p_values = np.asarray(getattr(box, "p", []), dtype=float).reshape(-1)
    r_values = np.asarray(getattr(box, "r", []), dtype=float).reshape(-1)
    ap50_values = np.asarray(getattr(box, "ap50", []), dtype=float).reshape(-1)
    ap_values = np.asarray(getattr(box, "ap", []), dtype=float)
    if ap_values.ndim == 1 and ap_values.size:
        ap_values = ap_values.reshape(-1, 1)
    indices = np.asarray(getattr(box, "ap_class_index", []), dtype=int).reshape(-1)
    for pos, class_id in enumerate(indices):
        if not 0 <= class_id < len(CLASS_NAMES):
            continue
        result[CLASS_NAMES[class_id]] = {
            "precision": float(p_values[pos]) if pos < len(p_values) else 0.0,
            "recall": float(r_values[pos]) if pos < len(r_values) else 0.0,
            "map50": float(ap50_values[pos]) if pos < len(ap50_values) else 0.0,
            "map50_95": float(ap_values[pos].mean()) if pos < len(ap_values) and ap_values.shape[1] else 0.0,
        }
    for name in CLASS_NAMES:
        result.setdefault(name, {"precision": 0.0, "recall": 0.0, "map50": 0.0, "map50_95": 0.0})
    return result


def main():
    if not DATA_YAML.is_file():
        raise FileNotFoundError(f"YOLO data config not found: {DATA_YAML}")
    if BEST_OUTPUT.exists():
        raise FileExistsError(f"Refusing to overwrite existing final model: {BEST_OUTPUT}")
    seed_everything(SEED)
    device = "0" if torch.cuda.is_available() else "cpu"
    device_name = torch.cuda.get_device_name(0) if device != "cpu" else "CPU"
    if device != "cpu":
        # Touch CUDA before training so initialization errors are visible and can fall back.
        torch.zeros(1, device="cuda")
    DRONE.joinpath("models").mkdir(parents=True, exist_ok=True)
    runs_dir = DRONE / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    run_name = "yolo11n_site2_50e_seed42"
    run_dir = runs_dir / run_name
    if run_dir.exists():
        raise FileExistsError(f"Refusing to overwrite existing training run directory: {run_dir}")

    start = time.monotonic()
    train_args = dict(data=str(DATA_YAML), epochs=EPOCHS, imgsz=IMGSZ, patience=PATIENCE,
                      seed=SEED, deterministic=True, batch=BATCH, workers=0, device=device,
                      project=str(runs_dir), name=run_name, exist_ok=False, cache=False,
                      amp=True, plots=True, save=True, verbose=True)
    model = YOLO(str(PRETRAINED) if PRETRAINED.is_file() else "yolo11n.pt")
    downloaded_weight = PROJECT / "yolo11n.pt"
    if not PRETRAINED.exists() and downloaded_weight.is_file():
        shutil.copy2(downloaded_weight, PRETRAINED)
    try:
        train_result = model.train(**train_args)
    except Exception as exc:
        is_cuda_oom = device != "cpu" and (isinstance(exc, torch.cuda.OutOfMemoryError)
                                             or "out of memory" in str(exc).lower()
                                             or "cuda error: out of memory" in str(exc).lower())
        if not is_cuda_oom:
            raise
        print(f"CUDA batch={BATCH} OOM at imgsz={IMGSZ}; batch is already the minimum. Retrying on CPU. Exact GPU error: {exc}")
        torch.cuda.empty_cache()
        device, device_name = "cpu", "CPU (CUDA OOM fallback)"
        cpu_run_name = run_name + "_cpu_fallback"
        cpu_run_dir = runs_dir / cpu_run_name
        if cpu_run_dir.exists():
            raise FileExistsError(f"Refusing to overwrite existing fallback run directory: {cpu_run_dir}")
        model = YOLO(str(PRETRAINED) if PRETRAINED.is_file() else "yolo11n.pt")
        train_args.update(device="cpu", name=cpu_run_name)
        train_result = model.train(**train_args)
        run_dir = cpu_run_dir
    train_seconds = time.monotonic() - start
    best_checkpoint = Path(train_result.save_dir) / "weights" / "best.pt"
    if not best_checkpoint.is_file():
        raise FileNotFoundError(f"Training ended without a best checkpoint: {best_checkpoint}")

    best_model = YOLO(str(best_checkpoint))
    val_project = DRONE / "outputs" / "evaluation"
    val_result = best_model.val(data=str(DATA_YAML), split="val", imgsz=IMGSZ, batch=1,
                           device=device, workers=0, plots=True, save_json=True,
                           project=str(val_project), name="best_1024_val", exist_ok=True,
                           verbose=True)
    val_dir = Path(val_result.save_dir)
    class_metrics = get_per_class(val_result)

    prediction_dir = DRONE / "outputs" / "predictions"
    prediction_dir.mkdir(parents=True, exist_ok=True)
    val_images = sorted((DRONE / "dataset_yolo" / "images" / "val").glob("*.jpg"))
    if len(val_images) < 10:
        raise RuntimeError(f"Expected at least 10 validation images, found {len(val_images)}")
    prediction_samples = random.Random(SEED).sample(val_images, 10)
    pred_result = best_model.predict(source=[str(p) for p in prediction_samples], imgsz=IMGSZ,
                                device=device, conf=0.25, save=True, save_conf=True,
                                show_labels=True, show_conf=True, project=str(prediction_dir),
                                name="val_samples", exist_ok=True, verbose=False)
    prediction_output_dir = Path(pred_result[0].save_dir) if pred_result else prediction_dir / "val_samples"

    BEST_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(best_checkpoint, BEST_OUTPUT)
    metrics = val_result.results_dict
    summary = {
        "status": "COMPLETED", "model": "YOLO11n pretrained (yolo11n.pt)",
        "ultralytics_version": __import__("ultralytics").__version__,
        "torch_version": torch.__version__, "device": device_name,
        "epochs_requested": EPOCHS, "epochs_completed": training_epochs(train_result.save_dir),
        "patience": PATIENCE, "imgsz": IMGSZ, "batch": BATCH, "seed": SEED,
        "training_seconds": train_seconds, "training_minutes": train_seconds / 60,
        "dataset_yaml": str(DATA_YAML),
        "validation": {"images": 500,
                       "precision": float(val_result.box.mp), "recall": float(val_result.box.mr),
                       "map50": float(val_result.box.map50), "map50_95": float(val_result.box.map),
                       "per_class": class_metrics, "results_dict": {k: float(v) for k, v in metrics.items() if isinstance(v, (int, float, np.number))}},
        "best_checkpoint": str(BEST_OUTPUT), "training_checkpoint": str(best_checkpoint),
        "evaluation_dir": str(val_dir),
        "confusion_matrix": str(val_dir / "confusion_matrix.png"),
        "confusion_matrix_normalized": str(val_dir / "confusion_matrix_normalized.png"),
        "curves": {name: str(val_dir / f"{name}.png") for name in ("PR_curve", "F1_curve", "P_curve", "R_curve")},
        "prediction_samples": [str(prediction_output_dir / (p.stem + ".jpg")) for p in prediction_samples],
        "prediction_dir": str(prediction_output_dir),
        "training_run_dir": str(train_result.save_dir),
    }
    SUMMARY_JSON.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    lines = ["YOLO11n DRONE TRAINING AND VALIDATION", "",
             f"Model: {summary['model']}", f"Device: {device_name}",
             f"Epochs completed: {summary['epochs_completed']} / {EPOCHS}",
             f"Training time (minutes): {summary['training_minutes']:.2f}",
             f"Precision: {summary['validation']['precision']:.6f}",
             f"Recall: {summary['validation']['recall']:.6f}",
             f"mAP50: {summary['validation']['map50']:.6f}",
             f"mAP50-95: {summary['validation']['map50_95']:.6f}", "", "PER CLASS"]
    for name in CLASS_NAMES:
        cm = class_metrics[name]
        lines.append(f"{name}: P={cm['precision']:.6f}, R={cm['recall']:.6f}, mAP50={cm['map50']:.6f}, mAP50-95={cm['map50_95']:.6f}")
    lines += ["", f"Best model: {BEST_OUTPUT}", f"Confusion matrix: {summary['confusion_matrix']}",
              f"Prediction directory: {prediction_output_dir}", "Training: COMPLETED", "Evaluation: COMPLETED"]
    SUMMARY_TXT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Training and evaluation complete. Best model: {BEST_OUTPUT}")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
