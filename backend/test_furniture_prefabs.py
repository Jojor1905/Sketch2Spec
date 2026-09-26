"""Catalog furniture uses local GLBs, shared project geometry, and undo history."""
import base64
import json
import time
from io import BytesIO
from pathlib import Path

from PIL import Image
from playwright.sync_api import expect, sync_playwright


image = BytesIO()
Image.new("RGB", (600, 500), "white").save(image, format="PNG")
floor = dict(id="furniture-floor", label="floor", class_id=1, confidence=1,
             box=dict(x1=20, y1=20, x2=580, y2=480, width=560, height=460))
project = dict(format="sketch2spec", version=1, project=dict(
    fileName="furniture.png", fileType="image/png",
    previewDataUrl="data:image/png;base64," + base64.b64encode(image.getvalue()).decode(),
    imageSize=dict(width=600, height=500), detections=[floor], metersPerPixel=.02, updatedAt=1))


def saved(page):
    return page.evaluate("""() => new Promise(resolve => {
      const open=indexedDB.open('sketch2spec',1)
      open.onsuccess=()=>{
        const db=open.result
        const request=db.transaction('projects').objectStore('projects').get('active')
        request.onsuccess=()=>{resolve(request.result?.detections ?? null);db.close()}
      }
    })""")


def wait_saved(page, predicate):
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        current = saved(page)
        if current is not None and predicate(current):
            return current
        page.wait_for_timeout(100)
    raise AssertionError(f"Project state did not reach expected furniture value: {saved(page)}")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport=dict(width=1500, height=1000))
    errors = []
    model_responses = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("response", lambda response: model_responses.append((response.url, response.status)) if "/furniture/models/" in response.url else None)
    page.goto("http://127.0.0.1:3000/upload")
    page.get_by_label("เปิดไฟล์โปรเจกต์", exact=True).set_input_files(dict(
        name="furniture.sketch2spec.json", mimeType="application/json",
        buffer=json.dumps(project).encode()))
    wait_saved(page, lambda detections: len(detections) == 1)
    page.get_by_role("button", name="3D Editor", exact=True).click()
    page.get_by_role("button", name="แบบแปลน", exact=True).click()
    page.get_by_role("button", name="More tools").click()
    page.get_by_role("button", name="Add furniture").click()
    expect(page.get_by_role("complementary", name="Furniture Catalog")).to_be_visible()
    expect(page.get_by_role("button", name="Place Linen Sofa")).to_be_visible()
    page.get_by_role("button", name="Place Linen Sofa").click()
    expect(page.get_by_role("button", name="Change furniture piece")).to_be_visible()
    canvas = page.get_by_test_id("editor-3d-canvas")
    bounds = canvas.bounding_box()
    page.mouse.click(bounds["x"] + bounds["width"] * .53, bounds["y"] + bounds["height"] * .55)
    placed = wait_saved(page, lambda detections: len(detections) == 2)
    sofa = next(item for item in placed if item["label"] == "furniture")
    assert sofa["furnitureCatalogId"] == "linen-sofa"
    assert abs(sofa["box"]["width"] * .02 - 2.3) < .01
    assert abs(sofa["box"]["height"] * .02 - .94) < .01
    assert sofa["objectHeightM"] == .84
    page.wait_for_timeout(1000)
    out = Path(__file__).parent / "test_results"
    out.mkdir(exist_ok=True)
    page.screenshot(path=str(out / "furniture-prefab.png"), full_page=True)
    page.get_by_role("button", name="3D", exact=True).click()
    page.screenshot(path=str(out / "furniture-prefab-perspective.png"), full_page=True)
    assert any(status == 200 and url.endswith("linen-sofa.glb") for url, status in model_responses), model_responses
    assert not errors, errors
    print("PASS: catalog placement loads local sofa GLB at real dimensions on the floor")

    page.get_by_text("เครื่องมือเพิ่มเติม · จัดแนว แบ่งห้อง เลือกชิ้นงานที่ถูกบัง", exact=True).click()
    page.get_by_label("เลือกวัตถุในโมเดล", exact=True).select_option(sofa["id"])
    inspector = page.get_by_label("Furniture properties")
    expect(inspector).to_be_visible()
    expect(inspector.get_by_text("2.30 m")).to_be_visible()
    rotation = inspector.get_by_role("spinbutton", name="Furniture rotation in degrees")
    rotation.fill("45")
    rotation.press("Enter")
    rotated = wait_saved(page, lambda detections: abs(next(item for item in detections if item["id"] == sofa["id"])["furnitureRotationY"] - .785398) < .001)
    scale = inspector.get_by_role("spinbutton", name="Furniture scale")
    scale.fill("1.20")
    scale.press("Enter")
    scaled = wait_saved(page, lambda detections: abs(next(item for item in detections if item["id"] == sofa["id"])["box"]["width"] * .02 - 2.76) < .01)
    scaled_sofa = next(item for item in scaled if item["id"] == sofa["id"])
    assert abs(scaled_sofa["objectHeightM"] - 1.008) < .001
    inspector.get_by_role("button", name="Duplicate", exact=True).click()
    duplicated = wait_saved(page, lambda detections: len(detections) == 3)
    duplicate = next(item for item in duplicated if item["label"] == "furniture" and item["id"] != sofa["id"])
    assert duplicate["furnitureCatalogId"] == "linen-sofa"
    page.get_by_title("Undo", exact=True).click()
    wait_saved(page, lambda detections: len(detections) == 2)
    page.get_by_title("Redo", exact=True).click()
    wait_saved(page, lambda detections: len(detections) == 3)
    page.get_by_label("เลือกวัตถุในโมเดล", exact=True).select_option(duplicate["id"])
    expect(inspector).to_be_visible()
    inspector.get_by_role("button", name="Delete", exact=True).click()
    wait_saved(page, lambda detections: len(detections) == 2)
    page.get_by_title("Undo", exact=True).click()
    wait_saved(page, lambda detections: len(detections) == 3)
    print("PASS: 3D rotation, scaling, duplicate, delete, and undo/redo share furniture state")
    browser.close()
