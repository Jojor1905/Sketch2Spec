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
    expect(page.get_by_role('button',name='เปิดโปรเจกต์',exact=True)).to_be_enabled()
    page.get_by_label('เปิดไฟล์โปรเจกต์',exact=True).set_input_files(dict(name='rooms.sketch2spec.json',mimeType='application/json',buffer=json.dumps(project).encode()))
    page.get_by_role('button',name='3D Editor',exact=True).click()
    page.get_by_role('button',name='แบ่งพื้นตามห้อง',exact=True).click()
    d=wait_saved(page,lambda d:len([x for x in d if x.get('floorTiles')])==3)
    floors=[x for x in d if x['label']=='floor']
    assert len(floors)==3
    for i,a in enumerate(floors):
        for b in floors[i+1:]:
            assert max(0,min(a['box']['x2'],b['box']['x2'])-max(a['box']['x1'],b['box']['x1']))*max(0,min(a['box']['y2'],b['box']['y2'])-max(a['box']['y1'],b['box']['y1']))==0
    top=next(x for x in floors if x['box']['x2']<100 and x['box']['y2']<100)
    right=next(x for x in floors if x['box']['x1']>100)
    page.get_by_title('Undo',exact=True).click();wait_saved(page,lambda d:len(d)==8 and all(not x.get('floorTiles') for x in d))
    page.get_by_title('Redo',exact=True).click();wait_saved(page,lambda d:len(d)==9)
    report('overlapping legacy floors replaced with three disjoint room objects; undo/redo work')
    page.get_by_title('เลือกวัสดุและดูงบประมาณ',exact=True).click()
    page.get_by_role('button',name=re.compile('อิฐแดง')).click()
    assert not any(x.get('materialApplied') or x.get('wallFinishes') for x in saved(page))
    page.get_by_role('button',name='กระเบื้องพื้น',exact=True).click()
    scope=page.get_by_label('ขอบเขตการใช้วัสดุ',exact=True);scope.select_option('room')
    page.get_by_label('ห้องที่จะเปลี่ยนวัสดุ',exact=True).select_option(top['id'])
    page.get_by_label('ชื่อห้อง',exact=True).fill('ห้องนอน')
    page.get_by_role('button',name='ตั้งชื่อ',exact=True).click()
    page.get_by_role('button',name='สีทาผนัง',exact=True).click()
    room=page.get_by_label('ห้องที่จะทาสีผนัง',exact=True);room.select_option(top['id'])
    page.get_by_role('button',name='อิฐแดง',exact=True).click()
    page.get_by_role('button',name='3. ทาสีผนัง',exact=True).click()
    d=wait_saved(page,lambda d:any(x['id']=='shared' and x.get('wallFinishes') for x in d))
    f=next(x for x in d if x['id']=='shared')['wallFinishes']
    assert len(f)==1 and f[0]['side']=='negative' and f[0]['end']<0.5
    left_finish=f[0].copy()
    room.select_option(right['id'])
    page.get_by_role('button',name=re.compile('คอนกรีตเปลือย')).click()
    page.get_by_role('button',name='3. ทาสีผนัง',exact=True).click()
    d=wait_saved(page,lambda d:any(x['id']=='shared' and len(x.get('wallFinishes',[]))==2 for x in d))
    assert left_finish in next(x for x in d if x['id']=='shared')['wallFinishes']
    report('room paint affects only interior-facing wall intervals; opposite and adjacent room faces preserved')
    page.get_by_role('button',name='กระเบื้องพื้น',exact=True).click()
    page.get_by_role('button',name=re.compile('กระเบื้องสีเข้ม')).click()
    page.get_by_label('ห้องที่จะเปลี่ยนวัสดุ',exact=True).select_option(top['id'])
    page.get_by_role('button',name='ใช้กับห้องนี้',exact=True).click()
    d=wait_saved(page,lambda d:any(x['id']==top['id'] and x.get('materialApplied') for x in d))
    assert all(not x.get('materialApplied') for x in d if x['label']=='floor' and x['id']!=top['id'])
    report('room floor material changes one entire room only')
    page.get_by_label('เลือกวัตถุในโมเดล',exact=True).select_option('shared')
    page.get_by_role('button',name='สีทาผนัง',exact=True).click()
    page.get_by_role('button',name=re.compile('อิฐแดง')).click()
    room.select_option(right['id'])
    page.get_by_role('button',name='ผนังเดียว',exact=True).click()
    page.get_by_role('button',name=re.compile(r'^\d+\. ด้านซ้าย$')).click()
    page.get_by_role('button',name='3. ทาสีผนัง',exact=True).click()
    d=wait_saved(page,lambda d:any(x['id']=='shared' and any(f['side']=='positive' and f['materialId']=='wall-brick' for f in x.get('wallFinishes',[])) for x in d))
    assert left_finish in next(x for x in d if x['id']=='shared')['wallFinishes']
    before=d
    page.get_by_role('button',name='ทั้งแปลน',exact=True).click();page.get_by_role('button',name='3. ทาสีผนัง',exact=True).click()
    wait_saved(page,lambda d:all(x.get('materialApplied') and not x.get('wallFinishes') for x in d if x['label']=='wall'))
    page.get_by_title('Undo',exact=True).click();wait_saved(page,lambda d:d==before)
    report('single face and all-plan scopes explicit; all-plan change undoes without losing per-face paint')
    page.get_by_title('เลือกวัสดุและดูงบประมาณ',exact=True).click()
    page.get_by_role('button',name='แบ่งพื้นตามห้อง',exact=True).click()
    wait_saved(page,lambda d:d==before)
    page.wait_for_timeout(1000)
    page.screenshot(path=str(OUT/'room-material-scopes.png'),full_page=True)
    with page.expect_download() as download:
        page.get_by_role('button',name='สำรองโปรเจกต์',exact=True).click()
    payload=json.loads(Path(download.value.path()).read_text())
    assert any(x.get('roomName')=='ห้องนอน' for x in payload['project']['detections'])
    assert any(x.get('wallFinishes') for x in payload['project']['detections'])
    page.reload();wait_saved(page,lambda d:any(x.get('roomName')=='ห้องนอน' for x in d))
    assert any(x.get('wallFinishes') for x in saved(page))
    report('room names, geometry and per-face materials survive rebuild, backup and reload')
    assert not errors,errors
    report('no browser errors')
    # A concave L-room remains one object and its cutout does not intercept the adjacent room.
    page=browser.new_page(viewport=dict(width=1500,height=1150));page.on('pageerror',lambda e:errors.append(str(e)))
    lproject=json.loads(json.dumps(project))
    lproject['project']['detections']=walls[:4]+[item('notch-v',95,30,105,105),item('notch-h',30,95,105,105)]
    lim=Image.new('RGB',(200,200),'white');ldraw=ImageDraw.Draw(lim)
    for obj in lproject['project']['detections']:
        box=obj['box'];ldraw.rectangle([box['x1'],box['y1'],box['x2'],box['y2']],fill='black')
    lraw=BytesIO();lim.save(lraw,format='PNG')
    lproject['project']['previewDataUrl']='data:image/png;base64,'+base64.b64encode(lraw.getvalue()).decode()
    page.goto('http://localhost:3000/upload')
    expect(page.get_by_role('button',name='เปิดโปรเจกต์',exact=True)).to_be_enabled()
    page.get_by_label('เปิดไฟล์โปรเจกต์',exact=True).set_input_files(dict(name='l-room.sketch2spec.json',mimeType='application/json',buffer=json.dumps(lproject).encode()))
    page.get_by_role('button',name='3D Editor',exact=True).click()
    page.get_by_role('button',name='แบ่งพื้นตามห้อง',exact=True).click()
    d=wait_saved(page,lambda d:len([x for x in d if x.get('floorTiles')])==2)
    lroom=next(x for x in d if len(x.get('floorTiles') or [])>1)
    small=next(x for x in d if len(x.get('floorTiles') or [])==1)
    page.get_by_label('เลือกวัตถุในโมเดล',exact=True).select_option(lroom['id'])
    page.get_by_title('เลือกวัสดุและดูงบประมาณ',exact=True).click()
    page.get_by_role('button',name=re.compile('กระเบื้องสีเข้ม')).click()
    page.get_by_role('button',name='ใช้กับที่เลือก',exact=True).click()
    wait_saved(page,lambda d:any(x['id']==lroom['id'] and x.get('materialApplied') for x in d))
    page.get_by_title('เลือกวัสดุและดูงบประมาณ',exact=True).click()
    page.get_by_role('button',name='แบบแปลน',exact=True).click()
    page.wait_for_timeout(1000)
    page.screenshot(path=str(OUT/'l-room-3d.png'),full_page=True)
    page.get_by_role('button',name='2D Review',exact=True).click()
    surface=page.get_by_test_id('plan-edit-surface');surface.scroll_into_view_if_needed()
    bounds=surface.bounding_box()
    def click_image(x,y): page.mouse.click(bounds['x']+x/200*bounds['width'],bounds['y']+y/200*bounds['height'])
    click_image(140,140)
    expect(page.locator('[data-object-id="'+lroom['id']+'"]')).to_have_attribute('aria-pressed','true')
    click_image(60,60)
    expect(page.locator('[data-object-id="'+small['id']+'"]')).to_have_attribute('aria-pressed','true')
    assert page.locator('[data-object-id="'+lroom['id']+'"] svg rect').count()>1
    page.screenshot(path=str(OUT/'l-room-2d.png'),full_page=True)
    report('L-shaped room is a single selectable floor; concave cutout does not overlap or intercept neighbour in 2D')
    before_move=saved(page)
    page.mouse.move(bounds['x']+60/200*bounds['width'],bounds['y']+60/200*bounds['height'])
    page.mouse.down()
    page.mouse.move(bounds['x']+135/200*bounds['width'],bounds['y']+60/200*bounds['height'],steps=10)
    page.mouse.up()
    expect(page.get_by_role('alert').filter(has_text='พื้นทับห้องอื่น')).to_be_visible()
    wait_saved(page,lambda d:d==before_move)
    page.get_by_role('button',name='ปิดข้อความ',exact=True).click()
    report('dragging a room floor into another room is rejected and restores the exact original geometry')
    assert not errors,errors
    browser.close()
