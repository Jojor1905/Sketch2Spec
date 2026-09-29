"""Real pointer regression checks for the 3D editor on localhost:3000.
Uses an isolated Chrome profile and a small deterministic imported project.
Run: backend/.venv/bin/python backend/test_3d_interactions.py
"""
import base64
import json
from io import BytesIO
from PIL import Image
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUT = Path(__file__).parent / 'test_results'
OUT.mkdir(exist_ok=True)
READ = """() => new Promise((resolve,reject)=>{const r=indexedDB.open('sketch2spec',1);r.onsuccess=()=>{const db=r.result;const q=db.transaction('projects').objectStore('projects').get('active');q.onsuccess=()=>{db.close();resolve(q.result)};q.onerror=()=>reject(q.error)};r.onerror=()=>reject(r.error)})"""

def saved(page): return page.evaluate(READ)['detections']
def wait_saved(page, predicate):
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        result=saved(page)
        if predicate(result): return result
        page.wait_for_timeout(100)
    page.screenshot(path=str(OUT/'3d-failure.png'),full_page=True)
    raise AssertionError(f'Stored data did not reach expected state: {result}')

def report(s): print('PASS:',s,flush=True)

wall = {
    'id': 'test-wall', 'class_id': 1, 'label': 'wall', 'confidence': 1,
    'box': {'x1': 303, 'y1': 303, 'x2': 503, 'y2': 323, 'width': 200, 'height': 20},
}
fixture = BytesIO()
Image.new('RGB', (800, 600), 'white').save(fixture, format='PNG')
project = {
    'format': 'sketch2spec', 'version': 1,
    'project': {
        'fileName': '3d-regression.png', 'fileType': 'image/png',
        'previewDataUrl': 'data:image/png;base64,' + base64.b64encode(fixture.getvalue()).decode(),
        'imageSize': {'width': 800, 'height': 600}, 'detections': [wall],
        'metersPerPixel': 0.02, 'updatedAt': 1,
    },
}

with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True,timeout=30000)
    page=browser.new_page(viewport={'width':1500,'height':1100})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:3000/upload')
    uploader=page.get_by_label('เปิดไฟล์โปรเจกต์',exact=True)
    expect(page.get_by_role('button',name='เปิดโปรเจกต์',exact=True)).to_be_enabled()
    page.wait_for_timeout(700)
    uploader.set_input_files({'name':'3d.sketch2spec.json','mimeType':'application/json','buffer':json.dumps(project).encode()})
    page.wait_for_timeout(1500)
    page.get_by_role('button',name='3D Editor',exact=True).click()
    page.get_by_role('button',name='แบบแปลน',exact=True).click()
    canvas=page.locator('canvas')
    expect(canvas).to_be_visible()
    page.wait_for_timeout(2500)
    canvas.scroll_into_view_if_needed()
    page.wait_for_timeout(700)
    bounds=canvas.bounding_box()
    cx=bounds['x']+bounds['width']/2
    cy=bounds['y']+bounds['height']/2
    page.locator('select[title="ใช้กับการวาด การย่อ-ขยาย และการขยับด้วยเครื่องมือเลือก"]').select_option('grid')
    page.mouse.click(cx+2,cy+8)
    page.wait_for_timeout(700)
    expect(page.get_by_role('button',name='แก้ขนาด',exact=True)).to_be_visible()
    expect(page.get_by_title('Undo',exact=True)).to_be_disabled()
    assert saved(page)[0]['box']==wall['box']
    report('selection with grid snapping does not move object or add undo entry')
    page.screenshot(path=str(OUT/'3d-interactions.png'),full_page=True)
    assert page.evaluate('([x,y])=>document.elementFromPoint(x,y).tagName',[cx+2,cy+8])=='CANVAS'
    page.mouse.move(cx+2,cy+8)
    page.mouse.down()
    page.mouse.move(cx+42,cy+38,steps=8)
    page.mouse.up()
    moved=wait_saved(page,lambda d:d[0]['box']!=wall['box'])
    assert moved[0]['box']['width']==200
    expect(page.get_by_title('Undo',exact=True)).to_be_enabled()
    report('wall drag commits translated box')
    page.get_by_title('Undo',exact=True).click()
    wait_saved(page,lambda d:d[0]['box']==wall['box'])
    page.get_by_title('Redo',exact=True).click()
    wait_saved(page,lambda d:d[0]['box']==moved[0]['box'])
    page.get_by_title('Undo',exact=True).click()
    wait_saved(page,lambda d:d[0]['box']==wall['box'])
    report('drag undo and redo restore exact coordinates')
    for cancel in ['Escape','pointercancel','blur']:
        page.mouse.move(cx+2,cy+8)
        page.mouse.down()
        page.mouse.move(cx+42,cy+38,steps=8)
        wait_saved(page,lambda d:d[0]['box']!=wall['box'])
        if cancel=='Escape': page.keyboard.press('Escape')
        elif cancel=='pointercancel': page.evaluate("window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1}))")
        else: page.evaluate("window.dispatchEvent(new Event('blur'))")
        page.mouse.up()
        page.wait_for_timeout(400)
        assert saved(page)[0]['box']==wall['box']
        expect(page.get_by_title('Undo',exact=True)).to_be_disabled()
        report(cancel+' rolls back active drag without history entry')
    # The endpoint sphere extends past the wall silhouette in top view.
    for shift in [True,False]:
        # Locate the actual resize target after responsive camera fitting.
        endpoint = None
        for dx in range(60, 85):
            page.mouse.move(cx+dx,cy+8)
            page.wait_for_timeout(25)
            if page.evaluate("document.body.style.cursor") == 'ew-resize':
                endpoint = cx+dx
                break
        assert endpoint is not None, 'Wall endpoint must be reachable with the mouse'
        page.mouse.move(endpoint,cy+8)
        if shift: page.keyboard.down('Shift')
        page.mouse.down()
        page.mouse.move(cx+106,cy+8,steps=8)
        page.mouse.up()
        if shift: page.keyboard.up('Shift')
        resized=wait_saved(page,lambda d:d[0]['box']['width']>201)[0]['box']
        assert resized['x1']==303 and resized['height']==20, resized
        if shift: assert abs(resized['x2']/10-round(resized['x2']/10))>0.01,resized
        else: assert abs(resized['x2']/10-round(resized['x2']/10))<0.001,resized
        page.get_by_title('Undo',exact=True).click()
        wait_saved(page,lambda d:d[0]['box']==wall['box'])
        report('wall endpoint resize '+('bypasses grid with Shift' if shift else 'snaps to grid'))
    for tool,count in [('ผนัง',2),('ห้อง',6),('พื้น',2)]:
        page.get_by_role('button',name=tool,exact=True).click()
        page.evaluate('() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
        page.mouse.move(cx-170,cy-140)
        page.mouse.down()
        page.mouse.move(cx-60,cy-70,steps=8)
        page.mouse.up()
        created=wait_saved(page,lambda d:len(d)==count)
        assert all(d['box']['width']>0 and d['box']['height']>0 for d in created)
        page.get_by_title('Undo',exact=True).click()
        wait_saved(page,lambda d:len(d)==1)
        report(tool+' draws objects and undo removes the entire gesture')
    page.get_by_role('button',name='ห้อง',exact=True).click()
    page.evaluate('() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
    page.mouse.move(cx+2,cy+8); page.mouse.down(); page.mouse.move(cx+140,cy-130,steps=12); page.mouse.up()
    connected=wait_saved(page,lambda d:len(d)>1)
    assert next(x for x in connected if x['id']=='test-wall')['box']==wall['box']
    expect(page.get_by_role('button',name='เลือก',exact=True)).to_have_attribute('aria-pressed','true')
    new_id=page.get_by_label('เลือกวัตถุในโมเดล',exact=True).input_value()
    assert new_id and new_id!='test-wall'
    page.get_by_role('button',name='ลบวัตถุที่เลือก',exact=True).click()
    wait_saved(page,lambda d:len(d)==len(connected)-1 and all(x['id']!=new_id for x in d))
    page.get_by_title('Undo',exact=True).click()
    wait_saved(page,lambda d:len(d)==len(connected))
    page.get_by_title('Undo',exact=True).click()
    wait_saved(page,lambda d:len(d)==1)
    report('room starts on an existing wall; new wall deletes and complete room creation undoes')
    page.get_by_role('button',name='พื้น',exact=True).click()
    page.mouse.move(cx-170,cy-140)
    page.mouse.down()
    page.mouse.move(cx-60,cy-70,steps=8)
    page.keyboard.press('Escape')
    page.mouse.up()
    page.wait_for_timeout(400)
    assert len(saved(page))==1
    expect(page.get_by_role('button',name='เลือก',exact=True)).to_have_attribute('aria-pressed','true')
    expect(page.get_by_title('Undo',exact=True)).to_be_disabled()
    report('Escape cancels drawing and returns to select')
    page.screenshot(path=str(OUT/'3d-interactions.png'),full_page=True)
    assert not errors,errors
    report('no uncaught browser errors during pointer release and cancellation')
    # The fitted grid and object must remain visible after mobile layout settles.
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_timeout(1200)
    page.screenshot(path=str(OUT/'3d-interactions-mobile.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    report('mobile layout fits without horizontal overflow')
    browser.close()
