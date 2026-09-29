"""Browser regression for room floors and isolated wall-face finishes. Uses a private Chrome profile."""
import base64,json,re,time
from io import BytesIO
from pathlib import Path
from PIL import Image,ImageDraw
from playwright.sync_api import sync_playwright,expect
OUT=Path(__file__).parent/'test_results'; OUT.mkdir(exist_ok=True)
READ="""() => new Promise((resolve,reject)=>{const r=indexedDB.open('sketch2spec',1);r.onsuccess=()=>{const db=r.result;const q=db.transaction('projects').objectStore('projects').get('active');q.onsuccess=()=>{db.close();resolve(q.result)};q.onerror=()=>reject(q.error)};r.onerror=()=>reject(r.error)})"""
def saved(page): return page.evaluate(READ)['detections']
def wait_saved(page,predicate):
    deadline=time.monotonic()+12
    while time.monotonic()<deadline:
        d=saved(page)
        if predicate(d): return d
        page.wait_for_timeout(100)
    page.screenshot(path=str(OUT/'rooms-failure.png'),full_page=True)
    raise AssertionError('Saved state not reached: '+json.dumps(d))
def item(id,x1,y1,x2,y2,label='wall'):
    return dict(id=id,label=label,class_id=1,confidence=1,box=dict(x1=x1,y1=y1,x2=x2,y2=y2,width=x2-x1,height=y2-y1))
def report(s): print('PASS:',s,flush=True)
walls=[item('top',20,20,180,30),item('bottom',20,170,180,180),item('left',20,30,30,170),item('right',170,30,180,170),item('shared',95,30,105,170),item('branch',30,95,95,105)]
im=Image.new('RGB',(200,200),'white');draw=ImageDraw.Draw(im)
for d in walls:
    b=d['box'];draw.rectangle([b['x1'],b['y1'],b['x2'],b['y2']],fill='black')
raw=BytesIO();im.save(raw,format='PNG')
project=dict(format='sketch2spec',version=1,project=dict(fileName='three-rooms.png',fileType='image/png',previewDataUrl='data:image/png;base64,'+base64.b64encode(raw.getvalue()).decode(),imageSize=dict(width=200,height=200),detections=walls+[item('legacy-a',20,20,175,175,'floor'),item('legacy-b',25,25,180,180,'floor')],metersPerPixel=0.03,updatedAt=1))

with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True,timeout=30000)
    page=browser.new_page(viewport=dict(width=1600,height=1250));errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:3000/upload')
    page.get_by_label('เปิดไฟล์โปรเจกต์',exact=True).set_input_files(dict(name='wall-ux.sketch2spec.json',mimeType='application/json',buffer=json.dumps(project).encode()))
    page.get_by_role('button',name='3D Editor',exact=True).click()
    page.get_by_role('button',name='แบ่งพื้นตามห้อง',exact=True).click()
    d=wait_saved(page,lambda d:len([x for x in d if x.get('floorTiles')])==3)
    floor=next(x for x in d if x['label']=='floor' and x['box']['x2']<100 and x['box']['y2']<100)
    page.get_by_label('เลือกวัตถุในโมเดล',exact=True).select_option(floor['id'])
    page.get_by_title('เลือกวัสดุและดูงบประมาณ',exact=True).click()
    page.get_by_role('button',name='กระเบื้องพื้น',exact=True).click()
    page.get_by_label('ขอบเขตการใช้วัสดุ',exact=True).select_option('room')
    page.get_by_role('button',name=re.compile('กระเบื้องสีเข้ม')).click()
    page.get_by_role('button',name='ใช้กับห้องนี้',exact=True).click()
    d=wait_saved(page,lambda d:any(x['id']==floor['id'] and x.get('materialApplied') for x in d))
    floor_after=next(x for x in d if x['id']==floor['id'])
    page.get_by_role('button',name='สีทาผนัง',exact=True).click()
    expect(page.get_by_role('button',name='ทั้งห้อง',exact=True)).to_have_attribute('aria-pressed','true')
    expect(page.get_by_label('ห้องที่จะทาสีผนัง',exact=True)).to_have_value(floor['id'])
    page.get_by_role('button',name='อิฐแดง',exact=True).click()
    apply=page.get_by_role('button',name='3. ทาสีผนัง',exact=True)
    expect(apply).to_be_enabled();apply.click()
    d=wait_saved(page,lambda d:any(x.get('wallFinishes') for x in d))
    assert next(x for x in d if x['id']==floor['id'])==floor_after
    shared=next(x for x in d if x['id']=='shared')
    assert len(shared['wallFinishes'])==1 and shared['wallFinishes'][0]['side']=='negative' and shared['wallFinishes'][0]['end']<.5
    report('switching from an already-painted floor to wall paint selects the same room and applies successfully without selecting a wall object')
    before=d
    page.get_by_role('button',name='เลือกผนัง 1 ด้านบน',exact=True).click()
    expect(page.get_by_role('button',name='ผนังเดียว',exact=True)).to_have_attribute('aria-pressed','true')
    expect(page.get_by_role('button',name='อิฐแดง',exact=True)).to_have_attribute('aria-pressed','true')
    expect(page.get_by_role('button',name='1. ด้านบน',exact=True)).to_have_attribute('aria-pressed','true')
    page.get_by_role('button',name='คอนกรีตเปลือย',exact=True).click()
    assert saved(page)==before, 'Choosing a swatch must not apply before the explicit button'
    page.screenshot(path=str(OUT/'wall-picker-desktop.png'),full_page=True)
    apply.click()
    after=wait_saved(page,lambda d:any(x['id']=='top' and any(f['materialId']=='wall-concrete' for f in x.get('wallFinishes',[])) for x in d))
    assert [x for x in before if x['id']!='top']==[x for x in after if x['id']!='top']
    f=next(x for x in after if x['id']=='top')['wallFinishes']
    assert len(f)==1 and f[0]['side']=='positive' and f[0]['end']<.5
    page.get_by_title('Undo',exact=True).click();wait_saved(page,lambda d:d==before)
    page.get_by_title('Redo',exact=True).click();wait_saved(page,lambda d:d==after)
    report('numbered room diagram selects exact wall span; material choice stays selected; explicit apply, opposite face protection and undo/redo work')
    # Changing rooms in single-wall mode must choose a valid surface in the new room.
    other=next(x for x in after if x['label']=='floor' and x['box']['x1']>100)
    page.get_by_label('ห้องที่จะทาสีผนัง',exact=True).select_option(other['id'])
    expect(apply).to_be_enabled()
    expect(page.get_by_role('button',name='คอนกรีตเปลือย',exact=True)).to_have_attribute('aria-pressed','true')
    page.set_viewport_size(dict(width=390,height=844))
    page.wait_for_timeout(1000)
    apply.scroll_into_view_if_needed();expect(apply).to_be_visible()
    page.screenshot(path=str(OUT/'wall-picker-mobile.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    report('room change retains chosen color; mobile panel fits and apply remains reachable')
    assert not errors,errors
    browser.close()
