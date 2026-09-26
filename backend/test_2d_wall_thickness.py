"""2D wall thickness handles and numeric edits share the 3D wall box and history."""
import base64
import json
import time
from io import BytesIO

from PIL import Image
from playwright.sync_api import expect, sync_playwright


def item(identifier, label, x1, y1, x2, y2):
    return dict(id=identifier, label=label, class_id=1, confidence=1,
                box=dict(x1=x1, y1=y1, x2=x2, y2=y2, width=x2-x1, height=y2-y1))


image = BytesIO()
Image.new("RGB", (800, 600), "white").save(image, format="PNG")
initial = [
    item("wall-horizontal", "wall", 200, 180, 500, 200),
    item("wall-vertical", "wall", 600, 100, 620, 400),
    item("wall-door", "door", 270, 180, 310, 200),
    item("wall-window", "window", 360, 180, 410, 200),
]


def project(scale):
    return dict(format="sketch2spec", version=1, project=dict(
        fileName="thickness.png", fileType="image/png",
        previewDataUrl="data:image/png;base64,"+base64.b64encode(image.getvalue()).decode(),
        imageSize=dict(width=800, height=600), detections=initial,
        metersPerPixel=scale, updatedAt=1,
    ))


def saved(page):
    return page.evaluate("""() => new Promise(resolve => {
      const open = indexedDB.open('sketch2spec', 1)
      open.onsuccess = () => {
        const db = open.result
        const request = db.transaction('projects').objectStore('projects').get('active')
        request.onsuccess = () => { resolve(request.result?.detections ?? null); db.close() }
      }
    })""")


def wait_for(page, predicate):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        detections = saved(page)
        if detections is not None and predicate(detections):
            return detections
        page.wait_for_timeout(100)
    raise AssertionError(f"Project state did not reach expected value: {saved(page)}")


def box(detections, identifier):
    return next(item["box"] for item in detections if item["id"] == identifier)


def drag(page, locator, dx, dy, release=True):
    bounds = locator.bounding_box()
    assert bounds, "Resize handle is missing"
    x = bounds["x"] + bounds["width"] / 2
    y = bounds["y"] + bounds["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + dx, y + dy, steps=4)
    if release:
        page.mouse.up()


def centered(before, after, axis):
    first, second = ("y1", "y2") if axis == "y" else ("x1", "x2")
    assert abs((before[first] + before[second]) - (after[first] + after[second])) < 0.01


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1500, "height": 1050})
    page.goto("http://127.0.0.1:3000/upload")
    page.get_by_label("เปิดไฟล์โปรเจกต์", exact=True).set_input_files(dict(
        name="thickness.sketch2spec.json", mimeType="application/json",
        buffer=json.dumps(project(0.01)).encode()))
    wait_for(page, lambda detections: len(detections) == len(initial))
    page.get_by_role("button", name="เพิ่มผนัง").click()
    created = wait_for(page, lambda detections: len(detections) == len(initial) + 1)
    created_id = next(item["id"] for item in created if item["id"] not in {d["id"] for d in initial})
    expect(page.locator(f'[data-object-id="{created_id}"] button[aria-label="Resize wall thickness, first side"]')).to_be_visible()
    expect(page.locator(f'[data-object-id="{created_id}"] button[aria-label="Resize wall thickness, second side"]')).to_be_visible()
    original_thickness = box(created, created_id)["height"]
    drag(page, page.locator(f'[data-object-id="{created_id}"] button[aria-label="Resize wall thickness, second side"]'), 0, 10)
    wait_for(page, lambda detections: box(detections, created_id)["height"] > original_thickness)
    page.get_by_role("button", name="ย้อนกลับการแก้ไขแปลน").click()
    wait_for(page, lambda detections: abs(box(detections, created_id)["height"] - original_thickness) < 0.01)
    original_length = box(created, created_id)["width"]
    page.keyboard.down("Shift")
    drag(page, page.locator(f'[data-object-id="{created_id}"] button[aria-label="ปรับปลายกำแพงด้านสิ้นสุด"]'), 16, 0)
    page.keyboard.up("Shift")
    wait_for(page, lambda detections: box(detections, created_id)["width"] > original_length)
    page.get_by_role("button", name="ย้อนกลับการแก้ไขแปลน").click()
    wait_for(page, lambda detections: abs(box(detections, created_id)["width"] - original_length) < 0.01)
    page.get_by_role("button", name="ย้อนกลับการแก้ไขแปลน").click()
    wait_for(page, lambda detections: len(detections) == len(initial))
    print("PASS TC-2D-WALL-THICK-001: newly added wall exposes two thickness handles")

    page.locator('[data-object-id="wall-horizontal"]').click(position={"x": 25, "y": 8})
    horizontal = box(saved(page), "wall-horizontal")
    handle = page.locator('[data-object-id="wall-horizontal"] button[aria-label="Resize wall thickness, second side"]')
    expect(handle).to_be_visible()
    drag(page, handle, 0, 12)
    changed = wait_for(page, lambda detections: box(detections, "wall-horizontal")["height"] > horizontal["height"])
    thick_horizontal = box(changed, "wall-horizontal")
    centered(horizontal, thick_horizontal, "y")
    assert thick_horizontal["x1"] == horizontal["x1"] and thick_horizontal["x2"] == horizontal["x2"]
    for identifier in ("wall-door", "wall-window"):
        assert box(changed, identifier) == box(initial, identifier)
    page.get_by_role("button", name="ย้อนกลับการแก้ไขแปลน").click()
    wait_for(page, lambda detections: box(detections, "wall-horizontal") == horizontal)
    page.get_by_role("button", name="ทำซ้ำการแก้ไขแปลน").click()
    wait_for(page, lambda detections: box(detections, "wall-horizontal") == thick_horizontal)
    drag(page, handle, 0, -10, release=False)
    page.keyboard.press("Escape")
    page.mouse.up()
    wait_for(page, lambda detections: box(detections, "wall-horizontal") == thick_horizontal)
    page.get_by_role("button", name="ย้อนกลับการแก้ไขแปลน").click()
    wait_for(page, lambda detections: box(detections, "wall-horizontal") == horizontal)
    print("PASS TC-2D-WALL-THICK-002/004/005/006/010: horizontal drag centers, commits once, cancels, and preserves openings")

    page.locator('[data-object-id="wall-vertical"]').click(position={"x": 8, "y": 30})
    vertical = box(saved(page), "wall-vertical")
    drag(page, page.locator('[data-object-id="wall-vertical"] button[aria-label="Resize wall thickness, first side"]'), -12, 0)
    changed = wait_for(page, lambda detections: box(detections, "wall-vertical")["width"] > vertical["width"])
    thick_vertical = box(changed, "wall-vertical")
    centered(vertical, thick_vertical, "x")
    assert thick_vertical["y1"] == vertical["y1"] and thick_vertical["y2"] == vertical["y2"]
    print("PASS TC-2D-WALL-THICK-003/004: vertical drag changes width around the centerline")

    page.locator('[data-object-id="wall-horizontal"]').click(position={"x": 25, "y": 8})
    page.get_by_title("แสดงรายละเอียด", exact=True).click()
    thickness = page.get_by_role("spinbutton", name="Wall thickness in meters")
    expect(thickness).to_be_visible()
    thickness.fill("0.30")
    thickness.press("Enter")
    numeric = wait_for(page, lambda detections: abs(box(detections, "wall-horizontal")["height"] - 30) < 0.01)
    centered(horizontal, box(numeric, "wall-horizontal"), "y")
    expect(page.locator('[data-object-id="wall-horizontal"]')).to_have_attribute("aria-pressed", "true")
    page.get_by_role("button", name="3D Editor", exact=True).click()
    page.get_by_text("เครื่องมือเพิ่มเติม · จัดแนว แบ่งห้อง เลือกชิ้นงานที่ถูกบัง", exact=True).click()
    page.get_by_label("เลือกวัตถุในโมเดล", exact=True).select_option("wall-horizontal")
    field = page.get_by_role("textbox", name="เซนติเมตร")
    expect(field).to_have_value("30")
    field.fill("25")
    field.press("Enter")
    from_3d = wait_for(page, lambda detections: abs(box(detections, "wall-horizontal")["height"] - 25) < 0.01)
    centered(horizontal, box(from_3d, "wall-horizontal"), "y")
    for identifier in ("wall-door", "wall-window"):
        assert box(from_3d, identifier)["x1"] == box(initial, identifier)["x1"]
        assert box(from_3d, identifier)["x2"] == box(initial, identifier)["x2"]
    page.get_by_role("button", name="2D Review", exact=True).click()
    assert page.locator('[data-object-id="wall-horizontal"]').count() == 1
    assert abs(box(saved(page), "wall-horizontal")["height"] - 25) < 0.01
    page.get_by_role("button", name="ย้อนกลับการแก้ไขแปลน").click()
    wait_for(page, lambda detections: abs(box(detections, "wall-horizontal")["height"] - 30) < 0.01)
    print("PASS TC-2D-WALL-THICK-007/008/009/010: meter edit syncs to 3D; 3D edit syncs to 2D; openings remain longitudinally fixed")

    unscaled = browser.new_page(viewport={"width": 1400, "height": 900})
    unscaled.goto("http://127.0.0.1:3000/upload")
    unscaled.get_by_label("เปิดไฟล์โปรเจกต์", exact=True).set_input_files(dict(
        name="unscaled.sketch2spec.json", mimeType="application/json",
        buffer=json.dumps(project(None)).encode()))
    unscaled.locator('[data-object-id="wall-horizontal"]').click(position={"x": 25, "y": 8})
    unscaled.get_by_title("แสดงรายละเอียด", exact=True).click()
    expect(unscaled.get_by_role("spinbutton", name="Wall thickness in pixels")).to_be_visible()
    expect(unscaled.get_by_text("Set scale to edit real dimensions.", exact=False)).to_be_visible()
    assert not unscaled.get_by_role("spinbutton", name="Wall thickness in meters").count()
    browser.close()
    print("PASS: uncalibrated inspector uses pixels and does not present a fabricated meter value")
