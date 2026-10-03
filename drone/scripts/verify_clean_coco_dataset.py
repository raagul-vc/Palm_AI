#!/usr/bin/env python3
"""Validate both clean COCO splits, their files, dimensions, and annotations."""
import argparse
import json
from collections import Counter
from pathlib import Path

DRONE = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = DRONE / "dataset_clean"


def inspect(split, dataset):
    json_path = dataset / "annotations" / f"instances_{split}_clean.json"
    image_root = dataset / split
    data = json.loads(json_path.read_text(encoding="utf-8"))
    images, anns, cats = data["images"], data["annotations"], data["categories"]
    image_ids = [x.get("id") for x in images]
    annotation_ids = [x.get("id") for x in anns]
    filenames = [x.get("file_name") for x in images]
    duplicate_image_ids = sum(n - 1 for n in Counter(image_ids).values() if n > 1)
    duplicate_annotation_ids = sum(n - 1 for n in Counter(annotation_ids).values() if n > 1)
    duplicate_filenames = sum(n - 1 for n in Counter(filenames).values() if n > 1)
    id_map = {x.get("id"): x for x in images}
    category_map = {x.get("id"): x.get("name") for x in cats}
    missing_refs = sum(a.get("image_id") not in id_map for a in anns)
    unknown_categories = sum(a.get("category_id") not in category_map for a in anns)
    invalid_boxes = 0
    for a in anns:
        im = id_map.get(a.get("image_id"))
        box = a.get("bbox")
        bad = not isinstance(box, list) or len(box) != 4 or im is None
        if not bad:
            try:
                x, y, w, h = map(float, box)
                bad = x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > im["width"] or y + h > im["height"]
            except (TypeError, ValueError, KeyError):
                bad = True
        invalid_boxes += bool(bad)
    missing_files, unreadable, mismatches = [], [], []
    try:
        from PIL import Image
    except ImportError as e:
        raise SystemExit("Pillow is required. Use .\\venv\\Scripts\\python.exe") from e
    resolutions = Counter()
    for record in images:
        file_path = image_root / record["file_name"]
        if not file_path.is_file():
            missing_files.append(record["file_name"])
            continue
        try:
            with Image.open(file_path) as image:
                size = list(image.size)
                resolutions[f"{size[0]}x{size[1]}"] += 1
                if size != [record.get("width"), record.get("height")]:
                    mismatches.append({"file_name": record["file_name"], "json": [record.get("width"), record.get("height")], "actual": size})
        except Exception as e:
            unreadable.append({"file_name": record["file_name"], "error": str(e)})
    per_image = Counter(a.get("image_id") for a in anns)
    without_annotations = sum(not per_image[x.get("id")] for x in images)
    class_counts = Counter(category_map.get(a.get("category_id"), f"UNKNOWN({a.get('category_id')})") for a in anns)
    duplicate_ids = duplicate_image_ids + duplicate_annotation_ids
    passed = not any((missing_files, unreadable, mismatches, missing_refs, invalid_boxes,
                      unknown_categories, duplicate_image_ids, duplicate_annotation_ids,
                      duplicate_filenames, without_annotations))
    report = {
        "split": split, "annotation_file": str(json_path), "image_folder": str(image_root),
        "image_count": len(images), "annotation_count": len(anns), "category_count": len(cats),
        "categories": [{"id": c.get("id"), "name": c.get("name")} for c in cats],
        "class_distribution": dict(class_counts), "actual_image_dimensions": dict(resolutions),
        "missing_image_file_count": len(missing_files), "missing_image_files": missing_files,
        "unreadable_image_count": len(unreadable), "unreadable_images": unreadable,
        "image_dimension_mismatch_count": len(mismatches), "image_dimension_mismatches": mismatches,
        "missing_image_reference_count": missing_refs, "invalid_bbox_count": invalid_boxes,
        "unknown_category_count": unknown_categories, "duplicate_image_id_count": duplicate_image_ids,
        "duplicate_annotation_id_count": duplicate_annotation_ids, "duplicate_id_count": duplicate_ids,
        "duplicate_filename_count": duplicate_filenames,
        "images_with_annotations": len(images) - without_annotations,
        "images_without_annotations": without_annotations, "status": "PASS" if passed else "FAIL",
    }
    print(f"{split}: images={len(images)} annotations={len(anns)} categories={len(cats)} missing_files={len(missing_files)} missing_refs={missing_refs} invalid_boxes={invalid_boxes} unknown_categories={unknown_categories} duplicate_image_ids={duplicate_image_ids} duplicate_annotation_ids={duplicate_annotation_ids} duplicate_filenames={duplicate_filenames} images_without_annotations={without_annotations} status={report['status']}")
    return report


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    p.add_argument("--json-output", type=Path, default=DRONE / "outputs" / "clean_dataset_summary.json")
    p.add_argument("--text-output", type=Path, default=DRONE / "outputs" / "clean_dataset_summary.txt")
    args = p.parse_args()
    reports = {split: inspect(split, args.dataset) for split in ("train2017", "val2017")}
    overall = "PASS" if all(r["status"] == "PASS" for r in reports.values()) else "FAIL"
    document = {"overall_status": overall, "source_context": {
        "train_source_image_records": 3999, "locally_available_train_images": 1803,
        "validation_source_image_records": 500, "locally_available_validation_images": 500,
        "preparation_note": "The source annotation file references 3,999 train images, while the locally available Site 2 train image folder contains 1,803 images. The clean dataset is therefore restricted to the 1,803 physically available images."
    }, "splits": reports}
    args.json_output.parent.mkdir(parents=True, exist_ok=True)
    args.json_output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = ["CLEAN DRONE COCO DATASET VERIFICATION", ""]
    for split, r in reports.items():
        lines += [split.upper(), f"Image folder: {r['image_folder']}", f"Annotation JSON: {r['annotation_file']}",
                  f"Images: {r['image_count']}", f"Annotations: {r['annotation_count']}",
                  f"Categories: {r['categories']}", f"Class distribution: {r['class_distribution']}",
                  f"Actual image dimensions: {r['actual_image_dimensions']}",
                  f"Missing image files: {r['missing_image_file_count']}",te
                  f"Unreadable images: {r['unreadable_image_count']}", f"Dimension mismatches: {r['image_dimension_mismatch_count']}",
                  f"Missing image references: {r['missing_image_reference_count']}", f"Invalid boxes: {r['invalid_bbox_count']}",
                  f"Unknown categories: {r['unknown_category_count']}", f"Duplicate image IDs: {r['duplicate_image_id_count']}",
                  f"Duplicate annotation IDs: {r['duplicate_annotation_id_count']}", f"Duplicate filenames: {r['duplicate_filename_count']}",
                  f"Images with annotations: {r['images_with_annotations']}",
                  f"Images without annotations: {r['images_without_annotations']}", f"Status: {r['status']}", ""]
    lines += [f"OVERALL STATUS: {overall}", "Model training: NOT STARTED"]
    args.text_output.parent.mkdir(parents=True, exist_ok=True)
    args.text_output.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Overall status: {overall}\nJSON: {args.json_output}\nTXT: {args.text_output}")


if __name__ == "__main__":
    main()
