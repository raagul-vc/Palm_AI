#!/usr/bin/env python3
"""Create reproducible random annotated image samples from both clean splits."""
import argparse
import json
import random
from pathlib import Path

DRONE = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = DRONE / "dataset_clean"
DEFAULT_OUTPUT = DRONE / "outputs" / "visualizations"
COLORS = [(230, 25, 75), (60, 180, 75), (255, 225, 25), (0, 130, 200), (245, 130, 48), (145, 30, 180)]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    p.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--per-split", type=int, default=3)
    p.add_argument("--seed", type=int, default=20260930)
    args = p.parse_args()
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as e:
        raise SystemExit("Pillow is required. Use .\\venv\\Scripts\\python.exe") from e
    rng = random.Random(args.seed)
    args.output.mkdir(parents=True, exist_ok=True)
    outputs = []
    for split in ("train2017", "val2017"):
        data = json.loads((args.dataset / "annotations" / f"instances_{split}_clean.json").read_text(encoding="utf-8"))
        cats = {c["id"]: c["name"] for c in data["categories"]}
        ann_map = {}
        for a in data["annotations"]:
            ann_map.setdefault(a["image_id"], []).append(a)
        candidates = [i for i in data["images"] if ann_map.get(i["id"]) and (args.dataset / split / i["file_name"]).is_file()]
        if len(candidates) < args.per_split:
            raise SystemExit(f"{split}: only {len(candidates)} annotated image files available")
        samples = rng.sample(candidates, args.per_split)
        for record in samples:
            image_path = args.dataset / split / record["file_name"]
            with Image.open(image_path) as source:
                canvas = source.convert("RGB")
            draw = ImageDraw.Draw(canvas)
            try:
                font = ImageFont.truetype("arial.ttf", 18)
                title_font = ImageFont.truetype("arial.ttf", 18)
            except OSError:
                font = ImageFont.load_default()
                title_font = font
            draw.rectangle((0, 0, canvas.width, 27), fill=(20, 20, 20))
            draw.text((6, 4), record["file_name"], fill=(255, 255, 255), font=title_font)
            for a in ann_map[record["id"]]:
                x, y, w, h = a["bbox"]
                color = COLORS[(int(a["category_id"]) - 1) % len(COLORS)]
                draw.rectangle((x, y, x + w, y + h), outline=color, width=3)
                draw.text((x, max(28, y - 20)), cats[a["category_id"]], fill=color, font=font,
                          stroke_width=1, stroke_fill=(0, 0, 0))
            out = args.output / f"{split}_{Path(record['file_name']).stem}_annotated.jpg"
            canvas.save(out, quality=95)
            outputs.append({"split": split, "source_filename": record["file_name"], "image_id": record["id"],
                            "annotation_count": len(ann_map[record["id"]]), "output": str(out)})
            print(f"{split}: {record['file_name']} ({len(ann_map[record['id']])} boxes) -> {out}")
    manifest = args.output / "visualization_manifest.json"
    manifest.write_text(json.dumps({"seed": args.seed, "samples": outputs}, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(outputs)} visualizations. Manifest: {manifest}")


if __name__ == "__main__":
    main()
