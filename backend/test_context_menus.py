"""3D object menus route actions through the existing selection, materials, and history."""
import base64
import json
import time
from io import BytesIO

from PIL import Image
from playwright.sync_api import expect, sync_playwright


def item(identifier, label, x1, y1, x2, y2, **extra):
    return dict(id=identifier, label=label, class_id=1, confidence=1,
                box=dict(x1=x1, y1=y1, x2=x2, y2=y2, width=x2-x1, height=y2-y1), **extra)


image = BytesIO()
Image.new("RGB", (500, 500), "white").save(image, format="PNG")
project = dict(format="sketch2spec", version=1, project=dict(
    fileName="context.png", fileType="image/png",
    previewDataUrl="data:image/png;base64," + base64.b64encode(image.getvalue()).decode(),
    imageSize=dict(width=500, height=500), metersPerPixel=.02, updatedAt=1,
    detections=[
        item("context-floor", "floor", 70, 70, 430, 430, roomName="Living Room"),
        item("context-wall", "wall", 70, 70, 430, 82),
        item("context-sofa", "furniture", 220, 220, 335, 267,
             furnitureCatalogId="linen-sofa", objectHeightM=.84),
    ]))


def stored(page):
    return page.evaluate("""() => new Promise(resolve => {
      const open=indexedDB.open('sketch2spec',1)
      open.onsuccess=()=>{
        const db=open.result
        const request=db.transaction('projects').objectStore('projects').get('active')
        request.onsuccess=()=>{resolve(request.result?.detections ?? null);db.close()}
      }
    })""")


def wait_stored(page, predicate):
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        result = stored(page)
        if result is not None and predicate(result):
            return result
        page.wait_for_timeout(100)
    raise AssertionError(f"State did not match: {stored(page)}")


def click_surface(page, canvas, name, coordinates):
    menu = page.get_by_role("menu", name=name)
    for x, y in coordinates:
        bounds = canvas.bounding_box()
        page.mouse.click(bounds["x"] + bounds["width"] * x,
                         bounds["y"] + bounds["height"] * y)
        page.wait_for_timeout(700)
        if menu.count() and menu.is_visible():
            return
    raise AssertionError(f"Direct 3D click did not select {name}")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport=dict(width=1500, height=1000))
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("http://127.0.0.1:3000/upload")
    page.get_by_label("เปิดไฟล์โปรเจกต์", exact=True).set_input_files(dict(
        name="context.sketch2spec.json", mimeType="application/json",
        buffer=json.dumps(project).encode()))
    wait_stored(page, lambda detections: len(detections) == 3)
    page.get_by_role("button", name="3D Editor", exact=True).click()
    page.get_by_role("button", name="แบบแปลน", exact=True).click()
    page.wait_for_timeout(900)
    canvas = page.get_by_test_id("editor-3d-canvas")
    bounds = canvas.bounding_box()
    page.mouse.click(bounds["x"] + bounds["width"] * .53, bounds["y"] + bounds["height"] * .5)
    expect(page.get_by_role("menu", name="Furniture actions")).to_be_visible()
    page.get_by_text("เครื่องมือเพิ่มเติม · จัดแนว แบ่งห้อง เลือกชิ้นงานที่ถูกบัง", exact=True).click()
    selector = page.get_by_label("เลือกวัตถุในโมเดล", exact=True)

    selector.select_option("context-sofa")
    furniture_menu = page.get_by_role("menu", name="Furniture actions")
    expect(furniture_menu).to_be_visible()
    for name in ["Move", "Rotate", "Resize", "Duplicate", "Hide", "Delete", "Paint"]:
        expect(furniture_menu.get_by_role("menuitem", name=name)).to_be_visible()
    expect(furniture_menu.get_by_role("menuitemcheckbox", name="Favorite")).to_be_visible()
    furniture_menu.get_by_role("menuitemcheckbox", name="Favorite").click()
    wait_stored(page, lambda items: next(item for item in items if item["id"] == "context-sofa").get("favorite") is True)
    furniture_menu.get_by_role("menuitem", name="Rotate").click()
    furniture_menu.get_by_role("button", name="Rotate right 15 degrees").click()
    wait_stored(page, lambda items: abs((next(item for item in items if item["id"] == "context-sofa").get("furnitureRotationY") or 0) - .261799) < .001)
    furniture_menu.get_by_role("menuitem", name="Paint").click()
    expect(page.get_by_text("Furniture Materials", exact=True)).to_be_visible()
    furniture_menu.get_by_role("menuitem", name="Duplicate").click()
    wait_stored(page, lambda items: len(items) == 4)
    page.get_by_title("Undo", exact=True).click()
    wait_stored(page, lambda items: len(items) == 3)
    print("PASS: furniture menu actions use canonical selection and history", flush=True)

    selector.select_option("")
    click_surface(page, canvas, "Wall actions", [(.5, .26), (.5, .27), (.5, .25), (.48, .28), (.52, .28)])
    selector.select_option("context-wall")
    wall_menu = page.get_by_role("menu", name="Wall actions")
    expect(wall_menu).to_be_visible()
    expect(wall_menu.get_by_role("menuitem", name="Paint")).to_be_visible()
    expect(wall_menu.get_by_role("menuitem", name="Move")).to_have_count(0)
    wall_menu.get_by_role("menuitem", name="Paint").click()
    expect(page.get_by_text("Wall Materials", exact=True)).to_be_visible()
    before = stored(page)
    swatch = page.get_by_role("button", name="คอนกรีตเปลือย", exact=False).first
    swatch.hover()
    assert stored(page) == before, "Hover must not commit a material"
    page.mouse.move(2, 2)
    assert stored(page) == before, "Leaving material must restore committed state"
    swatch.click()
    applied = wait_stored(page, lambda items: next(item for item in items if item["id"] == "context-wall").get("materialId") == "wall-concrete")
    page.get_by_title("Undo", exact=True).click()
    wait_stored(page, lambda items: items == before)
    print("PASS: wall Paint opens Wall Materials; preview, apply, and Undo work", flush=True)

    selector.select_option("")
    click_surface(page, canvas, "Floor actions", [(.44, .61), (.43, .66), (.46, .72), (.48, .75)])
    selector.select_option("context-floor")
    floor_menu = page.get_by_role("menu", name="Floor actions")
    expect(floor_menu).to_be_visible()
    expect(floor_menu.get_by_role("menuitem", name="Duplicate")).to_have_count(0)
    floor_menu.get_by_role("menuitem", name="Paint").click()
    expect(page.get_by_text("Floor Materials", exact=True)).to_be_visible()
    expect(floor_menu.get_by_text("Living Room Floor")).to_be_visible()
    floor_menu.get_by_role("menuitem", name="Hide").click()
    wait_stored(page, lambda items: next(item for item in items if item["id"] == "context-floor").get("hiddenInEditor") is True)
    page.get_by_title("Undo", exact=True).click()
    wait_stored(page, lambda items: not next(item for item in items if item["id"] == "context-floor").get("hiddenInEditor"))
    page.get_by_title("Redo", exact=True).click()
    wait_stored(page, lambda items: next(item for item in items if item["id"] == "context-floor").get("hiddenInEditor") is True)
    hidden = page.get_by_label("Hidden objects")
    hidden.locator("summary").click()
    hidden.get_by_role("button", name="Show floor").click()
    wait_stored(page, lambda items: not next(item for item in items if item["id"] == "context-floor").get("hiddenInEditor"))
    print("PASS: floor Paint targets Floor Materials; Hide is reversible", flush=True)

    selector.select_option("")
    expect(page.get_by_role("menu", name="Floor actions")).to_have_count(0)
    selector.select_option("context-wall")
    page.get_by_role("button", name="Walk", exact=True).first.click()
    expect(page.get_by_role("menu", name="Wall actions").get_by_role("menuitem", name="Paint")).to_be_visible()
    expect(page.get_by_role("menu", name="Wall actions").get_by_role("menuitem", name="Hide")).to_have_count(0)
    assert not errors, errors
    print("PASS: Walk offers Paint without structural actions", flush=True)
    browser.close()
