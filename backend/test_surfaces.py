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

# Fractional boundaries and two rooms on the camera-facing side of a shared wall.
walls[-1]=item('branch',105,95,170,105)
walls=[{**d,'box':item('x',d['box']['x1']*6.13+.27,d['box']['y1']*6.13+.19,d['box']['x2']*6.13+.27,d['box']['y2']*6.13+.19)['box']} for d in walls]
project['project']['detections']=walls+[item('door-a',400,123,520,184,'door'),{**item('door-b',402,123,520,184,'window'),'confidence':.5}]
project['project']['imageSize']=dict(width=1226,height=1226)
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True,timeout=30000)
    page=browser.new_page(viewport=dict(width=1600,height=1250));errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://localhost:3000/upload')
    page.get_by_label('เปิดไฟล์โปรเจกต์',exact=True).set_input_files(dict(name='surface.sketch2spec.json',mimeType='application/json',buffer=json.dumps(project).encode()))
    page.get_by_role('button',name='3D Editor',exact=True).click()
    page.get_by_text('เครื่องมือเพิ่มเติม · จัดแนว แบ่งห้อง เลือกชิ้นงานที่ถูกบัง',exact=True).click()
    page.get_by_role('button',name='แบ่งพื้นตามห้อง',exact=True).click()
    d=wait_saved(page,lambda d:len([x for x in d if x.get('floorTiles')])==3)
    assert len([x for x in d if x['label'] in ('door','window')])==1
    floors=[x for x in d if x['label']=='floor']
    shared=next(x for x in d if x['id']=='shared')
    for r in floors:
        edge=r['box']['x2'] if r['box']['x2']<shared['box']['x1']+1 else r['box']['x1']
        assert min(abs(edge-shared['box']['x1']),abs(edge-shared['box']['x2']))<1e-7
    page.wait_for_timeout(1600)
    # Probe the visible central wall instead of relying on a screen pixel that
    # changes when the calibrated house size or viewport changes.
    canvas=page.get_by_test_id('editor-3d-canvas');bounds=canvas.bounding_box()
    found=False
    for fy in (.38,.45,.52,.59,.66,.73):
        for fx in (.36,.42,.48,.54,.60,.66):
            page.mouse.click(bounds['x']+bounds['width']*fx,bounds['y']+bounds['height']*fy)
            if page.get_by_label('เลือกวัตถุในโมเดล',exact=True).input_value()=='shared' and page.get_by_role('button',name='ผนังเดียว',exact=True).get_attribute('aria-pressed')=='true':
                found=True;break
        if found:break
    assert found,'clicking the visible shared wall should select one physical face'
    expect(page.get_by_role('button',name='ผนังเดียว',exact=True)).to_have_attribute('aria-pressed','true')
    expect(page.get_by_label('เลือกวัตถุในโมเดล',exact=True)).to_have_value('shared')
    page.get_by_role('button',name=re.compile('อิฐแดง')).click()
    page.screenshot(path=str(OUT/'surface-before-paint.png'),full_page=True)
    d=wait_saved(page,lambda d:any(x['id']=='shared' and x.get('wallFinishes') for x in d))
    f=next(x for x in d if x['id']=='shared')['wallFinishes']
    assert len(f)==1 and f[0]['side']=='positive' and (f[0]['end']<.5 or f[0]['start']>.5),f
    other=next(r for r in floors if r['box']['x1']>shared['box']['x2']-1 and ((r['box']['y1']>600) if f[0]['end']<.5 else (r['box']['y2']<650)))
    page.get_by_label('ห้องที่จะทาสีผนัง',exact=True).select_option(other['id'])
    page.get_by_role('button',name=re.compile(r'^\d+\. ด้านซ้าย$')).click()
    page.get_by_role('button',name=re.compile('คอนกรีตเปลือย')).click()
    d=wait_saved(page,lambda d:any(x['id']=='shared' and len(x.get('wallFinishes',[]))==2 for x in d))
    final=next(x for x in d if x['id']=='shared')['wallFinishes']
    assert f[0] in final and all(x['side']=='positive' for x in final)
    page.get_by_title('เลือกวัสดุและดูงบประมาณ',exact=True).click()
    page.screenshot(path=str(OUT/'surface-after-paint.png'),full_page=True)
    assert not errors,errors
    report('fractional floors flush; duplicate opening removed; physical click defaults to one room-facing span; room surface picker preserves neighbour and opposite side; no browser errors')
    browser.close()
