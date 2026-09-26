"""Focus Mode keeps the project and selection while expanding either editor."""
import base64
import json
from io import BytesIO
from pathlib import Path

from PIL import Image
from playwright.sync_api import expect, sync_playwright


def item(identifier, label, x1, y1, x2, y2):
    return dict(id=identifier, label=label, class_id=1, confidence=1,
                box=dict(x1=x1, y1=y1, x2=x2, y2=y2, width=x2-x1, height=y2-y1))


image = BytesIO()
Image.new("RGB", (400, 400), "white").save(image, format="PNG")
project = dict(format="sketch2spec", version=1, project=dict(
    fileName="focus.png", fileType="image/png",
    previewDataUrl="data:image/png;base64,"+base64.b64encode(image.getvalue()).decode(),
    imageSize=dict(width=400, height=400),
    detections=[item("focus-wall", "wall", 100, 100, 300, 115),
                item("focus-floor", "floor", 115, 115, 285, 285)],
    metersPerPixel=0.02, updatedAt=1,
))
OUT = Path(__file__).parent / "test_results"
OUT.mkdir(exist_ok=True)


def stored(page):
    return page.evaluate("""() => new Promise(resolve => {
      const open=indexedDB.open('sketch2spec',1)
      open.onsuccess=()=>{
        const db=open.result
        const request=db.transaction('projects').objectStore('projects').get('active')
        request.onsuccess=()=>{resolve(request.result?.detections);db.close()}
      }
    })""")


def wait_stored(page, predicate):
    for _ in range(60):
        result = stored(page)
        if result is not None and predicate(result):
            return result
        page.wait_for_timeout(100)
    raise AssertionError("Project state did not reach the expected committed geometry")


def drag(page, locator, dx, dy):
    box = locator.bounding_box()
    assert box, "Drag target is missing"
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + dx, y + dy, steps=6)
    page.mouse.up()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("http://127.0.0.1:3000/upload")
    page.get_by_label("เปิดไฟล์โปรเจกต์", exact=True).set_input_files(dict(
        name="focus.sketch2spec.json", mimeType="application/json",
        buffer=json.dumps(project).encode()))
    page.locator('[data-object-id="focus-wall"]').click()
    expect(page.locator('[data-object-id="focus-wall"]')).to_have_attribute("aria-pressed", "true")
    page.get_by_title("แสดงรายละเอียด", exact=True).click()
    expect(page.get_by_role("heading", name="รายละเอียดวัตถุ")).to_be_visible()
    baseline = None
    for _ in range(50):
        baseline = stored(page)
        if baseline is not None:
            break
        page.wait_for_timeout(100)
    assert baseline is not None, "Imported project was not saved before Focus verification"
    page.get_by_role("button", name="Enter Focus Mode").click()
    expect(page.locator('[data-focus-mode="true"]')).to_be_visible()
    expect(page.get_by_role("toolbar", name="Focus workspace controls")).to_be_visible()
    expect(page.get_by_label("Selected object summary")).to_be_visible()
    expect(page.get_by_role("heading", name="รายละเอียดวัตถุ")).to_have_count(0)
    assert stored(page) == baseline
    page.screenshot(path=str(OUT / "focus-2d.png"), full_page=True)
    page.get_by_role("button", name="Edit details").click()
    expect(page.get_by_role("heading", name="รายละเอียดวัตถุ")).to_be_visible()
    page.evaluate("""() => {
      const input = document.createElement('input')
      input.setAttribute('aria-label', 'Focus shortcut typing probe')
      document.body.appendChild(input)
      input.focus()
    }""")
    page.keyboard.press("f")
    expect(page.locator('[data-focus-mode="true"]')).to_be_visible()
    page.evaluate("document.querySelector('[aria-label=\"Focus shortcut typing probe\"]').remove()")
    page.keyboard.press("Escape")
    expect(page.get_by_role("heading", name="รายละเอียดวัตถุ")).to_have_count(0)
    expect(page.locator('[data-focus-mode="true"]')).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator('[data-focus-mode="false"]')).to_be_visible()
    expect(page.get_by_role("heading", name="รายละเอียดวัตถุ")).to_be_visible()
    expect(page.locator('[data-object-id="focus-wall"]')).to_have_attribute("aria-pressed", "true")
    assert stored(page) == baseline
    print("PASS: 2D Focus hides panels, uses compact details, respects typing and Esc, and preserves state")

    page.get_by_role("button", name="3D Editor", exact=True).click()
    page.get_by_text("เครื่องมือเพิ่มเติม · จัดแนว แบ่งห้อง เลือกชิ้นงานที่ถูกบัง", exact=True).click()
    page.get_by_label("เลือกวัตถุในโมเดล", exact=True).select_option("focus-wall")
    expect(page.get_by_role("textbox", name="ความยาว (เมตร)")).to_be_visible()
    canvas = page.get_by_test_id("editor-3d-canvas")
    before_height = canvas.bounding_box()["height"]
    page.get_by_role("button", name="Enter Focus Mode").click()
    expect(page.get_by_label("Focused selection inspector")).to_be_visible()
    assert canvas.bounding_box()["height"] > before_height and canvas.bounding_box()["height"] > 700
    page.screenshot(path=str(OUT / "focus-3d.png"), full_page=True)
    expect(page.get_by_role("textbox", name="ความยาว (เมตร)")).to_have_count(0)
    page.get_by_role("button", name="Edit details").click()
    expect(page.get_by_role("textbox", name="ความยาว (เมตร)")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.get_by_label("Focused selection inspector")).to_be_visible()
    expect(page.locator('[data-focus-mode="true"]')).to_be_visible()
    page.get_by_role("toolbar", name="Focus workspace controls").get_by_role("button", name="2D Review").click()
    expect(page.get_by_label("Selected object summary")).to_be_visible()
    page.get_by_role("toolbar", name="Focus workspace controls").get_by_role("button", name="3D Editor").click()
    expect(page.get_by_label("Focused selection inspector")).to_be_visible()
    page.set_viewport_size({"width": 768, "height": 1024})
    assert canvas.bounding_box()["height"] > 800
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.set_viewport_size({"width": 1440, "height": 900})
    assert stored(page) == baseline
    print("PASS: 3D Focus expands canvas and uses compact/full inspector without changing geometry")

    page.get_by_role("button", name="Enter Walk Mode").click()
    expect(page.get_by_role("button", name="Start walking")).to_be_visible()
    page.get_by_role("button", name="Start walking").click()
    page.wait_for_function("document.pointerLockElement !== null")
    page.keyboard.press("Escape")
    expect(page.locator('[data-focus-mode="true"]')).to_be_visible()
    expect(page.get_by_role("button", name="Enter Walk Mode")).to_be_visible()
    page.keyboard.press("f")
    expect(page.locator('[data-focus-mode="false"]')).to_be_visible()
    assert stored(page) == baseline
    assert not errors, errors
    print("PASS: Walk runs inside Focus; Esc exits Walk first; F exits Focus; project state stays unchanged")

    page.get_by_role("button", name="2D Review", exact=True).click()
    page.get_by_role("button", name="Enter Focus Mode").click()
    rail = page.get_by_role("navigation", name="Focus editor tools")
    expect(rail).to_be_visible()
    for name in ("Select", "Add wall", "Add door", "Add window", "Materials", "More details"):
        expect(rail.get_by_role("button", name=name)).to_be_visible()
    rail.get_by_role("button", name="Add wall").click()
    wait_stored(page, lambda items: len(items) == 3)
    page.get_by_role("toolbar", name="Focus workspace controls").get_by_role("button", name="Undo").click()
    wait_stored(page, lambda items: len(items) == 2)
    page.get_by_role("toolbar", name="Focus workspace controls").get_by_role("button", name="Redo").click()
    wait_stored(page, lambda items: len(items) == 3)
    page.get_by_role("toolbar", name="Focus workspace controls").get_by_role("button", name="Undo").click()
    wait_stored(page, lambda items: len(items) == 2)
    for label, kind in (("Add door", "door"), ("Add window", "window")):
        rail.get_by_role("button", name=label).click()
        added = wait_stored(page, lambda items: len(items) == 3)
        assert any(item["label"] == kind for item in added)
        page.get_by_role("toolbar", name="Focus workspace controls").get_by_role("button", name="Undo").click()
        wait_stored(page, lambda items: len(items) == 2)
    page.get_by_role("toolbar", name="Focus workspace controls").get_by_role("button", name="Add object").click()
    expect(page.get_by_role("menu", name="Add objects").get_by_role("menuitem", name="Wall")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.get_by_role("menu", name="Add objects")).to_have_count(0)
    expect(page.locator('[data-focus-mode="true"]')).to_be_visible()
    print("PASS: 2D Focus rail adds a wall through canonical history; Undo and Redo work")

    wall = page.locator('[data-object-id="focus-wall"]')
    wall.click(position={"x": 40, "y": 5})
    original = next(item for item in stored(page) if item["id"] == "focus-wall")["box"]
    box = wall.bounding_box()
    page.mouse.move(box["x"] + box["width"] * 0.25, box["y"] + box["height"] / 2)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] * 0.25 + 24, box["y"] + box["height"] / 2 + 14, steps=6)
    page.mouse.up()
    moved = wait_stored(page, lambda items: next(item for item in items if item["id"] == "focus-wall")["box"]["x1"] != original["x1"])
    moved_box = next(item for item in moved if item["id"] == "focus-wall")["box"]
    assert moved_box["width"] == original["width"] and moved_box["height"] == original["height"]
    page.get_by_role("toolbar", name="Focus workspace controls").get_by_role("button", name="Undo").click()
    wait_stored(page, lambda items: next(item for item in items if item["id"] == "focus-wall")["box"] == original)
    box = wall.bounding_box()
    page.mouse.move(box["x"] + box["width"] * 0.25, box["y"] + box["height"] / 2)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] * 0.25 + 22, box["y"] + box["height"] / 2 + 16, steps=5)
    page.keyboard.press("Escape")
    page.mouse.up()
    assert next(item for item in stored(page) if item["id"] == "focus-wall")["box"] == original
    expect(page.locator('[data-focus-mode="true"]')).to_be_visible()

    drag(page, wall.get_by_role("button", name="ปรับปลายกำแพงด้านสิ้นสุด"), 25, 0)
    stretched = wait_stored(page, lambda items: next(item for item in items if item["id"] == "focus-wall")["box"]["width"] > original["width"])
    assert next(item for item in stretched if item["id"] == "focus-wall")["box"]["x1"] == original["x1"]
    page.get_by_role("toolbar", name="Focus workspace controls").get_by_role("button", name="Undo").click()
    wait_stored(page, lambda items: next(item for item in items if item["id"] == "focus-wall")["box"] == original)
    drag(page, wall.get_by_role("button", name="Resize wall thickness, second side"), 0, 18)
    wait_stored(page, lambda items: next(item for item in items if item["id"] == "focus-wall")["box"]["height"] > original["height"])
    page.get_by_role("toolbar", name="Focus workspace controls").get_by_role("button", name="Undo").click()
    wait_stored(page, lambda items: next(item for item in items if item["id"] == "focus-wall")["box"] == original)
    print("PASS: 2D Focus wall body, endpoint, and thickness handles share one-step drag history")

    rail.get_by_role("button", name="Materials").click()
    catalog = page.get_by_label("Focus material catalog")
    expect(catalog).to_be_visible()
    assert page.locator('[data-focus-mode="true"]').count() == 1
    material = catalog.locator('[data-material-id="wall-concrete"]')
    before_preview = wall.get_attribute("style")
    material.hover()
    assert wall.get_attribute("style") != before_preview
    page.mouse.move(700, 750)
    assert wall.get_attribute("style") == before_preview
    material.click()
    wait_stored(page, lambda items: next(item for item in items if item["id"] == "focus-wall").get("materialId") == "wall-concrete")
    expect(page.get_by_label("Selected object summary")).to_contain_text("คอนกรีตเปลือย")
    page.get_by_role("toolbar", name="Focus workspace controls").get_by_role("button", name="Undo").click()
    wait_stored(page, lambda items: next(item for item in items if item["id"] == "focus-wall").get("materialId") != "wall-concrete")
    page.keyboard.press("Escape")
    expect(catalog).to_have_count(0)
    expect(page.locator('[data-focus-mode="true"]')).to_be_visible()
    print("PASS: 2D Focus material hover stays transient; click and Undo update canonical material")

    page.get_by_role("toolbar", name="Focus workspace controls").get_by_role("button", name="3D Editor").click()
    rail = page.get_by_role("navigation", name="Focus editor tools")
    expect(rail.get_by_role("button", name="Add wall")).to_be_visible()
    toolbar = page.get_by_role("toolbar", name="Focus workspace controls")
    expect(toolbar.get_by_role("button", name="Reset camera")).to_be_visible()
    toolbar.get_by_role("button", name="Move", exact=True).click()
    expect(toolbar.get_by_role("button", name="Move", exact=True)).to_have_attribute("aria-pressed", "true")
    toolbar.get_by_role("button", name="Resize", exact=True).click()
    expect(toolbar.get_by_role("button", name="Resize", exact=True)).to_have_attribute("aria-pressed", "true")
    rail.get_by_role("button", name="Materials").click()
    expect(page.get_by_role("searchbox", name="Search materials")).to_be_visible()
    assert page.locator('[data-focus-mode="true"]').count() == 1
    page.keyboard.press("Escape")
    expect(page.get_by_role("searchbox", name="Search materials")).to_have_count(0)
    toolbar.get_by_role("button", name="Top view camera").click()
    expect(toolbar.get_by_role("button", name="Perspective camera")).to_be_visible()
    page.wait_for_timeout(1300)
    toolbar.get_by_role("button", name="Add object").click()
    toolbar.get_by_role("menu", name="Add objects").get_by_role("menuitem", name="Wall").click()
    expect(rail.get_by_role("button", name="Add wall")).to_have_attribute("aria-pressed", "true")
    canvas = page.get_by_test_id("editor-3d-canvas")
    bounds = canvas.bounding_box()
    cx, cy = bounds["x"] + bounds["width"] / 2, bounds["y"] + bounds["height"] / 2
    page.mouse.move(cx - 170, cy - 140)
    page.mouse.down()
    page.mouse.move(cx - 60, cy - 70, steps=8)
    page.mouse.up()
    wait_stored(page, lambda items: len(items) == 3)
    toolbar.get_by_role("button", name="Undo").click()
    wait_stored(page, lambda items: len(items) == 2)
    print("PASS: 3D Focus Add menu draws a wall and Undo removes the gesture")
    toolbar.get_by_role("button", name="Enter Walk Mode").click()
    expect(rail.get_by_role("button", name="Materials")).to_be_visible()
    for name in ("Add wall", "Add door", "Add window", "Move", "Resize"):
        expect(page.get_by_role("button", name=name, exact=True)).to_have_count(0)
    toolbar.get_by_role("button", name="Exit Walk Mode").click()
    expect(rail.get_by_role("button", name="Add wall")).to_be_visible()
    rail.get_by_role("button", name="More tools").click()
    expect(rail.get_by_role("button", name="Draw floor")).to_be_visible()
    page.keyboard.press("Escape")
    expect(rail.get_by_role("button", name="Draw floor")).to_have_count(0)
    expect(page.locator('[data-focus-mode="true"]')).to_be_visible()
    rail.get_by_role("button", name="Select", exact=True).click()
    page.keyboard.press("Escape")
    expect(page.locator('[data-focus-mode="false"]')).to_be_visible()
    assert not errors, errors
    print("PASS: 3D Focus exposes edit/material controls; Walk hides structure; Esc closes More and exits Focus")
    browser.close()
