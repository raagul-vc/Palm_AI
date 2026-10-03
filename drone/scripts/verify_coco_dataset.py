#!/usr/bin/env python3
"""Read-only validation and summary generation for the MOPAD COCO annotations."""
import argparse
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TRAIN = Path(r"C:\Users\iRaagul\Downloads\instances_train2017.json")
DEFAULT_VAL = Path(r"C:\Users\iRaagul\Downloads\instances_val2017.json")
DEFAULT_IMAGES = Path(r"C:\Users\iRaagul\OneDrive\Documents\Airei\Plantation")


def inspect(path, split, image_root=None):
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    issues = []
    for key in ("images", "annotations", "categories"):
        if not isinstance(data.get(key), list):
            raise ValueError(f"{path}: required list '{key}' is missing or invalid")
    images, anns, cats = data["images"], data["annotations"], data["categories"]
    image_ids = [x.get("id") for x in images]
    ann_ids = [x.get("id") for x in anns]
    filenames = [x.get("file_name") for x in images]
    dup_image_ids = sum(n - 1 for n in Counter(image_ids).values() if n > 1)
    dup_ann_ids = sum(n - 1 for n in Counter(ann_ids).values() if n > 1)
    dup_filenames = sum(n - 1 for n in Counter(filenames).values() if n > 1)
    image_map = {x.get("id"): x for x in images}
    category_map = {x.get("id"): x.get("name") for x in cats}
    valid_category_ids = set(category_map)
    missing_image_refs = 0
    invalid_boxes = 0
    unknown_categories = 0
    anns_per_image = Counter()
    images_per_category = {category_map[k]: Counter() for k in category_map}
    for a in anns:
        if a.get("image_id") in image_map:
            anns_per_image[a["image_id"]] += 1
            name = category_map.get(a.get("category_id"))
            if name is not None:
                images_per_category[name][a["image_id"]] += 1
    for a in anns:
        im = image_map.get(a.get("image_id"))
        if im is None:
            missing_image_refs += 1
            issues.append(f"annotation {a.get('id')}: missing image_id {a.get('image_id')}")
        if a.get("category_id") not in valid_category_ids:
            unknown_categories += 1
            issues.append(f"annotation {a.get('id')}: unknown category_id {a.get('category_id')}")
        box = a.get("bbox")
        bad = not isinstance(box, list) or len(box) != 4
        if not bad:
            try:
                x, y, w, h = map(float, box)
                bad = x < 0 or y < 0 or w <= 0 or h <= 0 or (im is not None and (x + w > im.get("width", 0) or y + h > im.get("height", 0)))
            except (TypeError, ValueError):
                bad = True
        if bad:
            invalid_boxes += 1
            issues.append(f"annotation {a.get('id')}: invalid/out-of-bounds bbox {box}")
    resolutions = Counter(f"{i.get('width')}x{i.get('height')}" for i in images)
    annotations_by_category = Counter(category_map.get(a.get("category_id"), f"UNKNOWN({a.get('category_id')})") for a in anns)
    physical_missing = 0
    missing_files = []
    dimension_mismatches = []
    unreadable_images = []
    if image_root:
        try:
            from PIL import Image
        except ImportError as e:
            raise SystemExit("Pillow is required to check actual image dimensions; use the project venv.") from e
        for i in images:
            image_path = image_root / str(i.get("file_name", ""))
            if not image_path.is_file():
                physical_missing += 1
                missing_files.append(i.get("file_name"))
                continue
            try:
                with Image.open(image_path) as im:
                    actual = list(im.size)
                    if actual != [i.get("width"), i.get("height")]:
                        dimension_mismatches.append({"file_name": i.get("file_name"), "json": [i.get("width"), i.get("height")], "actual": actual})
            except Exception as e:
                unreadable_images.append({"file_name": i.get("file_name"), "error": str(e)})
    no_annotations = len(images) - sum(1 for i in images if anns_per_image[i.get("id")])
    ann_counts = [anns_per_image[i.get("id")] for i in images]
    ann_stats = {
        "min": min(ann_counts, default=0), "max": max(ann_counts, default=0),
        "mean": (sum(ann_counts) / len(ann_counts)) if ann_counts else 0,
        "median": (sorted(ann_counts)[len(ann_counts)//2] if len(ann_counts) % 2 else (sorted(ann_counts)[len(ann_counts)//2-1] + sorted(ann_counts)[len(ann_counts)//2]) / 2) if ann_counts else 0,
    }
    report = {
        "split": split, "annotation_file": str(path), "image_root": str(image_root) if image_root else None, "image_count": len(images),
        "annotation_count": len(anns), "category_count": len(cats),
        "categories": [{"id": c.get("id"), "name": c.get("name")} for c in cats],
        "resolution_distribution": dict(resolutions), "annotations_by_category": dict(annotations_by_category),
        "images_by_category": {k: len(v) for k, v in images_per_category.items()},
        "images_with_annotations": len(images) - no_annotations, "images_without_annotations": no_annotations,
        "annotations_per_image": ann_stats,
        "invalid_annotation_count": invalid_boxes + unknown_categories + missing_image_refs,
        "invalid_bbox_count": invalid_boxes, "unknown_category_count": unknown_categories,
        "missing_image_reference_count": missing_image_refs, "duplicate_image_id_count": dup_image_ids,
        "duplicate_annotation_id_count": dup_ann_ids, "duplicate_filename_count": dup_filenames,
        "missing_image_file_count": physical_missing, "missing_image_files": missing_files,
        "image_dimension_mismatch_count": len(dimension_mismatches),
        "image_dimension_mismatches": dimension_mismatches, "unreadable_image_count": len(unreadable_images),
        "unreadable_images": unreadable_images, "issues": issues,
    }
    print(f"\n{split.upper()} — {path}\nImages: {len(images)} | annotations: {len(anns)} | categories: {len(cats)}")
    print("Categories:", ", ".join(f"{c.get('id')}: {c.get('name')}" for c in cats))
    print("Resolutions:", dict(resolutions))
    print("Annotations by category:", dict(annotations_by_category))
    print(f"Invalid boxes: {invalid_boxes}; unknown categories: {unknown_categories}; missing image refs: {missing_image_refs}")
    print(f"Duplicate IDs (images/annotations): {dup_image_ids}/{dup_ann_ids}; duplicate filenames: {dup_filenames}; missing image files: {physical_missing}")
    if issues:
        for issue in issues[:100]:
            print("INVALID:", issue)
        if len(issues) > 100:
            print(f"... {len(issues)-100} more issues")
    return report, data


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--train-json", type=Path, default=DEFAULT_TRAIN)
    p.add_argument("--val-json", type=Path, default=DEFAULT_VAL)
    p.add_argument("--train-images", type=Path, default=DEFAULT_IMAGES / "train2017")
    p.add_argument("--val-images", type=Path, default=DEFAULT_IMAGES / "val2017")
    p.add_argument("--output", type=Path, default=ROOT / "outputs" / "drone_dataset_summary.json")
    p.add_argument("--text-output", type=Path, default=ROOT / "outputs" / "drone_dataset_summary.txt")
    args = p.parse_args()
    reports = {}
    for split, path, imgroot in (("train", args.train_json, args.train_images), ("val", args.val_json, args.val_images)):
        if path is None:
            continue
        if not path.is_file():
            print(f"{split.upper()} JSON NOT FOUND: {path}")
            continue
        reports[split], _ = inspect(path, split, imgroot)
    if not reports:
        raise SystemExit("No annotation JSON files were found.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    failures = any(any(report[key] for key in (
        "missing_image_file_count", "missing_image_reference_count", "invalid_bbox_count",
        "unknown_category_count", "duplicate_image_id_count", "duplicate_annotation_id_count",
        "duplicate_filename_count", "image_dimension_mismatch_count", "unreadable_image_count"))
        for report in reports.values())
    overall = "FAIL" if failures else "PASS"
    document = {"overall_status": overall, "splits": reports}
    args.output.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    lines = ["DRONE DATASET FULL VERIFICATION", ""]
    for split, report in reports.items():
        lines += [split.upper(), f"Annotation JSON: {report['annotation_file']}", f"Image folder: {report.get('image_root', 'not checked')}",
                  f"Images: {report['image_count']}", f"Annotations: {report['annotation_count']}",
                  f"Classes: {', '.join(c['name'] for c in report['categories'])}",
                  f"Resolution distribution (JSON): {report['resolution_distribution']}",
                  f"Annotation count by class: {report['annotations_by_category']}",
                  f"Images per class: {report['images_by_category']}",
                  f"Missing image files: {report['missing_image_file_count']}",
                  f"Missing filename examples: {report['missing_image_files'][:10]}",
                  f"Missing image references: {report['missing_image_reference_count']}",
                  f"Invalid boxes: {report['invalid_bbox_count']}", f"Unknown categories: {report['unknown_category_count']}",
                  f"Duplicate image IDs: {report['duplicate_image_id_count']}",
                  f"Duplicate annotation IDs: {report['duplicate_annotation_id_count']}",
                  f"Duplicate filenames: {report['duplicate_filename_count']}",
                  f"Images with annotations: {report['images_with_annotations']}",
                  f"Images without annotations: {report['images_without_annotations']}",
                  f"Annotations per image (min/median/mean/max): {report['annotations_per_image']}",
                  f"Image dimension mismatches: {report['image_dimension_mismatch_count']}",
                  f"Unreadable image files: {report['unreadable_image_count']}", ""]
    args.text_output.parent.mkdir(parents=True, exist_ok=True)
    lines += [f"OVERALL STATUS: {overall}", "Model training status: NOT STARTED"]
    args.text_output.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nSummary written to {args.output}")
    print(f"Text summary written to {args.text_output}")


if __name__ == "__main__":
    main()
