#!/usr/bin/env python3
"""Draw COCO boxes onto a copy of an image (requires Pillow)."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_JSON = Path(r"C:\Users\iRaagul\Downloads\instances_train2017.json")
DEFAULT_IMAGE_ROOT = Path(r"C:\Users\iRaagul\Downloads")
SAMPLE = "44000_4000_16_2592.jpg"
COLORS = [(230, 25, 75), (60, 180, 75), (255, 225, 25), (0, 130, 200), (245, 130, 48), (145, 30, 180)]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--image", default=SAMPLE, help="Image filename or full path")
    p.add_argument("--annotation-json", type=Path, default=DEFAULT_JSON)
    p.add_argument("--image-root", type=Path, default=DEFAULT_IMAGE_ROOT)
    p.add_argument("--output", type=Path)
    args = p.parse_args()
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as e:
        raise SystemExit("Pillow is required for visualization. Install it with: python -m pip install Pillow") from e
    image_path = Path(args.image)
    if not image_path.is_absolute():
        image_path = args.image_root / image_path
    with args.annotation_json.open(encoding="utf-8") as f:
        data = json.load(f)
    image_record = next((i for i in data["images"] if i.get("file_name") == Path(args.image).name), None)
    if image_record is None:
        raise SystemExit(f"Image filename not present in annotation JSON: {Path(args.image).name}")
    if not image_path.is_file():
        raise SystemExit(f"Image file not found: {image_path}")
    categories = {c["id"]: c["name"] for c in data["categories"]}
    annotations = [a for a in data["annotations"] if a.get("image_id") == image_record["id"]]
    with Image.open(image_path) as original:
        canvas = original.convert("RGB")
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    for ann in annotations:
        x, y, w, h = ann["bbox"]
        color = COLORS[(int(ann["category_id"]) - 1) % len(COLORS)]
        draw.rectangle((x, y, x + w, y + h), outline=color, width=3)
        label = categories.get(ann.get("category_id"), f"Unknown {ann.get('category_id')}")
        draw.text((x, max(0, y - 20)), label, fill=color, font=font, stroke_width=1, stroke_fill=(0, 0, 0))
    output = args.output or ROOT / "outputs" / f"{image_path.stem}_annotated.jpg"
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, quality=95)
    print(f"Image filename: {image_record['file_name']}\nImage ID: {image_record['id']}\nImage width: {image_record['width']}\nImage height: {image_record['height']}\nNumber of annotations: {len(annotations)}")
    print("Category names:", ", ".join(categories[a["category_id"]] for a in annotations))
    print("Bounding boxes:")
    for a in annotations:
        print(f"  {categories.get(a['category_id'], a['category_id'])}: {a['bbox']}")
    print(f"Annotated image saved to {output}")


if __name__ == "__main__":
    main()
