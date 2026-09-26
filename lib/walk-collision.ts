import { labelKind, type Detection, type ImageSize } from "./floor-plan"
import { floorBoxes } from "./rooms"
import { furnitureCatalogItem, furnitureCollisionBox } from "./furniture"

export type WalkRect = { minX: number; maxX: number; minZ: number; maxZ: number }
export type WalkCollision = { barriers: WalkRect[]; supported: WalkRect[] }

function worldRect(box: {x1:number;y1:number;x2:number;y2:number}, imageSize: ImageSize, scale: number): WalkRect {
  return {
    minX:(box.x1-imageSize.width/2)*scale, maxX:(box.x2-imageSize.width/2)*scale,
    minZ:(box.y1-imageSize.height/2)*scale, maxZ:(box.y2-imageSize.height/2)*scale,
  }
}

/** Wall solids are split at door openings. Windows remain solid barriers. */
export function buildWalkCollision(detections: Detection[], imageSize: ImageSize, scale: number, openingsByWall: Map<string, Detection[]>): WalkCollision {
  const barriers: WalkRect[] = []
  for (const wall of detections.filter(item => labelKind(item.label) === "wall")) {
    const horizontal = wall.box.width >= wall.box.height
    const first = horizontal ? wall.box.x1 : wall.box.y1
    const last = horizontal ? wall.box.x2 : wall.box.y2
    const cuts = (openingsByWall.get(wall.id) ?? [])
      .filter(item => labelKind(item.label) === "door")
      .map(item => ({ start:Math.max(first, horizontal ? item.box.x1 : item.box.y1), end:Math.min(last, horizontal ? item.box.x2 : item.box.y2) }))
      .filter(cut => cut.end > cut.start)
      .sort((a,b) => a.start-b.start)
    let cursor = first
    for (const cut of cuts) {
      if (cut.start > cursor) {
        const segment = horizontal ? { ...wall.box, x1:cursor, x2:cut.start } : { ...wall.box, y1:cursor, y2:cut.start }
        barriers.push(worldRect(segment,imageSize,scale))
      }
      cursor = Math.max(cursor,cut.end)
    }
    if (cursor < last) {
      const segment = horizontal ? { ...wall.box, x1:cursor, x2:last } : { ...wall.box, y1:cursor, y2:last }
      barriers.push(worldRect(segment,imageSize,scale))
    }
  }
  for (const furniture of detections.filter(item => labelKind(item.label) === "furniture")) {
    const item = furnitureCatalogItem(furniture.furnitureCatalogId)
    // Lightweight AABB obstacles for large prefabs; small decor stays passable.
    if (item && item.category !== "Lighting" && item.category !== "Decor")
      barriers.push(worldRect(furnitureCollisionBox(furniture), imageSize, scale))
  }
  const floors = detections.filter(item => labelKind(item.label) === "floor").flatMap(floor => floorBoxes(floor))
  const supported = (floors.length ? floors : [{x1:0,y1:0,x2:imageSize.width,y2:imageSize.height}]).map(box => worldRect(box,imageSize,scale))
  return { barriers, supported }
}

export function canWalkAt(x: number, z: number, collision: WalkCollision, radius = 0.22): boolean {
  if (!collision.supported.some(rect => x >= rect.minX-radius && x <= rect.maxX+radius && z >= rect.minZ-radius && z <= rect.maxZ+radius)) return false
  for (const rect of collision.barriers) {
    const nearX = Math.max(rect.minX,Math.min(x,rect.maxX))
    const nearZ = Math.max(rect.minZ,Math.min(z,rect.maxZ))
    if ((x-nearX)**2+(z-nearZ)**2 < radius**2) return false
  }
  return true
}

export function walkSpawn(detections: Detection[], imageSize: ImageSize, scale: number, collision: WalkCollision) {
  const floor = detections.find(item => labelKind(item.label) === "floor")
  const boxes = floor ? floorBoxes(floor) : [{x1:0,y1:0,x2:imageSize.width,y2:imageSize.height}]
  const candidates = boxes.map(box => ({x:((box.x1+box.x2)/2-imageSize.width/2)*scale,z:((box.y1+box.y2)/2-imageSize.height/2)*scale}))
  for (const candidate of candidates) if (canWalkAt(candidate.x,candidate.z,collision)) return candidate
  for (const rect of collision.supported) {
    for (let x=rect.minX+0.5;x<rect.maxX;x+=0.5) for (let z=rect.minZ+0.5;z<rect.maxZ;z+=0.5)
      if (canWalkAt(x,z,collision)) return {x,z}
  }
  return candidates[0] ?? {x:0,z:0}
}
