from __future__ import annotations

import json
from pathlib import Path

from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "best.pt"
INPUT_DIR = BASE_DIR / "test_images"
OUTPUT_DIR = BASE_DIR / "test_results"
SUPPORTED = {".jpg", ".jpeg", ".png", ".webp"}


def main() -> None:
    INPUT_DIR.mkdir(exist_ok=True)
    OUTPUT_DIR.mkdir(exist_ok=True)

    images = sorted(path for path in INPUT_DIR.iterdir() if path.suffix.lower() in SUPPORTED)
    if not images:
        raise SystemExit(
            "ไม่พบรูปทดสอบ กรุณาใส่ภาพวาดมือ 3–4 รูปใน backend/test_images แล้วรันใหม่"
        )

    model = YOLO(str(MODEL_PATH))
    report = []

    for image_path in images:
        result = model.predict(str(image_path), conf=0.25, verbose=False)[0]
        detections = []
        for box in result.boxes:
            class_id = int(box.cls[0].item())
            names = model.names
            label = names.get(class_id, str(class_id)) if isinstance(names, dict) else names[class_id]
            detections.append(
                {
                    "label": label,
                    "confidence": round(float(box.conf[0].item()), 4),
                    "xyxy": [round(float(value), 2) for value in box.xyxy[0].tolist()],
                }
            )

        report.append(
            {
                "image": image_path.name,
                "count": len(detections),
                "detections": detections,
            }
        )
        print(f"{image_path.name}: {len(detections)} detections")

    report_path = OUTPUT_DIR / "hand_drawn_report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Saved report: {report_path}")


if __name__ == "__main__":
    main()
