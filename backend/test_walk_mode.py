"""Walk camera, collision, selection, and material commit in a private browser profile."""
import base64,json,re,time
from io import BytesIO
from PIL import Image
from playwright.sync_api import sync_playwright,expect

def item(id,label,x1,y1,x2,y2):
    return dict(id=id,label=label,class_id=1,confidence=1,box=dict(x1=x1,y1=y1,x2=x2,y2=y2,width=x2-x1,height=y2-y1))

image=BytesIO();Image.new('RGB',(200,200),'white').save(image,format='PNG')
walls=[item('north','wall',20,20,180,30),item('south','wall',20,170,180,180),item('west','wall',20,30,30,170),item('east','wall',170,30,180,170)]
project=dict(format='sketch2spec',version=1,project=dict(fileName='walk.png',fileType='image/png',previewDataUrl='data:image/png;base64,'+base64.b64encode(image.getvalue()).decode(),imageSize=dict(width=200,height=200),detections=walls+[item('room','floor',30,30,170,170),item('east-door','door',170,85,180,115)],metersPerPixel=0.03,updatedAt=1))

def saved(page):
    return page.evaluate("""() => new Promise(resolve => { const r=indexedDB.open('sketch2spec',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects').objectStore('projects').get('active');q.onsuccess=()=>{resolve(q.result?.detections ?? null);db.close()}}})""")

def position(page):
    value=page.locator('canvas[data-walk-eye-height]').get_attribute('data-walk-position')
    return tuple(float(v) for v in value.split(','))

def move_until(page,key,axis,starting,minimum):
    page.keyboard.down(key)
    try:
        page.wait_for_function("""({axis,starting,minimum}) => {
          const value=document.querySelector('canvas[data-walk-eye-height]')?.dataset.walkPosition
          return value && Math.abs(Number(value.split(',')[axis])-starting)>minimum
        }""",arg=dict(axis=axis,starting=starting,minimum=minimum),timeout=6000)
    finally:
        page.keyboard.up(key)
    return position(page)

def wait_saved(page,predicate):
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        result=saved(page)
        if result is not None and predicate(result): return result
        page.wait_for_timeout(100)
    raise AssertionError('walk state was not saved')

with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport=dict(width=1500,height=1000));errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto('http://localhost:3000/upload')
    page.get_by_label('เปิดไฟล์โปรเจกต์',exact=True).set_input_files(dict(name='walk.sketch2spec.json',mimeType='application/json',buffer=json.dumps(project).encode()))
    wait_saved(page,lambda d:len(d)==6)
    page.get_by_role('button',name='3D Editor',exact=True).click()
    page.get_by_role('button',name='Walk',exact=True).first.click()
    expect(page.get_by_role('button',name='Start walking')).to_be_visible()
    page.wait_for_function('document.querySelector("canvas[data-walk-eye-height]") !== null')
    assert page.locator('canvas[data-walk-eye-height]').get_attribute('data-walk-eye-height')=='1.65'
    assert page.get_by_role('button',name='ปรับขนาด').count()==0,'structural controls must be hidden in Walk Mode'
    page.get_by_role('button',name='Start walking').click()
    page.wait_for_function('document.pointerLockElement !== null')
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    start=position(page)
    forward=move_until(page,'w',1,start[1],.3)
    assert forward[1] < start[1]-.3,(start,forward)
    back=move_until(page,'s',1,forward[1],.3)
    assert back[1] > forward[1]+.3,(forward,back)
    right=move_until(page,'d',0,back[0],.25)
    assert right[0] > back[0]+.25,(back,right)
    left=move_until(page,'a',0,right[0],.25)
    assert left[0] < right[0]-.25,(right,left)
    page.keyboard.down('w');page.wait_for_timeout(3000);page.keyboard.up('w')
    blocked=position(page)
    assert blocked[1] > -2.0,blocked
    canvas=page.locator('canvas[data-walk-eye-height]')
    box=canvas.bounding_box();page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
    page.wait_for_function('document.pointerLockElement === null')
    expect(page.get_by_text('Exterior',exact=True).first).to_be_visible()
    expect(page.get_by_label('Search materials')).to_be_visible()
    before=saved(page)
    page.get_by_label('Search materials').fill('GRIT Honey')
    product=page.get_by_role('button',name=re.compile('True Sensation GRIT Honey Brown'))
    product.hover();page.wait_for_timeout(700)
    assert saved(page)==before,'Walk Mode hover must not persist'
    product.click()
    wait_saved(page,lambda d:any(x['id']=='north' and any(f['materialId']=='scg-grit-honey' for f in (x.get('wallFinishes') or [])) for x in d))
    page.keyboard.press('Escape')
    expect(page.get_by_role('button',name='Walk',exact=True).first).to_have_attribute('aria-pressed','false')
    page.get_by_title('Undo',exact=True).click()
    wait_saved(page,lambda d:d==before)
    assert not errors,errors
    browser.close()
    print('PASS: Walk starts at 1.65 m; WASD moves; wall blocks; clicking selects surface and releases pointer; material hover/commit and post-Walk undo work')
