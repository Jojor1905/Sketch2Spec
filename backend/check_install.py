"""Load the included checkpoint and run one CPU prediction before starting the UI."""
from pathlib import Path
import numpy as np
from ultralytics import YOLO

if __name__ == '__main__':
    model_path = Path(__file__).resolve().parent / 'best.pt'
    if not model_path.is_file():
        raise SystemExit(f'Missing model: {model_path}')
    model = YOLO(str(model_path))
    model.predict(np.full((64, 64, 3), 255, dtype=np.uint8), imgsz=64, device='cpu', verbose=False)
    print('Model load and CPU prediction: OK')
