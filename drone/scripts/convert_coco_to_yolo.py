#!/usr/bin/env python3
"""Convert the verified clean COCO splits to Ultralytics YOLO detection format."""
import argparse
import json
import math
import shutil
from pathlib import Path

DRONE = Path(__file__).resolve().parents[1]
DEFAULT_COCO = DRONE / "dataset_clean"
DEFAULT_OUTPUT = DRONE / "dataset_yolo"
CLASS_NAMES = ("Dead", "Healthy", "Grass", "Small", "Yellow")
SPLITS = (("train2017", "train"), ("val2017", "val"))


def class_map(categories):
    names = [c.get("name") for c in categories]
    if len(names) != len(CLASS_NAMES) or set(names) != set(CLASS_NAMES) or len(set(names)) != len(names):
        raise ValueError(f"Clean COCO categories must be exactly {list(CLASS_NAMES)}; found {names}")
    ids = [c.get("id") for c in categories]
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate category IDs in clean COCO metadata")
    return {c["id"]: CLASS_NAMES.index(c["name"]) for c in categories}


def yaml_content(output_root):
    # Paths are intentionally project-root-relative for commands run from Palm_AI.
    rel = output_root.resolve().relative_to(DRONE.parent.resolve()).as_posix()
    return (f"path: {rel}\n"
            "train: images/train\n"
            "val: images/val\n"
            "nc: 5\n"
            "names:\n"
            "  0: Dead\n"
            "  1: Healthy\n"
            "  2: Grass\n"
            "  3: Small\n"
            "  4: Yellow\n")


def convert_split(coco_root, output_root, coco_split, yolo_split):
    annotation_path = coco_root / "annotations" / f"instances_{coco_split}_clean.json"
    source_images = coco_root / coco_split
    data = json.loads(annotation_path.read_text(encoding="utf-8"))
    category_ids = class_map(data["categories"])
    images = data["images"]
    by_image = {im["id"]: [] for im in images}
    for ann in data["annotations"]:
        if ann.get("image_id") not in by_image:
            raise ValueError(f"Annotation {ann.get('id')} refers to absent image {ann.get('image_id')}")
        if ann.get("category_id") not in category_ids:
            raise ValueError(f"Annotation {ann.get('id')} has unknown category {ann.get('category_id')}")
        by_image[ann["image_id"]].append(ann)

    dest_images = output_root / "images" / yolo_split
    dest_labels = output_root / "labels" / yolo_split
    dest_images.mkdir(parents=True, exist_ok=True)
    dest_labels.mkdir(parents=True, exist_ok=True)
    class_counts = [0] * len(CLASS_NAMES)
    missing_files = 0
    objects = 0
    seen_stems = set()
    for image in images:
        filename = image["file_name"]
        source = source_images / filename
        if not source.is_file():
            missing_files += 1
            continue
        stem = Path(filename).stem
        if stem in seen_stems:
            raise ValueError(f"Duplicate image filename stem would collide in YOLO labels: {stem}")
        seen_stems.add(stem)
        target_image = dest_images / filename
        if target_image.exists():
            if not target_image.is_file() or not target_image.samefile(source) and target_image.stat().st_size != source.stat().st_size:
                raise FileExistsError(f"Refusing to overwrite conflicting existing image: {target_image}")
            if not target_image.samefile(source):
                import filecmp
                if not filecmp.cmp(source, target_image, shallow=False):
                    raise FileExistsError(f"Refusing to overwrite conflicting existing image: {target_image}")
        else:
            shutil.copy2(source, target_image)
        width, height = image.get("width"), image.get("height")
        if not isinstance(width, (int, float)) or not isinstance(height, (int, float)) or width <= 0 or height <= 0:
            raise ValueError(f"Invalid image dimensions for {filename}: {width}x{height}")
        lines = []
        for ann in by_image[image["id"]]:
            bbox = ann.get("bbox")
            if not isinstance(bbox, list) or len(bbox) != 4:
                raise ValueError(f"Malformed bbox in annotation {ann.get('id')}: {bbox}")
            x, y, box_w, box_h = map(float, bbox)
            if not all(map(math.isfinite, (x, y, box_w, box_h))) or x < 0 or y < 0 or box_w <= 0 or box_h <= 0 or x + box_w > width or y + box_h > height:
                raise ValueError(f"Out-of-bounds bbox in annotation {ann.get('id')}: {bbox} for {filename} ({width}x{height})")
            class_id = category_ids[ann["category_id"]]
            x_center = (x + box_w / 2) / width
            y_center = (y + box_h / 2) / height
            norm_w, norm_h = box_w / width, box_h / height
            values = (x_center, y_center, norm_w, norm_h)
            if not all(math.isfinite(v) and 0 <= v <= 1 for v in values) or norm_w <= 0 or norm_h <= 0:
                raise ValueError(f"Normalization produced invalid values for annotation {ann.get('id')}: {values}")
            lines.append(f"{class_id} {x_center:.10f} {y_center:.10f} {norm_w:.10f} {norm_h:.10f}")
            class_counts[class_id] += 1
            objects += 1
        target_label = dest_labels / f"{stem}.txt"
        content = "\n".join(lines) + ("\n" if lines else "")
        if target_label.exists():
            if target_label.read_text(encoding="utf-8") != content:
                raise FileExistsError(f"Refusing to overwrite a different existing label file: {target_label}")
        else:
            temp = target_label.with_suffix(".txt.tmp")
            temp.write_text(content, encoding="utf-8", newline="\n")
            temp.replace(target_label)
    if missing_files:
        raise FileNotFoundError(f"{coco_split}: {missing_files} clean images are absent")
    return {"image_count": len(images), "label_file_count": len(images), "object_count": objects,
            "class_distribution": dict(zip(CLASS_NAMES, class_counts))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--coco", type=Path, default=DEFAULT_COCO, help="Clean COCO dataset directory")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="YOLO dataset output directory")
    args = parser.parse_args()
    reports = {}
    for coco_split, yolo_split in SPLITS:
        reports[yolo_split] = convert_split(args.coco, args.output, coco_split, yolo_split)
        print(f"{yolo_split}: images={reports[yolo_split]['image_count']} labels={reports[yolo_split]['label_file_count']} objects={reports[yolo_split]['object_count']} classes={reports[yolo_split]['class_distribution']}")
    yaml_path = args.output / "data.yaml"
    expected_yaml = yaml_content(args.output)
    if yaml_path.exists() and yaml_path.read_text(encoding="utf-8") != expected_yaml:
        raise FileExistsError(f"Refusing to overwrite a different data.yaml: {yaml_path}")
    yaml_path.parent.mkdir(parents=True, exist_ok=True)
    if not yaml_path.exists():
        yaml_path.write_text(expected_yaml, encoding="utf-8", newline="\n")
    print(f"YOLO dataset generated at {args.output}\ndata.yaml: {yaml_path}")


if __name__ == "__main__":
    main()
