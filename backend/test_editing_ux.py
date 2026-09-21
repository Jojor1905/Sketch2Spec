"""Real browser regression: edit directly after upload and orbit 3D with left drag.
Run with both servers running and a detectable floor-plan path as the argument.
"""
import json
import sys
import time
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageChops, ImageStat, ImageFilter
from playwright.sync_api import sync_playwright, expect
OUT=Path(__file__).parent/'test_results'
OUT.mkdir(exist_ok=True)
READ="""() => new Promise((resolve,reject)=>{const r=indexedDB.open('sketch2spec',1);r.onsuccess=()=>{const db=r.result;const q=db.transaction('projects').objectStore('projects').get('active');q.onsuccess=()=>{db.close();resolve(q.result||null)};q.onerror=()=>reject(q.error)};r.onerror=()=>reject(r.error)})"""
def saved(page): return page.evaluate(READ)
def wait_saved(page,predicate):
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        v=saved(page)
        if v and predicate(v): return v
        page.wait_for_timeout(100)
    raise AssertionError('Expected saved state not reached')
def count(page,n): return wait_saved(page,lambda v:len(v['detections'])==n)
def report(s): print('PASS:',s,flush=True)
def difference(a,b):
    return sum(ImageStat.Stat(ImageChops.difference(Image.open(BytesIO(a)).convert('L').filter(ImageFilter.FIND_EDGES),Image.open(BytesIO(b)).convert('L').filter(ImageFilter.FIND_EDGES))).mean)

with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1600,'height':1200})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:3000/upload')
    upload=page.get_by_label('อัปโหลดแปลน',exact=True)
    expect(upload).to_be_enabled()
    upload.set_input_files(str(Path(sys.argv[1]).resolve()))
    page.get_by_role('button',name='ใช้รูปนี้',exact=True).click()
    expect(page.get_by_role('button',name='เพิ่มผนัง',exact=True)).to_be_visible()
    count(page,0)
    report('editing toolbar available immediately after upload, before AI')
    page.get_by_role('button',name='เพิ่มผนัง',exact=True).click()
    original=count(page,1)['detections'][0]
    wall=page.locator('[data-object-id]').first
    expect(wall).to_have_attribute('aria-pressed','true')
    bounds=wall.bounding_box()
    page.mouse.move(bounds['x']+bounds['width']/2,bounds['y']+bounds['height']/2)
    page.mouse.down()
    page.mouse.move(bounds['x']+bounds['width']/2+40,bounds['y']+bounds['height']/2+35,steps=8)
    page.mouse.up()
    moved=wait_saved(page,lambda v:v['detections'][0]['box']!=original['box'])['detections'][0]
    handle=page.get_by_role('button',name='ปรับปลายกำแพงด้านสิ้นสุด',exact=True)
    b=handle.bounding_box()
    page.mouse.move(b['x']+b['width']/2,b['y']+b['height']/2)
    page.mouse.down()
    page.mouse.move(b['x']+b['width']/2+40,b['y']+b['height']/2,steps=8)
    page.mouse.up()
    wait_saved(page,lambda v:v['detections'][0]['box']['width']>moved['box']['width'])
    report('new 2D wall can be selected, dragged and resized')
    page.get_by_role('button',name='ลบวัตถุที่เลือก',exact=True).click()
    count(page,0)
    page.get_by_role('button',name='ย้อนกลับการแก้ไขแปลน',exact=True).click()
    count(page,1)
    wall.click()
    page.keyboard.press('Delete')
    count(page,0)
    for name in ['เพิ่มประตู','เพิ่มหน้าต่าง']:
        page.get_by_role('button',name=name,exact=True).click()
        count(page,1)
        page.get_by_role('button',name='ลบวัตถุที่เลือก',exact=True).click()
        count(page,0)
    report('add all object types, delete by button/key, and undo without opening a side panel')
    page.get_by_role('button',name='Run AI Detection',exact=True).click()
    wait_saved(page,lambda v:len(v['detections'])>0)
    expect(page.get_by_role('button',name='AI กำลังทำงาน...',exact=True)).to_have_count(0,timeout=120000)
    detected=len(saved(page)['detections'])
    page.get_by_role('button',name='เพิ่มประตู',exact=True).click()
    count(page,detected+1)
    page.get_by_role('button',name='ลบวัตถุที่เลือก',exact=True).click()
    count(page,detected)
    page.screenshot(path=str(OUT/'editing-2d-ux.png'),full_page=True)
    report(f'AI result with {detected} objects remains directly editable')
    page.get_by_role('button',name='3D Editor',exact=True).click()
    orbit=page.get_by_role('button',name='หมุนดู 360°',exact=True)
    expect(orbit).to_have_attribute('aria-pressed','true')
    canvas=page.locator('canvas')
    expect(canvas).to_be_visible()
    canvas.scroll_into_view_if_needed()
    page.wait_for_timeout(2000)
    before=saved(page)['detections']
    b=canvas.bounding_box()
    cx=b['x']+b['width']/2
    cy=b['y']+b['height']/2
    height=canvas.evaluate('element => element.clientHeight')
    # OrbitControls maps one canvas-height horizontal drag to a complete turn.
    start=canvas.screenshot()
    page.mouse.move(cx+height/2,cy)
    page.mouse.down()
    page.mouse.move(cx,cy,steps=24)
    page.wait_for_timeout(1800)
    half=canvas.screenshot()
    page.mouse.move(cx-height/2,cy,steps=24)
    page.mouse.up()
    page.wait_for_timeout(2000)
    complete=canvas.screenshot()
    (OUT/'orbit-start.png').write_bytes(start)
    (OUT/'orbit-half.png').write_bytes(half)
    (OUT/'orbit-full.png').write_bytes(complete)
    half_delta=difference(start,half)
    full_delta=difference(start,complete)
    print(f'Orbit image difference: half={half_delta:.3f}, full={full_delta:.3f}',flush=True)
    assert half_delta>1, 'Left drag did not rotate the view'
    assert full_delta < half_delta*0.35, 'Full turn did not return close to original view'
    assert saved(page)['detections']==before, 'Orbit mutated object geometry'
    report('left mouse drag makes a full 360-degree orbit without moving objects')
    page.get_by_role('button',name='แก้ไขวัตถุ',exact=True).click()
    expect(page.get_by_role('button',name='แก้ไขวัตถุ',exact=True)).to_have_attribute('aria-pressed','true')
    orbit.click()
    page.get_by_role('button',name='คืนมุมกล้อง',exact=True).click()
    page.wait_for_timeout(1200)
    page.screenshot(path=str(OUT/'editing-3d-ux.png'),full_page=True)
    report('visible orbit/edit mode switch and camera reset work')
    assert not errors,errors
    report('no uncaught browser errors')
    browser.close()
