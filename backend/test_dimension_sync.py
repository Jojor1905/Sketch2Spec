"""A numeric 2D wall edit must reach 3D and undo through the shared project."""
import base64
import json
import time
from io import BytesIO

from PIL import Image
from playwright.sync_api import expect, sync_playwright


image = BytesIO()
Image.new("RGB", (800, 600), "white").save(image, format="PNG")
wall = {
    "id": "wall-dimension", "class_id": 1, "label": "wall", "confidence": 1,
    "box": {"x1": 300, "y1": 300, "x2": 500, "y2": 320, "width": 200, "height": 20},
}
project = {
    "format": "sketch2spec", "version": 1,
    "project": {
        "fileName": "dimension.png", "fileType": "image/png",
        "previewDataUrl": "data:image/png;base64," + base64.b64encode(image.getvalue()).decode(),
        "imageSize": {"width": 800, "height": 600}, "detections": [wall],
        "metersPerPixel": 0.02, "updatedAt": 1,
    },
}


def saved_width(page):
    return page.evaluate("""() => new Promise((resolve, reject) => {
      const request = indexedDB.open('sketch2spec', 1)
      request.onsuccess = () => {
        const db = request.result
        const item = db.transaction('projects').objectStore('projects').get('active')
        item.onsuccess = () => { resolve(item.result?.detections?.[0]?.box?.width ?? null); db.close() }
        item.onerror = () => reject(item.error)
      }
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('IndexedDB open was blocked'))
    })""")


def wait_width(page, expected):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        width = saved_width(page)
        if width is not None and abs(width - expected) < 0.01:
            return
        page.wait_for_timeout(100)
    raise AssertionError(f"Expected wall width {expected}, got {saved_width(page)}")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1500, "height": 1050})
    page.goto("http://localhost:3000/upload")
    page.get_by_label("เปิดไฟล์โปรเจกต์", exact=True).set_input_files({
        "name": "dimension.sketch2spec.json", "mimeType": "application/json",
        "buffer": json.dumps(project).encode(),
    })
    wait_width(page, 200)
    edit = page.get_by_role("button", name="Edit wall length, 4.00 meters")
    expect(edit).to_be_visible()
    edit.click()
    entry = page.get_by_role("spinbutton", name="Wall length in meters")
    entry.fill("4.50")
    entry.press("Enter")
    wait_width(page, 225)
    page.get_by_role("button", name="3D Editor", exact=True).click()
    page.get_by_text("เครื่องมือเพิ่มเติม · จัดแนว แบ่งห้อง เลือกชิ้นงานที่ถูกบัง", exact=True).click()
    page.get_by_label("เลือกวัตถุในโมเดล", exact=True).select_option("wall-dimension")
    expect(page.get_by_role("textbox", name="ความยาว (เมตร)")).to_have_value("4.50")
    page.get_by_title("Undo", exact=True).click()
    wait_width(page, 200)
    page.get_by_role("button", name="2D Review", exact=True).click()
    expect(page.get_by_role("button", name="Edit wall length, 4.00 meters")).to_be_visible()
    page.get_by_role("button", name="3D Editor", exact=True).click()
    page.get_by_text("เครื่องมือเพิ่มเติม · จัดแนว แบ่งห้อง เลือกชิ้นงานที่ถูกบัง", exact=True).click()
    page.get_by_label("เลือกวัตถุในโมเดล", exact=True).select_option("wall-dimension")
    field=page.get_by_role("textbox", name="ความยาว (เมตร)")
    field.fill("4.25")
    field.press("Enter")
    wait_width(page,212.5)
    page.get_by_role("button", name="2D Review", exact=True).click()
    expect(page.get_by_role("button", name="Edit wall length, 4.25 meters")).to_be_visible()
    page.get_by_role("button", name="3D Editor", exact=True).click()
    page.get_by_title("Undo", exact=True).click()
    wait_width(page,200)
    page.get_by_role("button", name="2D Review", exact=True).click()
    expect(page.get_by_role("button", name="Edit wall length, 4.00 meters")).to_be_visible()
    browser.close()
    print("PASS: numeric 2D and 3D wall edits update shared geometry; Undo restores both views")
