export type DetectionBox = {
  x1: number
  y1: number
  x2: number
  y2: number
  width: number
  height: number
}

export type FloorTile = { x1: number; y1: number; x2: number; y2: number }
export type WallSide = "positive" | "negative"
export type WallFinish = { side: WallSide; start: number; end: number; materialId: string; materialScale?: number; materialRotation?: number }

export type Detection = {
  id: string
  class_id: number
  label: string
  confidence: number
  box: DetectionBox
  /** Optional real-world wall height used by the 3D editor. */
  wallHeightM?: number
  /** Optional finish material used by the 3D material workspace. */
  materialId?: string
  /** True only after the user explicitly applies a material. Preview defaults do not count toward BOQ. */
  materialApplied?: boolean
  /** Optional per-object texture scale multiplier. */
  materialScale?: number
  /** Optional per-object texture rotation in radians. */
  materialRotation?: number
  /** Optional height for furniture or ceiling objects. */
  roomBoundaryTolerancePx?: number
  roomName?: string
  floorTiles?: FloorTile[]
  wallFinishes?: WallFinish[]
  objectHeightM?: number
  /** New prefab identity and transform; the existing box remains the shared 2D footprint. */
  furnitureCatalogId?: string
  furnitureRotationY?: number
  furnitureHeightScale?: number
  /** Hide the object in the 3D edit workspace without removing its geometry. */
  hiddenInEditor?: boolean
  /** Lightweight project-local favorite marker for placed objects. */
  favorite?: boolean
}

export type ImageSize = {
  width: number
  height: number
}

export type EditorTool = "select" | "add-wall" | "add-door" | "add-window" | "add-floor"

export type TransformMode = "translate" | "scale"

export function makeDetectionId(prefix = "object") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function normalizeDetection(
  detection: Partial<Detection> & Omit<Detection, "id">,
  index = 0,
): Detection {
  const x1 = Number(detection.box?.x1 ?? 0)
  const y1 = Number(detection.box?.y1 ?? 0)
  const x2 = Number(detection.box?.x2 ?? x1)
  const y2 = Number(detection.box?.y2 ?? y1)

  return {
    roomName: detection.roomName,
    roomBoundaryTolerancePx: detection.roomBoundaryTolerancePx,
    floorTiles: detection.floorTiles?.map(tile => ({ ...tile })),
    wallFinishes: detection.wallFinishes?.map(finish => ({ ...finish })),
    id: detection.id || makeDetectionId(`det-${index}`),
    class_id: Number(detection.class_id ?? -1),
    label: String(detection.label ?? "object"),
    confidence: Number(detection.confidence ?? 1),
    box: boxFromEdges(x1, y1, x2, y2),
    wallHeightM:
      detection.wallHeightM === undefined
        ? undefined
        : Number(detection.wallHeightM),
    materialId:
      typeof detection.materialId === "string" ? detection.materialId : undefined,
    materialApplied: detection.materialApplied === true,
    materialScale:
      detection.materialScale === undefined ? undefined : Number(detection.materialScale),
    materialRotation:
      detection.materialRotation === undefined ? undefined : Number(detection.materialRotation),
    objectHeightM:
      detection.objectHeightM === undefined ? undefined : Number(detection.objectHeightM),
    furnitureCatalogId: typeof detection.furnitureCatalogId === "string" ? detection.furnitureCatalogId : undefined,
    furnitureRotationY: detection.furnitureRotationY === undefined ? undefined : Number(detection.furnitureRotationY),
    furnitureHeightScale: detection.furnitureHeightScale === undefined ? undefined : Number(detection.furnitureHeightScale),
    hiddenInEditor: detection.hiddenInEditor === true ? true : undefined,
    favorite: detection.favorite === true ? true : undefined,
  }
}

export function boxFromEdges(x1: number, y1: number, x2: number, y2: number): DetectionBox {
  const left = Math.min(x1, x2)
  const top = Math.min(y1, y2)
  const right = Math.max(x1, x2)
  const bottom = Math.max(y1, y2)

  return {
    x1: left,
    y1: top,
    x2: right,
    y2: bottom,
    width: right - left,
    height: bottom - top,
  }
}

export function clampBox(box: DetectionBox, image: ImageSize, minSize = 4): DetectionBox {
  const width = Math.min(Math.max(box.width, minSize), image.width)
  const height = Math.min(Math.max(box.height, minSize), image.height)
  const x1 = Math.min(Math.max(box.x1, 0), Math.max(0, image.width - width))
  const y1 = Math.min(Math.max(box.y1, 0), Math.max(0, image.height - height))

  return boxFromEdges(x1, y1, x1 + width, y1 + height)
}

/** Calibrated projects use metres; uncalibrated previews use the existing 14-unit scene span. */
export function worldScaleFor(image: ImageSize, metersPerPixel: number | null) {
  return metersPerPixel && metersPerPixel > 0 ? metersPerPixel : 14 / Math.max(image.width, image.height, 1)
}

export function labelKind(label: string) {
  const normalized = label.toLowerCase()
  if (normalized.includes("wall")) return "wall"
  if (normalized.includes("door")) return "door"
  if (normalized.includes("window")) return "window"
  if (normalized.includes("floor")) return "floor"
  if (normalized.includes("ceiling")) return "ceiling"
  if (normalized.includes("furniture")) return "furniture"
  return "object"
}

export function colorByLabel(label: string) {
  const kind = labelKind(label)
  if (kind === "wall") return "#3B82F6"
  if (kind === "door") return "#22C55E"
  if (kind === "window") return "#06B6D4"
  if (kind === "floor") return "#8B5CF6"
  if (kind === "ceiling") return "#A78BFA"
  if (kind === "furniture") return "#F97316"
  return "#F59E0B"
}

export function createDetection(kind: "wall" | "door" | "window" | "floor" | "ceiling" | "furniture", image: ImageSize): Detection {
  const presets = {
    wall: { width: image.width * 0.28, height: Math.max(12, image.height * 0.035) },
    door: { width: image.width * 0.09, height: Math.max(12, image.height * 0.035) },
    window: { width: image.width * 0.12, height: Math.max(12, image.height * 0.035) },
    floor: { width: image.width * 0.3, height: image.height * 0.22 },
    ceiling: { width: image.width * 0.3, height: image.height * 0.22 },
    furniture: { width: image.width * 0.14, height: image.height * 0.09 },
  }
  const preset = presets[kind]
  const box = clampBox(
    boxFromEdges(
      image.width / 2 - preset.width / 2,
      image.height / 2 - preset.height / 2,
      image.width / 2 + preset.width / 2,
      image.height / 2 + preset.height / 2,
    ),
    image,
  )

  return {
    id: makeDetectionId(kind),
    class_id: -1,
    label: kind,
    confidence: 1,
    box,
  }
}

export function cloneDetections(detections: Detection[]): Detection[] {
  return detections.map((detection) => ({
    ...detection,
    box: { ...detection.box },
    floorTiles: detection.floorTiles?.map(tile => ({ ...tile })),
    wallFinishes: detection.wallFinishes?.map(finish => ({ ...finish })),
  }))
}

export function detectionsEqual(left: Detection[], right: Detection[]) {
  return JSON.stringify(left) === JSON.stringify(right)
}
