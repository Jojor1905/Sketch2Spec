// Exercise actual TypeScript geometry without adding a test-runner dependency.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, filename)
const {boxFromEdges} = require('../lib/floor-plan.ts')
const {exteriorWallFaces, applyScopedMaterial} = require('../lib/rooms.ts')
const item = (id,label,edges) => ({id,label,box:boxFromEdges(...edges)})
for (const vertical of [false,true]) {
  const orient = edges => vertical ? [edges[1],edges[0],edges[3],edges[2]] : edges
  const wall=item('wall','wall',orient([0,50,100,60]))
  const above=item('above','floor',orient([0,0,100,50]))
  const below=item('below','floor',orient([0,60,100,110]))
  assert.deepEqual(exteriorWallFaces([above,below],wall),[], 'Shared interior wall has no exterior face')
  assert.deepEqual(exteriorWallFaces([above],wall),[{side:'positive',start:0,end:1}])
  const left=item('left','floor',orient([0,60,30,100]))
  const right=item('right','floor',orient([70,60,100,100]))
  assert.deepEqual(exteriorWallFaces([above,left,right],wall),[{side:'positive',start:.3,end:.7}])
  const input=[wall,above,left,right]
  const outside=applyScopedMaterial(input,'wall','outside','face','wall',null,'positive',.5)
  assert.deepEqual(outside[0].wallFinishes,[{side:'positive',start:.3,end:.7,materialId:'outside'}])
  const inside=applyScopedMaterial(outside,'wall','inside','room',null,'left','positive')
  assert(inside[0].wallFinishes.some(f=>f.materialId==='outside' && f.start===.3 && f.end===.7))
  assert(inside[0].wallFinishes.some(f=>f.materialId==='inside' && f.start===0 && f.end===.3))
  assert(!inside[0].wallFinishes.some(f=>f.start>=.7), 'Neighbouring room remains unpainted')
  assert.equal(wall.wallFinishes,undefined,'Painting is immutable for undo')
}
console.log('PASS: horizontal/vertical interior walls, exterior gaps, adjacent-room isolation, immutable paint')
