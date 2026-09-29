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
    page=browser.new_page(viewport=dict(width=1440,height=900));errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:3000/upload')
    page.get_by_label('เปิดไฟล์โปรเจกต์',exact=True).set_input_files(dict(name='scg5.sketch2spec.json',mimeType='application/json',buffer=json.dumps(project).encode()))
    page.get_by_role('button',name='3D Editor',exact=True).click()
    expect(page.get_by_test_id('editor-3d-canvas')).to_be_visible()
    page.get_by_role('button',name='Materials',exact=True).click()
    expect(page.get_by_label('ห้องที่จะทาสีผนัง',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Ceiling',exact=True)).to_have_count(0)
    expect(page.get_by_text('วางเมาส์เพื่อทดลองสี · คลิกสีเพื่อใช้กับบริเวณนี้',exact=True)).to_have_count(0)
    page.get_by_role('button',name='ผนังด้านนอก',exact=True).click()
    expect(page.get_by_label('ผนังด้านนอกที่จะทาสี',exact=True)).to_be_visible()
    picker=page.get_by_label('สีและวัสดุผนัง',exact=True)
    picker.get_by_role('button').nth(1).click()
    page.wait_for_timeout(700)
    painted=stored(page);wall=next(d for d in painted if d['id']=='wall')
    assert len(wall['wallFinishes'])==1 and wall['wallFinishes'][0]['side']=='negative',wall
    assert wall['wallFinishes'][0]['start']==0 and wall['wallFinishes'][0]['end']==1
    assert all(not d.get('wallFinishes') for d in painted if d['id']!='wall'), 'Exterior paint must not change other walls'
    page.get_by_role('button',name='ทั้งห้อง',exact=True).click()
    expect(page.get_by_label('ห้องที่จะทาสีผนัง',exact=True)).to_be_visible()
    picker.get_by_role('button').nth(2).click();page.wait_for_timeout(500)
    wall=next(d for d in stored(page) if d['id']=='wall')
    assert len(wall['wallFinishes'])==2 and wall['wallFinishes'][0]['side']=='negative',wall
    assert wall['wallFinishes'][0]==next(d for d in painted if d['id']=='wall')['wallFinishes'][0], 'Room paint must preserve exterior'
    out=Path('tmp/scg5');out.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(out/'materials.png'))
    page.get_by_role('tab',name='ขนาดและการจัดการ',exact=True).click()
    expect(page.get_by_role('menu',name='Wall actions')).not_to_be_visible()
    page.get_by_role('button',name='ปรับขนาดชิ้นงาน',exact=True).click()
    length=page.get_by_label('ความยาวชิ้นงาน',exact=True)
    length.fill('5.2');page.get_by_role('button',name='ใช้ค่า',exact=True).click();page.wait_for_timeout(500)
    assert abs(next(d for d in stored(page) if d['id']=='wall')['box']['width']-260)<.01
    page.screenshot(path=str(out/'resize.png'))
    before=stored(page)
    # End handle projected at this fixed fixture/camera/viewport, as checked in resize.png.
    page.mouse.move(906,519);page.wait_for_timeout(150)
    assert page.evaluate('document.body.style.cursor')=='ew-resize', 'Pointer must hit the resize handle'
    page.keyboard.down('Shift');page.mouse.down();page.mouse.move(941,530,steps=10);page.mouse.up();page.keyboard.up('Shift')
    page.wait_for_timeout(600)
    after=stored(page)
    assert next(d for d in after if d['id']=='wall')['box']!=next(d for d in before if d['id']=='wall')['box'], 'Real endpoint drag must resize the wall'
    expect(page.get_by_label('ความยาวชิ้นงาน',exact=True)).to_be_visible()
    expect(page.get_by_text('Wall Materials',exact=True)).to_have_count(0)
    assert all(d==next(old for old in before if old['id']==d['id']) for d in after if d['id']!='wall'), 'Other walls and room must remain unchanged'
    page.screenshot(path=str(out/'dragged.png'))
    page.set_viewport_size(dict(width=390,height=844));page.wait_for_timeout(500)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+2 && document.documentElement.scrollHeight <= innerHeight+2')
    page.screenshot(path=str(out/'mobile.png'))
    assert not errors,errors
    print('PASS: direct room controls; exterior paint isolated; room paint preserves exterior; no ceiling tab/obscuring tip; collapsed actions; numeric resize; pointer resize; mobile viewport')
    browser.close()
