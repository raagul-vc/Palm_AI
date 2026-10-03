#!/usr/bin/env python3
"""Create a clean COCO subset containing only source images physically available."""
import argparse
import json
import shutil
from pathlib import Path

DRONE = Path(__file__).resolve().parents[1]
DEFAULT_TRAIN_JSON = Path(r"C:\Users\iRaagul\Downloads\instances_train2017.json")
DEFAULT_VAL_JSON = Path(r"C:\Users\iRaagul\Downloads\instances_val2017.json")
DEFAULT_SOURCE = Path(r"C:\Users\iRaagul\OneDrive\Documents\Airei\Plantation")
DEFAULT_DEST = DRONE / "dataset_clean"


def prepare_split(json_path, image_root, dest_root, split, require_complete=False):
    with json_path.open(encoding="utf-8") as f:
        source = json.load(f)
    images = source["images"]
    present = [i for i in images if (image_root / i["file_name"]).is_file()]
    missing = [i["file_name"] for i in images if not (image_root / i["file_name"]).is_file()]
    if require_complete and missing:
        raise SystemExit(f"{split}: refusing to prepare; {len(missing)} JSON-listed images are missing")
    ids = {i["id"] for i in present}
    annotations = [a for a in source["annotations"] if a.get("image_id") in ids]
    out_images = dest_root / split
    out_images.mkdir(parents=True)
    for record in present:
        src = image_root / record["file_name"]
        dst = out_images / record["file_name"]
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    clean = dict(source)
    clean["images"] = present
    clean["annotations"] = annotations
    json_out = dest_root / "annotations" / f"instances_{split}_clean.json"
    json_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps(clean, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{split}: source image records={len(images)}, files present={len(present)}, omitted records={len(missing)}, retained annotations={len(annotations)}")
    return len(present), len(missing)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--train-json", type=Path, default=DEFAULT_TRAIN_JSON)
    p.add_argument("--val-json", type=Path, default=DEFAULT_VAL_JSON)
    p.add_argument("--train-images", type=Path, default=DEFAULT_SOURCE / "train2017")
    p.add_argument("--val-images", type=Path, default=DEFAULT_SOURCE / "val2017")
    p.add_argument("--output", type=Path, default=DEFAULT_DEST)
    args = p.parse_args()
    if args.output.exists():
        raise SystemExit(f"Refusing to overwrite existing clean dataset directory: {args.output}")
    if not args.train_json.is_file() or not args.val_json.is_file():
        raise SystemExit("Both source annotation JSON files must exist")
    args.output.mkdir(parents=True)
    try:
        train_count, train_missing = prepare_split(args.train_json, args.train_images, args.output, "train2017")
        val_count, val_missing = prepare_split(args.val_json, args.val_images, args.output, "val2017", require_complete=True)
    except Exception:
        # Keep partial work for inspection; do not delete user data automatically.
        raise
    print(f"Clean dataset created at {args.output}; train={train_count} (source omissions={train_missing}), val={val_count} (source omissions={val_missing})")


if __name__ == "__main__":
    main()
