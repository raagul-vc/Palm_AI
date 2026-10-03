#!/usr/bin/env python3
"""Verify converted YOLO image and detection-label files and write a report."""
import argparse
import json
import math
from collections import Counter
from pathlib import Path

DRONE = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = DRONE / "dataset_yolo"
DEFAULT_COCO = DRONE / "dataset_clean"
NAMES = ("Dead", "Healthy", "Grass", "Small", "Yellow")
EXPECTED = {"train": (1803, 118740), "val": (500, 32846)}


def inspect(split, root, coco_root):
    image_dir, label_dir = root / "images" / split, root / "labels" / split
    images = sorted(p for p in image_dir.iterdir() if p.is_file()) if image_dir.is_dir() else []
    labels = sorted(p for p in label_dir.glob("*.txt") if p.is_file()) if label_dir.is_dir() else []
    image_stems = [p.stem for p in images]
    label_stems = [p.stem for p in labels]
    duplicate_image_stems = sum(n - 1 for n in Counter(image_stems).values() if n > 1)
    missing_labels = sorted(set(image_stems) - set(label_stems))
    orphan_labels = sorted(set(label_stems) - set(image_stems))
    invalid_lines = []
    malformed_lines = 0
    class_counts = Counter()
    object_count = 0
    conversion_mismatches = []
    coco_path = coco_root / "annotations" / f"instances_{'train2017' if split == 'train' else 'val2017'}_clean.json"
    coco = json.loads(coco_path.read_text(encoding="utf-8"))
    cat_by_id = {c["id"]: c["name"] for c in coco["categories"]}
    class_by_name = {name: i for i, name in enumerate(NAMES)}
    records_by_stem = {Path(i["file_name"]).stem: i for i in coco["images"]}
    records_by_id = {i["id"]: i for i in coco["images"]}
    expected_by_stem = {stem: [] for stem in records_by_stem}
    for ann in coco["annotations"]:
        rec = records_by_id.get(ann.get("image_id"))
        if rec is not None:
            expected_by_stem[Path(rec["file_name"]).stem].append(ann)
    try:
        from PIL import Image
    except ImportError as e:
        raise SystemExit("Pillow is required to verify image dimensions; use .\\venv\\Scripts\\python.exe") from e
    bad_dimensions = []
    unreadable_images = []
    dimensions = Counter()
    for image_path in images:
        try:
            with Image.open(image_path) as im:
                im.load()
                dimensions[f"{im.width}x{im.height}"] += 1
                if im.size != (1024, 1024):
                    bad_dimensions.append({"file": image_path.name, "size": list(im.size)})
        except Exception as e:
            unreadable_images.append({"file": image_path.name, "error": str(e)})
    for label_path in labels:
        label_lines = label_path.read_text(encoding="utf-8").splitlines()
        expected_anns = expected_by_stem.get(label_path.stem, [])
        if len(label_lines) != len(expected_anns):
            conversion_mismatches.append({"file": label_path.name, "expected_objects": len(expected_anns), "actual_objects": len(label_lines)})
        for line_no, line in enumerate(label_lines, 1):
            object_count += 1
            fields = line.split()
            reason = None
            if len(fields) != 5:
                reason = "expected exactly 5 values"
            else:
                try:
                    class_float = float(fields[0])
                    coords = [float(v) for v in fields[1:]]
                    if not math.isfinite(class_float) or not class_float.is_integer():
                        reason = "class ID is not an integer"
                    elif not all(math.isfinite(v) for v in coords):
                        reason = "non-finite coordinate"
                    elif not 0 <= int(class_float) < len(NAMES):
                        reason = "class ID outside 0-4"
                    elif any(v < 0 or v > 1 for v in coords):
                        reason = "normalized coordinate outside [0,1]"
                    elif coords[2] <= 0 or coords[3] <= 0:
                        reason = "width and height must be > 0"
                    else:
                        class_counts[NAMES[int(class_float)]] += 1
                        if line_no <= len(expected_anns):
                            ann = expected_anns[line_no - 1]
                            image_record = records_by_stem[label_path.stem]
                            x, y, bw, bh = map(float, ann["bbox"])
                            expected_values = [class_by_name[cat_by_id[ann["category_id"]]],
                                               (x + bw / 2) / image_record["width"],
                                               (y + bh / 2) / image_record["height"],
                                               bw / image_record["width"], bh / image_record["height"]]
                            actual_values = [int(class_float), *coords]
                            if actual_values[0] != expected_values[0] or any(
                                not math.isclose(float(actual_values[i]), expected_values[i], rel_tol=0, abs_tol=5.1e-11)
                                for i in range(1, 5)
                            ):
                                conversion_mismatches.append({"file": label_path.name, "line": line_no,
                                                              "expected": expected_values, "actual": actual_values})
                except ValueError:
                    reason = "non-numeric value"
            if reason:
                malformed_lines += 1
                invalid_lines.append({"file": label_path.name, "line": line_no, "reason": reason, "content": line})
    expected_images, expected_objects = EXPECTED[split]
    passed = (len(images) == expected_images and len(labels) == expected_images and object_count == expected_objects
              and not missing_labels and not orphan_labels and not invalid_lines and not duplicate_image_stems
              and not bad_dimensions and not unreadable_images and not conversion_mismatches)
    return {"split": split, "image_count": len(images), "label_file_count": len(labels),
            "object_count": object_count, "class_distribution": {name: class_counts[name] for name in NAMES},
            "expected_image_count": expected_images, "expected_object_count": expected_objects,
            "missing_label_count": len(missing_labels), "missing_labels": missing_labels,
            "orphan_label_count": len(orphan_labels), "orphan_labels": orphan_labels,
            "invalid_label_count": len(invalid_lines), "malformed_label_line_count": malformed_lines,
            "invalid_labels": invalid_lines, "duplicate_image_stem_count": duplicate_image_stems,
            "conversion_mismatch_count": len(conversion_mismatches), "conversion_mismatches": conversion_mismatches,
            "image_dimensions": dict(dimensions), "wrong_dimension_count": len(bad_dimensions),
            "wrong_dimensions": bad_dimensions, "unreadable_image_count": len(unreadable_images),
            "unreadable_images": unreadable_images, "status": "PASS" if passed else "FAIL"}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    p.add_argument("--coco", type=Path, default=DEFAULT_COCO, help="Clean COCO source to cross-check exact converted labels")
    p.add_argument("--json-output", type=Path, default=DRONE / "outputs" / "yolo_dataset_summary.json")
    p.add_argument("--text-output", type=Path, default=DRONE / "outputs" / "yolo_dataset_summary.txt")
    args = p.parse_args()
    reports = {split: inspect(split, args.dataset, args.coco) for split in ("train", "val")}
    overall = "PASS" if all(r["status"] == "PASS" for r in reports.values()) else "FAIL"
    document = {"overall_status": overall, "class_mapping": {str(i): n for i, n in enumerate(NAMES)}, "splits": reports}
    args.json_output.parent.mkdir(parents=True, exist_ok=True)
    args.json_output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = ["YOLO DATASET VERIFICATION", ""]
    for split, r in reports.items():
        lines += [split.upper(), f"Images: {r['image_count']}", f"Labels: {r['label_file_count']}",
                  f"Objects: {r['object_count']}", f"Class distribution: {r['class_distribution']}",
                  f"Invalid labels: {r['invalid_label_count']}", f"Missing labels: {r['missing_label_count']}",
                  f"Orphan labels: {r['orphan_label_count']}", f"Wrong image dimensions: {r['wrong_dimension_count']}",
                  f"COCO conversion mismatches: {r['conversion_mismatch_count']}",
                  f"Unreadable images: {r['unreadable_image_count']}", f"Status: {r['status']}", ""]
    total_classes = {name: sum(r["class_distribution"][name] for r in reports.values()) for name in NAMES}
    lines += ["COMBINED CLASS COUNTS", *(f"{name}: {count}" for name, count in total_classes.items()),
              "", f"OVERALL STATUS: {overall}", "Model training: NOT STARTED"]
    args.text_output.parent.mkdir(parents=True, exist_ok=True)
    args.text_output.write_text("\n".join(lines) + "\n", encoding="utf-8")
    for split, r in reports.items():
        print(f"{split}: images={r['image_count']} labels={r['label_file_count']} objects={r['object_count']} invalid_labels={r['invalid_label_count']} missing_labels={r['missing_label_count']} orphan_labels={r['orphan_label_count']} classes={r['class_distribution']} status={r['status']}")
    print(f"Overall: {overall}\nJSON: {args.json_output}\nTXT: {args.text_output}")


if __name__ == "__main__":
    main()
