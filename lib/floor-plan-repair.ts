import { floorBoxes, overlapArea } from "./rooms"
import { boxFromEdges, labelKind, makeDetectionId, type Detection, type ImageSize } from "./floor-plan"

/** Split only the requested tiled floor, preserving its occupied area and finish. */
export function splitFloorPieces(detections: Detection[], selectedId: string): Detection[] {
  const floor = detections.find(item => item.id === selectedId)
  if (!floor || labelKind(floor.label) !== "floor" || !floor.floorTiles || floor.floorTiles.length < 2) return detections
  const groupId = makeDetectionId("floor-group")
  const pieces = floor.floorTiles.map((tile, index) => ({
    ...floor,
    id: tile.pieceId ?? (index === 0 ? floor.id : makeDetectionId("floor")),
    roomName: tile.pieceName ?? `${(floor.roomName ?? "พื้น").slice(0, 80)} · ชิ้น ${index + 1}`,
    floorGroupId: floor.floorGroupId ?? groupId,
    floorGroupName: floor.floorGroupName ?? floor.roomName ?? "ห้อง",
    materialId: tile.pieceId ? tile.materialId : floor.materialId,
    materialApplied: tile.pieceId ? tile.materialApplied : floor.materialApplied,
    materialScale: tile.pieceId ? tile.materialScale : floor.materialScale,
    materialRotation: tile.pieceId ? tile.materialRotation : floor.materialRotation,
    box: boxFromEdges(
      floor.box.x1 + tile.x1 * floor.box.width,
      floor.box.y1 + tile.y1 * floor.box.height,
      floor.box.x1 + tile.x2 * floor.box.width,
      floor.box.y1 + tile.y2 * floor.box.height,
    ),
    floorTiles: [{ x1: 0, y1: 0, x2: 1, y2: 1 }],
  }))
  return detections.flatMap(item => item.id === selectedId ? pieces : [item])
}

/** Rejoin only members of the selected room, using their current positions. */
export function groupFloorPieces(detections: Detection[], selectedId: string): Detection[] {
  const selected = detections.find(item => item.id === selectedId)
  if (!selected?.floorGroupId || labelKind(selected.label) !== "floor") return detections
  const members = detections.filter(item => labelKind(item.label) === "floor" && item.floorGroupId === selected.floorGroupId)
  if (members.length < 2) return detections
  const box = boxFromEdges(Math.min(...members.map(d=>d.box.x1)), Math.min(...members.map(d=>d.box.y1)), Math.max(...members.map(d=>d.box.x2)), Math.max(...members.map(d=>d.box.y2)))
  const grouped: Detection = {...selected, box, roomName: selected.floorGroupName ?? "ห้อง", floorTiles: members.flatMap(member => floorBoxes(member).map((part, index) => ({
    x1:(part.x1-box.x1)/box.width, y1:(part.y1-box.y1)/box.height,
    x2:(part.x2-box.x1)/box.width, y2:(part.y2-box.y1)/box.height,
    pieceId: member.floorTiles?.[index]?.pieceId ?? (index === 0 ? member.id : makeDetectionId("floor")),
    pieceName: member.floorTiles?.[index]?.pieceName ?? member.roomName,
    materialId: member.floorTiles?.[index]?.materialId ?? member.materialId,
    materialApplied: member.floorTiles?.[index]?.materialApplied ?? member.materialApplied,
    materialScale: member.floorTiles?.[index]?.materialScale ?? member.materialScale,
    materialRotation: member.floorTiles?.[index]?.materialRotation ?? member.materialRotation,
  })))}
  return detections.flatMap(item => item.id === selectedId ? [grouped] : members.includes(item) ? [] : [item])
}

/** Conservative duplicate removal: retain the higher-confidence box, never merge different finishes. */
export function removeDuplicateWalls(detections: Detection[]): Detection[] {
  const kept: Detection[] = []
  for (const item of [...detections].sort((a, b) => b.confidence - a.confidence)) {
    const a = item.box
    const duplicate = labelKind(item.label) === "wall" && kept.some((other) => {
      if (labelKind(other.label) !== "wall" || other.materialId !== item.materialId || other.materialApplied !== item.materialApplied || other.wallHeightM !== item.wallHeightM || JSON.stringify(other.wallFinishes ?? []) !== JSON.stringify(item.wallFinishes ?? [])) return false
      const b = other.box
      if ((a.width >= a.height) !== (b.width >= b.height)) return false
      const intersection = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1))
      const small = Math.min(a.width * a.height, b.width * b.height)
      const union = a.width * a.height + b.width * b.height - intersection
      return small > 0 && (intersection / union >= 0.8 || intersection / small >= 0.96)
    })
    if (!duplicate) kept.push(item)
  }
  const ids = new Set(kept.map(item => item.id))
  return removeDuplicateOpenings(detections.filter(item => ids.has(item.id)))
}

/** Infer enclosed free space from wall/opening boxes, not from a new AI model.
 * Exact-cell flood fill excludes the exterior; rectangular runs preserve concave rooms.
 * No closed boundary means no invented floor. Existing floors are preserved.
 */
function detectRoomFloors(detections: Detection[], image: ImageSize): Detection[] {
  const walls = detections.filter(d=>labelKind(d.label)==="wall")
  const barriers = detections.filter(item => ["wall", "door", "window"].includes(labelKind(item.label))).map(d => {
    if (labelKind(d.label)==="wall") return d
    const b=d.box
    const candidates=walls.map(w=>{
      const horizontal=w.box.width>=w.box.height
      const center=horizontal?(b.y1+b.y2)/2:(b.x1+b.x2)/2
      const a=w.box, thickness=horizontal?a.height:a.width
      const cross=Math.abs(center-(horizontal?(a.y1+a.y2)/2:(a.x1+a.x2)/2))
      const gap=horizontal?Math.max(a.x1-b.x2,b.x1-a.x2,0):Math.max(a.y1-b.y2,b.y1-a.y2,0)
      return {w,cross,gap,thickness}
    }).filter(c=>c.cross<=c.thickness && c.gap<=Math.max(c.thickness*2,2)).sort((a,b)=>a.cross+a.gap-b.cross-b.gap)
    const host=candidates[0]?.w.box
    const horizontal=host ? host.width>=host.height : b.width>=b.height
    // Door swing / symbol boxes must not carve a hole in the room floor.
    return host?{...d,box:horizontal?boxFromEdges(b.x1,host.y1,b.x2,host.y2):boxFromEdges(host.x1,b.y1,host.x2,b.y2)}:d
  })
  if (barriers.filter(item => labelKind(item.label) === "wall").length < 3) return []
  // Coordinate compression retains the exact wall faces, including fractional pixels.
  const xs = [...new Set([-1, 0, image.width, image.width+1, ...barriers.flatMap(d => [Math.max(0,Math.min(image.width,d.box.x1)),Math.max(0,Math.min(image.width,d.box.x2))])])].sort((a,b)=>a-b)
  const ys = [...new Set([-1, 0, image.height, image.height+1, ...barriers.flatMap(d => [Math.max(0,Math.min(image.height,d.box.y1)),Math.max(0,Math.min(image.height,d.box.y2))])])].sort((a,b)=>a-b)
  const cols = xs.length-1, rows = ys.length-1
  // Refuse pathological imports without discarding existing floors.
  if (cols*rows > 4_000_000) return []
  const occupied = new Uint8Array(cols * rows)
  for (const { box } of barriers) {
    const left = xs.indexOf(Math.max(0,Math.min(image.width,box.x1))), right = xs.indexOf(Math.max(0,Math.min(image.width,box.x2)))
    const top = ys.indexOf(Math.max(0,Math.min(image.height,box.y1))), bottom = ys.indexOf(Math.max(0,Math.min(image.height,box.y2)))
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) occupied[y * cols + x] = 1
  }
  const visited = new Uint8Array(occupied.length)
  const floors: Detection[] = []
  for (let seed = 0; seed < occupied.length; seed++) {
    if (occupied[seed] || visited[seed]) continue
    const queue = [seed]; visited[seed] = 1
    let exterior = false
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i], x = cell % cols, y = Math.floor(cell / cols)
      if (x === 0 || x === cols - 1 || y === 0 || y === rows - 1) exterior = true
      for (const next of [x > 0 ? cell - 1 : -1, x < cols - 1 ? cell + 1 : -1, y > 0 ? cell - cols : -1, y < rows - 1 ? cell + cols : -1]) {
        if (next >= 0 && !occupied[next] && !visited[next]) { visited[next] = 1; queue.push(next) }
      }
    }
    if (exterior || queue.reduce((area,cell) => { const x=cell%cols,y=Math.floor(cell/cols); return area+(xs[x+1]-xs[x])*(ys[y+1]-ys[y]) },0) < 25) continue
    const cells = new Set(queue)
    const roomParts: Detection["box"][] = []
    for (const cell of [...queue].sort((a, b) => a - b)) {
      if (!cells.has(cell)) continue
      const x = cell % cols, y = Math.floor(cell / cols)
      let width = 1, height = 1
      while (x + width < cols && cells.has(cell + width)) width++
      while (y + height < rows && Array.from({ length: width }, (_, dx) => cells.has((y + height) * cols + x + dx)).every(Boolean)) height++
      for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) cells.delete((y + dy) * cols + x + dx)
      const box = boxFromEdges(xs[x], ys[y], xs[x+width], ys[y+height])
      if (box.width <= 0 || box.height <= 0) continue
      roomParts.push(box)
    }
    if (roomParts.length) {
      const box = boxFromEdges(Math.min(...roomParts.map(t => t.x1)), Math.min(...roomParts.map(t => t.y1)), Math.max(...roomParts.map(t => t.x2)), Math.max(...roomParts.map(t => t.y2)))
      floors.push({roomBoundaryTolerancePx: 0.001, id: makeDetectionId("room"), roomName: `ห้อง ${floors.length + 1}`, label: "floor", class_id: -1, confidence: 1, materialApplied: false, box,
        floorTiles: roomParts.map(t => ({x1:(t.x1-box.x1)/box.width,y1:(t.y1-box.y1)/box.height,x2:(t.x2-box.x1)/box.width,y2:(t.y2-box.y1)/box.height}))})
    }
  }
  return floors
}

/** Rebuild explicitly replaces legacy, overlapping rectangles with one object per enclosure.
 * Preserve names/finishes by maximum overlap, reusing each old identity at most once.
 * No enclosed rooms: preserve existing work instead of silently deleting it.
 */
export function rebuildRoomFloors(detections: Detection[], image: ImageSize): Detection[] {
  const rooms = detectRoomFloors(detections, image)
  if (!rooms.length) return detections
  const old = detections.filter(d => labelKind(d.label) === "floor")
  const reused = new Set<string>()
  for (const room of rooms) {
    const matches = old.map(d => ({ d, area: overlapArea(floorBoxes(d), floorBoxes(room)) })).filter(m => m.area > 0).sort((a,b) => b.area-a.area)
    const match = matches.find(m => !reused.has(m.d.id))
    if (match) {
      reused.add(match.d.id)
      const prior = match.d
      room.id = prior.id
      room.roomName = prior.roomName ?? room.roomName
    }
    const materialSource = (match ?? matches[0])?.d
    if (materialSource) for (const key of ["materialId","materialApplied","materialScale","materialRotation"] as const) {
      if (materialSource[key] !== undefined) Object.assign(room, {[key]:materialSource[key]})
    }
  }
  return [...detections.filter(d => labelKind(d.label) !== "floor"), ...rooms]
}

/** Add only enclosures without any existing floor coverage when drawing a new room. */
export function inferRoomFloors(detections: Detection[], image: ImageSize): Detection[] {
  const old = detections.filter(d => labelKind(d.label) === "floor").flatMap(floorBoxes)
  return detectRoomFloors(detections, image).filter(room => overlapArea(old, floorBoxes(room)) === 0)
}

/** Suppress near-identical opening predictions; keep adjacent openings distinct. */
export function removeDuplicateOpenings(detections: Detection[]): Detection[] {
  const kept: Detection[] = []
  for (const d of [...detections].sort((a,b)=>Number(Boolean(b.materialApplied))-Number(Boolean(a.materialApplied)) || b.confidence-a.confidence)) {
    const kind=labelKind(d.label)
    const duplicate=(kind==="door" || kind==="window") && kept.some(other => {
      const otherKind=labelKind(other.label)
      if (otherKind!=="door" && otherKind!=="window") return false
      if ((d.box.width>=d.box.height)!==(other.box.width>=other.box.height)) return false
      const intersection=overlapArea([d.box],[other.box])
      const a=d.box.width*d.box.height,b=other.box.width*other.box.height
      return intersection/Math.max(a+b-intersection,1e-9)>=0.65 || intersection/Math.max(Math.min(a,b),1e-9)>=0.92
    })
    if (!duplicate) kept.push(d)
  }
  const ids=new Set(kept.map(d=>d.id))
  return detections.filter(d=>ids.has(d.id))
}
