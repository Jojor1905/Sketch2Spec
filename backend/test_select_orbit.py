"""PDF5 regression: material scope without background clicks, exterior isolation, resize and layout."""
import base64
import json
from io import BytesIO
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright, expect

def item(identifier,label,x1,y1,x2,y2,**extra):
    return dict(id=identifier,label=label,class_id=1,confidence=1,box=dict(x1=x1,y1=y1,x2=x2,y2=y2,width=x2-x1,height=y2-y1),**extra)

image=BytesIO();Image.new('RGB',(400,400),'white').save(image,format='PNG')
project=dict(format='sketch2spec',version=1,project=dict(fileName='scg5.png',fileType='image/png',previewDataUrl='data:image/png;base64,'+base64.b64encode(image.getvalue()).decode(),imageSize=dict(width=400,height=400),metersPerPixel=.02,updatedAt=1,detections=[
    item('wall','wall',80,80,320,92),item('left','wall',80,92,92,320),item('right','wall',308,92,320,320),item('bottom','wall',92,308,308,320),
    item('floor','floor',92,92,308,308,roomName='Room',floorTiles=[dict(x1=0,y1=0,x2=1,y2=1)])]))

def stored(page):
    return page.evaluate("""() => new Promise(resolve => { const q=indexedDB.open('sketch2spec',1); q.onsuccess=()=>{const db=q.result;const r=db.transaction('projects').objectStore('projects').get('active');r.onsuccess=()=>{resolve(r.result.detections);db.close()}} })""")

with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport=dict(width=1440,height=900))
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:3000/upload')
    page.get_by_label('เปิดไฟล์โปรเจกต์',exact=True).set_input_files(dict(name='orbit.sketch2spec.json',mimeType='application/json',buffer=json.dumps(project).encode()))
    page.get_by_role('button',name='3D Editor',exact=True).click()
    page.get_by_role('button',name='Select',exact=True).click()
    more=page.get_by_text('เครื่องมือเพิ่มเติม · จัดแนว แบ่งห้อง เลือกชิ้นงานที่ถูกบัง',exact=True)
    more.click();page.get_by_label('เลือกวัตถุในโมเดล',exact=True).select_option('wall');more.click()
    page.get_by_role('button',name='ปิดรายละเอียดชิ้นงาน',exact=True).click()
    page.wait_for_timeout(1000)
    before=stored(page)
    import re
    label=page.get_by_text(re.compile(r'^wall · '))
    original=label.bounding_box()
    assert original
    # Drag across empty canvas, then directly across model surfaces.
    for x,y,dx in [(420,540,180),(720,510,160),(720,510,-340)]:
        start=page.get_by_test_id('editor-3d-canvas').screenshot()
        page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+dx,y+15,steps=15);page.mouse.up()
        page.wait_for_timeout(300)
        assert page.get_by_test_id('editor-3d-canvas').screenshot()!=start,'Select drag must rotate view'
        expect(label).to_be_visible()
        expect(page.get_by_role('button',name='Select',exact=True)).to_have_attribute('aria-pressed','true')
        assert stored(page)==before,'Rotation must not edit geometry or paint'
    # Ordinary click still selects a visible wall and opens its inspector.
    page.get_by_label('มุมมองกล้อง',exact=True).get_by_title('กลับมุมมองหลัก',exact=True).click();page.wait_for_timeout(1000)
    page.mouse.click(625,530)
    expect(page.get_by_role('tab',name='วัสดุ',exact=True)).to_be_visible()
    assert not errors,errors
    print('PASS: Select rotates on background and model; keeps selection and geometry; click still selects')
    browser.close()
