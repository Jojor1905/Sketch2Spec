"""Real pointer regression checks for the 3D editor on localhost:3000.
Uses an isolated Chrome profile and a small deterministic imported project.
Run: backend/.venv/bin/python backend/test_pdf_feedback.py
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


project['project']['detections'] += [
 {'id':'test-floor','label':'floor','class_id':-1,'confidence':1,'box':{'x1':220,'y1':350,'x2':570,'y2':480,'width':350,'height':130}},
 {'id':'test-door','label':'door','class_id':0,'confidence':1,'box':{'x1':350,'y1':303,'x2':390,'y2':323,'width':40,'height':20}},
 {'id':'test-window','label':'window','class_id':2,'confidence':1,'box':{'x1':440,'y1':303,'x2':480,'y2':323,'width':40,'height':20}},
]
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1500,'height':1150})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:3000/upload')
    expect(page.get_by_role('button',name='เปิดโปรเจกต์',exact=True)).to_be_enabled()
    page.get_by_label('เปิดไฟล์โปรเจกต์',exact=True).set_input_files({'name':'pdf-feedback.sketch2spec.json','mimeType':'application/json','buffer':json.dumps(project).encode()})
    page.get_by_role('button',name='3D Editor',exact=True).click()
    page.get_by_text('เครื่องมือเพิ่มเติม · จัดแนว แบ่งห้อง เลือกชิ้นงานที่ถูกบัง',exact=True).click()
    canvas=page.locator('canvas'); expect(canvas).to_be_visible()
    page.wait_for_timeout(2500)
    expect(page.get_by_test_id('original-plan-preview')).to_be_visible()
    picker=page.get_by_label('เลือกวัตถุในโมเดล',exact=True)
    # Picking hidden surfaces is also accessible without hunting through walls.
    picker.select_option('test-floor')
    page.get_by_role('button',name='ลบวัตถุที่เลือก',exact=True).click()
    wait_saved(page,lambda d:len(d)==3 and all(x['id']!='test-floor' for x in d))
    page.get_by_title('Undo',exact=True).click()
    wait_saved(page,lambda d:len(d)==4)
    report('floor can be selected, deleted and restored')
    for identifier in ['test-door','test-window']:
        picker.select_option(identifier)
        expect(page.get_by_label('ความยาว (เมตร)',exact=True)).to_be_visible()
        page.get_by_label('ความยาว (เมตร)',exact=True).fill('1.2')
        page.get_by_label('ความยาว (เมตร)',exact=True).press('Enter')
        wait_saved(page,lambda d:any(x['id']==identifier and abs(x['box']['width']-60)<0.01 for x in d))
        page.get_by_title('ปิดแผง',exact=True).click()
    report('door and window length edits are persisted')
    picker.select_option('test-floor')
    page.get_by_title('เลือกวัสดุและดูงบประมาณ',exact=True).click()
    page.get_by_role('button',name='ใช้กับที่เลือก',exact=True).click()
    wait_saved(page,lambda d:any(x['id']=='test-floor' and x.get('materialApplied') for x in d))
    assert all(not x.get('materialApplied') for x in saved(page) if x['id']!='test-floor')
    scale=page.get_by_label('ขนาดลาย',exact=False)
    scale.fill('1.5')
    rotation=page.get_by_label('หมุนลาย',exact=False)
    rotation.fill('90')
    wait_saved(page,lambda d:any(x['id']=='test-floor' and x.get('materialScale')==1.5 and abs(x.get('materialRotation',0)-1.570796)<0.001 for x in d))
    page.evaluate("""() => {
      const open = window.open.bind(window)
      window.open = (...args) => {
        const report = open(...args)
        if (report) report.print = () => { report.document.documentElement.dataset.printInvoked = 'true' }
        return report
      }
    }""")
    with page.expect_popup() as report_popup:
        page.get_by_title('Export PDF',exact=True).click()
    report_page=report_popup.value
    report_page.wait_for_function("document.documentElement.dataset.printInvoked === 'true'")
    assert 'Sketch2Spec - House Planning Report' in report_page.title()
    assert report_page.locator('img[alt="3D Preview"]').count()==1
    assert 'Sketch2Spec' in report_page.locator('body').inner_text()
    report('calibrated project opens the report with a 3D image and invokes browser print')
    report_page.close()
    page.get_by_role('button',name='Door',exact=True).click()
    page.screenshot(path=str(OUT/'pdf-materials-doors.png'),full_page=True)
    page.get_by_role('button',name='Window',exact=True).click()
    page.get_by_title('เลือกวัสดุและดูงบประมาณ',exact=True).click()
    report('per-surface materials and texture controls persist; separate opening categories accessible')
    page.get_by_role('button',name='แบบแปลน',exact=True).click()
    page.wait_for_timeout(1200)
    canvas.scroll_into_view_if_needed()
    b=canvas.bounding_box(); cx=b['x']+b['width']/2; cy=b['y']+b['height']/2
    page.mouse.click(cx+2,cy+8)
    expect(picker).to_have_value('test-wall')
    page.get_by_role('button',name='ลบวัตถุที่เลือก',exact=True).click()
    wait_saved(page,lambda d:all(x['id']!='test-wall' for x in d))
    page.get_by_title('Undo',exact=True).click()
    wait_saved(page,lambda d:any(x['id']=='test-wall' for x in d))
    report('actual canvas wall selection and deletion work')
    page.get_by_role('button',name='More tools',exact=True).click()
    page.get_by_role('button',name='Draw floor',exact=True).click()
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    b=canvas.bounding_box(); cx=b['x']+b['width']/2; cy=b['y']+b['height']/2
    page.mouse.move(cx-170,cy-140); page.mouse.down(); page.mouse.move(cx-60,cy-70,steps=8); page.mouse.up()
    wait_saved(page,lambda d:len(d)==5)
    expect(page.get_by_role('button',name='เลือก',exact=True)).to_have_attribute('aria-pressed','true')
    page.get_by_role('button',name='ลบวัตถุที่เลือก',exact=True).click()
    wait_saved(page,lambda d:len(d)==4)
    report('new floor automatically enters selection and deletes immediately')
    expect(page.get_by_role('button',name='ฝ้า',exact=True)).to_have_count(0)
    page.get_by_role('button',name='Orbit',exact=True).click()
    page.wait_for_timeout(1200)
    b=canvas.bounding_box(); cx=b['x']+b['width']/2; cy=b['y']+b['height']/2
    page.mouse.click(cx-35,cy-35)
    expect(picker).to_have_value('test-wall')
    expect(page.get_by_role('button',name='Orbit',exact=True)).to_have_attribute('aria-pressed','true')
    report('single click selects a wall while staying in orbit mode')
    picker.select_option('')
    # Drag a visible floor, then an empty canvas area: both navigate without changing geometry.
    data=saved(page)
    before=canvas.screenshot()
    page.mouse.move(cx-70,cy+65); page.mouse.down(); page.mouse.move(cx-20,cy+65,steps=12); page.mouse.up()
    page.wait_for_timeout(500)
    assert canvas.screenshot()!=before
    assert saved(page)==data
    report('left drag on the floor navigates without moving floor geometry')
    page.get_by_role('button',name='กลับมุมมองหลัก',exact=True).click()
    page.wait_for_timeout(600)
    before=canvas.screenshot(); data=saved(page)
    page.locator('body').click(position={'x':10,'y':10})
    page.keyboard.press('ArrowRight'); page.keyboard.press('ArrowUp')
    page.wait_for_timeout(600)
    assert before!=canvas.screenshot()
    assert saved(page)==data
    report('keyboard camera navigation changes view without modifying objects')
    page.screenshot(path=str(OUT/'pdf-feedback-3d.png'),full_page=True)
    assert not errors,errors
    page.set_viewport_size({'width':390,'height':844}); page.wait_for_timeout(1000)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(OUT/'pdf-feedback-mobile.png'),full_page=True)
    report('mobile layout has no horizontal overflow; no uncaught browser errors')
    browser.close()
