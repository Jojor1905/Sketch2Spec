from __future__ import annotations

import json
import os
import subprocess
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

import fitz
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image, ImageOps, UnidentifiedImageError
try:
    from ultralytics import YOLO
except ImportError:  # Keep /health and /docs available before dependencies are installed.
    YOLO = None  # type: ignore[assignment]

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "best.pt"
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_IMAGE_DIMENSION = 2000
SUPPORTED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
JOB_TTL_SECONDS = 30 * 60

app = FastAPI(title="Sketch2Spec AI Detection API", version="3.1")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_model: Any | None = None
_model_lock = threading.Lock()
_job_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="sketch2spec-detect")
_jobs: dict[str, dict[str, Any]] = {}


def get_model() -> Any:
    global _model
    if _model is not None:
        return _model
    if YOLO is None:
        raise RuntimeError("ultralytics is not installed. Run: pip install -r requirements.txt")
    if not MODEL_PATH.exists():
        raise RuntimeError(f"Model file not found: {MODEL_PATH}")
    with _model_lock:
        if _model is None:
            _model = YOLO(str(MODEL_PATH))
    return _model


def _set_job(job_id: str, **updates: Any) -> None:
    with _job_lock:
        job = _jobs.get(job_id)
        if job is None:
            return
        job.update(updates)
        job["updated_at"] = time.time()


def _cleanup_jobs() -> None:
    now = time.time()
    with _job_lock:
        stale = [
            job_id
            for job_id, job in _jobs.items()
            if now - float(job.get("updated_at", now)) > JOB_TTL_SECONDS
        ]
        for job_id in stale:
            _jobs.pop(job_id, None)


@app.get("/")
@app.get("/health")
def health_check() -> dict[str, Any]:
    return {
        "status": "ok" if YOLO is not None and MODEL_PATH.exists() else "degraded",
        "message": "Sketch2Spec detection backend is running",
        "model": MODEL_PATH.name,
        "model_ready": bool(YOLO is not None and MODEL_PATH.exists()),
        "supports": ["jpg", "jpeg", "png", "webp", "pdf-multi-page"],
        "max_upload_mb": MAX_UPLOAD_BYTES // 1024 // 1024,
        "max_image_dimension": MAX_IMAGE_DIMENSION,
    }


@app.post("/pdf/info")
async def pdf_info(file: UploadFile = File(...)) -> dict[str, int]:
    data = await read_upload(file)
    if not is_pdf_upload(data, file.filename, file.content_type):
        raise HTTPException(status_code=400, detail="The uploaded file is not a PDF.")

    try:
        document = fitz.open(stream=data, filetype="pdf")
        try:
            return {"page_count": document.page_count}
        finally:
            document.close()
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=400, detail="The PDF could not be read.") from error


@app.post("/prepare")
async def prepare_floor_plan(
    file: UploadFile = File(...),
    page: int = Query(default=1, ge=1),
) -> StreamingResponse:
    """Normalize an image or convert a selected PDF page into a PNG preview."""
    data = await read_upload(file)
    image = decode_floor_plan(data, file.filename, file.content_type, pdf_page=page)

    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="image/png",
        headers={
            "Content-Disposition": 'inline; filename="floor-plan-preview.png"',
            "X-Image-Width": str(image.width),
            "X-Image-Height": str(image.height),
            "X-PDF-Page": str(page),
        },
    )


@app.post("/detect/jobs", status_code=202)
async def create_detection_job(
    file: UploadFile = File(...),
    confidence: float = Query(default=0.25, ge=0.01, le=0.99),
) -> dict[str, str]:
    """Start a real detection job so the UI can show backend-reported progress."""
    _cleanup_jobs()
    data = await read_upload(file)
    job_id = uuid.uuid4().hex
    now = time.time()
    with _job_lock:
        _jobs[job_id] = {
            "id": job_id,
            "status": "queued",
            "phase": "preparing",
            "progress": 5,
            "message": "Preparing the uploaded floor plan",
            "created_at": now,
            "updated_at": now,
            "result": None,
            "error": None,
        }

    _executor.submit(
        _run_detection_job,
        job_id,
        data,
        file.filename,
        file.content_type,
        confidence,
    )
    return {"job_id": job_id, "status": "queued"}


@app.get("/detect/jobs/{job_id}")
def get_detection_job(job_id: str) -> dict[str, Any]:
    _cleanup_jobs()
    with _job_lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Detection job was not found.")
        return {
            "id": job["id"],
            "status": job["status"],
            "phase": job["phase"],
            "progress": job["progress"],
            "message": job["message"],
            "result": job["result"],
            "error": job["error"],
        }


@app.delete("/detect/jobs/{job_id}")
def delete_detection_job(job_id: str) -> dict[str, bool]:
    with _job_lock:
        removed = _jobs.pop(job_id, None) is not None
    return {"deleted": removed}


@app.post("/detect")
async def detect_floor_plan(
    file: UploadFile = File(...),
    confidence: float = Query(default=0.25, ge=0.01, le=0.99),
) -> dict[str, Any]:
    """Compatibility endpoint for clients that do not use job polling."""
    data = await read_upload(file)
    return run_detection(data, file.filename, file.content_type, confidence)


def _run_detection_job(
    job_id: str,
    data: bytes,
    filename: str | None,
    content_type: str | None,
    confidence: float,
) -> None:
    try:
        _set_job(
            job_id,
            status="running",
            phase="preparing",
            progress=12,
            message="Normalizing image size and orientation",
        )
        image = decode_floor_plan(data, filename, content_type)
        _set_job(
            job_id,
            phase="walls",
            progress=35,
            message="Running wall, door, and window detection",
        )
        result = run_detection_on_image(image, confidence)
        _set_job(
            job_id,
            phase="openings",
            progress=82,
            message="Validating and organizing detected objects",
        )
        layout = build_layout(result["detections"])
        json_path = BASE_DIR / "plan_result.json"
        json_path.write_text(json.dumps(layout, indent=4), encoding="utf-8")
        result["blender"] = maybe_generate_blender()
        _set_job(
            job_id,
            status="complete",
            phase="complete",
            progress=100,
            message="Detection workspace is ready",
            result=result,
        )
    except Exception as error:  # The worker must always expose a readable error to the UI.
        _set_job(
            job_id,
            status="failed",
            phase="error",
            progress=0,
            message="Detection failed",
            error=str(error),
        )


def run_detection(
    data: bytes,
    filename: str | None,
    content_type: str | None,
    confidence: float,
) -> dict[str, Any]:
    image = decode_floor_plan(data, filename, content_type)
    result = run_detection_on_image(image, confidence)
    layout = build_layout(result["detections"])
    (BASE_DIR / "plan_result.json").write_text(
        json.dumps(layout, indent=4), encoding="utf-8"
    )
    result["blender"] = maybe_generate_blender()
    return result


def run_detection_on_image(image: Image.Image, confidence: float) -> dict[str, Any]:
    width, height = image.size

    with NamedTemporaryFile(delete=False, suffix=".jpg") as temp:
        temp_path = Path(temp.name)
        image.save(temp, format="JPEG", quality=95, optimize=True)

    try:
        # Ultralytics model objects are not guaranteed to be safe for concurrent predicts.
        active_model = get_model()
        with _model_lock:
            results = active_model.predict(str(temp_path), conf=confidence, verbose=False)
        names = active_model.names
        detections: list[dict[str, Any]] = []

        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0].item())
                label = names.get(class_id, str(class_id)) if isinstance(names, dict) else names[class_id]
                x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
                detections.append(
                    {
                        "class_id": class_id,
                        "label": label,
                        "confidence": round(float(box.conf[0].item()), 4),
                        "box": {
                            "x1": round(x1, 2),
                            "y1": round(y1, 2),
                            "x2": round(x2, 2),
                            "y2": round(y2, 2),
                            "width": round(x2 - x1, 2),
                            "height": round(y2 - y1, 2),
                        },
                    }
                )

        return {
            "image": {"width": width, "height": height},
            "count": len(detections),
            "detections": detections,
        }
    finally:
        temp_path.unlink(missing_ok=True)


async def read_upload(file: UploadFile) -> bytes:
    data = await file.read()

    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File size exceeds the 25 MB limit.")

    filename = file.filename or "upload"
    suffix = Path(filename).suffix.lower()
    supported = is_pdf_upload(data, filename, file.content_type) or (
        file.content_type in SUPPORTED_IMAGE_TYPES
        or suffix in {".jpg", ".jpeg", ".png", ".webp"}
    )

    if not supported:
        raise HTTPException(status_code=400, detail="Please upload JPG, PNG, WebP, or PDF.")

    return data


def is_pdf_upload(data: bytes, filename: str | None, content_type: str | None) -> bool:
    suffix = Path(filename or "upload").suffix.lower()
    return content_type == "application/pdf" or suffix == ".pdf" or data.startswith(b"%PDF")


def decode_floor_plan(
    data: bytes,
    filename: str | None,
    content_type: str | None,
    pdf_page: int = 1,
) -> Image.Image:
    is_pdf = is_pdf_upload(data, filename, content_type)

    try:
        if is_pdf:
            document = fitz.open(stream=data, filetype="pdf")
            try:
                if document.page_count < 1:
                    raise HTTPException(status_code=400, detail="The PDF does not contain any pages.")
                if pdf_page < 1 or pdf_page > document.page_count:
                    raise HTTPException(
                        status_code=400,
                        detail=f"PDF page must be between 1 and {document.page_count}.",
                    )

                page = document.load_page(pdf_page - 1)
                pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                image = Image.open(BytesIO(pixmap.tobytes("png"))).copy()
            finally:
                document.close()
        else:
            image = Image.open(BytesIO(data))
            image = ImageOps.exif_transpose(image).copy()
    except HTTPException:
        raise
    except (UnidentifiedImageError, ValueError, RuntimeError) as error:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file could not be read as a floor plan image.",
        ) from error

    if image.mode not in {"RGB", "L"}:
        background = Image.new("RGB", image.size, "white")
        if "A" in image.getbands():
            background.paste(image, mask=image.getchannel("A"))
        else:
            background.paste(image)
        image = background
    else:
        image = image.convert("RGB")

    image.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)
    return image


def build_layout(detections: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    layout: dict[str, list[dict[str, Any]]] = {
        "walls": [],
        "doors": [],
        "windows": [],
    }

    for detection in detections:
        item = {
            "bbox": [
                detection["box"]["x1"],
                detection["box"]["y1"],
                detection["box"]["x2"],
                detection["box"]["y2"],
            ],
            "confidence": detection["confidence"],
        }
        label = detection["label"].lower()

        if "wall" in label:
            layout["walls"].append(item)
        elif "door" in label:
            layout["doors"].append(item)
        elif "window" in label:
            layout["windows"].append(item)

    return layout


def maybe_generate_blender() -> dict[str, str]:
    """Run Blender only when explicitly enabled, so detection works on every PC."""
    if os.getenv("GENERATE_BLENDER", "0") != "1":
        return {"status": "skipped", "reason": "GENERATE_BLENDER is disabled"}

    executable_value = os.getenv("BLENDER_EXECUTABLE", "")
    executable = Path(executable_value) if executable_value else None

    if not executable or not executable.exists():
        return {"status": "skipped", "reason": "BLENDER_EXECUTABLE was not found"}

    try:
        completed = subprocess.run(
            [
                str(executable),
                "--background",
                "--python",
                str(BASE_DIR / "generate_blender.py"),
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=180,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"status": "failed", "reason": str(error)}

    if completed.returncode != 0:
        reason = completed.stderr.strip()[-500:] or f"Blender exited with code {completed.returncode}"
        return {"status": "failed", "reason": reason}

    return {"status": "complete", "reason": "Blender model generated"}
