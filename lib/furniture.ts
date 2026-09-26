import * as catalogModule from "./furniture-catalog.json"
import { boxFromEdges, clampBox, makeDetectionId, worldScaleFor, type Detection, type DetectionBox, type ImageSize } from "./floor-plan"

export const FURNITURE_CATEGORIES = ["All", "Seating", "Tables", "Storage", "Bedroom", "Lighting", "Decor"] as const
export type FurnitureCategory = (typeof FURNITURE_CATEGORIES)[number]

export type FurnitureCatalogItem = {
  id: string
  name: string
  category: Exclude<FurnitureCategory, "All">
  modelUrl: string
  thumbnail: string
  widthM: number
  depthM: number
  heightM: number
  defaultScale: number
  floorOffset: number
  brand?: string
  sourceUrl?: string
  license?: string
}

const catalogSource: unknown = catalogModule
export const FURNITURE_CATALOG = (Array.isArray(catalogSource) ? catalogSource : (catalogSource as { default: unknown }).default) as FurnitureCatalogItem[]
const byId = new Map(FURNITURE_CATALOG.map(item => [item.id, item]))

export function furnitureCatalogItem(id?: string | null) {
  return id ? byId.get(id) ?? null : null
}

export type FurnitureInstance = {
  id: string
  catalogItemId: string
  /** Position in the same metre-based Three.js world as architectural geometry. */
  position: { x: number; z: number }
  rotationY: number
  scale: { x: number; y: number; z: number }
}

/** One canonical detection supplies the footprint, placement and transform in both views. */
export function furnitureInstanceOf(detection: Detection, imageSize: ImageSize, metersPerPixel: number | null): FurnitureInstance | null {
  const item = furnitureCatalogItem(detection.furnitureCatalogId)
  if (!item) return null // Version-1 block furniture keeps its legacy renderer.
  const worldScale = worldScaleFor(imageSize, metersPerPixel)
  return {
    id: detection.id,
    catalogItemId: item.id,
    position: {
      x: ((detection.box.x1 + detection.box.x2) / 2 - imageSize.width / 2) * worldScale,
      z: ((detection.box.y1 + detection.box.y2) / 2 - imageSize.height / 2) * worldScale,
    },
    rotationY: detection.furnitureRotationY ?? 0,
    scale: {
      x: detection.box.width * worldScale / item.widthM,
      y: detection.furnitureHeightScale ?? item.defaultScale,
      z: detection.box.height * worldScale / item.depthM,
    },
  }
}

export function furnitureDimensionsOf(detection: Detection, imageSize: ImageSize, metersPerPixel: number | null) {
  const item = furnitureCatalogItem(detection.furnitureCatalogId)
  const instance = furnitureInstanceOf(detection, imageSize, metersPerPixel)
  if (!item || !instance) return null
  return {
    widthM: item.widthM * instance.scale.x,
    depthM: item.depthM * instance.scale.z,
    heightM: item.heightM * instance.scale.y,
  }
}

export function makeFurnitureDetection(item: FurnitureCatalogItem, point: { x: number; y: number }, imageSize: ImageSize, metersPerPixel: number | null): Detection {
  const scale = worldScaleFor(imageSize, metersPerPixel)
  const width = item.widthM * item.defaultScale / scale
  const depth = item.depthM * item.defaultScale / scale
  const footprint = clampBox(boxFromEdges(point.x - width / 2, point.y - depth / 2, point.x + width / 2, point.y + depth / 2), imageSize, 1)
  return {
    id: makeDetectionId("furniture"), class_id: -1, label: "furniture", confidence: 1,
    box: footprint,
    furnitureCatalogId: item.id,
    furnitureRotationY: 0,
    furnitureHeightScale: item.defaultScale,
    objectHeightM: item.heightM * item.defaultScale,
  }
}

export function resizeFurnitureUniform(detection: Detection, factor: number, imageSize: ImageSize): Detection {
  const safe = Math.max(0.25, Math.min(factor, 4))
  const centerX = (detection.box.x1 + detection.box.x2) / 2
  const centerY = (detection.box.y1 + detection.box.y2) / 2
  const width = detection.box.width * safe
  const depth = detection.box.height * safe
  return {
    ...detection,
    box: clampBox(boxFromEdges(centerX - width / 2, centerY - depth / 2, centerX + width / 2, centerY + depth / 2), imageSize, 1),
    furnitureHeightScale: (detection.furnitureHeightScale ?? 1) * safe,
    objectHeightM: detection.objectHeightM === undefined ? undefined : detection.objectHeightM * safe,
  }
}

/** Axis-aligned bounds for simple browser Walk collision around rotated furniture. */
export function furnitureCollisionBox(detection: Detection): DetectionBox {
  const angle = detection.furnitureRotationY ?? 0
  const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle))
  const width = detection.box.width * c + detection.box.height * s
  const depth = detection.box.width * s + detection.box.height * c
  const x = (detection.box.x1 + detection.box.x2) / 2
  const y = (detection.box.y1 + detection.box.y2) / 2
  return boxFromEdges(x - width / 2, y - depth / 2, x + width / 2, y + depth / 2)
}
