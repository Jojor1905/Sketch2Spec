import { labelKind, type Detection, type DetectionBox, type ImageSize } from "./floor-plan"

export const DOOR_HEIGHT_M = 2.1
export const WINDOW_SILL_M = 0.95
export const WINDOW_TOP_M = 2.15

function center(box: DetectionBox) { return {x:(box.x1+box.x2)/2,y:(box.y1+box.y2)/2} }
function distancePointToBox(x: number, y: number, box: DetectionBox) {
  const dx = Math.max(box.x1-x,0,x-box.x2), dy = Math.max(box.y1-y,0,y-box.y2)
  return Math.hypot(dx,dy)
}

/** Shared attachment rule for 3D openings, walk collision, and material estimates. */
export function findNearestWall(opening: Detection, walls: Detection[], imageSize: ImageSize): Detection | null {
  const point = center(opening.box)
  const threshold = Math.max(18,Math.max(imageSize.width,imageSize.height)*0.07)
  let nearest: Detection | null = null, distance = Number.POSITIVE_INFINITY
  for (const wall of walls) {
    const next = distancePointToBox(point.x,point.y,wall.box)
    if (next < distance) { distance=next; nearest=wall }
  }
  return distance <= threshold ? nearest : null
}

export function openingsForWalls(detections: Detection[], imageSize: ImageSize) {
  const walls = detections.filter(item => labelKind(item.label)==="wall")
  const result = new Map<string,Detection[]>()
  for (const opening of detections.filter(item => ["door","window"].includes(labelKind(item.label)))) {
    const wall = findNearestWall(opening,walls,imageSize)
    if (wall) result.set(wall.id,[...(result.get(wall.id) ?? []),opening])
  }
  return result
}

/** One exposed wall face, net of the union of door/window opening rectangles. */
export function netWallFaceAreaM2(wall: Detection, openings: Detection[], metersPerPixel: number, heightM: number, from = 0, to = 1) {
  const horizontal = wall.box.width >= wall.box.height
  const first = horizontal ? wall.box.x1 : wall.box.y1
  const lengthPx = horizontal ? wall.box.width : wall.box.height
  const left = Math.max(0,Math.min(1,from)), right = Math.max(left,Math.min(1,to))
  const cuts = openings.map(opening => {
    const kind = labelKind(opening.label)
    if (kind!=="door" && kind!=="window") return null
    const a = (horizontal ? opening.box.x1 : opening.box.y1)-first
    const b = (horizontal ? opening.box.x2 : opening.box.y2)-first
    return {start:Math.max(left,a/lengthPx),end:Math.min(right,b/lengthPx),bottom:kind==="door"?0:WINDOW_SILL_M,top:Math.min(heightM,kind==="door"?DOOR_HEIGHT_M:WINDOW_TOP_M)}
  }).filter((cut): cut is NonNullable<typeof cut> => Boolean(cut && cut.end>cut.start && cut.top>cut.bottom))
  const stops = [...new Set([left,right,...cuts.flatMap(cut=>[cut.start,cut.end])])].sort((a,b)=>a-b)
  let net = 0
  for(let index=0;index<stops.length-1;index++) {
    const a=stops[index],b=stops[index+1],middle=(a+b)/2
    const vertical = cuts.filter(cut=>cut.start<=middle && cut.end>=middle).map(cut=>({bottom:cut.bottom,top:cut.top})).sort((one,two)=>one.bottom-two.bottom)
    let openingHeight=0, currentBottom=-1, currentTop=-1
    for(const interval of vertical) {
      if(interval.bottom>currentTop) { if(currentTop>currentBottom) openingHeight+=currentTop-currentBottom; currentBottom=interval.bottom;currentTop=interval.top }
      else currentTop=Math.max(currentTop,interval.top)
    }
    if(currentTop>currentBottom) openingHeight+=currentTop-currentBottom
    net+=(b-a)*lengthPx*metersPerPixel*Math.max(0,heightM-openingHeight)
  }
  return net
}
