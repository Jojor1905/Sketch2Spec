// Run: node tests/floor-plan-repair.cjs
const fs = require('node:fs'), ts = require('typescript'), assert = require('node:assert/strict')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
const { floorAreaPx } = require('../lib/rooms.ts')
const { inferRoomFloors, removeDuplicateWalls } = require('../lib/floor-plan-repair.ts')
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
