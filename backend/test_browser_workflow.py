"""Regression checks against running local servers using a separate Chrome profile.

Usage: backend/.venv/bin/python backend/test_browser_workflow.py /path/to/floor-plan.jpg
Requires: pip install playwright (uses the installed Google Chrome).
"""
from __future__ import annotations
import json
import sys
import time
from pathlib import Path
from tempfile import TemporaryDirectory
import fitz
from playwright.sync_api import sync_playwright, expect

BASE = Path(__file__).resolve().parent
OUT = BASE / 'test_results'
OUT.mkdir(exist_ok=True)
SAMPLE = Path(sys.argv[1]).resolve()

READ_SAVED = """() => new Promise((resolve, reject) => {
 const r = indexedDB.open('sketch2spec', 1);
 r.onsuccess = () => { const db=r.result; const q=db.transaction('projects').objectStore('projects').get('active');
 q.onsuccess=()=>{db.close();resolve(q.result || null)};q.onerror=()=>reject(q.error) };
 r.onerror=()=>reject(r.error);
})"""

def stored(page):
    return page.evaluate(READ_SAVED)

def wait_saved(page, predicate):
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        value=stored(page)
        if predicate(value): return value
        page.wait_for_timeout(100)
    raise AssertionError('Saved project did not reach expected state')

def saved_count(page, count):
    return wait_saved(page, lambda value: value is not None and len(value['detections'])==count)

def confirm(page):
    page.get_by_role('button', name='ดำเนินการต่อ', exact=True).click()

def panel(page):
    button=page.get_by_title('แสดงแผงไฟล์', exact=True)
    if button.count(): button.click()

def report(message):
    print('PASS:', message, flush=True)

with TemporaryDirectory(prefix='sketch2spec-test-') as temp, sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome', headless=True)
    context=browser.new_context(viewport={'width':1500,'height':1000}, accept_downloads=True)
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto('http://localhost:3000/upload')
    upload=page.get_by_label('อัปโหลดแปลน', exact=True)
    expect(upload).to_be_enabled()
    upload.set_input_files(str(SAMPLE))
    page.get_by_role('button',name='ใช้รูปนี้',exact=True).click()
    page.get_by_role('button',name='Run AI Detection',exact=True).click()
    editor=page.get_by_role('button',name='3D Editor',exact=True)
    editor.wait_for(timeout=120000)
    expect(page.get_by_text('บันทึกงานในเบราว์เซอร์นี้แล้ว',exact=True)).to_be_visible()
    original=wait_saved(page,lambda v: v and len(v['detections']) > 0)
    count=len(original['detections'])
    assert count > 0, 'Sample must contain detectable walls, doors or windows'
    report(f'real upload and AI detection: {count} objects')
    panel(page)
    upload.set_input_files({'name':'invalid.txt','mimeType':'text/plain','buffer':b'invalid'})
    expect(page.locator('main [role=alert]')).to_contain_text('รองรับไฟล์')
    expect(editor).to_be_visible()
    assert len(stored(page)['detections'])==count
    page.get_by_role('button',name='ปิดข้อความ',exact=True).click()
    report('invalid upload preserves existing workspace')

    page.get_by_role('button',name='Crop',exact=True).click()
    confirm(page)
    page.get_by_role('button',name='ยกเลิก',exact=True).click()
    expect(editor).to_be_visible()
    assert len(stored(page)['detections'])==count
    report('cancel crop preserves existing workspace')
    for _ in range(2):
        upload.set_input_files(str(SAMPLE))
        page.get_by_role('button',name='เก็บงานเดิม',exact=True).click()
        expect(editor).to_be_visible()
    report('the same image can be selected again after cancelling replacement')

    page.route('**/detect/jobs',lambda r:r.abort('connectionrefused'))
    page.get_by_role('button',name='ตรวจจับใหม่',exact=True).click()
    confirm(page)
    expect(page.locator('main [role=alert]')).to_contain_text('เชื่อมต่อ AI ไม่ได้')
    expect(editor).to_be_visible()
    assert len(stored(page)['detections'])==count
    page.unroute('**/detect/jobs')
    page.get_by_role('button',name='ปิดข้อความ',exact=True).click()
    report('failed re-detection preserves existing workspace')

    page.route('**/detect/jobs',lambda r:r.fulfill(status=202,json={'job_id':'waiting'}))
    page.route('**/detect/jobs/waiting',lambda r:r.fulfill(json={'id':'waiting','status':'running','phase':'walls','progress':35,'message':'working','result':None,'error':None}))
    page.get_by_role('button',name='ตรวจจับใหม่',exact=True).click()
    confirm(page)
    page.get_by_role('button',name='ยกเลิกการรอผล',exact=True).click()
    expect(editor).to_be_visible()
    assert len(stored(page)['detections'])==count
    page.unroute('**/detect/jobs')
    page.unroute('**/detect/jobs/waiting')
    report('cancel waiting preserves existing workspace')

    panel(page)
    page.get_by_role('button',name='เพิ่มผนัง',exact=True).click()
    saved_count(page,count+1)
    page.keyboard.press('Meta+z')
    saved_count(page,count)
    page.keyboard.press('Meta+Shift+z')
    saved_count(page,count+1)
    report('add wall and Mac undo/redo')
    page.get_by_role('button',name='รายละเอียด / ขนาดจริง',exact=True).click()
    page.get_by_placeholder('เช่น 5',exact=True).fill('5')
    page.get_by_role('button',name='ใช้กับทั้งแปลน',exact=True).click()
    wait_saved(page,lambda value: value and value['metersPerPixel'] is not None and value['metersPerPixel'] > 0)
    report('scale calibration')

    editor.click()
    page.get_by_role('button',name='3D',exact=True).click()
    page.wait_for_function("Array.from(document.querySelectorAll('canvas')).some(c => c.width > 0 && !!c.getContext('webgl2'))")
    page.wait_for_timeout(1000)
    page.screenshot(path=str(OUT/'functions-3d.png'),full_page=True)
    report('3D editor and WebGL rendering')
    page.get_by_title('เลือกวัสดุและดูงบประมาณ',exact=True).click()
    (OUT/'materials-ui.txt').write_text(page.locator('body').inner_text())
    page.get_by_role('button',name='สีทาผนัง',exact=True).click()
    page.get_by_role('button',name='ทั้งแปลน',exact=True).click()
    page.get_by_role('button',name='3. ทาสีผนัง',exact=True).click()
    wait_saved(page,lambda value: value and any(d.get('materialApplied') for d in value['detections']))
    with page.expect_download() as csv_download:
        page.get_by_title('ส่งออก CSV',exact=True).click()
    csv_path=Path(temp)/'budget.csv'
    csv_download.value.save_as(csv_path)
    assert len(csv_path.read_text(encoding='utf-8-sig').splitlines()) > 1
    report('apply materials and export budget CSV')
    page.get_by_title('เลือกวัสดุและดูงบประมาณ',exact=True).click()

    with page.expect_download() as d:
        page.get_by_role('button',name='สำรองโปรเจกต์',exact=True).click()
    backup=Path(temp)/'backup.sketch2spec.json'
    d.value.save_as(backup)
    exported=json.loads(backup.read_text())
    assert len(exported['project']['detections'])==count+1
    assert exported['project']['metersPerPixel']>0
    report('project backup includes objects and scale')
    page.get_by_role('button',name='เริ่มใหม่',exact=True).click()
    page.get_by_role('button',name='เก็บงานเดิม',exact=True).click()
    expect(editor).to_be_visible()
    page.get_by_role('button',name='เริ่มใหม่',exact=True).click()
    confirm(page)
    expect(editor).to_have_count(0)
    wait_saved(page,lambda value: value is None)
    report('reset confirmation and persisted clear')
    page.get_by_label('เปิดไฟล์โปรเจกต์',exact=True).set_input_files(str(backup))
    expect(editor).to_be_visible()
    saved_count(page,count+1)
    restored=stored(page)
    assert restored['metersPerPixel']==exported['project']['metersPerPixel']
    for actual, expected in zip(restored['detections'],exported['project']['detections']):
        assert actual['box']==expected['box']
        assert actual.get('materialId')==expected.get('materialId')
        assert actual.get('materialApplied')==expected.get('materialApplied')
    page.reload()
    expect(editor).to_be_visible()
    saved_count(page,count+1)
    report('backup import and reload restore objects and scale')
    page.get_by_label('เปิดไฟล์โปรเจกต์',exact=True).set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"format":"sketch2spec","version":9}'})
    expect(page.locator('main [role=alert]')).to_contain_text('ไฟล์โปรเจกต์ไม่ถูกต้อง')
    expect(editor).to_be_visible()
    assert len(stored(page)['detections'])==count+1
    report('invalid backup does not replace the project')

    mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    mp=mobile.new_page()
    mp.on('pageerror',lambda e:errors.append(str(e)))
    mp.goto('http://localhost:3000/upload')
    expect(mp.get_by_role('button',name='เปิดโปรเจกต์',exact=True)).to_be_enabled()
    mp.get_by_label('เปิดไฟล์โปรเจกต์',exact=True).set_input_files(str(backup))
    mp.get_by_role('button',name='3D Editor',exact=True).click()
    mp.wait_for_function("document.querySelector('canvas') !== null")
    assert mp.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile horizontal overflow'
    mp.screenshot(path=str(OUT/'functions-mobile.png'),full_page=True)
    report('mobile import and 3D workspace fit viewport')

    document=fitz.open()
    for i in range(2):
        docpage=document.new_page(width=400,height=300)
        docpage.insert_text((30,50),f'Floor plan page {i+1}')
        docpage.draw_rect(fitz.Rect(40,70,350,250),width=4)
    pdf=Path(temp)/'two-pages.pdf'
    document.save(pdf)
    document.close()
    pdfcontext=browser.new_context()
    pp=pdfcontext.new_page()
    pp.on('pageerror',lambda e:errors.append(str(e)))
    pp.goto('http://localhost:3000/upload')
    expect(pp.get_by_label('อัปโหลดแปลน',exact=True)).to_be_enabled()
    pp.get_by_label('อัปโหลดแปลน',exact=True).set_input_files(str(pdf))
    pp.get_by_role('button',name='เปิดหน้านี้',exact=True).wait_for()
    (OUT/'pdf-ui.txt').write_text(pp.locator('body').inner_text())
    pp.locator('input[type=number]').fill('2')
    pp.get_by_role('button',name='เปิดหน้านี้',exact=True).click()
    pp.get_by_role('button',name='ใช้รูปนี้',exact=True).click()
    expect(pp.get_by_role('button',name='Run AI Detection',exact=True)).to_be_enabled()
    expect(pp.get_by_text('two-pages-page-2-edited.jpg',exact=True)).to_be_visible()
    report('multi-page PDF page 2 selection and image preparation')

    unavailable=browser.new_context()
    unavailable.add_init_script("IDBFactory.prototype.open = function() { throw new Error('Storage unavailable for test') }")
    up=unavailable.new_page()
    up.on('pageerror',lambda e: errors.append(str(e)))
    up.route('**/health',lambda r:r.abort('connectionrefused'))
    up.goto('http://localhost:3000/upload')
    expect(up.get_by_text('ยังเชื่อมต่อ AI ไม่ได้',exact=True)).to_be_visible()
    expect(up.locator('main [role=alert]')).to_contain_text('กู้คืนงานล่าสุดไม่สำเร็จ')
    up.get_by_label('เปิดไฟล์โปรเจกต์',exact=True).set_input_files(str(backup))
    expect(up.get_by_role('button',name='3D Editor',exact=True)).to_be_visible()
    expect(up.locator('main [role=alert]')).to_contain_text('บันทึกอัตโนมัติไม่สำเร็จ')
    with up.expect_download() as recovery:
        up.get_by_role('button',name='สำรองโปรเจกต์',exact=True).click()
    recovery.value.save_as(Path(temp)/'storage-recovery.json')
    report('offline AI and failed browser storage are visible; backup still works')
    assert not errors, errors
    report('no uncaught browser errors')
    browser.close()
