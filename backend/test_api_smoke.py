"""Lightweight API smoke tests that do not require the YOLO package to be installed.

Run from the project root:
    python backend/test_api_smoke.py
"""
from __future__ import annotations

import io

import fitz
from fastapi.testclient import TestClient
from PIL import Image

from main import app


def main() -> None:
    client = TestClient(app)

    health = client.get("/health")
    health.raise_for_status()
    assert health.json()["status"] in {"ok", "degraded"}

    image_buffer = io.BytesIO()
    Image.new("RGB", (2500, 1000), "white").save(image_buffer, "PNG")
    prepared_image = client.post(
        "/prepare",
        files={"file": ("sample.png", image_buffer.getvalue(), "image/png")},
    )
    prepared_image.raise_for_status()
    assert prepared_image.headers["x-image-width"] == "2000"
    assert prepared_image.headers["x-image-height"] == "800"

    document = fitz.open()
    for page_number in range(3):
        page = document.new_page(width=300, height=200)
        page.insert_text((30, 70), f"Floor plan page {page_number + 1}")
    pdf_bytes = document.tobytes()
    document.close()

    pdf_info = client.post(
        "/pdf/info",
        files={"file": ("sample.pdf", pdf_bytes, "application/pdf")},
    )
    pdf_info.raise_for_status()
    assert pdf_info.json()["page_count"] == 3

    prepared_pdf = client.post(
        "/prepare?page=2",
        files={"file": ("sample.pdf", pdf_bytes, "application/pdf")},
    )
    prepared_pdf.raise_for_status()
    assert prepared_pdf.headers["x-pdf-page"] == "2"

    print("Sketch2Spec backend smoke tests passed")


if __name__ == "__main__":
    main()
