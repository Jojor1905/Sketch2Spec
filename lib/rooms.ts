import { boxFromEdges, labelKind, type Detection, type DetectionBox, type WallFinish, type WallSide } from "./floor-plan"

export function floorBoxes(floor: Detection): DetectionBox[] {
  if (!floor.floorTiles?.length) return [floor.box]
  const b = floor.box
  return floor.floorTiles.map(t => boxFromEdges(b.x1+t.x1*b.width,b.y1+t.y1*b.height,b.x1+t.x2*b.width,b.y1+t.y2*b.height))
}
export function floorAreaPx(floor: Detection) { return floorBoxes(floor).reduce((sum,b) => sum+b.width*b.height,0) }
export function overlapArea(a: DetectionBox[], b: DetectionBox[]) {
  let total = 0
  for (const x of a) for (const y of b) total += Math.max(0,Math.min(x.x2,y.x2)-Math.max(x.x1,y.x1))*Math.max(0,Math.min(x.y2,y.y2)-Math.max(x.y1,y.y1))
  return total
}

/** Surface intervals facing this room.
 * 
 * The previous implementation required the floor edge to be almost exactly on
 * the wall edge (0.001 px by default). AI-generated walls/floors are rarely
 * that exact, so a room could report only 1–2 wall faces even when the room
 * visibly had four walls. This version uses a bounded, wall-thickness-aware
 * tolerance and determines the face from the tile's side of the wall.
 */
export function roomWallFaces(room: Detection, wall: Detection): {side: WallSide; start:number; end:number}[] {
  if (labelKind(wall.label) !== "wall") return []

  const b = wall.box
  const horizontal = b.width >= b.height
  const length = horizontal ? b.width : b.height
  if (length <= 0) return []

  // Match the small geometric errors introduced by detection / resizing, but
  // keep the tolerance bounded so a nearby neighbouring wall is not captured.
  const wallThickness = Math.max(1, Math.min(b.width, b.height))
  const configuredTolerance = Number(room.roomBoundaryTolerancePx ?? 0)
  const tolerance = Math.min(
    14,
    Math.max(6, Number.isFinite(configuredTolerance) ? configuredTolerance : 0, wallThickness),
  )

  const contacts: {side: WallSide; start:number; end:number}[] = []

  for (const tile of floorBoxes(room)) {
    const lo = Math.max(
      horizontal ? b.x1 : b.y1,
      horizontal ? tile.x1 : tile.y1,
    )
    const hi = Math.min(
      horizontal ? b.x2 : b.y2,
      horizontal ? tile.x2 : tile.y2,
    )
    if (hi <= lo) continue

    const roomCenter = horizontal
      ? (tile.y1 + tile.y2) / 2
      : (tile.x1 + tile.x2) / 2
    const wallCenter = horizontal
      ? (b.y1 + b.y2) / 2
      : (b.x1 + b.x2) / 2

    const negativeWallEdge = horizontal ? b.y1 : b.x1
    const positiveWallEdge = horizontal ? b.y2 : b.x2
    const negativeRoomEdge = horizontal ? tile.y2 : tile.x2
    const positiveRoomEdge = horizontal ? tile.y1 : tile.x1

    const negativeGap = Math.abs(negativeRoomEdge - negativeWallEdge)
    const positiveGap = Math.abs(positiveRoomEdge - positiveWallEdge)

    let side: WallSide | null = null

    // Prefer the geometrically nearer side, while also requiring the tile center
    // to lie on that side of the wall. This prevents a neighbouring wall on the
    // opposite side from being selected just because its edge is close.
    if (
      roomCenter <= wallCenter &&
      negativeGap <= tolerance &&
      negativeGap <= positiveGap
    ) {
      side = "negative"
    } else if (
      roomCenter >= wallCenter &&
      positiveGap <= tolerance &&
      positiveGap <= negativeGap
    ) {
      side = "positive"
    } else {
      // Fallback for slightly overlapping/offset AI geometry.
      if (negativeGap <= tolerance && negativeGap < positiveGap) side = "negative"
      else if (positiveGap <= tolerance) side = "positive"
    }

    if (!side) continue

    const alongStart = horizontal ? b.x1 : b.y1
    contacts.push({
      side,
      start: (lo - alongStart) / length,
      end: (hi - alongStart) / length,
    })
  }

  // Adjacent tiles of the same L-shaped room share one continuous finish interval.
  const result: typeof contacts = []
  for (const side of ["negative","positive"] as const) {
    for (const c of contacts.filter(c => c.side === side).sort((a,b) => a.start-b.start)) {
      const last = result.at(-1)
      if (last?.side === side && c.start <= last.end + 1e-6) {
        last.end = Math.max(last.end, c.end)
      } else {
        result.push({...c})
      }
    }
  }
  return result
}

/** Last application wins only inside its side/interval, preserving neighbouring rooms. */
export function paintWallFace(wall: Detection, finish: WallFinish): Detection {
  const kept: WallFinish[] = []
  for (const old of wall.wallFinishes ?? []) {
    if (old.side !== finish.side || old.end <= finish.start || old.start >= finish.end) kept.push({...old})
    else {
      if (old.start < finish.start) kept.push({...old,end:finish.start})
      if (old.end > finish.end) kept.push({...old,start:finish.end})
    }
  }
  return {...wall,wallFinishes:[...kept,{...finish}].sort((a,b)=>a.side.localeCompare(b.side)||a.start-b.start)}
}
export type PaintScope = "selected" | "face" | "room" | "all"
export function applyScopedMaterial(detections: Detection[], target: string, materialId: string, scope: PaintScope, selectedId: string | null, roomId: string | null, side: WallSide, position?: number): Detection[] {
  const room = detections.find(d=>d.id===roomId && labelKind(d.label)==="floor")
  return detections.map(d => {
    if (labelKind(d.label)!==target) return d
    if (scope === "room") {
      if (!room) return d
      if (target === "floor") return d.id===room.id ? {...d, materialId, materialApplied:true} : d
      if (target === "wall") return roomWallFaces(room,d).reduce((wall,face)=>paintWallFace(wall,{...face,materialId}),d)
      return d
    }
    if (scope !== "all" && d.id !== selectedId) return d
    if (scope === "face") {
      if (target !== "wall") return d
      const contacts = detections.filter(r=>labelKind(r.label)==="floor").flatMap(r=>roomWallFaces(r,d)).filter(f=>f.side===side)
      const face = position === undefined ? (contacts.length===1 ? contacts[0] : undefined) : contacts.find(f=>position>=f.start-1e-6 && position<=f.end+1e-6)
      // A clicked room-facing span cannot spill into a neighbouring room.
      if (contacts.length && !face) return d
      return paintWallFace(d,{...(face ?? {side,start:0,end:1}),materialId})
    }
    return {...d,materialId,materialApplied:true,...(target === "wall" ? {wallFinishes:[]} : {})}
  })
}

/** Reject only newly introduced overlap. Legacy projects can still be opened and repaired. */
export function introducesFloorOverlap(before: Detection[], after: Detection[]) {
  const floors = after.filter(d => labelKind(d.label) === "floor")
  const changed = new Set(floors.filter(d => {
    const prior = before.find(p => p.id === d.id)
    return !prior || JSON.stringify([prior.box,prior.floorTiles]) !== JSON.stringify([d.box,d.floorTiles])
  }).map(d => d.id))
  for (let i=0;i<floors.length;i++) for (let j=i+1;j<floors.length;j++) {
    if ((changed.has(floors[i].id) || changed.has(floors[j].id)) && overlapArea(floorBoxes(floors[i]),floorBoxes(floors[j])) > 0.01) return true
  }
  return false
}
