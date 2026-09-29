"""Regression checks for the fourth PDF feedback, in an isolated browser profile."""
import base64
import json
import re
from io import BytesIO
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright, expect


def item(identifier, label, x1, y1, x2, y2, **extra):
    return dict(id=identifier, label=label, class_id=1, confidence=1,
                box=dict(x1=x1,y1=y1,x2=x2,y2=y2,width=x2-x1,height=y2-y1), **extra)


image=BytesIO()
Image.new('RGB',(400,400),'white').save(image,format='PNG')
project=dict(format='sketch2spec',version=1,project=dict(fileName='scg4.png',fileType='image/png',
    previewDataUrl='data:image/png;base64,'+base64.b64encode(image.getvalue()).decode(),
    imageSize=dict(width=400,height=400),metersPerPixel=.02,updatedAt=1,
    detections=[item('wall','wall',80,80,320,92),item('floor','floor',92,92,308,308,roomName='Room',floorTiles=[dict(x1=0,y1=0,x2=1,y2=1)]),
                item('sofa','furniture',170,170,240,210,furnitureCatalogId='linen-sofa',objectHeightM=.84)]))

with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport=dict(width=1440,height=900))
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto('http://127.0.0.1:3000/upload')
    page.get_by_label('เปิดไฟล์โปรเจกต์',exact=True).set_input_files(dict(name='scg4.sketch2spec.json',mimeType='application/json',buffer=json.dumps(project).encode()))
    page.get_by_role('button',name='3D Editor',exact=True).click()
    canvas=page.get_by_test_id('editor-3d-canvas')
    expect(canvas).to_be_visible()
    page.wait_for_timeout(1500)
    assert page.evaluate('document.documentElement.scrollHeight <= innerHeight + 2'), '3D workspace must fit viewport'
    expect(page.get_by_label('มุมมองกล้อง',exact=True)).to_be_visible()
    expect(page.get_by_title('ซูมเข้า',exact=True)).to_be_visible()
    preview=page.get_by_test_id('original-plan-preview').bounding_box()
    bounds=canvas.bounding_box()
    assert preview['y'] < bounds['y']+100
    rail=page.get_by_role('navigation',name='3D editor tools').bounding_box()
    assert rail['y']>bounds['y']+bounds['height']*.6
    page.get_by_role('button',name='Add wall',exact=True).hover()
    expect(page.get_by_role('tooltip')).to_have_text('Add wall')
    page.get_by_text('เครื่องมือเพิ่มเติม · จัดแนว แบ่งห้อง เลือกชิ้นงานที่ถูกบัง',exact=True).click()
    selector=page.get_by_label('เลือกวัตถุในโมเดล',exact=True)
    page.get_by_role('button',name='แบบแปลน',exact=True).click()
    selector.select_option('wall')
    page.get_by_text('เครื่องมือเพิ่มเติม · จัดแนว แบ่งห้อง เลือกชิ้นงานที่ถูกบัง',exact=True).click()
    expect(page.get_by_role('menu',name='Wall actions')).not_to_be_visible()
    page.get_by_text('ตัวเลือกเพิ่มเติมของชิ้นงาน',exact=True).click()
    expect(page.get_by_role('menu',name='Wall actions')).to_be_visible()
    menu=page.get_by_role('menu',name='Wall actions').bounding_box()
    assert menu['x']>900, 'Actions belong in the right dock, not over the model'
    page.get_by_role('tab',name='วัสดุ',exact=True).click()
    expect(page.get_by_text('Wall Materials',exact=True)).to_be_visible()
    expect(page.get_by_role('menu',name='Wall actions')).to_have_count(0)
    page.get_by_role('button',name='ผนังเดียว',exact=True).click()
    picker=page.get_by_role('region',name='เลือกผนังที่จะทาสี')
    assert picker.locator('svg [role="button"]').count()>0
    assert picker.locator('button').filter(has_text='1. ด้าน').count()==0
    page.get_by_role('tab',name='ขนาดและการจัดการ',exact=True).click()
    expect(page.get_by_text('Wall Materials',exact=True)).to_have_count(0)
    page.get_by_text('ตัวเลือกเพิ่มเติมของชิ้นงาน',exact=True).click()
    page.get_by_role('menuitem',name='Duplicate',exact=True).click()
    expect(page.get_by_role('button',name='ย้ายชิ้นงาน',exact=True)).to_be_visible()
    expect(page.get_by_text('ลากเพื่อย้ายเท่านั้น',exact=True)).to_be_visible()
    page.get_by_role('button',name='ปิดรายละเอียดชิ้นงาน',exact=True).click()
    page.wait_for_timeout(900)
    def stored():
        return page.evaluate("""() => new Promise(resolve => { const q=indexedDB.open('sketch2spec',1); q.onsuccess=()=>{const db=q.result;const r=db.transaction('projects').objectStore('projects').get('active');r.onsuccess=()=>{resolve(r.result.detections);db.close()}} })""")
    before=stored()
    copy=next(d for d in before if d['id'] not in ['wall','floor','sofa'])
    label=page.get_by_text(re.compile(r'^wall · ')).bounding_box()
    assert label, 'Selected duplicate label exists'
    x,y=label['x']+label['width']/2,label['y']+label['height']/2
    page.keyboard.down('Shift')
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+45,y+45,steps=8);page.mouse.up()
    page.keyboard.up('Shift')
    page.wait_for_timeout(700)
    after=stored()
    moved=next(d for d in after if d['id']==copy['id'])
    assert moved['box']!=copy['box'], 'Duplicate must move with actual pointer drag'
    assert next(d for d in after if d['id']=='wall')==next(d for d in before if d['id']=='wall'), 'Original wall must stay in place'
    page.get_by_role('button',name='Enter Focus Mode',exact=True).click()
    expect(page.locator('[data-focus-mode="true"]')).to_be_visible()
    page.keyboard.press('Escape')
    expect(page.locator('[data-focus-mode="false"]')).to_be_visible()
    out=Path('tmp/scg4');out.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(out/'desktop.png'))
    page.set_viewport_size(dict(width=390,height=844))
    page.wait_for_timeout(500)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2')
    assert page.evaluate('document.documentElement.scrollHeight <= innerHeight + 2')
    rail=page.get_by_role('navigation',name='3D editor tools').bounding_box()
    assert rail['y']>=0 and rail['y']+rail['height']<=844
    page.screenshot(path=str(out/'mobile.png'))
    assert not errors, errors
    print('PASS: fixed viewport, bottom tools, tooltip, upper-left preview, visible camera, shared right dock, compact wall selector, duplicate Move, Focus round-trip, mobile bounds')
    browser.close()
