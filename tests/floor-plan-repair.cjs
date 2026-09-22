// Run: node tests/floor-plan-repair.cjs
const fs = require('node:fs'), ts = require('typescript'), assert = require('node:assert/strict')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
const { floorAreaPx } = require('../lib/rooms.ts')
const { inferRoomFloors, removeDuplicateWalls, splitFloorPieces } = require('../lib/floor-plan-repair.ts')
const { boxFromEdges } = require('../lib/floor-plan.ts')
const item = (id, x1, y1, x2, y2, label = 'wall', confidence = 1) => ({id, label, confidence, class_id: -1, box: boxFromEdges(x1,y1,x2,y2)})
const size = {width: 200, height: 200}
const room = [item('top',20,20,180,30), item('bottom',20,170,180,180), item('left',20,30,30,170), item('right',170,30,180,170)]
const floor = inferRoomFloors(room, size)
assert.equal(floor.length, 1)
assert.deepEqual(floor[0].box, boxFromEdges(30,30,170,170))
assert.equal(inferRoomFloors(room.slice(1), size).length, 0, 'open room must not invent floor')
assert.equal(inferRoomFloors([...room, ...floor], size).length, 0, 'repeated repair must not duplicate floor')
assert.equal(inferRoomFloors([...room, item('divider',95,30,105,170)],size).length, 2)
const doorway = room.filter(x=>x.id !== 'top').concat(item('top-a',20,20,80,30),item('top-b',120,20,180,30),item('door',80,20,120,30,'door'))
assert.equal(inferRoomFloors(doorway,size).length,1,'doors close the room boundary')
const duplicate = {...room[0], id:'duplicate', confidence:0.6}
assert.deepEqual(removeDuplicateWalls([...room,duplicate]),room)
assert.equal(removeDuplicateWalls([...room, {...duplicate, materialId:'different'}]).length,5)
assert.equal(removeDuplicateWalls([...room, item('parallel',20,32,180,42)]).length,5)
assert.equal(removeDuplicateWalls([...room, item('extension',175,20,195,30)]).length,5)
const concave = [...room, item('notch-v',100,30,110,110), item('notch-h',30,100,110,110)]
const pieces = inferRoomFloors(concave,size)
assert.equal(pieces.reduce((sum,p)=>sum+floorAreaPx(p),0),18100,'concave floors must not cover the interior wall notch')
console.log('PASS: enclosed/open/partitioned/doorway/concave floors, idempotence, duplicates, distinct finishes and parallel walls')

const grouped = {...item('grouped',20,30,120,130,'floor'), roomName:'Test room', materialId:'wood', floorTiles:[{x1:0,y1:0,x2:1,y2:0.4},{x1:0,y1:0.4,x2:0.3,y2:1}]}
const beforeSplit = [room[0], grouped]
const snapshot = JSON.stringify(beforeSplit)
const split = splitFloorPieces(beforeSplit, grouped.id)
assert.equal(split.length, 3)
assert.equal(split[0], room[0], 'other objects must remain untouched')
assert.equal(new Set(split.map(d=>d.id)).size, 3, 'pieces need independent IDs')
assert.deepEqual(split.slice(1).map(d=>d.box), [boxFromEdges(20,30,120,70),boxFromEdges(20,70,50,130)])
assert.equal(split.slice(1).reduce((sum,d)=>sum+floorAreaPx(d),0),floorAreaPx(grouped),'preserve occupied floor area')
assert.ok(split.slice(1).every(d=>d.materialId==='wood'))
assert.equal(JSON.stringify(beforeSplit),snapshot,'keep undo snapshot intact')
assert.equal(splitFloorPieces(split, grouped.id),split,'single pieces do not split again')
assert.equal(splitFloorPieces(beforeSplit,room[0].id),beforeSplit,'walls are not split')
console.log('PASS: independent floor pieces, positions, area, material and undo snapshot')

const { groupFloorPieces } = require('../lib/floor-plan-repair.ts')
const { normalizeDetection } = require('../lib/floor-plan.ts')
const { applyScopedMaterial } = require('../lib/rooms.ts')
const { parseProjectFile } = require('../lib/project-file.ts')
const moved = split.map((d,i)=>i===2?{...d,box:boxFromEdges(25,75,55,135),materialId:'different',materialApplied:true}:d)
const joined = groupFloorPieces(moved,moved[2].id)
assert.equal(joined.length,2)
assert.equal(joined[0],room[0])
const again = splitFloorPieces(joined,moved[2].id)
for (const original of moved.slice(1)) {
 const restored=again.find(d=>d.id===original.id)
 assert.deepEqual(restored.box,original.box,'regroup keeps moved pieces in place')
 assert.equal(restored.materialId,original.materialId,'regroup preserves each finish')
}
assert.equal(groupFloorPieces(joined,moved[2].id),joined,'group action is idempotent')
const translated=joined.map(d=>d.id===moved[2].id?{...d,box:boxFromEdges(d.box.x1+10,d.box.y1+15,d.box.x2+10,d.box.y2+15)}:d)
const translatedPieces=splitFloorPieces(translated,moved[2].id)
for (const original of moved.slice(1)) {
 const restored=translatedPieces.find(d=>d.id===original.id)
 assert.equal(restored.box.x1,original.box.x1+10)
 assert.equal(restored.box.y1,original.box.y1+15)
}
const painted=applyScopedMaterial(joined,'floor','new-finish','selected',moved[2].id,null,'positive')
assert.ok(splitFloorPieces(painted,moved[2].id).slice(1).every(d=>d.materialId==='new-finish' && d.materialApplied))
const project={format:'sketch2spec',version:1,project:{fileName:'plan.png',fileType:'image/png',previewDataUrl:'data:image/png;base64,AAAA',imageSize:size,detections:joined,metersPerPixel:0.01,updatedAt:1}}
const loaded=parseProjectFile(JSON.stringify(project)).detections.map(normalizeDetection)
assert.deepEqual(loaded[1].floorTiles,JSON.parse(JSON.stringify(joined[1].floorTiles)))
assert.equal(loaded[1].floorGroupId,joined[1].floorGroupId)
assert.equal(splitFloorPieces(loaded,loaded[1].id).length,3)
console.log('PASS: regroup, repeated toggles, moved pieces, per-piece finishes, group translation, group paint and project reload')
