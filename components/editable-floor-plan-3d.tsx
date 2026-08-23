"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber"
import { Edges, Environment, Html, OrbitControls } from "@react-three/drei"
import {
  Box,
  CircleHelp,
  Copy,
  DoorOpen,
  Eye,
  EyeOff,
  Grid2X2,
  Grid3X3,
  Home,
  Heart,
  GitCompareArrows,
  Sun,
  Moon,
  Lightbulb,
  Layers3,
  Magnet,
  Maximize2,
  MousePointer2,
  Paintbrush,
  ReceiptText,
  Download,
  PanelTop,
  Redo2,
  RectangleHorizontal,
  RotateCcw,
  RotateCw,
  Ruler,
  SquareDashed,
  SlidersHorizontal,
  Trash2,
  Undo2,
  WandSparkles,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react"
import { DoubleSide, MOUSE, Plane, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader, Vector2, Vector3 } from "three"

import { Button } from "@/components/ui/button"
import {
  calculateBudget,
  materialById,
  materialsForCategory,
  targetForDetection,
  type MaterialCategory,
  type MaterialDefinition,
  type MaterialTarget,
} from "@/lib/materials"
import {
  createProceduralPreviewDataUrl,
  createProceduralTextures,
} from "@/lib/procedural-textures"
import {
  boxFromEdges,
  clampBox,
  cloneDetections,
  colorByLabel,
  labelKind,
  makeDetectionId,
  type Detection,
  type DetectionBox,
  type ImageSize,
} from "@/lib/floor-plan"

type BuildTool = "select" | "wall" | "room" | "floor" | "ceiling" | "furniture" | "door" | "window"
type EditorView = "plan" | "perspective"
type SnapMode = "smart" | "grid" | "free"
type WallViewMode = "up" | "cutaway" | "down"
type LightingPreset = "day" | "warm" | "night" | "studio"
type CameraCommand =
  | "home"
  | "plan"
  | "top"
  | "focus"
  | "rotate-left"
  | "rotate-right"
  | "zoom-in"
  | "zoom-out"
type WallOrientation = "horizontal" | "vertical"
type DragOperation =
  | "move"
  | "resize-start"
  | "resize-end"
  | "resize-nw"
  | "resize-ne"
  | "resize-sw"
  | "resize-se"

type Props = {
  detections: Detection[]
  imageSize: ImageSize
  selectedId: string | null
  metersPerPixel: number | null
  floorMaterialId: string
  onFloorMaterialChange: (materialId: string) => void
  onSelect: (id: string | null) => void
  onLiveChange: (detections: Detection[]) => void
  onCommit: (detections: Detection[]) => void
  onDeleteSelected: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

const DEFAULT_WALL_HEIGHT = 2.8
const DOOR_HEIGHT = 2.1
const WINDOW_SILL = 0.95
const WINDOW_TOP = 2.15
const MIN_MAJOR_SIZE_PX = 8
const MIN_FLOOR_SIZE_PX = 12
const DRAG_PLANE = new Plane(new Vector3(0, 1, 0), 0)

type MaterialTextureBundle = {
  colorMap: Texture
  roughnessMap: Texture
  bumpMap?: Texture
  normalMap?: Texture
  source: "procedural" | "image"
}

function disposeTextureBundle(bundle: MaterialTextureBundle | null) {
  if (!bundle) return
  bundle.colorMap.dispose()
  bundle.bumpMap?.dispose()
  bundle.normalMap?.dispose()
  bundle.roughnessMap.dispose()
}

function loadTexture(loader: TextureLoader, url: string) {
  return new Promise<Texture>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject)
  })
}

function configureImageTexture(
  source: Texture,
  repeatX: number,
  repeatY: number,
  rotation: number,
  isColorMap: boolean,
) {
  const texture = source.clone()
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.center.set(0.5, 0.5)
  texture.rotation = rotation
  texture.repeat.set(Math.max(0.35, repeatX), Math.max(0.35, repeatY))
  texture.anisotropy = 8
  if (isColorMap) texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function useMaterialTextureBundle(
  material: MaterialDefinition,
  repeatX: number,
  repeatY: number,
) {
  const safeRepeatX = Math.max(0.35, Number(repeatX.toFixed(2)))
  const safeRepeatY = Math.max(0.35, Number(repeatY.toFixed(2)))
  const procedural = useMemo<MaterialTextureBundle>(() => {
    const bundle = createProceduralTextures(
      material.textureStyle,
      material.color,
      safeRepeatX,
      safeRepeatY,
    )
    return { ...bundle, source: "procedural" }
  }, [material.color, material.textureStyle, safeRepeatX, safeRepeatY])

  useEffect(() => () => disposeTextureBundle(procedural), [procedural])

  const [sourceMaps, setSourceMaps] = useState<{
    color: Texture
    normal?: Texture
    roughness: Texture
  } | null>(null)

  useEffect(() => {
    const maps = material.textureMaps
    if (!maps?.color) {
      setSourceMaps(null)
      return
    }

    setSourceMaps(null)
    let cancelled = false
    const loader = new TextureLoader()
    const loaded: Texture[] = []

    Promise.all([
      loadTexture(loader, maps.color),
      maps.normal ? loadTexture(loader, maps.normal) : Promise.resolve(undefined),
      maps.roughness ? loadTexture(loader, maps.roughness) : Promise.resolve(undefined),
    ])
      .then(([color, normal, roughness]) => {
        if (cancelled) {
          color.dispose()
          normal?.dispose()
          roughness?.dispose()
          return
        }
        loaded.push(color)
        if (normal) loaded.push(normal)
        if (roughness) loaded.push(roughness)
        setSourceMaps({
          color,
          normal,
          roughness: roughness ?? color,
        })
      })
      .catch(() => {
        if (!cancelled) setSourceMaps(null)
      })

    return () => {
      cancelled = true
      loaded.forEach((texture) => texture.dispose())
    }
  }, [material.textureMaps])

  const imageBundle = useMemo<MaterialTextureBundle | null>(() => {
    if (!sourceMaps) return null
    const rotation = material.textureRotation ?? 0
    return {
      colorMap: configureImageTexture(sourceMaps.color, safeRepeatX, safeRepeatY, rotation, true),
      normalMap: sourceMaps.normal
        ? configureImageTexture(sourceMaps.normal, safeRepeatX, safeRepeatY, rotation, false)
        : undefined,
      roughnessMap: configureImageTexture(
        sourceMaps.roughness,
        safeRepeatX,
        safeRepeatY,
        rotation,
        false,
      ),
      source: "image",
    }
  }, [material.textureRotation, safeRepeatX, safeRepeatY, sourceMaps])

  useEffect(() => () => disposeTextureBundle(imageBundle), [imageBundle])
  return imageBundle ?? procedural
}

function previewUrlForMaterial(material: MaterialDefinition) {
  if (material.previewImage) return material.previewImage
  if (typeof document === "undefined") return null
  return createProceduralPreviewDataUrl(material.textureStyle, material.color)
}

function MaterialThumbnail({
  material,
  active,
}: {
  material: MaterialDefinition
  active: boolean
}) {
  const previewUrl = useMemo(() => {
    return previewUrlForMaterial(material)
  }, [material])

  return (
    <span
      className={`relative h-14 w-16 shrink-0 overflow-hidden rounded-xl border shadow-inner transition ${
        active ? "border-primary/50 ring-2 ring-primary/15" : "border-black/10"
      }`}
      style={{
        backgroundColor: material.color,
        backgroundImage: previewUrl ? `url(${previewUrl})` : undefined,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
      aria-hidden="true"
    >
      <span className="absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-black/25 to-transparent" />
      <span className="absolute right-1 top-1 rounded-md bg-white/80 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-700 shadow-sm backdrop-blur-sm">
        {material.textureMaps ? "REAL" : "PBR"}
      </span>
    </span>
  )
}

function formatDimension(valuePx: number, metersPerPixel: number | null) {
  if (!metersPerPixel) return `${Math.round(valuePx)} px`
  return `${(valuePx * metersPerPixel).toFixed(2)} m`
}

function formatWallThickness(valuePx: number, metersPerPixel: number | null) {
  if (!metersPerPixel) return `${Math.round(valuePx)} px`
  return `${Math.round(valuePx * metersPerPixel * 100)} cm`
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value)
}

function wallThicknessPx(box: DetectionBox) {
  return orientationOf(box) === "horizontal" ? box.height : box.width
}

function wallLengthPx(box: DetectionBox) {
  return orientationOf(box) === "horizontal" ? box.width : box.height
}

function clampWallThicknessPx(value: number, imageSize: ImageSize) {
  // Do not use a fixed 48 px cap. Scanned plans can have much thicker walls
  // after resizing, and capping the draft made a continued wall visibly thinner
  // than the source wall. Keep only a generous image-relative safety limit.
  const maxThickness = Math.max(4, Math.min(imageSize.width, imageSize.height) * 0.35)
  return Math.max(4, Math.min(value, maxThickness))
}

function inferredWallThicknessPx(detections: Detection[], imageSize: ImageSize) {
  const values = detections
    .filter((item) => labelKind(item.label) === "wall")
    .map((item) => wallThicknessPx(item.box))
    .filter((value) => Number.isFinite(value) && value >= 4)
  if (!values.length) {
    return clampWallThicknessPx(
      Math.max(7, Math.max(imageSize.width, imageSize.height) * 0.022),
      imageSize,
    )
  }
  return clampWallThicknessPx(median(values), imageSize)
}

function distancePointToWallBox(point: { x: number; y: number }, box: DetectionBox) {
  const dx = Math.max(box.x1 - point.x, 0, point.x - box.x2)
  const dy = Math.max(box.y1 - point.y, 0, point.y - box.y2)
  return Math.hypot(dx, dy)
}

function nearestWallForThickness(
  point: { x: number; y: number },
  walls: Detection[],
  imageSize: ImageSize,
) {
  let best: Detection | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  walls.forEach((wall) => {
    const thickness = wallThicknessPx(wall.box)
    const threshold = Math.max(10, Math.min(36, thickness * 1.75))
    const distance = distancePointToWallBox(point, wall.box)
    if (distance <= threshold && distance < bestDistance) {
      best = wall
      bestDistance = distance
    }
  })
  return best
}

function nearestWallForConnection(
  point: { x: number; y: number },
  walls: Detection[],
  imageSize: ImageSize,
) {
  let best: Detection | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  const imageLimit = Math.max(6, Math.min(18, Math.max(imageSize.width, imageSize.height) * 0.012))

  walls.forEach((wall) => {
    const thickness = wallThicknessPx(wall.box)
    const threshold = Math.max(5, Math.min(imageLimit, thickness * 0.75))
    const distance = distancePointToWallBox(point, wall.box)
    if (distance <= threshold && distance < bestDistance) {
      best = wall
      bestDistance = distance
    }
  })

  return best
}

function wallHeightOf(detection: Detection) {
  const value = Number(detection.wallHeightM ?? DEFAULT_WALL_HEIGHT)
  return Number.isFinite(value) ? Math.min(4.5, Math.max(2.2, value)) : DEFAULT_WALL_HEIGHT
}

function snapToGrid(value: number, step: number) {
  const safeStep = Math.max(1, step)
  return Math.round(value / safeStep) * safeStep
}

function clampPoint(point: { x: number; y: number }, imageSize: ImageSize) {
  return {
    x: Math.min(imageSize.width, Math.max(0, point.x)),
    y: Math.min(imageSize.height, Math.max(0, point.y)),
  }
}

function snapPointForMode(
  point: { x: number; y: number },
  detections: Detection[],
  imageSize: ImageSize,
  snapMode: SnapMode,
  gridStepPx: number,
) {
  if (snapMode === "free") return clampPoint(point, imageSize)
  if (snapMode === "grid") {
    return clampPoint(
      { x: snapToGrid(point.x, gridStepPx), y: snapToGrid(point.y, gridStepPx) },
      imageSize,
    )
  }
  return snapPoint(point, detections, imageSize)
}

function resizeWallThicknessBox(
  box: DetectionBox,
  targetThicknessPx: number,
  imageSize: ImageSize,
) {
  const safeThickness = Math.max(4, Math.min(targetThicknessPx, Math.max(imageSize.width, imageSize.height)))
  const center = centerOf(box)

  if (orientationOf(box) === "horizontal") {
    return clampBox(
      boxFromEdges(box.x1, center.y - safeThickness / 2, box.x2, center.y + safeThickness / 2),
      imageSize,
      4,
    )
  }

  return clampBox(
    boxFromEdges(center.x - safeThickness / 2, box.y1, center.x + safeThickness / 2, box.y2),
    imageSize,
    4,
  )
}

function parseThicknessInput(
  rawValue: string,
  metersPerPixel: number | null,
) {
  const value = Number(rawValue)
  if (!Number.isFinite(value) || value <= 0) return null
  return metersPerPixel ? value / 100 / metersPerPixel : value
}

function orientationOf(box: DetectionBox): WallOrientation {
  return box.width >= box.height ? "horizontal" : "vertical"
}

function centerOf(box: DetectionBox) {
  return {
    x: (box.x1 + box.x2) / 2,
    y: (box.y1 + box.y2) / 2,
  }
}

function worldScaleFor(imageSize: ImageSize) {
  return 14 / Math.max(imageSize.width, imageSize.height, 1)
}

function worldPointToImage(point: Vector3, imageSize: ImageSize) {
  const scale = worldScaleFor(imageSize)
  return {
    x: Math.min(imageSize.width, Math.max(0, point.x / scale + imageSize.width / 2)),
    y: Math.min(imageSize.height, Math.max(0, point.z / scale + imageSize.height / 2)),
  }
}

function distancePointToBox(x: number, y: number, box: DetectionBox) {
  const dx = Math.max(box.x1 - x, 0, x - box.x2)
  const dy = Math.max(box.y1 - y, 0, y - box.y2)
  return Math.hypot(dx, dy)
}

function findNearestWall(opening: Detection, walls: Detection[], imageSize: ImageSize) {
  const center = centerOf(opening.box)
  const threshold = Math.max(18, Math.max(imageSize.width, imageSize.height) * 0.07)
  let nearest: Detection | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const wall of walls) {
    const distance = distancePointToBox(center.x, center.y, wall.box)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = wall
    }
  }

  return nearestDistance <= threshold ? nearest : null
}

function snapOpeningToWall(opening: Detection, wall: Detection, imageSize: ImageSize): Detection {
  const wallOrientation = orientationOf(wall.box)
  const openingCenter = centerOf(opening.box)
  const major = Math.max(opening.box.width, opening.box.height, MIN_MAJOR_SIZE_PX)
  const wallMinor = wallOrientation === "horizontal" ? wall.box.height : wall.box.width
  const minor = Math.max(
    4,
    Math.min(
      Math.max(6, wallMinor * 0.72),
      Math.min(opening.box.width, opening.box.height),
    ),
  )

  let nextBox: DetectionBox
  if (wallOrientation === "horizontal") {
    const maxMajor = Math.max(MIN_MAJOR_SIZE_PX, wall.box.width - 4)
    const safeMajor = Math.min(major, maxMajor)
    const centerX = Math.min(
      Math.max(openingCenter.x, wall.box.x1 + safeMajor / 2 + 2),
      wall.box.x2 - safeMajor / 2 - 2,
    )
    const centerY = (wall.box.y1 + wall.box.y2) / 2
    nextBox = boxFromEdges(
      centerX - safeMajor / 2,
      centerY - minor / 2,
      centerX + safeMajor / 2,
      centerY + minor / 2,
    )
  } else {
    const maxMajor = Math.max(MIN_MAJOR_SIZE_PX, wall.box.height - 4)
    const safeMajor = Math.min(major, maxMajor)
    const centerX = (wall.box.x1 + wall.box.x2) / 2
    const centerY = Math.min(
      Math.max(openingCenter.y, wall.box.y1 + safeMajor / 2 + 2),
      wall.box.y2 - safeMajor / 2 - 2,
    )
    nextBox = boxFromEdges(
      centerX - minor / 2,
      centerY - safeMajor / 2,
      centerX + minor / 2,
      centerY + safeMajor / 2,
    )
  }

  return { ...opening, box: clampBox(nextBox, imageSize) }
}

function snapOpeningToNearestWall(opening: Detection, walls: Detection[], imageSize: ImageSize) {
  const wall = findNearestWall(opening, walls, imageSize)
  return wall ? snapOpeningToWall(opening, wall, imageSize) : opening
}

function closestSnapDelta(values: number[], candidates: number[], threshold: number) {
  let best = 0
  let bestDistance = threshold + 1
  for (const value of values) {
    for (const candidate of candidates) {
      const delta = candidate - value
      const distance = Math.abs(delta)
      if (distance < bestDistance) {
        bestDistance = distance
        best = delta
      }
    }
  }
  return bestDistance <= threshold ? best : 0
}

function snapPoint(
  point: { x: number; y: number },
  detections: Detection[],
  imageSize: ImageSize,
) {
  const threshold = Math.max(
    5,
    Math.min(16, Math.max(imageSize.width, imageSize.height) * 0.012),
  )
  const xCandidates = [0, imageSize.width]
  const yCandidates = [0, imageSize.height]

  detections.forEach((item) => {
    xCandidates.push(item.box.x1, item.box.x2, (item.box.x1 + item.box.x2) / 2)
    yCandidates.push(item.box.y1, item.box.y2, (item.box.y1 + item.box.y2) / 2)
  })

  return {
    x: Math.min(
      imageSize.width,
      Math.max(0, point.x + closestSnapDelta([point.x], xCandidates, threshold)),
    ),
    y: Math.min(
      imageSize.height,
      Math.max(0, point.y + closestSnapDelta([point.y], yCandidates, threshold)),
    ),
  }
}

function snapMovedBox(
  box: DetectionBox,
  detectionId: string,
  detections: Detection[],
  imageSize: ImageSize,
) {
  const threshold = Math.max(
    5,
    Math.min(16, Math.max(imageSize.width, imageSize.height) * 0.012),
  )
  const others = detections.filter((item) => item.id !== detectionId)
  const xCandidates = [0, imageSize.width]
  const yCandidates = [0, imageSize.height]

  for (const other of others) {
    xCandidates.push(other.box.x1, other.box.x2, (other.box.x1 + other.box.x2) / 2)
    yCandidates.push(other.box.y1, other.box.y2, (other.box.y1 + other.box.y2) / 2)
  }

  const center = centerOf(box)
  const dx = closestSnapDelta([box.x1, box.x2, center.x], xCandidates, threshold)
  const dy = closestSnapDelta([box.y1, box.y2, center.y], yCandidates, threshold)

  return clampBox(
    boxFromEdges(box.x1 + dx, box.y1 + dy, box.x2 + dx, box.y2 + dy),
    imageSize,
  )
}

function snapMovedBoxToGrid(
  box: DetectionBox,
  imageSize: ImageSize,
  gridStepPx: number,
) {
  const center = centerOf(box)
  const targetX = snapToGrid(center.x, gridStepPx)
  const targetY = snapToGrid(center.y, gridStepPx)
  return clampBox(
    boxFromEdges(
      box.x1 + targetX - center.x,
      box.y1 + targetY - center.y,
      box.x2 + targetX - center.x,
      box.y2 + targetY - center.y,
    ),
    imageSize,
  )
}

function snapResizeBoxToGrid(
  box: DetectionBox,
  operation: DragOperation,
  orientation: WallOrientation,
  imageSize: ImageSize,
  gridStepPx: number,
) {
  if (orientation === "horizontal") {
    if (operation === "resize-start") {
      const x1 = Math.min(snapToGrid(box.x1, gridStepPx), box.x2 - MIN_MAJOR_SIZE_PX)
      return boxFromEdges(Math.max(0, x1), box.y1, box.x2, box.y2)
    }
    const x2 = Math.max(snapToGrid(box.x2, gridStepPx), box.x1 + MIN_MAJOR_SIZE_PX)
    return boxFromEdges(box.x1, box.y1, Math.min(imageSize.width, x2), box.y2)
  }
  if (operation === "resize-start") {
    const y1 = Math.min(snapToGrid(box.y1, gridStepPx), box.y2 - MIN_MAJOR_SIZE_PX)
    return boxFromEdges(box.x1, Math.max(0, y1), box.x2, box.y2)
  }
  const y2 = Math.max(snapToGrid(box.y2, gridStepPx), box.y1 + MIN_MAJOR_SIZE_PX)
  return boxFromEdges(box.x1, box.y1, box.x2, Math.min(imageSize.height, y2))
}

function snapResizeEdge(
  value: number,
  axis: "x" | "y",
  detectionId: string,
  detections: Detection[],
  imageSize: ImageSize,
) {
  const threshold = Math.max(
    5,
    Math.min(16, Math.max(imageSize.width, imageSize.height) * 0.012),
  )
  const candidates = axis === "x" ? [0, imageSize.width] : [0, imageSize.height]
  detections.forEach((item) => {
    if (item.id === detectionId) return
    if (axis === "x") {
      candidates.push(item.box.x1, item.box.x2, (item.box.x1 + item.box.x2) / 2)
    } else {
      candidates.push(item.box.y1, item.box.y2, (item.box.y1 + item.box.y2) / 2)
    }
  })

  const delta = closestSnapDelta([value], candidates, threshold)
  return value + delta
}


function nearestValue(value: number, candidates: number[], threshold: number) {
  let result = value
  let bestDistance = threshold + 1
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value)
    if (distance < bestDistance) {
      bestDistance = distance
      result = candidate
    }
  }
  return bestDistance <= threshold ? result : value
}

function intervalOverlap(
  a1: number,
  a2: number,
  b1: number,
  b2: number,
) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
}

type WallEndpointSnap = {
  endpoint: number
  crossCenter: number | null
  score: number
}

function snapWallAfterResize(
  box: DetectionBox,
  operation: DragOperation,
  orientation: WallOrientation,
  detectionId: string,
  detections: Detection[],
  imageSize: ImageSize,
) {
  const snapThreshold = Math.max(
    6,
    Math.min(18, Math.max(imageSize.width, imageSize.height) * 0.014),
  )
  const wallCenter = centerOf(box)
  const wallThickness = wallThicknessPx(box)
  const endpoint =
    orientation === "horizontal"
      ? operation === "resize-start"
        ? box.x1
        : box.x2
      : operation === "resize-start"
        ? box.y1
        : box.y2

  let best: WallEndpointSnap | null = null

  for (const other of detections) {
    if (other.id === detectionId || labelKind(other.label) !== "wall") continue

    const otherOrientation = orientationOf(other.box)
    const otherCenter = centerOf(other.box)
    const otherThickness = wallThicknessPx(other.box)

    if (otherOrientation === orientation) {
      const crossDistance =
        orientation === "horizontal"
          ? Math.abs(wallCenter.y - otherCenter.y)
          : Math.abs(wallCenter.x - otherCenter.x)
      const alignThreshold = Math.max(
        snapThreshold * 0.8,
        Math.min(wallThickness, otherThickness) * 0.7,
      )
      if (crossDistance > alignThreshold) continue

      const targets =
        orientation === "horizontal"
          ? [other.box.x1, other.box.x2]
          : [other.box.y1, other.box.y2]

      for (const target of targets) {
        const distance = Math.abs(endpoint - target)
        if (distance > snapThreshold) continue
        const score = distance + crossDistance * 0.35
        if (!best || score < best.score) {
          best = {
            endpoint: target,
            crossCenter:
              orientation === "horizontal" ? otherCenter.y : otherCenter.x,
            score,
          }
        }
      }
      continue
    }

    // Perpendicular walls must share the same centerline junction. Snapping to
    // the outer face leaves a visible offset when the two BoxGeometry meshes
    // meet. Centerline-to-centerline snapping creates a clean L/T overlap.
    if (orientation === "horizontal") {
      const crossTolerance = Math.max(
        snapThreshold,
        (wallThickness + otherThickness) / 2,
      )
      if (
        wallCenter.y < other.box.y1 - crossTolerance ||
        wallCenter.y > other.box.y2 + crossTolerance
      ) {
        continue
      }

      const target = wallCenter.x <= otherCenter.x ? other.box.x1 : other.box.x2
      const distanceToWall = Math.abs(endpoint - target)
      if (distanceToWall <= snapThreshold + otherThickness / 2) {
        const score = distanceToWall * 0.75
        if (!best || score < best.score) {
          best = { endpoint: target, crossCenter: null, score }
        }
      }
    } else {
      const crossTolerance = Math.max(
        snapThreshold,
        (wallThickness + otherThickness) / 2,
      )
      if (
        wallCenter.x < other.box.x1 - crossTolerance ||
        wallCenter.x > other.box.x2 + crossTolerance
      ) {
        continue
      }

      const target = wallCenter.y <= otherCenter.y ? other.box.y1 : other.box.y2
      const distanceToWall = Math.abs(endpoint - target)
      if (distanceToWall <= snapThreshold + otherThickness / 2) {
        const score = distanceToWall * 0.75
        if (!best || score < best.score) {
          best = { endpoint: target, crossCenter: null, score }
        }
      }
    }
  }

  if (!best) return box

  if (orientation === "horizontal") {
    const centerY = best.crossCenter ?? wallCenter.y
    const y1 = centerY - wallThickness / 2
    const y2 = centerY + wallThickness / 2
    if (operation === "resize-start") {
      const x1 = Math.min(best.endpoint, box.x2 - MIN_MAJOR_SIZE_PX)
      return clampBox(boxFromEdges(x1, y1, box.x2, y2), imageSize, 4)
    }
    const x2 = Math.max(best.endpoint, box.x1 + MIN_MAJOR_SIZE_PX)
    return clampBox(boxFromEdges(box.x1, y1, x2, y2), imageSize, 4)
  }

  const centerX = best.crossCenter ?? wallCenter.x
  const x1 = centerX - wallThickness / 2
  const x2 = centerX + wallThickness / 2
  if (operation === "resize-start") {
    const y1 = Math.min(best.endpoint, box.y2 - MIN_MAJOR_SIZE_PX)
    return clampBox(boxFromEdges(x1, y1, x2, box.y2), imageSize, 4)
  }
  const y2 = Math.max(best.endpoint, box.y1 + MIN_MAJOR_SIZE_PX)
  return clampBox(boxFromEdges(x1, box.y1, x2, y2), imageSize, 4)
}

function resolveWallJunctionsForWall(
  detections: Detection[],
  selectedId: string,
  imageSize: ImageSize,
) {
  let result = cloneDetections(detections)
  const threshold = Math.max(
    6,
    Math.min(20, Math.max(imageSize.width, imageSize.height) * 0.016),
  )

  const updateWall = (id: string, box: DetectionBox) => {
    result = result.map((item) =>
      item.id === id ? { ...item, box: clampBox(box, imageSize, 4) } : item,
    )
  }

  for (const endpointSide of ["start", "end"] as const) {
    const selected = result.find((item) => item.id === selectedId)
    if (!selected || labelKind(selected.label) !== "wall") break

    const selectedOrientation = orientationOf(selected.box)
    const selectedCenter = centerOf(selected.box)
    const selectedThickness = wallThicknessPx(selected.box)
    const endpoint =
      selectedOrientation === "horizontal"
        ? endpointSide === "start"
          ? selected.box.x1
          : selected.box.x2
        : endpointSide === "start"
          ? selected.box.y1
          : selected.box.y2

    let best:
      | { wall: Detection; targetCenter: number; distance: number }
      | null = null

    for (const other of result) {
      if (other.id === selectedId || labelKind(other.label) !== "wall") continue
      const otherOrientation = orientationOf(other.box)
      if (otherOrientation === selectedOrientation) continue
      const otherCenter = centerOf(other.box)
      const otherThickness = wallThicknessPx(other.box)

      if (selectedOrientation === "horizontal") {
        const crossTolerance = threshold + (selectedThickness + otherThickness) / 2
        if (
          selectedCenter.y < other.box.y1 - crossTolerance ||
          selectedCenter.y > other.box.y2 + crossTolerance
        ) continue
        const distance = Math.min(
          Math.abs(endpoint - other.box.x1),
          Math.abs(endpoint - other.box.x2),
          Math.abs(endpoint - otherCenter.x),
        )
        if (distance <= threshold + otherThickness / 2 && (!best || distance < best.distance)) {
          best = { wall: other, targetCenter: otherCenter.x, distance }
        }
      } else {
        const crossTolerance = threshold + (selectedThickness + otherThickness) / 2
        if (
          selectedCenter.x < other.box.x1 - crossTolerance ||
          selectedCenter.x > other.box.x2 + crossTolerance
        ) continue
        const distance = Math.min(
          Math.abs(endpoint - other.box.y1),
          Math.abs(endpoint - other.box.y2),
          Math.abs(endpoint - otherCenter.y),
        )
        if (distance <= threshold + otherThickness / 2 && (!best || distance < best.distance)) {
          best = { wall: other, targetCenter: otherCenter.y, distance }
        }
      }
    }

    if (!best) continue

    let selectedBox = selected.box
    if (selectedOrientation === "horizontal") {
      selectedBox = endpointSide === "start"
        ? boxFromEdges(
            Math.min(best.targetCenter, selected.box.x2 - MIN_MAJOR_SIZE_PX),
            selected.box.y1,
            selected.box.x2,
            selected.box.y2,
          )
        : boxFromEdges(
            selected.box.x1,
            selected.box.y1,
            Math.max(best.targetCenter, selected.box.x1 + MIN_MAJOR_SIZE_PX),
            selected.box.y2,
          )
    } else {
      selectedBox = endpointSide === "start"
        ? boxFromEdges(
            selected.box.x1,
            Math.min(best.targetCenter, selected.box.y2 - MIN_MAJOR_SIZE_PX),
            selected.box.x2,
            selected.box.y2,
          )
        : boxFromEdges(
            selected.box.x1,
            selected.box.y1,
            selected.box.x2,
            Math.max(best.targetCenter, selected.box.y1 + MIN_MAJOR_SIZE_PX),
          )
    }
    updateWall(selectedId, selectedBox)

    // If the target also ends at this junction, pull its endpoint to the same
    // shared centerline. That makes an L corner; interior hits remain T joints.
    const refreshedSelected = result.find((item) => item.id === selectedId)!
    const refreshedSelectedCenter = centerOf(refreshedSelected.box)
    const target = result.find((item) => item.id === best!.wall.id)
    if (!target) continue
    const targetOrientation = orientationOf(target.box)
    const junctionCross =
      selectedOrientation === "horizontal"
        ? refreshedSelectedCenter.y
        : refreshedSelectedCenter.x
    const targetStart = targetOrientation === "horizontal" ? target.box.x1 : target.box.y1
    const targetEnd = targetOrientation === "horizontal" ? target.box.x2 : target.box.y2
    const distanceStart = Math.abs(targetStart - junctionCross)
    const distanceEnd = Math.abs(targetEnd - junctionCross)
    const endpointTolerance = threshold + selectedThickness / 2

    if (Math.min(distanceStart, distanceEnd) <= endpointTolerance) {
      let targetBox = target.box
      if (targetOrientation === "horizontal") {
        targetBox = distanceStart <= distanceEnd
          ? boxFromEdges(
              Math.min(junctionCross, target.box.x2 - MIN_MAJOR_SIZE_PX),
              target.box.y1,
              target.box.x2,
              target.box.y2,
            )
          : boxFromEdges(
              target.box.x1,
              target.box.y1,
              Math.max(junctionCross, target.box.x1 + MIN_MAJOR_SIZE_PX),
              target.box.y2,
            )
      } else {
        targetBox = distanceStart <= distanceEnd
          ? boxFromEdges(
              target.box.x1,
              Math.min(junctionCross, target.box.y2 - MIN_MAJOR_SIZE_PX),
              target.box.x2,
              target.box.y2,
            )
          : boxFromEdges(
              target.box.x1,
              target.box.y1,
              target.box.x2,
              Math.max(junctionCross, target.box.y1 + MIN_MAJOR_SIZE_PX),
            )
      }
      updateWall(target.id, targetBox)
    }
  }

  return result
}

function mergeSelectedWallWithCollinearNeighbours(
  detections: Detection[],
  selectedId: string,
  imageSize: ImageSize,
) {
  let result = cloneDetections(detections)
  let selected = result.find((item) => item.id === selectedId)
  if (!selected || labelKind(selected.label) !== "wall") return result

  let merged = true
  while (merged) {
    merged = false
    const selectedOrientation = orientationOf(selected.box)
    const selectedCenter = centerOf(selected.box)
    const selectedThickness = wallThicknessPx(selected.box)

    for (const other of result) {
      if (
        other.id === selected.id ||
        labelKind(other.label) !== "wall" ||
        orientationOf(other.box) !== selectedOrientation
      ) {
        continue
      }

      const otherCenter = centerOf(other.box)
      const otherThickness = wallThicknessPx(other.box)
      const centerDistance =
        selectedOrientation === "horizontal"
          ? Math.abs(selectedCenter.y - otherCenter.y)
          : Math.abs(selectedCenter.x - otherCenter.x)
      const centerTolerance = Math.max(
        2,
        Math.min(selectedThickness, otherThickness) * 0.35,
      )
      if (centerDistance > centerTolerance) continue

      const selectedStart =
        selectedOrientation === "horizontal" ? selected.box.x1 : selected.box.y1
      const selectedEnd =
        selectedOrientation === "horizontal" ? selected.box.x2 : selected.box.y2
      const otherStart =
        selectedOrientation === "horizontal" ? other.box.x1 : other.box.y1
      const otherEnd =
        selectedOrientation === "horizontal" ? other.box.x2 : other.box.y2
      const overlap = intervalOverlap(selectedStart, selectedEnd, otherStart, otherEnd)
      const shorter = Math.max(
        1,
        Math.min(selectedEnd - selectedStart, otherEnd - otherStart),
      )
      const gap = Math.max(
        0,
        Math.max(selectedStart, otherStart) - Math.min(selectedEnd, otherEnd),
      )
      const duplicateLike = overlap / shorter >= 0.58
      const continuationLike = gap <= Math.max(3, centerTolerance)
      if (!duplicateLike && !continuationLike) continue

      const mergedStart = Math.min(selectedStart, otherStart)
      const mergedEnd = Math.max(selectedEnd, otherEnd)
      const center = selectedCenter
      const thickness = selectedThickness
      const mergedBox =
        selectedOrientation === "horizontal"
          ? boxFromEdges(
              mergedStart,
              center.y - thickness / 2,
              mergedEnd,
              center.y + thickness / 2,
            )
          : boxFromEdges(
              center.x - thickness / 2,
              mergedStart,
              center.x + thickness / 2,
              mergedEnd,
            )

      selected = {
        ...selected,
        box: clampBox(mergedBox, imageSize, 4),
      }
      result = result
        .filter((item) => item.id !== other.id)
        .map((item) => (item.id === selected!.id ? selected! : item))
      merged = true
      break
    }
  }

  return result
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function autoAlignFloorPlan(detections: Detection[], imageSize: ImageSize) {
  const snapshot = cloneDetections(detections)
  const walls = snapshot.filter((item) => labelKind(item.label) === "wall")
  if (!walls.length) return snapshot

  const thickness = clampWallThicknessPx(
    median(walls.map((wall) => wallThicknessPx(wall.box))),
    imageSize,
  )
  const threshold = Math.max(
    5,
    Math.min(14, Math.max(imageSize.width, imageSize.height) * 0.01),
  )

  const normalized = walls.map((wall) => {
    const center = centerOf(wall.box)
    if (orientationOf(wall.box) === "horizontal") {
      return {
        ...wall,
        box: clampBox(
          boxFromEdges(
            wall.box.x1,
            center.y - thickness / 2,
            wall.box.x2,
            center.y + thickness / 2,
          ),
          imageSize,
        ),
      }
    }
    return {
      ...wall,
      box: clampBox(
        boxFromEdges(
          center.x - thickness / 2,
          wall.box.y1,
          center.x + thickness / 2,
          wall.box.y2,
        ),
        imageSize,
      ),
    }
  })

  const alignedWalls = normalized.map((wall) => {
    const orientation = orientationOf(wall.box)
    const center = centerOf(wall.box)
    const others = normalized.filter((item) => item.id !== wall.id)

    if (orientation === "horizontal") {
      const parallelCenters = others
        .filter((item) => orientationOf(item.box) === "horizontal")
        .map((item) => centerOf(item.box).y)
      const verticalCenters = others
        .filter((item) => orientationOf(item.box) === "vertical")
        .map((item) => centerOf(item.box).x)
      const horizontalEnds = others
        .filter((item) => orientationOf(item.box) === "horizontal")
        .flatMap((item) => [item.box.x1, item.box.x2])
      const y = nearestValue(center.y, parallelCenters, threshold)
      const xCandidates = [...verticalCenters, ...horizontalEnds, 0, imageSize.width]
      const x1 = nearestValue(wall.box.x1, xCandidates, threshold)
      const x2 = nearestValue(wall.box.x2, xCandidates, threshold)
      return {
        ...wall,
        box: clampBox(
          boxFromEdges(
            Math.min(x1, x2 - MIN_MAJOR_SIZE_PX),
            y - thickness / 2,
            Math.max(x2, x1 + MIN_MAJOR_SIZE_PX),
            y + thickness / 2,
          ),
          imageSize,
        ),
      }
    }

    const parallelCenters = others
      .filter((item) => orientationOf(item.box) === "vertical")
      .map((item) => centerOf(item.box).x)
    const horizontalCenters = others
      .filter((item) => orientationOf(item.box) === "horizontal")
      .map((item) => centerOf(item.box).y)
    const verticalEnds = others
      .filter((item) => orientationOf(item.box) === "vertical")
      .flatMap((item) => [item.box.y1, item.box.y2])
    const x = nearestValue(center.x, parallelCenters, threshold)
    const yCandidates = [...horizontalCenters, ...verticalEnds, 0, imageSize.height]
    const y1 = nearestValue(wall.box.y1, yCandidates, threshold)
    const y2 = nearestValue(wall.box.y2, yCandidates, threshold)
    return {
      ...wall,
      box: clampBox(
        boxFromEdges(
          x - thickness / 2,
          Math.min(y1, y2 - MIN_MAJOR_SIZE_PX),
          x + thickness / 2,
          Math.max(y2, y1 + MIN_MAJOR_SIZE_PX),
        ),
        imageSize,
      ),
    }
  })

  const wallMap = new Map(alignedWalls.map((wall) => [wall.id, wall]))
  let next = snapshot.map((item) => wallMap.get(item.id) ?? item)
  const finalWalls = next.filter((item) => labelKind(item.label) === "wall")
  next = next.map((item) => {
    const kind = labelKind(item.label)
    return kind === "door" || kind === "window"
      ? snapOpeningToNearestWall(item, finalWalls, imageSize)
      : item
  })
  return next
}

function wallBoxFromPoints(
  startValue: { x: number; y: number },
  endValue: { x: number; y: number },
  detections: Detection[],
  imageSize: ImageSize,
  snapMode: SnapMode,
  gridStepPx: number,
  defaultThicknessPx: number,
) {
  const start = snapPointForMode(startValue, detections, imageSize, snapMode, gridStepPx)
  const end = snapPointForMode(endValue, detections, imageSize, snapMode, gridStepPx)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const thickness = clampWallThicknessPx(defaultThicknessPx, imageSize)

  if (Math.abs(dx) >= Math.abs(dy)) {
    const finishX = Math.abs(dx) < MIN_MAJOR_SIZE_PX
      ? start.x + Math.sign(dx || 1) * MIN_MAJOR_SIZE_PX
      : end.x
    return clampBox(
      boxFromEdges(
        start.x,
        start.y - thickness / 2,
        finishX,
        start.y + thickness / 2,
      ),
      imageSize,
    )
  }

  const finishY = Math.abs(dy) < MIN_MAJOR_SIZE_PX
    ? start.y + Math.sign(dy || 1) * MIN_MAJOR_SIZE_PX
    : end.y
  return clampBox(
    boxFromEdges(
      start.x - thickness / 2,
      start.y,
      start.x + thickness / 2,
      finishY,
    ),
    imageSize,
  )
}


type WallCenterlineDraft = {
  start: { x: number; y: number }
  end: { x: number; y: number }
  orientation: WallOrientation
  thicknessPx: number
  wallHeightM: number
}

function trimWallDraftToFirstFace(
  draft: WallCenterlineDraft,
  walls: Detection[],
  imageSize: ImageSize,
  ignoredWallIds: Set<string>,
) {
  const threshold = Math.max(
    6,
    Math.min(18, Math.max(imageSize.width, imageSize.height) * 0.014),
  )
  const halfThickness = clampWallThicknessPx(draft.thicknessPx, imageSize) / 2
  const startMajor = draft.orientation === "horizontal" ? draft.start.x : draft.start.y
  const endMajor = draft.orientation === "horizontal" ? draft.end.x : draft.end.y
  const direction = Math.sign(endMajor - startMajor)
  const requestedLength = Math.abs(endMajor - startMajor)

  if (!direction || requestedLength < MIN_MAJOR_SIZE_PX) return draft

  const crossCenter = draft.orientation === "horizontal" ? draft.start.y : draft.start.x
  const crossMin = crossCenter - halfThickness
  const crossMax = crossCenter + halfThickness
  let bestFace: number | null = null
  let bestDistance = requestedLength + threshold + 1

  for (const wall of walls) {
    if (ignoredWallIds.has(wall.id) || labelKind(wall.label) !== "wall") continue

    const otherOrientation = orientationOf(wall.box)
    const otherCenter = centerOf(wall.box)
    const otherThickness = wallThicknessPx(wall.box)
    const otherCrossMin =
      draft.orientation === "horizontal" ? wall.box.y1 : wall.box.x1
    const otherCrossMax =
      draft.orientation === "horizontal" ? wall.box.y2 : wall.box.x2

    if (otherOrientation === draft.orientation) {
      const centerDistance =
        draft.orientation === "horizontal"
          ? Math.abs(crossCenter - otherCenter.y)
          : Math.abs(crossCenter - otherCenter.x)
      const centerTolerance = Math.max(
        2,
        Math.min(halfThickness * 2, otherThickness) * 0.45,
      )
      if (centerDistance > centerTolerance) continue
    } else if (intervalOverlap(crossMin, crossMax, otherCrossMin, otherCrossMax) <= 0) {
      continue
    }

    const nearFace =
      draft.orientation === "horizontal"
        ? direction > 0
          ? wall.box.x1
          : wall.box.x2
        : direction > 0
          ? wall.box.y1
          : wall.box.y2
    const distanceFromStart = (nearFace - startMajor) * direction

    if (distanceFromStart < MIN_MAJOR_SIZE_PX) continue
    if (distanceFromStart > requestedLength + threshold) continue
    if (distanceFromStart >= bestDistance) continue

    bestFace = nearFace
    bestDistance = distanceFromStart
  }

  if (bestFace === null) return draft

  return {
    ...draft,
    end:
      draft.orientation === "horizontal"
        ? clampPoint({ x: bestFace, y: draft.start.y }, imageSize)
        : clampPoint({ x: draft.start.x, y: bestFace }, imageSize),
  }
}

function draftOrientation(
  start: { x: number; y: number },
  end: { x: number; y: number },
  fallback: WallOrientation = "horizontal",
): WallOrientation {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (Math.hypot(dx, dy) < 2) return fallback
  return Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical"
}

function snapWallDraftEnd(
  start: { x: number; y: number },
  rawEnd: { x: number; y: number },
  orientation: WallOrientation,
  detections: Detection[],
  imageSize: ImageSize,
  snapMode: SnapMode,
  gridStepPx: number,
  sourceWallId?: string,
) {
  const threshold = Math.max(
    6,
    Math.min(18, Math.max(imageSize.width, imageSize.height) * 0.014),
  )

  if (orientation === "horizontal") {
    let x = rawEnd.x
    if (snapMode === "grid") {
      x = snapToGrid(x, gridStepPx)
    } else if (snapMode === "smart") {
      let bestValue = x
      let bestScore = threshold + 1
      const consider = (value: number, priority = 0) => {
        const distance = Math.abs(x - value)
        const score = distance + priority
        if (distance <= threshold && score < bestScore) {
          bestValue = value
          bestScore = score
        }
      }

      consider(0, 1)
      consider(imageSize.width, 1)
      detections.forEach((item) => {
        if (item.id === sourceWallId || labelKind(item.label) !== "wall") return
        const itemOrientation = orientationOf(item.box)
        const itemCenter = centerOf(item.box)
        if (itemOrientation === "vertical") {
          const crossTolerance = threshold + wallThicknessPx(item.box) / 2
          if (start.y >= item.box.y1 - crossTolerance && start.y <= item.box.y2 + crossTolerance) {
            // Snap to the near face, not the centerline. A face-to-face joint
            // produces the same geometry before and after pointer release.
            const targetFace = rawEnd.x >= start.x ? item.box.x1 : item.box.x2
            consider(targetFace, -0.5)
          }
        } else if (Math.abs(start.y - itemCenter.y) <= threshold) {
          consider(item.box.x1, 0)
          consider(item.box.x2, 0)
        }
      })
      x = bestValue
    }
    return clampPoint({ x, y: start.y }, imageSize)
  }

  let y = rawEnd.y
  if (snapMode === "grid") {
    y = snapToGrid(y, gridStepPx)
  } else if (snapMode === "smart") {
    let bestValue = y
    let bestScore = threshold + 1
    const consider = (value: number, priority = 0) => {
      const distance = Math.abs(y - value)
      const score = distance + priority
      if (distance <= threshold && score < bestScore) {
        bestValue = value
        bestScore = score
      }
    }

    consider(0, 1)
    consider(imageSize.height, 1)
    detections.forEach((item) => {
      if (item.id === sourceWallId || labelKind(item.label) !== "wall") return
      const itemOrientation = orientationOf(item.box)
      const itemCenter = centerOf(item.box)
      if (itemOrientation === "horizontal") {
        const crossTolerance = threshold + wallThicknessPx(item.box) / 2
        if (start.x >= item.box.x1 - crossTolerance && start.x <= item.box.x2 + crossTolerance) {
          const targetFace = rawEnd.y >= start.y ? item.box.y1 : item.box.y2
          consider(targetFace, -0.5)
        }
      } else if (Math.abs(start.x - itemCenter.x) <= threshold) {
        consider(item.box.y1, 0)
        consider(item.box.y2, 0)
      }
    })
    y = bestValue
  }
  return clampPoint({ x: start.x, y }, imageSize)
}

function wallBoxFromCenterlineDraft(
  draft: WallCenterlineDraft,
  imageSize: ImageSize,
) {
  const half = clampWallThicknessPx(draft.thicknessPx, imageSize) / 2
  if (draft.orientation === "horizontal") {
    return clampBox(
      boxFromEdges(
        Math.min(draft.start.x, draft.end.x),
        draft.start.y - half,
        Math.max(draft.start.x, draft.end.x),
        draft.start.y + half,
      ),
      imageSize,
      4,
    )
  }
  return clampBox(
    boxFromEdges(
      draft.start.x - half,
      Math.min(draft.start.y, draft.end.y),
      draft.start.x + half,
      Math.max(draft.start.y, draft.end.y),
    ),
    imageSize,
    4,
  )
}

function wallDraftLength(draft: WallCenterlineDraft) {
  return draft.orientation === "horizontal"
    ? Math.abs(draft.end.x - draft.start.x)
    : Math.abs(draft.end.y - draft.start.y)
}

function wallContinuationStartPoint(
  wall: Detection,
  clickedPoint: { x: number; y: number },
  endPoint: { x: number; y: number },
  nextOrientation: WallOrientation,
) {
  const wallOrientation = orientationOf(wall.box)
  const center = centerOf(wall.box)
  const dx = endPoint.x - clickedPoint.x
  const dy = endPoint.y - clickedPoint.y
  const endpointThreshold = Math.max(10, wallThicknessPx(wall.box) * 1.5)

  if (wallOrientation === "horizontal") {
    const projectedX = Math.min(wall.box.x2, Math.max(wall.box.x1, clickedPoint.x))
    const nearStart = Math.abs(clickedPoint.x - wall.box.x1) <= endpointThreshold
    const nearEnd = Math.abs(clickedPoint.x - wall.box.x2) <= endpointThreshold

    if (nextOrientation === "horizontal") {
      const endpoint =
        nearStart && !nearEnd
          ? wall.box.x1
          : nearEnd && !nearStart
            ? wall.box.x2
            : dx >= 0
              ? wall.box.x2
              : wall.box.x1
      return { x: endpoint, y: center.y }
    }

    // Perpendicular continuations start on the visible face of the source wall.
    // This keeps the final wall identical to the green preview and avoids a
    // hidden half-wall overlap that used to create thin fins at the junction.
    return {
      x: projectedX,
      y: dy >= 0 ? wall.box.y2 : wall.box.y1,
    }
  }

  const projectedY = Math.min(wall.box.y2, Math.max(wall.box.y1, clickedPoint.y))
  const nearStart = Math.abs(clickedPoint.y - wall.box.y1) <= endpointThreshold
  const nearEnd = Math.abs(clickedPoint.y - wall.box.y2) <= endpointThreshold

  if (nextOrientation === "vertical") {
    const endpoint =
      nearStart && !nearEnd
        ? wall.box.y1
        : nearEnd && !nearStart
          ? wall.box.y2
          : dy >= 0
            ? wall.box.y2
            : wall.box.y1
    return { x: center.x, y: endpoint }
  }

  return {
    x: dx >= 0 ? wall.box.x2 : wall.box.x1,
    y: projectedY,
  }
}

function makeDetection(
  kind: "wall" | "door" | "window" | "floor" | "ceiling" | "furniture",
  box: DetectionBox,
  wallHeightM = DEFAULT_WALL_HEIGHT,
  materialId?: string,
): Detection {
  return {
    id: makeDetectionId(kind),
    class_id: -1,
    label: kind,
    confidence: 1,
    box,
    wallHeightM: kind === "wall" ? wallHeightM : undefined,
    materialId:
      kind === "floor" || kind === "ceiling" || kind === "furniture"
        ? materialId
        : undefined,
    objectHeightM: kind === "furniture" ? 0.75 : kind === "ceiling" ? 2.8 : undefined,
  }
}

function surfaceFromPoints(
  startValue: { x: number; y: number },
  endValue: { x: number; y: number },
  detections: Detection[],
  imageSize: ImageSize,
  snapMode: SnapMode,
  gridStepPx: number,
  materialId?: string,
  kind: "floor" | "ceiling" | "furniture" = "floor",
) {
  const otherObjects = detections.filter((item) => labelKind(item.label) !== kind)
  const start = snapPointForMode(startValue, otherObjects, imageSize, snapMode, gridStepPx)
  const end = snapPointForMode(endValue, otherObjects, imageSize, snapMode, gridStepPx)
  const box = clampBox(boxFromEdges(start.x, start.y, end.x, end.y), imageSize, 1)
  return makeDetection(kind, box, DEFAULT_WALL_HEIGHT, materialId)
}

function roomWallsFromPoints(
  startValue: { x: number; y: number },
  endValue: { x: number; y: number },
  detections: Detection[],
  imageSize: ImageSize,
  snapMode: SnapMode,
  gridStepPx: number,
  defaultThicknessPx: number,
  wallHeightM: number,
) {
  const start = snapPointForMode(startValue, detections, imageSize, snapMode, gridStepPx)
  const end = snapPointForMode(endValue, detections, imageSize, snapMode, gridStepPx)
  const left = Math.min(start.x, end.x)
  const right = Math.max(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const bottom = Math.max(start.y, end.y)
  const thickness = clampWallThicknessPx(defaultThicknessPx, imageSize)
  const minRoom = Math.max(MIN_MAJOR_SIZE_PX * 2, thickness * 3 + 2)
  if (right - left < minRoom || bottom - top < minRoom) return []

  // Treat the dragged rectangle as the OUTER footprint of the room. Each
  // corner belongs to exactly one horizontal wall and the vertical walls stop
  // at the inner faces. This creates a clean rectangular ring with no doubled
  // corner boxes, protruding end caps, or thin fins in the 3D result.
  const innerTop = top + thickness
  const innerBottom = bottom - thickness
  const boxes = [
    boxFromEdges(left, top, right, innerTop),
    boxFromEdges(left, innerBottom, right, bottom),
    boxFromEdges(left, innerTop, left + thickness, innerBottom),
    boxFromEdges(right - thickness, innerTop, right, innerBottom),
  ]

  return boxes.map((box) =>
    makeDetection("wall", clampBox(box, imageSize, 4), wallHeightM),
  )
}

function openingAtPoint(
  kind: "door" | "window",
  point: { x: number; y: number },
  walls: Detection[],
  imageSize: ImageSize,
) {
  const defaultMajor = imageSize.width * (kind === "door" ? 0.085 : 0.11)
  const defaultMinor = Math.max(7, imageSize.height * 0.02)
  let opening = makeDetection(
    kind,
    clampBox(
      boxFromEdges(
        point.x - defaultMajor / 2,
        point.y - defaultMinor / 2,
        point.x + defaultMajor / 2,
        point.y + defaultMinor / 2,
      ),
      imageSize,
    ),
  )

  const nearestWall = findNearestWall(opening, walls, imageSize)
  if (!nearestWall) return null

  if (orientationOf(nearestWall.box) === "vertical") {
    opening = {
      ...opening,
      box: clampBox(
        boxFromEdges(
          point.x - defaultMinor / 2,
          point.y - defaultMajor / 2,
          point.x + defaultMinor / 2,
          point.y + defaultMajor / 2,
        ),
        imageSize,
      ),
    }
  }

  return snapOpeningToWall(opening, nearestWall, imageSize)
}

function CameraController({
  command,
  nonce,
  selected,
  imageSize,
  controlsRef,
}: {
  command: CameraCommand
  nonce: number
  selected: Detection | null
  imageSize: ImageSize
  controlsRef: React.MutableRefObject<any>
}) {
  const { camera } = useThree()
  const selectedRef = useRef(selected)

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  useEffect(() => {
    const activeSelected = selectedRef.current
    const worldScale = worldScaleFor(imageSize)
    const floorWidth = imageSize.width * worldScale
    const floorDepth = imageSize.height * worldScale
    const span = Math.max(floorWidth, floorDepth, 6)
    const selectedCenter = activeSelected ? centerOf(activeSelected.box) : null
    const selectedTarget = selectedCenter
      ? new Vector3(
          (selectedCenter.x - imageSize.width / 2) * worldScale,
          labelKind(activeSelected!.label) === "wall" ? 1.25 : 1,
          (selectedCenter.y - imageSize.height / 2) * worldScale,
        )
      : new Vector3(0, 0.8, 0)
    const currentTarget = controlsRef.current?.target?.clone?.() ?? selectedTarget.clone()
    const target = command === "focus" ? selectedTarget : currentTarget
    const distance = span * 1.15 + 4

    if (command === "home") {
      target.set(0, 0.8, 0)
      camera.up.set(0, 1, 0)
      camera.position.set(distance * 0.72, distance * 0.62, distance * 0.72)
    } else if (command === "top" || command === "plan") {
      target.set(0, 0, 0)
      camera.up.set(0, 0, -1)
      camera.position.set(0.001, distance * 1.25, 0.001)
    } else if (command === "focus") {
      camera.up.set(0, 1, 0)
      camera.position.set(target.x + 6, target.y + 5, target.z + 6)
    } else {
      camera.up.set(0, 1, 0)
      const offset = camera.position.clone().sub(target)
      if (command === "rotate-left") {
        offset.applyAxisAngle(new Vector3(0, 1, 0), Math.PI / 8)
      } else if (command === "rotate-right") {
        offset.applyAxisAngle(new Vector3(0, 1, 0), -Math.PI / 8)
      } else if (command === "zoom-in") {
        offset.multiplyScalar(0.78)
      } else if (command === "zoom-out") {
        offset.multiplyScalar(1.28)
      }
      camera.position.copy(target).add(offset)
    }

    camera.lookAt(target)
    camera.updateProjectionMatrix()

    if (controlsRef.current) {
      controlsRef.current.target.copy(target)
      controlsRef.current.update()
    }
  }, [camera, command, controlsRef, imageSize, nonce])

  return null
}

type WallCut = {
  start: number
  end: number
  kind: "door" | "window"
}

function wallCuts(wall: Detection, openings: Detection[], worldScale: number): WallCut[] {
  const orientation = orientationOf(wall.box)
  const center = centerOf(wall.box)
  const halfMajor =
    ((orientation === "horizontal" ? wall.box.width : wall.box.height) * worldScale) / 2

  return openings
    .map((opening) => {
      const kind = labelKind(opening.label)
      if (kind !== "door" && kind !== "window") return null
      const startPx =
        orientation === "horizontal"
          ? opening.box.x1 - center.x
          : opening.box.y1 - center.y
      const endPx =
        orientation === "horizontal"
          ? opening.box.x2 - center.x
          : opening.box.y2 - center.y
      const start = Math.max(
        -halfMajor + 0.02,
        Math.min(startPx, endPx) * worldScale,
      )
      const end = Math.min(
        halfMajor - 0.02,
        Math.max(startPx, endPx) * worldScale,
      )
      if (end - start < 0.08) return null
      return { start, end, kind }
    })
    .filter((cut): cut is WallCut => Boolean(cut))
}

type LocalDimensions = {
  width: number
  depth: number
  height: number
}

function WallGeometry({
  detection,
  openings,
  dimensions,
  worldScale,
  selected,
  wallHeight,
  material,
}: {
  detection: Detection
  openings: Detection[]
  dimensions: LocalDimensions
  worldScale: number
  selected: boolean
  wallHeight: number
  material: MaterialDefinition
}) {
  const orientation = orientationOf(detection.box)
  const majorLength = orientation === "horizontal" ? dimensions.width : dimensions.depth
  const minorLength = orientation === "horizontal" ? dimensions.depth : dimensions.width
  const cuts = wallCuts(detection, openings, worldScale)
  const boundaries = [-majorLength / 2, majorLength / 2]
  cuts.forEach((cut) => boundaries.push(cut.start, cut.end))
  const sorted = Array.from(
    new Set(boundaries.map((value) => Number(value.toFixed(5)))),
  ).sort((a, b) => a - b)
  const repeatMajor = Math.max(1, majorLength / material.textureScale)
  const repeatMinor = Math.max(1, wallHeight / material.textureScale)
  const textureBundle = useMaterialTextureBundle(material, repeatMajor, repeatMinor)

  const segmentMeshes: React.ReactNode[] = []
  const addSegment = (
    key: string,
    start: number,
    end: number,
    y: number,
    height: number,
  ) => {
    const length = Math.max(0.01, end - start)
    const localMajor = (start + end) / 2
    const position: [number, number, number] =
      orientation === "horizontal" ? [localMajor, y, 0] : [0, y, localMajor]
    const args: [number, number, number] =
      orientation === "horizontal"
        ? [length, height, minorLength]
        : [minorLength, height, length]

    segmentMeshes.push(
      <mesh key={key} position={position} castShadow receiveShadow>
        <boxGeometry args={args} />
        <meshPhysicalMaterial
          color={material.color}
          map={textureBundle?.colorMap}
          normalMap={textureBundle?.normalMap}
          normalScale={new Vector2(material.normalStrength ?? 0.7, material.normalStrength ?? 0.7)}
          bumpMap={textureBundle?.normalMap ? undefined : textureBundle?.bumpMap}
          bumpScale={material.bumpScale ?? 0.014}
          roughnessMap={textureBundle?.roughnessMap}
          roughness={material.roughness}
          metalness={material.metalness}
          clearcoat={material.clearcoat ?? 0}
          emissive={selected ? material.color : "#000000"}
          emissiveIntensity={selected ? 0.18 : 0}
        />
      </mesh>,
    )
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index]
    const end = sorted[index + 1]
    if (end - start < 0.02) continue
    const midpoint = (start + end) / 2
    const cut = cuts.find((item) => midpoint >= item.start && midpoint <= item.end)

    if (!cut) {
      addSegment(`full-${index}`, start, end, wallHeight / 2, wallHeight)
      continue
    }

    if (cut.kind === "door") {
      const topHeight = wallHeight - DOOR_HEIGHT
      if (topHeight > 0.05) {
        addSegment(
          `door-top-${index}`,
          start,
          end,
          DOOR_HEIGHT + topHeight / 2,
          topHeight,
        )
      }
      continue
    }

    const bottomHeight = WINDOW_SILL
    const topHeight = wallHeight - WINDOW_TOP
    addSegment(`window-bottom-${index}`, start, end, bottomHeight / 2, bottomHeight)
    if (topHeight > 0.05) {
      addSegment(
        `window-top-${index}`,
        start,
        end,
        WINDOW_TOP + topHeight / 2,
        topHeight,
      )
    }
  }

  return <>{segmentMeshes}</>
}

function OpeningGeometry({
  detection,
  dimensions,
  selected,
  material,
}: {
  detection: Detection
  dimensions: LocalDimensions
  selected: boolean
  material: MaterialDefinition
}) {
  const kind = labelKind(detection.label)
  const orientation = orientationOf(detection.box)
  const thickness = Math.max(
    0.06,
    (orientation === "horizontal" ? dimensions.depth : dimensions.width) * 0.58,
  )
  const width = orientation === "horizontal" ? dimensions.width : dimensions.depth
  const args: [number, number, number] =
    orientation === "horizontal"
      ? [width, kind === "door" ? DOOR_HEIGHT : WINDOW_TOP - WINDOW_SILL, thickness]
      : [thickness, kind === "door" ? DOOR_HEIGHT : WINDOW_TOP - WINDOW_SILL, width]
  const y = kind === "door" ? DOOR_HEIGHT / 2 : (WINDOW_SILL + WINDOW_TOP) / 2
  const color = material.color
  const repeatX = Math.max(1, width / material.textureScale)
  const repeatY = Math.max(1, (kind === "door" ? DOOR_HEIGHT : WINDOW_TOP - WINDOW_SILL) / material.textureScale)
  const textureBundle = useMaterialTextureBundle(material, repeatX, repeatY)

  return (
    <mesh position={[0, y, 0]} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshPhysicalMaterial
        color={color}
        map={textureBundle?.colorMap}
        normalMap={kind === "door" ? textureBundle?.normalMap : undefined}
        normalScale={new Vector2(material.normalStrength ?? 0.65, material.normalStrength ?? 0.65)}
        bumpMap={kind === "door" && !textureBundle?.normalMap ? textureBundle?.bumpMap : undefined}
        bumpScale={kind === "door" ? material.bumpScale ?? 0.012 : 0.002}
        roughnessMap={kind === "door" ? textureBundle?.roughnessMap : undefined}
        roughness={material.roughness}
        metalness={material.metalness}
        clearcoat={kind === "window" ? 0.7 : material.clearcoat ?? 0.08}
        transparent={kind === "window"}
        opacity={kind === "window" ? material.opacity ?? 0.58 : 1}
        transmission={kind === "window" ? 0.42 : 0}
        thickness={kind === "window" ? 0.28 : 0}
        emissive={selected ? color : "#000000"}
        emissiveIntensity={selected ? 0.16 : 0}
      />
      <Edges
        threshold={10}
        color={selected ? "#0F65D8" : kind === "door" ? "#93683F" : "#269BB7"}
      />
    </mesh>
  )
}

function FloorGeometry({
  dimensions,
  selected,
  material,
}: {
  dimensions: LocalDimensions
  selected: boolean
  material: MaterialDefinition
}) {
  const textureBundle = useMaterialTextureBundle(
    material,
    Math.max(1, dimensions.width / material.textureScale),
    Math.max(1, dimensions.depth / material.textureScale),
  )

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} receiveShadow>
        <planeGeometry args={[dimensions.width, dimensions.depth]} />
        <meshPhysicalMaterial
          color={material.color}
          map={textureBundle?.colorMap}
          normalMap={textureBundle?.normalMap}
          normalScale={new Vector2(material.normalStrength ?? 0.75, material.normalStrength ?? 0.75)}
          bumpMap={textureBundle?.normalMap ? undefined : textureBundle?.bumpMap}
          bumpScale={material.bumpScale ?? 0.012}
          roughnessMap={textureBundle?.roughnessMap}
          roughness={material.roughness}
          metalness={material.metalness}
          clearcoat={material.clearcoat ?? 0.08}
          emissive={selected ? material.color : "#000000"}
          emissiveIntensity={selected ? 0.12 : 0}
        />
      </mesh>
      {selected && (
        <mesh position={[0, 0.035, 0]} renderOrder={25}>
          <boxGeometry args={[dimensions.width + 0.05, 0.05, dimensions.depth + 0.05]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          <Edges color="#7C3AED" threshold={1} />
        </mesh>
      )}
    </group>
  )
}

function CeilingGeometry({
  dimensions,
  selected,
  material,
  height,
}: {
  dimensions: LocalDimensions
  selected: boolean
  material: MaterialDefinition
  height: number
}) {
  const textureBundle = useMaterialTextureBundle(
    material,
    Math.max(1, dimensions.width / material.textureScale),
    Math.max(1, dimensions.depth / material.textureScale),
  )

  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, height, 0]} receiveShadow>
        <planeGeometry args={[dimensions.width, dimensions.depth]} />
        <meshPhysicalMaterial
          side={DoubleSide}
          color={material.color}
          map={textureBundle?.colorMap}
          normalMap={textureBundle?.normalMap}
          normalScale={new Vector2(material.normalStrength ?? 0.45, material.normalStrength ?? 0.45)}
          bumpMap={textureBundle?.normalMap ? undefined : textureBundle?.bumpMap}
          bumpScale={material.bumpScale ?? 0.006}
          roughnessMap={textureBundle?.roughnessMap}
          roughness={material.roughness}
          metalness={material.metalness}
          clearcoat={material.clearcoat ?? 0}
          transparent={!selected}
          opacity={selected ? 1 : 0.88}
          emissive={selected ? material.color : "#000000"}
          emissiveIntensity={selected ? 0.1 : 0}
        />
      </mesh>
      {selected && (
        <mesh position={[0, height, 0]} renderOrder={25}>
          <boxGeometry args={[dimensions.width + 0.05, 0.05, dimensions.depth + 0.05]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          <Edges color="#7C3AED" threshold={1} />
        </mesh>
      )}
    </group>
  )
}

function FurnitureGeometry({
  dimensions,
  selected,
  material,
  height,
}: {
  dimensions: LocalDimensions
  selected: boolean
  material: MaterialDefinition
  height: number
}) {
  const textureBundle = useMaterialTextureBundle(
    material,
    Math.max(1, dimensions.width / material.textureScale),
    Math.max(1, dimensions.depth / material.textureScale),
  )

  return (
    <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[dimensions.width, height, dimensions.depth]} />
      <meshPhysicalMaterial
        color={material.color}
        map={textureBundle?.colorMap}
        normalMap={textureBundle?.normalMap}
        normalScale={new Vector2(material.normalStrength ?? 0.6, material.normalStrength ?? 0.6)}
        bumpMap={textureBundle?.normalMap ? undefined : textureBundle?.bumpMap}
        bumpScale={material.bumpScale ?? 0.012}
        roughnessMap={textureBundle?.roughnessMap}
        roughness={material.roughness}
        metalness={material.metalness}
        clearcoat={material.clearcoat ?? 0.05}
        emissive={selected ? material.color : "#000000"}
        emissiveIntensity={selected ? 0.12 : 0}
      />
      <Edges threshold={10} color={selected ? "#EA580C" : "#9A5C28"} />
    </mesh>
  )
}

function OtherGeometry({
  dimensions,
  selected,
  color,
}: {
  dimensions: LocalDimensions
  selected: boolean
  color: string
}) {
  return (
    <mesh position={[0, dimensions.height / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[dimensions.width, dimensions.height, dimensions.depth]} />
      <meshStandardMaterial
        color={color}
        roughness={0.65}
        emissive={selected ? color : "#000000"}
        emissiveIntensity={selected ? 0.14 : 0}
      />
      <Edges threshold={10} color={selected ? "#1D4ED8" : "#64748B"} />
    </mesh>
  )
}

function DraftWall({
  detection,
  imageSize,
  metersPerPixel,
  showEndpoints = true,
  showLabel = true,
}: {
  detection: Detection
  imageSize: ImageSize
  metersPerPixel: number | null
  showEndpoints?: boolean
  showLabel?: boolean
}) {
  const worldScale = worldScaleFor(imageSize)
  const orientation = orientationOf(detection.box)
  const center = centerOf(detection.box)
  const centerX = (center.x - imageSize.width / 2) * worldScale
  const centerZ = (center.y - imageSize.height / 2) * worldScale
  const width = Math.max(detection.box.width * worldScale, 0.02)
  const depth = Math.max(detection.box.height * worldScale, 0.02)
  const major = orientation === "horizontal" ? detection.box.width : detection.box.height
  const valid = major >= MIN_MAJOR_SIZE_PX
  const endpointA: [number, number, number] =
    orientation === "horizontal" ? [-width / 2, 0.1, 0] : [0, 0.1, -depth / 2]
  const endpointB: [number, number, number] =
    orientation === "horizontal" ? [width / 2, 0.1, 0] : [0, 0.1, depth / 2]

  return (
    <group position={[centerX, 0, centerZ]}>
      <mesh position={[0, 0.07, 0]} renderOrder={30}>
        <boxGeometry args={[width, 0.14, depth]} />
        <meshStandardMaterial
          color={valid ? "#22C55E" : "#F59E0B"}
          emissive={valid ? "#16A34A" : "#D97706"}
          emissiveIntensity={0.24}
          transparent
          opacity={0.72}
          depthWrite={false}
        />
        <Edges color={valid ? "#15803D" : "#B45309"} threshold={1} />
      </mesh>
      {showEndpoints &&
        [endpointA, endpointB].map((position, index) => (
          <mesh key={index} position={position} renderOrder={31}>
            <sphereGeometry args={[0.11, 16, 16]} />
            <meshBasicMaterial color={valid ? "#16A34A" : "#D97706"} depthTest={false} />
          </mesh>
        ))}
      {showLabel && (
        <Html position={[0, 0.48, 0]} center distanceFactor={10} zIndexRange={[40, 0]}>
          <div
            className={`pointer-events-none whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold text-white shadow-xl ${
              valid ? "bg-emerald-600" : "bg-amber-600"
            }`}
          >
            {valid ? formatDimension(major, metersPerPixel) : "ลากต่ออีกเล็กน้อย"}
          </div>
        </Html>
      )}
    </group>
  )
}

function DraftFloor({
  detection,
  imageSize,
  metersPerPixel,
}: {
  detection: Detection
  imageSize: ImageSize
  metersPerPixel: number | null
}) {
  const worldScale = worldScaleFor(imageSize)
  const center = centerOf(detection.box)
  const centerX = (center.x - imageSize.width / 2) * worldScale
  const centerZ = (center.y - imageSize.height / 2) * worldScale
  const width = Math.max(detection.box.width * worldScale, 0.02)
  const depth = Math.max(detection.box.height * worldScale, 0.02)
  const valid = detection.box.width >= MIN_FLOOR_SIZE_PX && detection.box.height >= MIN_FLOOR_SIZE_PX

  return (
    <group position={[centerX, 0, centerZ]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.055, 0]} renderOrder={32}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          color={valid ? "#8B5CF6" : "#F59E0B"}
          emissive={valid ? "#7C3AED" : "#D97706"}
          emissiveIntensity={0.22}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.05, 0]} renderOrder={33}>
        <boxGeometry args={[width, 0.04, depth]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        <Edges color={valid ? "#6D28D9" : "#B45309"} threshold={1} />
      </mesh>
      <Html position={[0, 0.42, 0]} center distanceFactor={10} zIndexRange={[40, 0]}>
        <div className={`pointer-events-none whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold text-white shadow-xl ${valid ? "bg-violet-600" : "bg-amber-600"}`}>
          {valid
            ? `${formatDimension(detection.box.width, metersPerPixel)} × ${formatDimension(detection.box.height, metersPerPixel)}`
            : "ลากให้กว้างขึ้น"}
        </div>
      </Html>
    </group>
  )
}

function InteractiveObject({
  detection,
  allDetections,
  imageSize,
  selected,
  buildTool,
  metersPerPixel,
  assignedWall,
  attachedOpeningIds,
  openings,
  showDimensions,
  snapMode,
  gridStepPx,
  wallViewMode,
  onSelect,
  onLiveChange,
  onCommit,
  onDragging,
  onPlaceOpening,
  onBeginWallFromWall,
  onUpdateWallDrawing,
  onFinishWallDrawing,
}: {
  detection: Detection
  allDetections: Detection[]
  imageSize: ImageSize
  selected: boolean
  buildTool: BuildTool
  metersPerPixel: number | null
  assignedWall: Detection | null
  attachedOpeningIds: string[]
  openings: Detection[]
  showDimensions: boolean
  snapMode: SnapMode
  gridStepPx: number
  wallViewMode: WallViewMode
  onSelect: () => void
  onLiveChange: (detections: Detection[]) => void
  onCommit: (detections: Detection[]) => void
  onDragging: (dragging: boolean) => void
  onPlaceOpening: (kind: "door" | "window", point: Vector3) => void
  onBeginWallFromWall: (
    event: ThreeEvent<PointerEvent>,
    wall: Detection,
    point: Vector3,
  ) => void
  onUpdateWallDrawing: (event: ThreeEvent<PointerEvent>) => void
  onFinishWallDrawing: (event: ThreeEvent<PointerEvent>) => void
}) {
  const { camera } = useThree()
  const detectionsRef = useRef(allDetections)
  const latestRef = useRef(allDetections)
  const dragRef = useRef<{
    pointerId: number
    operation: DragOperation
    startPoint: Vector3
    dragPlane: Plane
    dragAxis: Vector3 | null
    startDetections: Detection[]
    startBox: DetectionBox
    orientation: WallOrientation
    attachedIds: string[]
    bypassSnap: boolean
  } | null>(null)

  useEffect(() => {
    detectionsRef.current = allDetections
    if (!dragRef.current) latestRef.current = allDetections
  }, [allDetections])

  const worldScale = worldScaleFor(imageSize)
  const kind = labelKind(detection.label)
  const materialTarget = targetForDetection(detection)
  const baseMaterial = materialById(detection.materialId, materialTarget ?? "wall")
  const material = useMemo(
    () => ({
      ...baseMaterial,
      textureScale: Math.max(0.25, baseMaterial.textureScale * (detection.materialScale ?? 1)),
      textureRotation:
        (baseMaterial.textureRotation ?? 0) + (detection.materialRotation ?? 0),
    }),
    [baseMaterial, detection.materialRotation, detection.materialScale],
  )
  const isRectObject = kind === "floor" || kind === "ceiling" || kind === "furniture"
  const orientation = orientationOf(detection.box)
  const center = centerOf(detection.box)
  const centerX = (center.x - imageSize.width / 2) * worldScale
  const centerZ = (center.y - imageSize.height / 2) * worldScale
  const color = colorByLabel(detection.label)
  const wallHeight = wallHeightOf(detection)
  const cutawayWall =
    kind === "wall" &&
    !selected &&
    wallViewMode === "cutaway" &&
    center.y > imageSize.height * 0.58
  const displayWallHeight =
    kind !== "wall" || selected || wallViewMode === "up"
      ? wallHeight
      : wallViewMode === "down"
        ? 0.18
        : cutawayWall
          ? 0.42
          : wallHeight
  const dimensions: LocalDimensions = {
    width: Math.max(detection.box.width * worldScale, 0.1),
    depth: Math.max(detection.box.height * worldScale, 0.1),
    height:
      kind === "wall"
        ? wallHeight
        : kind === "door"
          ? DOOR_HEIGHT
          : kind === "window"
            ? WINDOW_TOP - WINDOW_SILL
            : kind === "floor"
              ? 0.05
              : kind === "ceiling"
                ? 0.08
                : kind === "furniture"
                  ? Math.max(0.25, detection.objectHeightM ?? 0.75)
                  : 1.4,
  }
  const majorPx = orientation === "horizontal" ? detection.box.width : detection.box.height
  const minorPx = orientation === "horizontal" ? detection.box.height : detection.box.width
  const labelY =
    kind === "wall"
      ? displayWallHeight + 0.48
      : kind === "door"
        ? DOOR_HEIGHT + 0.42
        : kind === "floor"
          ? 0.48
          : kind === "ceiling"
            ? (detection.objectHeightM ?? DEFAULT_WALL_HEIGHT) + 0.35
            : kind === "furniture"
              ? (detection.objectHeightM ?? 0.75) + 0.35
              : WINDOW_TOP + 0.4

  function pointOnGround(event: ThreeEvent<PointerEvent>) {
    const point = new Vector3()
    return event.ray.intersectPlane(DRAG_PLANE, point) ? point : null
  }

  function capturePointer(event: ThreeEvent<PointerEvent>) {
    const target = event.target as unknown as {
      setPointerCapture?: (pointerId: number) => void
    }
    target.setPointerCapture?.(event.pointerId)
  }

  function releasePointer(event: ThreeEvent<PointerEvent>) {
    const target = event.target as unknown as {
      releasePointerCapture?: (pointerId: number) => void
    }
    target.releasePointerCapture?.(event.pointerId)
  }

  function beginDrag(event: ThreeEvent<PointerEvent>, operation: DragOperation) {
    if (event.button !== 0) return
    event.stopPropagation()
    onSelect()

    // A fixed ground plane works in top view, but in perspective the ray hits
    // y=0 far behind the handle. That makes the wall jump or stretch in the
    // wrong direction. Build a per-drag plane through the clicked object and,
    // for endpoint resizing, align it with the wall axis like transform gizmos.
    const anchor =
      operation === "move"
        ? event.point.clone()
        : event.object.getWorldPosition(new Vector3())
    let dragAxis: Vector3 | null = null
    let dragPlane: Plane

    if (operation === "move" || isRectObject) {
      dragPlane = new Plane(new Vector3(0, 1, 0), -anchor.y)
    } else {
      dragAxis =
        orientation === "horizontal"
          ? new Vector3(1, 0, 0)
          : new Vector3(0, 0, 1)
      const cameraDirection = camera.getWorldDirection(new Vector3()).normalize()
      const normal = cameraDirection
        .clone()
        .addScaledVector(dragAxis, -cameraDirection.dot(dragAxis))
      if (normal.lengthSq() < 1e-6) {
        const cameraUp = camera.up.clone().applyQuaternion(camera.quaternion)
        normal.copy(cameraUp).addScaledVector(dragAxis, -cameraUp.dot(dragAxis))
      }
      if (normal.lengthSq() < 1e-6) normal.set(0, 1, 0)
      normal.normalize()
      dragPlane = new Plane().setFromNormalAndCoplanarPoint(normal, anchor)
    }

    const point = event.ray.intersectPlane(dragPlane, new Vector3())
    if (!point) return

    capturePointer(event)
    const snapshot = cloneDetections(detectionsRef.current)
    dragRef.current = {
      pointerId: event.pointerId,
      operation,
      startPoint: point,
      dragPlane,
      dragAxis,
      startDetections: snapshot,
      startBox: { ...detection.box },
      orientation,
      attachedIds: [...attachedOpeningIds],
      bypassSnap: false,
    }
    latestRef.current = snapshot
    onDragging(true)
    document.body.style.cursor =
      operation === "move"
        ? "grabbing"
        : operation === "resize-nw" || operation === "resize-se"
          ? "nwse-resize"
          : operation === "resize-ne" || operation === "resize-sw"
            ? "nesw-resize"
            : orientation === "horizontal"
              ? "ew-resize"
              : "ns-resize"
  }

  function moveDetection(event: ThreeEvent<PointerEvent>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    const point = event.ray.intersectPlane(drag.dragPlane, new Vector3())
    if (!point) return

    drag.bypassSnap = event.shiftKey
    const movement = point.clone().sub(drag.startPoint)
    const dxPx = movement.x / worldScale
    const dyPx = movement.z / worldScale
    const axisDeltaPx = drag.dragAxis
      ? movement.dot(drag.dragAxis) / worldScale
      : 0
    let nextBox = drag.startBox

    if (drag.operation === "move") {
      const freeMoveBox = clampBox(
        boxFromEdges(
          drag.startBox.x1 + dxPx,
          drag.startBox.y1 + dyPx,
          drag.startBox.x2 + dxPx,
          drag.startBox.y2 + dyPx,
        ),
        imageSize,
      )

      // The Select tool now uses the same Snap mode as the build tools while
      // the object is being dragged. Holding Shift temporarily bypasses Snap
      // for fine positioning without changing the selected mode.
      nextBox = event.shiftKey
        ? freeMoveBox
        : snapMode === "smart"
          ? snapMovedBox(
              freeMoveBox,
              detection.id,
              drag.startDetections,
              imageSize,
            )
          : snapMode === "grid"
            ? snapMovedBoxToGrid(freeMoveBox, imageSize, gridStepPx)
            : freeMoveBox
    } else if (isRectObject) {
      const otherObjects = drag.startDetections.filter((item) => item.id !== detection.id)
      const rawPoint =
        drag.operation === "resize-nw"
          ? { x: drag.startBox.x1 + dxPx, y: drag.startBox.y1 + dyPx }
          : drag.operation === "resize-ne"
            ? { x: drag.startBox.x2 + dxPx, y: drag.startBox.y1 + dyPx }
            : drag.operation === "resize-sw"
              ? { x: drag.startBox.x1 + dxPx, y: drag.startBox.y2 + dyPx }
              : { x: drag.startBox.x2 + dxPx, y: drag.startBox.y2 + dyPx }
      const point = event.shiftKey
        ? clampPoint(rawPoint, imageSize)
        : snapPointForMode(rawPoint, otherObjects, imageSize, snapMode, gridStepPx)
      const opposite =
        drag.operation === "resize-nw"
          ? { x: drag.startBox.x2, y: drag.startBox.y2 }
          : drag.operation === "resize-ne"
            ? { x: drag.startBox.x1, y: drag.startBox.y2 }
            : drag.operation === "resize-sw"
              ? { x: drag.startBox.x2, y: drag.startBox.y1 }
              : { x: drag.startBox.x1, y: drag.startBox.y1 }
      const candidate = boxFromEdges(point.x, point.y, opposite.x, opposite.y)
      nextBox =
        candidate.width >= MIN_FLOOR_SIZE_PX && candidate.height >= MIN_FLOOR_SIZE_PX
          ? clampBox(candidate, imageSize, MIN_FLOOR_SIZE_PX)
          : drag.startBox
    } else if (drag.orientation === "horizontal") {
      if (drag.operation === "resize-start") {
        const proposed = drag.startBox.x1 + axisDeltaPx
        nextBox = boxFromEdges(
          Math.min(Math.max(0, proposed), drag.startBox.x2 - MIN_MAJOR_SIZE_PX),
          drag.startBox.y1,
          drag.startBox.x2,
          drag.startBox.y2,
        )
      } else {
        const proposed = drag.startBox.x2 + axisDeltaPx
        nextBox = boxFromEdges(
          drag.startBox.x1,
          drag.startBox.y1,
          Math.max(
            Math.min(imageSize.width, proposed),
            drag.startBox.x1 + MIN_MAJOR_SIZE_PX,
          ),
          drag.startBox.y2,
        )
      }
    } else if (drag.operation === "resize-start") {
      const proposed = drag.startBox.y1 + axisDeltaPx
      nextBox = boxFromEdges(
        drag.startBox.x1,
        Math.min(Math.max(0, proposed), drag.startBox.y2 - MIN_MAJOR_SIZE_PX),
        drag.startBox.x2,
        drag.startBox.y2,
      )
    } else {
      const proposed = drag.startBox.y2 + axisDeltaPx
      nextBox = boxFromEdges(
        drag.startBox.x1,
        drag.startBox.y1,
        drag.startBox.x2,
        Math.max(
          Math.min(imageSize.height, proposed),
          drag.startBox.y1 + MIN_MAJOR_SIZE_PX,
        ),
      )
    }

    const actualDx = nextBox.x1 - drag.startBox.x1
    const actualDy = nextBox.y1 - drag.startBox.y1
    const nextDetections = drag.startDetections.map((item) => {
      if (item.id === detection.id) return { ...item, box: nextBox }
      if (
        kind === "wall" &&
        drag.operation === "move" &&
        drag.attachedIds.includes(item.id)
      ) {
        return {
          ...item,
          box: clampBox(
            boxFromEdges(
              item.box.x1 + actualDx,
              item.box.y1 + actualDy,
              item.box.x2 + actualDx,
              item.box.y2 + actualDy,
            ),
            imageSize,
          ),
        }
      }
      return item
    })

    latestRef.current = nextDetections
    onLiveChange(nextDetections)
  }

  function finalizeDrag(pointerId?: number) {
    const drag = dragRef.current
    if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) return

    dragRef.current = null
    onDragging(false)
    document.body.style.cursor = ""

    let finalDetections = cloneDetections(latestRef.current)
    let selectedObject = finalDetections.find((item) => item.id === detection.id)
    if (!selectedObject) return

    if (drag.operation === "move") {
      const snappedBox =
        drag.bypassSnap
          ? selectedObject.box
          : snapMode === "smart"
            ? snapMovedBox(
                selectedObject.box,
                detection.id,
                drag.startDetections,
                imageSize,
              )
            : snapMode === "grid"
              ? snapMovedBoxToGrid(selectedObject.box, imageSize, gridStepPx)
              : selectedObject.box
      selectedObject = { ...selectedObject, box: snappedBox }
      finalDetections = finalDetections.map((item) =>
        item.id === selectedObject!.id ? selectedObject! : item,
      )
      // Moving one wall must never pull neighbouring walls. Smart snapping
      // changes only the selected object, which makes edits predictable.
    } else if (kind === "wall") {
      const snappedBox =
        snapMode === "smart"
          ? snapWallAfterResize(
              selectedObject.box,
              drag.operation,
              drag.orientation,
              detection.id,
              drag.startDetections,
              imageSize,
            )
          : snapMode === "grid"
            ? snapResizeBoxToGrid(
                selectedObject.box,
                drag.operation,
                drag.orientation,
                imageSize,
                gridStepPx,
              )
            : selectedObject.box
      selectedObject = { ...selectedObject, box: snappedBox }
      finalDetections = finalDetections.map((item) =>
        item.id === selectedObject!.id ? selectedObject! : item,
      )
      // Keep walls as independent editable objects even when their endpoints
      // snap to the same line. Automatic merging made a newly resized wall
      // absorb an existing wall and unexpectedly change its full length.
      // Junction snapping still connects the endpoints visually, while each
      // wall keeps its own id, thickness, height and undo history.
      selectedObject =
        finalDetections.find((item) => item.id === detection.id) ?? selectedObject
    }

    const walls = finalDetections.filter((item) => labelKind(item.label) === "wall")
    if (kind === "door" || kind === "window") {
      const snapped = snapOpeningToNearestWall(selectedObject, walls, imageSize)
      finalDetections = finalDetections.map((item) =>
        item.id === snapped.id ? snapped : item,
      )
    } else if (kind === "wall") {
      const finalWall = selectedObject
      finalDetections = finalDetections.map((item) => {
        if (!drag.attachedIds.includes(item.id)) return item
        return snapOpeningToWall(item, finalWall, imageSize)
      })
    }

    latestRef.current = finalDetections
    onLiveChange(finalDetections)
    onCommit(finalDetections)
  }

  function endDrag(event: ThreeEvent<PointerEvent>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    releasePointer(event)
    finalizeDrag(event.pointerId)
  }

  useEffect(() => {
    function onWindowPointerUp(event: PointerEvent) {
      finalizeDrag(event.pointerId)
    }

    function releaseStuckInteraction() {
      if (!dragRef.current) return
      finalizeDrag()
    }

    window.addEventListener("pointerup", onWindowPointerUp)
    window.addEventListener("pointercancel", onWindowPointerUp)
    window.addEventListener("blur", releaseStuckInteraction)
    return () => {
      window.removeEventListener("pointerup", onWindowPointerUp)
      window.removeEventListener("pointercancel", onWindowPointerUp)
      window.removeEventListener("blur", releaseStuckInteraction)
      if (dragRef.current) {
        dragRef.current = null
        onDragging(false)
      }
      document.body.style.cursor = ""
    }
  }, [
    detection.id,
    gridStepPx,
    imageSize,
    kind,
    onCommit,
    onDragging,
    onLiveChange,
    snapMode,
  ])

  const handleY =
    kind === "wall"
      ? displayWallHeight / 2
      : kind === "door"
        ? DOOR_HEIGHT / 2
        : kind === "floor"
          ? 0.1
          : kind === "ceiling"
            ? detection.objectHeightM ?? DEFAULT_WALL_HEIGHT
            : kind === "furniture"
              ? (detection.objectHeightM ?? 0.75) / 2
              : WINDOW_TOP / 2
  const handleStart: [number, number, number] =
    orientation === "horizontal"
      ? [-dimensions.width / 2, handleY, 0]
      : [0, handleY, -dimensions.depth / 2]
  const handleEnd: [number, number, number] =
    orientation === "horizontal"
      ? [dimensions.width / 2, handleY, 0]
      : [0, handleY, dimensions.depth / 2]

  return (
    <group
      position={[centerX, 0, centerZ]}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        if (buildTool === "wall" && kind === "wall") {
          event.stopPropagation()
          // Use the real mesh hit point. Projecting the ray to the floor can land
          // behind a tall wall and was the main cause of offset/triangular walls.
          onBeginWallFromWall(event, detection, event.point.clone())
          return
        }
        if ((buildTool === "door" || buildTool === "window") && kind === "wall") {
          event.stopPropagation()
          // Use the wall hit point directly. Projecting to y=0 can place an
          // opening behind the wall when the camera is in perspective.
          onPlaceOpening(buildTool, event.point.clone())
          return
        }
        if (buildTool !== "select") return
        beginDrag(event, "move")
      }}
      onPointerMove={(event) => {
        if (buildTool === "wall" && kind === "wall") {
          onUpdateWallDrawing(event)
          return
        }
        moveDetection(event)
      }}
      onPointerUp={(event) => {
        if (buildTool === "wall" && kind === "wall") {
          onFinishWallDrawing(event)
          return
        }
        endDrag(event)
      }}
      onPointerCancel={(event) => {
        if (buildTool === "wall" && kind === "wall") {
          onFinishWallDrawing(event)
          return
        }
        endDrag(event)
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        if (buildTool === "select") document.body.style.cursor = "grab"
        else if (buildTool === "wall" && kind === "wall") {
          document.body.style.cursor = "crosshair"
        } else if ((buildTool === "door" || buildTool === "window") && kind === "wall") {
          document.body.style.cursor = "copy"
        }
      }}
      onPointerOut={() => {
        if (!dragRef.current) document.body.style.cursor = ""
      }}
    >
      {kind === "wall" ? (
        displayWallHeight < 0.8 ? (
          <OtherGeometry
            dimensions={{ ...dimensions, height: displayWallHeight }}
            selected={selected}
            color={selected ? "#78AFFF" : "#A8C9F2"}
          />
        ) : (
          <WallGeometry
            detection={detection}
            openings={openings}
            dimensions={{ ...dimensions, height: displayWallHeight }}
            worldScale={worldScale}
            selected={selected}
            wallHeight={displayWallHeight}
            material={material}
          />
        )
      ) : kind === "door" || kind === "window" ? (
        <OpeningGeometry
          detection={detection}
          dimensions={dimensions}
          selected={selected}
          material={material}
        />
      ) : kind === "floor" ? (
        <FloorGeometry
          dimensions={dimensions}
          selected={selected}
          material={material}
        />
      ) : kind === "ceiling" ? (
        <CeilingGeometry
          dimensions={dimensions}
          selected={selected}
          material={material}
          height={detection.objectHeightM ?? DEFAULT_WALL_HEIGHT}
        />
      ) : kind === "furniture" ? (
        <FurnitureGeometry
          dimensions={dimensions}
          selected={selected}
          material={material}
          height={detection.objectHeightM ?? 0.75}
        />
      ) : (
        <OtherGeometry dimensions={dimensions} selected={selected} color={color} />
      )}

      {selected && kind !== "wall" && !isRectObject && (
        <mesh position={[0, labelY / 2, 0]}>
          <boxGeometry
            args={[
              dimensions.width + 0.1,
              Math.max(0.5, labelY) + 0.1,
              dimensions.depth + 0.1,
            ]}
          />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          <Edges color="#175CD3" threshold={1} />
        </mesh>
      )}

      {selected && buildTool === "select" && !isRectObject && (
        <>
          {[
            { position: handleStart, operation: "resize-start" as const },
            { position: handleEnd, operation: "resize-end" as const },
          ].map((handle) => (
            <mesh
              key={handle.operation}
              position={handle.position}
              onPointerDown={(event) => beginDrag(event, handle.operation)}
              onPointerMove={moveDetection}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onPointerOver={(event) => {
                event.stopPropagation()
                document.body.style.cursor =
                  orientation === "horizontal" ? "ew-resize" : "ns-resize"
              }}
              onPointerOut={() => {
                if (!dragRef.current) document.body.style.cursor = ""
              }}
              renderOrder={20}
            >
              <sphereGeometry args={[0.24, 24, 24]} />
              <meshStandardMaterial
                color="#FFFFFF"
                emissive="#3B82F6"
                emissiveIntensity={0.62}
                depthTest={false}
              />
              <Edges color="#1D4ED8" threshold={1} />
            </mesh>
          ))}
        </>
      )}

      {selected && buildTool === "select" && isRectObject && (
        <>
          {([
            { position: [-dimensions.width / 2, 0.1, -dimensions.depth / 2] as [number, number, number], operation: "resize-nw" as const },
            { position: [dimensions.width / 2, 0.1, -dimensions.depth / 2] as [number, number, number], operation: "resize-ne" as const },
            { position: [-dimensions.width / 2, 0.1, dimensions.depth / 2] as [number, number, number], operation: "resize-sw" as const },
            { position: [dimensions.width / 2, 0.1, dimensions.depth / 2] as [number, number, number], operation: "resize-se" as const },
          ]).map((handle) => (
            <mesh
              key={handle.operation}
              position={handle.position}
              onPointerDown={(event) => beginDrag(event, handle.operation)}
              onPointerMove={moveDetection}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onPointerOver={(event) => {
                event.stopPropagation()
                document.body.style.cursor =
                  handle.operation === "resize-nw" || handle.operation === "resize-se"
                    ? "nwse-resize"
                    : "nesw-resize"
              }}
              onPointerOut={() => {
                if (!dragRef.current) document.body.style.cursor = ""
              }}
              renderOrder={26}
            >
              <sphereGeometry args={[0.18, 20, 20]} />
              <meshStandardMaterial
                color="#FFFFFF"
                emissive="#8B5CF6"
                emissiveIntensity={0.72}
                depthTest={false}
              />
              <Edges color="#6D28D9" threshold={1} />
            </mesh>
          ))}
        </>
      )}

      {(selected || showDimensions) && (
        <Html position={[0, labelY, 0]} center distanceFactor={10} zIndexRange={[20, 0]}>
          <div
            className={`pointer-events-none whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-medium shadow-lg ${
              selected
                ? "border-blue-200 bg-slate-950/90 text-white"
                : "border-slate-200 bg-white/90 text-slate-700"
            }`}
          >
            {selected ? `${detection.label} · ` : ""}
            {formatDimension(majorPx, metersPerPixel)}
            {selected ? ` × ${formatDimension(minorPx, metersPerPixel)}` : ""}
            {selected && kind === "ceiling"
              ? ` · ระดับ ${Number(detection.objectHeightM ?? DEFAULT_WALL_HEIGHT).toFixed(2)} m`
              : ""}
          </div>
        </Html>
      )}

      {selected && buildTool === "select" && (
        <Html position={[0, 0.22, 0]} center distanceFactor={12} zIndexRange={[30, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-full bg-primary px-3 py-1 text-[10px] font-semibold text-primary-foreground shadow-lg">
            {kind === "floor"
              ? "ลากพื้นเพื่อย้าย · ลากจุดมุมเพื่อปรับขนาด"
              : kind === "ceiling"
                ? "ลากฝ้าเพื่อย้าย · ลากจุดมุมปรับขนาด · ปรับระดับขึ้นลงในแผงแก้ขนาด"
                : kind === "furniture"
                  ? "ลากเฟอร์นิเจอร์เพื่อย้าย · ลากจุดมุมเพื่อปรับขนาด"
                  : "ลากตัววัตถุเพื่อย้าย · จุดปลายเลื่อนเฉพาะตามแนวผนัง"}
          </div>
        </Html>
      )}

      {selected && assignedWall && kind !== "wall" && (
        <Html position={[0, labelY + 0.42, 0]} center distanceFactor={11} zIndexRange={[20, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50/95 px-2.5 py-1 text-[10px] font-medium text-emerald-700 shadow">
            ยึดกับผนังอัตโนมัติ
          </div>
        </Html>
      )}
    </group>
  )
}

function FloorPlanScene({
  detections,
  imageSize,
  selectedId,
  floorMaterialId,
  buildTool,
  metersPerPixel,
  cameraCommand,
  cameraNonce,
  showDimensions,
  showGrid,
  viewMode,
  snapMode,
  gridStepPx,
  wallViewMode,
  lightingPreset,
  defaultWallThicknessPx,
  defaultWallHeightM,
  onNotice,
  onSelect,
  onLiveChange,
  onCommit,
}: Props & {
  buildTool: BuildTool
  cameraCommand: CameraCommand
  cameraNonce: number
  showDimensions: boolean
  showGrid: boolean
  viewMode: EditorView
  snapMode: SnapMode
  gridStepPx: number
  wallViewMode: WallViewMode
  lightingPreset: LightingPreset
  defaultWallThicknessPx: number
  defaultWallHeightM: number
  onNotice: (message: string) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [draftWalls, setDraftWalls] = useState<Detection[]>([])
  const draftWallsRef = useRef<Detection[]>([])
  const controlsRef = useRef<any>(null)
  const drawingRef = useRef<{
    pointerId: number
    start: { x: number; y: number }
    tool: "wall" | "room" | "floor" | "ceiling" | "furniture"
    dragPlane: Plane
    sourceWallId?: string
    orientation?: WallOrientation
    draft?: WallCenterlineDraft
  } | null>(null)
  const worldScale = worldScaleFor(imageSize)
  const floorWidth = Math.max(imageSize.width * worldScale, 4)
  const floorDepth = Math.max(imageSize.height * worldScale, 4)
  const selected = detections.find((detection) => detection.id === selectedId) ?? null
  const walls = useMemo(
    () => detections.filter((item) => labelKind(item.label) === "wall"),
    [detections],
  )

  const openingAssignments = useMemo(() => {
    const map = new Map<string, string>()
    detections.forEach((item) => {
      const kind = labelKind(item.label)
      if (kind !== "door" && kind !== "window") return
      const wall = findNearestWall(item, walls, imageSize)
      if (wall) map.set(item.id, wall.id)
    })
    return map
  }, [detections, imageSize, walls])

  const openingsByWall = useMemo(() => {
    const map = new Map<string, Detection[]>()
    openingAssignments.forEach((wallId, openingId) => {
      const opening = detections.find((item) => item.id === openingId)
      if (!opening) return
      const list = map.get(wallId) ?? []
      list.push(opening)
      map.set(wallId, list)
    })
    return map
  }, [detections, openingAssignments])

  function pointOnGround(event: ThreeEvent<PointerEvent>) {
    const point = new Vector3()
    return event.ray.intersectPlane(DRAG_PLANE, point) ? point : null
  }

  function placeOpening(kind: "door" | "window", worldPoint: Vector3) {
    const imagePoint = worldPointToImage(worldPoint, imageSize)
    const opening = openingAtPoint(kind, imagePoint, walls, imageSize)
    if (!opening) {
      onNotice(`วาง${kind === "door" ? "ประตู" : "หน้าต่าง"}ไม่ได้ — กรุณาคลิกบนผนัง`)
      return
    }
    onCommit([...detections, opening])
    onSelect(opening.id)
  }

  function makeDrafts(
    tool: "wall" | "room" | "floor" | "ceiling" | "furniture",
    start: { x: number; y: number },
    end: { x: number; y: number },
    sourceWallId?: string,
    lockedOrientation?: WallOrientation,
  ) {
    if (tool === "floor" || tool === "ceiling" || tool === "furniture") {
      return [
        surfaceFromPoints(
          start,
          end,
          detections,
          imageSize,
          snapMode,
          gridStepPx,
          undefined,
          tool,
        ),
      ]
    }

    if (tool === "room") {
      return roomWallsFromPoints(
        start,
        end,
        detections,
        imageSize,
        snapMode,
        gridStepPx,
        defaultWallThicknessPx,
        defaultWallHeightM,
      )
    }

    const sourceWall = sourceWallId
      ? detections.find((item) => item.id === sourceWallId && labelKind(item.label) === "wall")
      : null
    // A click can hit the invisible floor even though it visually starts on an
    // AI wall. Detect a nearby connection wall separately from the wider search
    // used only to inherit thickness. The new wall then starts on the source
    // wall face instead of beginning inside its volume.
    const nearbyConnectionWall = sourceWall
      ? null
      : nearestWallForConnection(start, walls, imageSize)
    const nearbyWall = sourceWall
      ? null
      : nearestWallForThickness(start, walls, imageSize)
    const connectionSource = sourceWall ?? nearbyConnectionWall
    const selectedWall = selected && labelKind(selected.label) === "wall" ? selected : null
    const thicknessSource = sourceWall ?? nearbyWall ?? selectedWall
    const fallbackOrientation = connectionSource
      ? orientationOf(connectionSource.box)
      : "horizontal"
    const orientation = lockedOrientation ?? draftOrientation(start, end, fallbackOrientation)
    const resolvedStart = connectionSource
      ? wallContinuationStartPoint(connectionSource, start, end, orientation)
      : snapMode === "grid"
        ? clampPoint(
            { x: snapToGrid(start.x, gridStepPx), y: snapToGrid(start.y, gridStepPx) },
            imageSize,
          )
        : clampPoint(start, imageSize)
    const resolvedEnd = snapWallDraftEnd(
      resolvedStart,
      end,
      orientation,
      detections,
      imageSize,
      snapMode,
      gridStepPx,
      connectionSource?.id,
    )
    const rawDraft: WallCenterlineDraft = {
      start: resolvedStart,
      end: resolvedEnd,
      orientation,
      thicknessPx: thicknessSource
        ? wallThicknessPx(thicknessSource.box)
        : clampWallThicknessPx(defaultWallThicknessPx, imageSize),
      wallHeightM: thicknessSource ? wallHeightOf(thicknessSource) : defaultWallHeightM,
    }
    const draft = trimWallDraftToFirstFace(
      rawDraft,
      walls,
      imageSize,
      new Set(connectionSource ? [connectionSource.id] : []),
    )
    const box = wallBoxFromCenterlineDraft(draft, imageSize)
    return [makeDetection("wall", box, draft.wallHeightM)]
  }

  function beginWallFromExisting(
    event: ThreeEvent<PointerEvent>,
    sourceWall: Detection,
    worldPoint: Vector3,
  ) {
    if (event.button !== 0 || buildTool !== "wall") return
    event.stopPropagation()
    const imagePoint = worldPointToImage(worldPoint, imageSize)
    const target = event.target as unknown as {
      setPointerCapture?: (pointerId: number) => void
    }
    target.setPointerCapture?.(event.pointerId)
    drawingRef.current = {
      pointerId: event.pointerId,
      start: imagePoint,
      tool: "wall",
      // Keep pointer tracking on the same elevation as the clicked wall. In
      // perspective this prevents the first movement from jumping to the floor.
      dragPlane: new Plane(new Vector3(0, 1, 0), -worldPoint.y),
      sourceWallId: sourceWall.id,
    }
    const nextDrafts = makeDrafts(
      "wall",
      imagePoint,
      imagePoint,
      sourceWall.id,
    )
    draftWallsRef.current = nextDrafts
    setDraftWalls(nextDrafts)
    setDragging(true)
    document.body.style.cursor = "crosshair"
    onNotice("ลากออกจากกำแพงเดิมเพื่อสร้างผนังต่อ — ปล่อยเมาส์เพื่อยืนยัน")
  }

  function beginFloorAction(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0) return
    const point = pointOnGround(event)
    if (!point) return

    if (buildTool === "select") {
      onSelect(null)
      return
    }

    event.stopPropagation()
    if (buildTool === "door" || buildTool === "window") {
      placeOpening(buildTool, point)
      return
    }

    const imagePoint = worldPointToImage(point, imageSize)
    const target = event.target as unknown as {
      setPointerCapture?: (pointerId: number) => void
    }
    target.setPointerCapture?.(event.pointerId)
    const drawingTool =
      buildTool === "room"
        ? "room"
        : buildTool === "floor" || buildTool === "ceiling" || buildTool === "furniture"
          ? buildTool
          : "wall"
    drawingRef.current = {
      pointerId: event.pointerId,
      start: imagePoint,
      tool: drawingTool,
      dragPlane: new Plane(new Vector3(0, 1, 0), -point.y),
    }
    const nextDrafts = makeDrafts(drawingTool, imagePoint, imagePoint)
    draftWallsRef.current = nextDrafts
    setDraftWalls(nextDrafts)
    setDragging(true)
    document.body.style.cursor = "crosshair"
  }

  function updateFloorAction(event: ThreeEvent<PointerEvent>) {
    const drawing = drawingRef.current
    if (!drawing || drawing.pointerId !== event.pointerId) return
    event.stopPropagation()
    const point = event.ray.intersectPlane(drawing.dragPlane, new Vector3())
    if (!point) return
    const imagePoint = worldPointToImage(point, imageSize)

    if (drawing.tool === "wall" && !drawing.orientation) {
      const dx = imagePoint.x - drawing.start.x
      const dy = imagePoint.y - drawing.start.y
      if (Math.hypot(dx, dy) >= 6) {
        drawing.orientation = Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical"
      }
    }

    const nextDrafts = makeDrafts(
      drawing.tool,
      drawing.start,
      imagePoint,
      drawing.sourceWallId,
      drawing.orientation,
    )
    draftWallsRef.current = nextDrafts
    setDraftWalls(nextDrafts)
  }

  function finalizeFloorDrawing(pointerId?: number, commit = true) {
    const drawing = drawingRef.current
    if (!drawing || (pointerId !== undefined && drawing.pointerId !== pointerId)) return

    drawingRef.current = null
    setDragging(false)
    document.body.style.cursor = ""

    const finishedWalls = draftWallsRef.current
    draftWallsRef.current = []
    setDraftWalls([])

    if (commit && finishedWalls.length) {
      if (
        drawing.tool === "wall" &&
        wallLengthPx(finishedWalls[0].box) < MIN_MAJOR_SIZE_PX
      ) {
        onNotice("ยังไม่ได้สร้างผนัง — กรุณาลากให้ยาวกว่านี้")
        return
      }
      if (
        (drawing.tool === "floor" || drawing.tool === "ceiling" || drawing.tool === "furniture") &&
        (finishedWalls[0].box.width < MIN_FLOOR_SIZE_PX ||
          finishedWalls[0].box.height < MIN_FLOOR_SIZE_PX)
      ) {
        onNotice(`ยังไม่ได้สร้าง${drawing.tool === "floor" ? "พื้น" : drawing.tool === "ceiling" ? "ฝ้า" : "เฟอร์นิเจอร์"} — กรุณาลากให้มีขนาดมากขึ้น`)
        return
      }

      const nextDetections = [...detections, ...finishedWalls]
      // Commit the exact green preview as a NEW wall object. Smart snapping may
      // share an endpoint with an existing wall, but it must never combine both
      // walls into one long detection. This keeps edits predictable and lets the
      // user move, resize, delete or style each segment independently.
      onCommit(nextDetections)
      onSelect(finishedWalls[0].id)
      onNotice(
        drawing.tool === "room"
          ? "สร้างห้องแล้ว — ปรับผนังแต่ละด้านต่อได้ทันที"
          : drawing.tool === "floor"
            ? "สร้างพื้นแล้ว — เลือกพื้นเพื่อย้าย ปรับขนาด หรือเปลี่ยนวัสดุได้"
            : drawing.tool === "ceiling"
              ? "สร้างฝ้าแล้ว — เลือกฝ้าเพื่อปรับขนาดหรือเปลี่ยนวัสดุได้"
              : drawing.tool === "furniture"
                ? "สร้างเฟอร์นิเจอร์แล้ว — ย้าย ปรับขนาด และเลือกผิววัสดุได้"
            : drawing.sourceWallId
              ? "สร้างผนังต่อแล้ว — เชื่อมปลายแต่ยังแยกเป็นคนละชิ้น"
              : "สร้างผนังใหม่แล้ว — ไม่รวมกับกำแพงเดิม",
      )
    }
  }

  function finishFloorAction(event: ThreeEvent<PointerEvent>) {
    const drawing = drawingRef.current
    if (!drawing || drawing.pointerId !== event.pointerId) return
    event.stopPropagation()
    const target = event.target as unknown as {
      releasePointerCapture?: (pointerId: number) => void
    }
    target.releasePointerCapture?.(event.pointerId)
    finalizeFloorDrawing(event.pointerId)
  }

  useEffect(() => {
    function onWindowPointerUp(event: PointerEvent) {
      finalizeFloorDrawing(event.pointerId)
    }

    function cancelStuckDrawing() {
      finalizeFloorDrawing(undefined, false)
    }

    window.addEventListener("pointerup", onWindowPointerUp)
    window.addEventListener("pointercancel", onWindowPointerUp)
    window.addEventListener("blur", cancelStuckDrawing)
    return () => {
      window.removeEventListener("pointerup", onWindowPointerUp)
      window.removeEventListener("pointercancel", onWindowPointerUp)
      window.removeEventListener("blur", cancelStuckDrawing)
      drawingRef.current = null
      draftWallsRef.current = []
      setDragging(false)
      document.body.style.cursor = ""
    }
  }, [detections, onCommit, onSelect])

  const lighting = {
    day: { ambient: 1.05, hemi: 0.62, key: 2.15, fill: 0.45, fog: "#E8EDF5", env: "city" as const },
    warm: { ambient: 0.78, hemi: 0.42, key: 1.55, fill: 0.65, fog: "#F3E9DD", env: "sunset" as const },
    night: { ambient: 0.26, hemi: 0.2, key: 0.5, fill: 0.2, fog: "#172033", env: "night" as const },
    studio: { ambient: 0.95, hemi: 0.5, key: 2.35, fill: 0.9, fog: "#E7E9EE", env: "studio" as const },
  }[lightingPreset]

  const gridDivisions = Math.max(
    12,
    Math.min(80, Math.round(Math.max(imageSize.width, imageSize.height) / Math.max(2, gridStepPx))),
  )

  return (
    <>
      <CameraController
        command={cameraCommand}
        nonce={cameraNonce}
        selected={selected}
        imageSize={imageSize}
        controlsRef={controlsRef}
      />
      <fog attach="fog" args={[lighting.fog, 22, 48]} />
      <ambientLight intensity={lighting.ambient} />
      <hemisphereLight args={[lightingPreset === "night" ? "#6B7FA8" : "#DDEBFF", lightingPreset === "warm" ? "#8B6750" : "#8A96A8", lighting.hemi]} />
      <directionalLight
        castShadow
        position={[9, 15, 10]}
        intensity={lighting.key}
        color={lightingPreset === "warm" ? "#FFD7A8" : lightingPreset === "night" ? "#A9C7FF" : "#FFFFFF"}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-8, 7, -5]} intensity={lighting.fill} color={lightingPreset === "warm" ? "#FFB36B" : "#DCE7FF"} />
      {lightingPreset === "night" && (
        <>
          <pointLight position={[0, 3.1, 0]} intensity={10} distance={12} color="#FFD19A" />
          <pointLight position={[5, 2.4, -4]} intensity={5} distance={9} color="#8CB4FF" />
        </>
      )}

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.035, 0]}
        receiveShadow
        onPointerDown={beginFloorAction}
        onPointerMove={updateFloorAction}
        onPointerUp={finishFloorAction}
        onPointerCancel={finishFloorAction}
        onPointerOver={() => {
          if (buildTool === "wall" || buildTool === "room" || buildTool === "floor" || buildTool === "ceiling" || buildTool === "furniture") document.body.style.cursor = "crosshair"
          else if (buildTool === "door" || buildTool === "window") {
            document.body.style.cursor = "copy"
          }
        }}
        onPointerOut={() => {
          if (!drawingRef.current) document.body.style.cursor = ""
        }}
      >
        <planeGeometry args={[floorWidth + 2.2, floorDepth + 2.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {showGrid && (
        <gridHelper
          args={[
            Math.max(floorWidth, floorDepth) + 2,
            gridDivisions,
            "#8EA6C4",
            "#CBD7E6",
          ]}
          position={[0, 0, 0]}
        />
      )}

      <Suspense fallback={null}>
        <Environment preset={lighting.env} />
      </Suspense>

      {detections.map((detection) => {
        const assignedWallId = openingAssignments.get(detection.id)
        const assignedWall = assignedWallId
          ? walls.find((wall) => wall.id === assignedWallId) ?? null
          : null
        const attachedOpeningIds =
          openingsByWall.get(detection.id)?.map((item) => item.id) ?? []

        return (
          <InteractiveObject
            key={detection.id}
            detection={detection}
            allDetections={detections}
            imageSize={imageSize}
            selected={detection.id === selectedId}
            buildTool={buildTool}
            metersPerPixel={metersPerPixel}
            assignedWall={assignedWall}
            attachedOpeningIds={attachedOpeningIds}
            openings={openingsByWall.get(detection.id) ?? []}
            showDimensions={showDimensions}
            snapMode={snapMode}
            gridStepPx={gridStepPx}
            wallViewMode={wallViewMode}
            onSelect={() => onSelect(detection.id)}
            onLiveChange={onLiveChange}
            onCommit={onCommit}
            onDragging={setDragging}
            onPlaceOpening={placeOpening}
            onBeginWallFromWall={beginWallFromExisting}
            onUpdateWallDrawing={updateFloorAction}
            onFinishWallDrawing={finishFloorAction}
          />
        )
      })}

      {draftWalls.map((draftWall, index) => {
        if (["floor", "ceiling", "furniture"].includes(labelKind(draftWall.label))) {
          return (
            <DraftFloor
              key={draftWall.id}
              detection={draftWall}
              imageSize={imageSize}
              metersPerPixel={metersPerPixel}
            />
          )
        }
        const isRoomPreview = draftWalls.length === 4
        return (
          <DraftWall
            key={draftWall.id}
            detection={draftWall}
            imageSize={imageSize}
            metersPerPixel={metersPerPixel}
            showEndpoints={!isRoomPreview}
            showLabel={!isRoomPreview || index === 0 || index === 2}
          />
        )
      })}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={!dragging}
        enableDamping
        dampingFactor={0.08}
        minDistance={2.8}
        maxDistance={50}
        // Keep a small amount of elevation above the horizon. At an almost
        // horizontal camera angle, ray/plane intersections become extremely
        // sensitive and direct editing feels like it "shoots" across the plan.
        maxPolarAngle={Math.PI * 0.46}
        target={[0, 0.9, 0]}
        enableRotate={viewMode === "perspective"}
        enablePan
        enableZoom
        screenSpacePanning
        mouseButtons={{
          LEFT: -1 as MOUSE,
          MIDDLE: viewMode === "perspective" ? MOUSE.ROTATE : MOUSE.PAN,
          RIGHT: MOUSE.PAN,
        }}
      />
    </>
  )
}
const toolInfo: Record<BuildTool, { title: string; detail: string }> = {
  select: {
    title: "เลือกและแก้ไข",
    detail: "ลากตัววัตถุเพื่อย้าย ลากจุดปลายเพื่อปรับความยาว ระบบจะไม่ขยับกำแพงข้างเคียง",
  },
  wall: {
    title: "วาดและต่อผนัง",
    detail: "คลิกค้างแล้วลาก ระบบจะแสดงเส้นตัวอย่างและล็อกแนว ก่อนสร้างผนังจริงตอนปล่อยเมาส์",
  },
  room: {
    title: "สร้างห้อง",
    detail: "คลิกค้างแล้วลากเป็นกรอบ ระบบสร้างผนัง 4 ด้านให้ในครั้งเดียว",
  },
  floor: {
    title: "สร้างพื้นเอง",
    detail: "คลิกค้างแล้วลากเป็นพื้นที่สี่เหลี่ยม จากนั้นเลือก ย้าย ปรับขนาด และเปลี่ยนวัสดุได้",
  },
  ceiling: {
    title: "สร้างฝ้าเพดาน",
    detail: "ลากเป็นพื้นที่ฝ้าเหนือห้อง แล้วเลือกวัสดุฝ้าและปรับขนาดได้",
  },
  furniture: {
    title: "วางเฟอร์นิเจอร์",
    detail: "ลากเป็นบล็อกเฟอร์นิเจอร์สำหรับทดลองผิวไม้ ผ้า หรือหนังในโมเดล 3D",
  },
  door: {
    title: "วางประตู",
    detail: "คลิกตำแหน่งบนผนัง ประตูจะยึดกับผนังและเจาะช่องให้อัตโนมัติ",
  },
  window: {
    title: "วางหน้าต่าง",
    detail: "คลิกตำแหน่งบนผนัง หน้าต่างจะยึดกับผนังและเจาะช่องให้อัตโนมัติ",
  },
}

export function EditableFloorPlan3D(props: Props) {
  const [buildTool, setBuildTool] = useState<BuildTool>("select")
  const [editorView, setEditorView] = useState<EditorView>("plan")
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>("plan")
  const [cameraNonce, setCameraNonce] = useState(0)
  const [showDimensions, setShowDimensions] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [snapMode, setSnapMode] = useState<SnapMode>("smart")
  const [gridStepPx, setGridStepPx] = useState(10)
  const [wallViewMode, setWallViewMode] = useState<WallViewMode>("cutaway")
  const [showHelp, setShowHelp] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const [materialCategory, setMaterialCategory] = useState<MaterialCategory>("wall-paint")
  const [selectedMaterialId, setSelectedMaterialId] = useState("wall-paint-white")
  const [texturePreviewOpen, setTexturePreviewOpen] = useState(false)
  const [instantApply, setInstantApply] = useState(true)
  const [favoriteMaterialIds, setFavoriteMaterialIds] = useState<string[]>([])
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [comparisonIds, setComparisonIds] = useState<string[]>([])
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>("day")
  const [notice, setNotice] = useState("")
  const [lengthDraft, setLengthDraft] = useState("")
  const [thicknessDraft, setThicknessDraft] = useState("")
  const [heightDraft, setHeightDraft] = useState(DEFAULT_WALL_HEIGHT.toFixed(2))
  const [ceilingHeightDraft, setCeilingHeightDraft] = useState(DEFAULT_WALL_HEIGHT.toFixed(2))
  const [defaultWallThicknessPx, setDefaultWallThicknessPx] = useState(() =>
    inferredWallThicknessPx(props.detections, props.imageSize),
  )
  const [defaultWallHeightM, setDefaultWallHeightM] = useState(DEFAULT_WALL_HEIGHT)
  const defaultThicknessCustomizedRef = useRef(false)
  const canvasHostRef = useRef<HTMLDivElement | null>(null)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selected = useMemo(
    () => props.detections.find((detection) => detection.id === props.selectedId) ?? null,
    [props.detections, props.selectedId],
  )
  const currentTool = toolInfo[buildTool]
  const selectedMaterialTarget = selected ? targetForDetection(selected) : null
  const materialCatalog = useMemo(() => {
    const materials = materialsForCategory(materialCategory)
    return showFavoritesOnly
      ? materials.filter((material) => favoriteMaterialIds.includes(material.id))
      : materials
  }, [favoriteMaterialIds, materialCategory, showFavoritesOnly])
  const selectedMaterialDefinition = useMemo(
    () => materialById(selectedMaterialId),
    [selectedMaterialId],
  )
  const comparisonMaterials = useMemo(
    () => comparisonIds.map((id) => materialById(id)).filter(Boolean),
    [comparisonIds],
  )
  const selectedMaterialPreviewUrl = useMemo(
    () => previewUrlForMaterial(selectedMaterialDefinition),
    [selectedMaterialDefinition],
  )
  const budget = useMemo(
    () =>
      calculateBudget(
        props.detections,
        props.imageSize,
        props.metersPerPixel,
        props.floorMaterialId,
      ),
    [
      props.detections,
      props.floorMaterialId,
      props.imageSize,
      props.metersPerPixel,
    ],
  )

  useEffect(() => {
    if (!selectedMaterialTarget || !selected) return
    const current = materialById(selected.materialId, selectedMaterialTarget)
    setMaterialCategory(current.category)
    setSelectedMaterialId(current.id)
  }, [selected, selectedMaterialTarget])

  useEffect(() => {
    const list = materialsForCategory(materialCategory)
    if (!list.length) return
    const current = materialById(selectedMaterialId)
    if (current.category !== materialCategory) {
      setSelectedMaterialId(list[0].id)
    }
  }, [materialCategory, selectedMaterialId])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("sketch2spec-favorite-materials")
      if (stored) setFavoriteMaterialIds(JSON.parse(stored))
    } catch {
      setFavoriteMaterialIds([])
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "sketch2spec-favorite-materials",
        JSON.stringify(favoriteMaterialIds),
      )
    } catch {
      // Favorites remain available for the current session.
    }
  }, [favoriteMaterialIds])

  useEffect(() => {
    if (defaultThicknessCustomizedRef.current) return
    setDefaultWallThicknessPx(inferredWallThicknessPx(props.detections, props.imageSize))
  }, [props.detections, props.imageSize])

  function showNotice(message: string) {
    setNotice(message)
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = setTimeout(() => setNotice(""), 2600)
  }

  function runCamera(command: CameraCommand) {
    setCameraCommand(command)
    setCameraNonce((value) => value + 1)
  }

  function chooseTool(tool: BuildTool) {
    // Keep the current editor view and camera exactly where the user left them.
    // Tool selection must never force a jump from the 3D view to the plan view.
    if (
      (tool === "wall" || tool === "room") &&
      selected &&
      labelKind(selected.label) === "wall"
    ) {
      setDefaultWallThicknessPx(wallThicknessPx(selected.box))
      setDefaultWallHeightM(wallHeightOf(selected))
      defaultThicknessCustomizedRef.current = true
    }
    setBuildTool(tool)
    if (tool !== "select") {
      props.onSelect(null)
    }
  }

  function chooseView(view: EditorView) {
    setEditorView(view)
    chooseTool("select")
    runCamera(view === "plan" ? "plan" : "home")
  }

  function runAutoAlign() {
    const next = autoAlignFloorPlan(props.detections, props.imageSize)
    props.onCommit(next)
    props.onSelect(null)
    showNotice("จัดแนวผนังและยึดช่องเปิดให้อัตโนมัติแล้ว")
  }

  function applyExactLength() {
    if (!selected) return
    const value = Number(lengthDraft)
    if (!Number.isFinite(value) || value <= 0) return
    const targetPx = props.metersPerPixel ? value / props.metersPerPixel : value
    const orientation = orientationOf(selected.box)
    const maxTarget =
      orientation === "horizontal"
        ? props.imageSize.width - selected.box.x1
        : props.imageSize.height - selected.box.y1
    const safeTarget = Math.max(MIN_MAJOR_SIZE_PX, Math.min(targetPx, maxTarget))
    const nextBox =
      orientation === "horizontal"
        ? boxFromEdges(
            selected.box.x1,
            selected.box.y1,
            selected.box.x1 + safeTarget,
            selected.box.y2,
          )
        : boxFromEdges(
            selected.box.x1,
            selected.box.y1,
            selected.box.x2,
            selected.box.y1 + safeTarget,
          )
    const next = props.detections.map((item) =>
      item.id === selected.id ? { ...item, box: nextBox } : item,
    )
    props.onCommit(next)
    showNotice("ปรับความยาวโดยยึดปลายด้านแรกไว้แล้ว")
  }

  function normalizeOpeningsAfterWallEdit(nextDetections: Detection[]) {
    const walls = nextDetections.filter((item) => labelKind(item.label) === "wall")
    return nextDetections.map((item) => {
      const kind = labelKind(item.label)
      return kind === "door" || kind === "window"
        ? snapOpeningToNearestWall(item, walls, props.imageSize)
        : item
    })
  }

  function commitWallThickness(targetThicknessPx: number, scope: "selected" | "all") {
    if (!selected || labelKind(selected.label) !== "wall") return
    const next = props.detections.map((item) => {
      if (labelKind(item.label) !== "wall") return item
      if (scope === "selected" && item.id !== selected.id) return item
      return {
        ...item,
        box: resizeWallThicknessBox(item.box, targetThicknessPx, props.imageSize),
      }
    })
    props.onCommit(normalizeOpeningsAfterWallEdit(next))
    showNotice(scope === "all" ? "ปรับความหนากำแพงทั้งหมดแล้ว" : "ปรับความหนากำแพงแล้ว")
  }

  function applyExactThickness(scope: "selected" | "all" = "selected") {
    const targetPx = parseThicknessInput(thicknessDraft, props.metersPerPixel)
    if (!targetPx) return
    commitWallThickness(targetPx, scope)
  }

  function applyPresetThickness(valueCm: number, scope: "selected" | "all" = "selected") {
    if (!selected || labelKind(selected.label) !== "wall") return
    const baseThickness = wallThicknessPx(selected.box)
    const targetPx = props.metersPerPixel
      ? valueCm / 100 / props.metersPerPixel
      : Math.max(6, Math.round((valueCm / 15) * baseThickness))
    commitWallThickness(targetPx, scope)
  }

  function applyWallHeight(scope: "selected" | "all" = "selected", preset?: number) {
    if (!selected || labelKind(selected.label) !== "wall") return
    const raw = preset ?? Number(heightDraft)
    if (!Number.isFinite(raw)) return
    const value = Math.min(4.5, Math.max(2.2, raw))
    const next = props.detections.map((item) => {
      if (labelKind(item.label) !== "wall") return item
      if (scope === "selected" && item.id !== selected.id) return item
      return { ...item, wallHeightM: value }
    })
    props.onCommit(next)
    setHeightDraft(value.toFixed(2))
    showNotice(scope === "all" ? "ปรับความสูงกำแพงทั้งหมดแล้ว" : "ปรับความสูงกำแพงแล้ว")
  }

  function applyCeilingHeight(value?: number) {
    if (!selected || labelKind(selected.label) !== "ceiling") return
    const raw = value ?? Number(ceilingHeightDraft)
    if (!Number.isFinite(raw)) return
    const safeValue = Math.min(5, Math.max(1.8, raw))
    props.onCommit(
      props.detections.map((item) =>
        item.id === selected.id ? { ...item, objectHeightM: safeValue } : item,
      ),
    )
    setCeilingHeightDraft(safeValue.toFixed(2))
    showNotice(`ปรับระดับฝ้าเป็น ${safeValue.toFixed(2)} เมตรแล้ว`)
  }

  function nudgeCeilingHeight(delta: number) {
    if (!selected || labelKind(selected.label) !== "ceiling") return
    const current = Number(selected.objectHeightM ?? DEFAULT_WALL_HEIGHT)
    applyCeilingHeight(current + delta)
  }

  function useSelectedWallAsDefault() {
    if (!selected || labelKind(selected.label) !== "wall") return
    setDefaultWallThicknessPx(
      clampWallThicknessPx(wallThicknessPx(selected.box), props.imageSize),
    )
    setDefaultWallHeightM(wallHeightOf(selected))
    defaultThicknessCustomizedRef.current = true
    showNotice("บันทึกขนาดกำแพงนี้เป็นค่าเริ่มต้นสำหรับผนังและห้องใหม่แล้ว")
  }

  function targetLabel(target: MaterialTarget) {
    return target === "wall"
      ? "ผนัง"
      : target === "door"
        ? "ประตู"
        : target === "window"
          ? "หน้าต่าง"
          : target === "floor"
            ? "พื้น"
            : target === "ceiling"
              ? "ฝ้าเพดาน"
              : "เฟอร์นิเจอร์"
  }

  function applyMaterial(scope: "selected" | "all", materialId = selectedMaterialId) {
    const material = materialById(materialId)
    const target = material.target

    if (scope === "selected") {
      if (!selected || selectedMaterialTarget !== target) {
        showNotice(`เลือก${targetLabel(target)}ก่อน แล้วจึงใช้วัสดุนี้`)
        return
      }
      props.onCommit(
        props.detections.map((item) =>
          item.id === selected.id
            ? { ...item, materialId: material.id, materialApplied: true }
            : item,
        ),
      )
      showNotice(`ใช้ ${material.name} กับ${targetLabel(target)}ที่เลือกแล้ว`)
      return
    }

    const hasTarget = props.detections.some((item) => targetForDetection(item) === target)
    if (!hasTarget) {
      showNotice(`ยังไม่มี${targetLabel(target)}ในโมเดล`)
      return
    }

    if (target === "floor") props.onFloorMaterialChange(material.id)
    props.onCommit(
      props.detections.map((item) =>
        targetForDetection(item) === target
          ? { ...item, materialId: material.id, materialApplied: true }
          : item,
      ),
    )
    showNotice(`ใช้ ${material.name} กับ${targetLabel(target)}ทั้งหมดแล้ว`)
  }

  function chooseMaterial(material: MaterialDefinition) {
    setSelectedMaterialId(material.id)
    if (!instantApply) return
    const scope = selected && selectedMaterialTarget === material.target ? "selected" : "all"
    applyMaterial(scope, material.id)
  }

  function toggleFavorite(materialId: string) {
    setFavoriteMaterialIds((current) =>
      current.includes(materialId)
        ? current.filter((id) => id !== materialId)
        : [...current, materialId],
    )
  }

  function toggleComparison(materialId: string) {
    setComparisonIds((current) => {
      if (current.includes(materialId)) return current.filter((id) => id !== materialId)
      if (current.length >= 3) {
        showNotice("เปรียบเทียบได้สูงสุด 3 วัสดุ")
        return current
      }
      return [...current, materialId]
    })
  }

  function updateSelectedMaterialTransform(
    patch: Partial<Pick<Detection, "materialScale" | "materialRotation">>,
  ) {
    if (!selected || !selectedMaterialTarget) {
      showNotice("เลือกวัตถุก่อนปรับขนาดหรือตำแหน่งลาย")
      return
    }
    props.onCommit(
      props.detections.map((item) =>
        item.id === selected.id ? { ...item, ...patch } : item,
      ),
    )
  }

  function exportBudgetCsv() {
    if (!budget.hasScale) {
      showNotice("กำหนดมาตราส่วนจริงก่อนส่งออกรายการวัสดุ")
      return
    }

    const rows = [
      ["รายการ", "ประเภท", "ปริมาณ", "หน่วย", "ราคาต่อหน่วย (บาท)", "รวม (บาท)"],
      ...budget.lines.map((line) => [
        line.name,
        targetLabel(line.target),
        line.quantity.toFixed(line.unit === "ชิ้น" ? 0 : 2),
        line.unit,
        line.unitPrice.toFixed(0),
        line.total.toFixed(0),
      ]),
      ["รวมประมาณการ", "", "", "", "", budget.subtotal.toFixed(0)],
    ]
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\r\n")
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "Sketch2Spec-material-budget.csv"
    anchor.click()
    URL.revokeObjectURL(url)
    showNotice("ส่งออกรายการวัสดุเป็น CSV แล้ว")
  }

  function duplicateSelected() {
    if (!selected) return
    const offset = Math.max(8, gridStepPx * 2)
    let nextBox = clampBox(
      boxFromEdges(
        selected.box.x1 + offset,
        selected.box.y1 + offset,
        selected.box.x2 + offset,
        selected.box.y2 + offset,
      ),
      props.imageSize,
    )
    if (snapMode === "grid") {
      nextBox = snapMovedBoxToGrid(nextBox, props.imageSize, gridStepPx)
    }
    let copy: Detection = {
      ...selected,
      id: makeDetectionId(labelKind(selected.label)),
      confidence: 1,
      box: nextBox,
    }
    const kind = labelKind(copy.label)
    if (kind === "door" || kind === "window") {
      const walls = props.detections.filter((item) => labelKind(item.label) === "wall")
      copy = snapOpeningToNearestWall(copy, walls, props.imageSize)
    }
    props.onCommit([...props.detections, copy])
    props.onSelect(copy.id)
    showNotice("ทำสำเนาวัตถุแล้ว")
  }

  function cycleSnapMode() {
    setSnapMode((current) =>
      current === "smart" ? "grid" : current === "grid" ? "free" : "smart",
    )
  }

  useEffect(() => {
    if (!selected) {
      setInspectorOpen(false)
      setLengthDraft("")
      setThicknessDraft("")
      setHeightDraft(defaultWallHeightM.toFixed(2))
      setCeilingHeightDraft(DEFAULT_WALL_HEIGHT.toFixed(2))
      return
    }
    const major = wallLengthPx(selected.box)
    const minor = wallThicknessPx(selected.box)
    setLengthDraft(
      props.metersPerPixel
        ? (major * props.metersPerPixel).toFixed(2)
        : Math.round(major).toString(),
    )
    setThicknessDraft(
      props.metersPerPixel
        ? Math.round(minor * props.metersPerPixel * 100).toString()
        : Math.round(minor).toString(),
    )
    setHeightDraft(wallHeightOf(selected).toFixed(2))
    setCeilingHeightDraft(Number(selected.objectHeightM ?? DEFAULT_WALL_HEIGHT).toFixed(2))
  }, [defaultWallHeightM, props.metersPerPixel, selected])

  useEffect(() => {
    const host = canvasHostRef.current
    if (!host) return

    function preventMiddleButtonAutoScroll(event: MouseEvent) {
      if (event.button === 1) event.preventDefault()
    }

    function preventEditorContextMenu(event: MouseEvent) {
      event.preventDefault()
    }

    host.addEventListener("mousedown", preventMiddleButtonAutoScroll, {
      capture: true,
      passive: false,
    })
    host.addEventListener("auxclick", preventMiddleButtonAutoScroll, {
      capture: true,
      passive: false,
    })
    host.addEventListener("contextmenu", preventEditorContextMenu, {
      capture: true,
      passive: false,
    })

    return () => {
      host.removeEventListener("mousedown", preventMiddleButtonAutoScroll, true)
      host.removeEventListener("auxclick", preventMiddleButtonAutoScroll, true)
      host.removeEventListener("contextmenu", preventEditorContextMenu, true)
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      if (isTyping) return

      if ((event.ctrlKey || event.metaKey) &&
        (event.code === "KeyD" || event.key.toLowerCase() === "d")) {
        event.preventDefault()
        duplicateSelected()
        return
      }
      if (event.ctrlKey || event.metaKey) return

      if (event.key === "Escape") chooseTool("select")
      else if (event.key === "1") chooseTool("select")
      else if (event.key === "2") chooseTool("wall")
      else if (event.code === "KeyR" || event.key.toLowerCase() === "r") chooseTool("room")
      else if (event.key === "3") chooseTool("door")
      else if (event.key === "4") chooseTool("window")
      else if (event.key === "5" || event.code === "KeyF") chooseTool("floor")
      else if (event.key === "6" || event.code === "KeyC") chooseTool("ceiling")
      else if (event.key === "PageUp" && selected && labelKind(selected.label) === "ceiling") {
        event.preventDefault()
        nudgeCeilingHeight(0.1)
      }
      else if (event.key === "PageDown" && selected && labelKind(selected.label) === "ceiling") {
        event.preventDefault()
        nudgeCeilingHeight(-0.1)
      }
      else if (event.code === "KeyG" || event.key.toLowerCase() === "g") cycleSnapMode()
      else if (event.code === "KeyH" || event.key.toLowerCase() === "h") setShowHelp((value) => !value)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    }
  }, [])

  const snapLabel =
    snapMode === "smart" ? "แม่เหล็ก" : snapMode === "grid" ? "กริด" : "อิสระ"
  const gridLabel = props.metersPerPixel
    ? `${Math.round(gridStepPx * props.metersPerPixel * 100)} cm`
    : `${gridStepPx} px`

  return (
    <div className="animate-in fade-in zoom-in-95 overflow-hidden rounded-2xl border border-border bg-slate-200 duration-500">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-white/95 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">Build Assist</p>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              Scan-to-3D
            </span>
          </div>
          <p className="mt-0.5 hidden truncate text-xs text-muted-foreground sm:block">
            {currentTool.title} — {currentTool.detail}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <div className="flex rounded-xl bg-secondary p-1">
            <button
              type="button"
              onClick={() => chooseView("plan")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                editorView === "plan"
                  ? "bg-white text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              แบบแปลน
            </button>
            <button
              type="button"
              onClick={() => chooseView("perspective")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                editorView === "perspective"
                  ? "bg-white text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              3D
            </button>
          </div>

          <label className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-white px-2 text-[11px] font-medium text-muted-foreground">
            <Magnet className="h-3.5 w-3.5 text-primary" />
            <select
              value={snapMode}
              onChange={(event) => setSnapMode(event.target.value as SnapMode)}
              className="bg-transparent font-semibold text-foreground outline-none"
              title="ใช้กับการวาด การย่อ-ขยาย และการขยับด้วยเครื่องมือเลือก"
            >
              <option value="smart">แม่เหล็ก</option>
              <option value="grid">กริด</option>
              <option value="free">อิสระ</option>
            </select>
          </label>

          {snapMode === "grid" && (
            <select
              value={gridStepPx}
              onChange={(event) => setGridStepPx(Number(event.target.value))}
              className="h-9 rounded-xl border border-border bg-white px-2 text-xs font-semibold text-foreground outline-none"
              title="ขนาดกริด"
            >
              {[5, 10, 20, 40].map((value) => (
                <option key={value} value={value}>
                  {props.metersPerPixel
                    ? `${Math.round(value * props.metersPerPixel * 100)} cm`
                    : `${value} px`}
                </option>
              ))}
            </select>
          )}

          <Button type="button" size="sm" variant="outline" className="h-9 rounded-xl px-2 sm:px-3" onClick={runAutoAlign} title="จัดแนวผนังและช่องเปิด">
            <WandSparkles className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">จัดแนว</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={materialsOpen ? "secondary" : "outline"}
            className="h-9 rounded-xl px-2 sm:px-3"
            onClick={() => setMaterialsOpen((value) => !value)}
            title="เลือกวัสดุและดูงบประมาณ"
          >
            <Paintbrush className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">วัสดุ & งบ</span>
          </Button>
          <Button type="button" size="icon-sm" variant="outline" className="rounded-xl" title="Undo" onClick={props.onUndo} disabled={!props.canUndo}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon-sm" variant="outline" className="rounded-xl" title="Redo" onClick={props.onRedo} disabled={!props.canRedo}>
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon-sm" variant={showHelp ? "secondary" : "ghost"} className="rounded-xl" title="วิธีควบคุม" onClick={() => setShowHelp((value) => !value)}>
            <CircleHelp className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={canvasHostRef}
        className="relative h-[720px] w-full select-none overflow-hidden overscroll-contain"
      >
        <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[360px] items-center gap-2 rounded-full border border-white/80 bg-white/92 px-3 py-2 shadow-lg backdrop-blur-md">
          <span className="rounded-full bg-primary/10 p-1.5 text-primary">
            {buildTool === "select" ? (
              <MousePointer2 className="h-3.5 w-3.5" />
            ) : buildTool === "wall" ? (
              <SquareDashed className="h-3.5 w-3.5" />
            ) : buildTool === "room" ? (
              <RectangleHorizontal className="h-3.5 w-3.5" />
            ) : buildTool === "floor" ? (
              <Grid2X2 className="h-3.5 w-3.5" />
            ) : buildTool === "door" ? (
              <DoorOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelTop className="h-3.5 w-3.5" />
            )}
          </span>
          <span className="truncate text-[11px] font-semibold text-foreground">{currentTool.title}</span>
          <span className="text-[10px] text-muted-foreground">· {snapLabel}</span>
          {selected && buildTool === "select" && (
            <span className="hidden text-[10px] font-medium text-primary sm:inline">
              · {formatDimension(Math.max(selected.box.width, selected.box.height), props.metersPerPixel)}
            </span>
          )}
        </div>

        {notice && (
          <div className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-full bg-slate-950/90 px-4 py-2 text-xs font-semibold text-white shadow-xl">
            {notice}
          </div>
        )}

        {showHelp && (
          <div className="absolute left-3 top-14 z-30 w-[300px] rounded-2xl border border-white/80 bg-white/96 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">การควบคุมแบบเข้าใจง่าย</p>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowHelp(false)}
              >
                ปิด
              </button>
            </div>
            <div className="mt-3 space-y-2 text-[11px] text-muted-foreground">
              <p><b className="text-foreground">คลิกซ้าย:</b> เลือก วาง ย้าย และปรับขนาด</p>
              <p><b className="text-foreground">เมาส์กลาง:</b> หมุนกล้องในมุม 3D</p>
              <p><b className="text-foreground">คลิกขวา:</b> เลื่อนมุมมอง</p>
              <p><b className="text-foreground">ล้อเมาส์:</b> ซูมเข้า–ออก</p>
              <p><b className="text-foreground">ปุ่ม 5 / F:</b> สร้างพื้นเองโดยลากเป็นสี่เหลี่ยม</p>
              <p><b className="text-foreground">ปุ่ม 6 / C:</b> สร้างฝ้าเพดาน</p>
              <p><b className="text-foreground">Page Up / Page Down:</b> เลื่อนฝ้าที่เลือกขึ้นหรือลงครั้งละ 10 ซม.</p>
              <p><b className="text-foreground">Ctrl+D:</b> ทำสำเนาวัตถุ</p>
              <p><b className="text-foreground">G:</b> สลับแม่เหล็ก / กริด / อิสระ</p>
              <p><b className="text-foreground">Shift + ลาก:</b> ขยับอิสระชั่วคราว</p>
              <p><b className="text-foreground">Esc:</b> กลับโหมดเลือก</p>
            </div>
          </div>
        )}

        {texturePreviewOpen && (
          <div className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-5 backdrop-blur-sm">
            <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl">
              <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{selectedMaterialDefinition.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    ตัวอย่างพื้นผิวแบบซูมใกล้ · {selectedMaterialDefinition.textureMaps ? "ภาพจริงพร้อม PBR maps" : "Procedural texture"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTexturePreviewOpen(false)}
                  className="rounded-xl border border-border bg-white p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="ปิด"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div
                className="h-[min(68vh,620px)] bg-repeat"
                style={{
                  backgroundColor: selectedMaterialDefinition.color,
                  backgroundImage: selectedMaterialPreviewUrl
                    ? `url(${selectedMaterialPreviewUrl})`
                    : undefined,
                  backgroundPosition: "center",
                  backgroundSize: selectedMaterialDefinition.textureMaps ? "720px auto" : "420px 420px",
                }}
              />
              <div className="grid grid-cols-3 gap-3 border-t border-border bg-slate-50 px-5 py-3 text-[10px] text-muted-foreground">
                <span><b className="text-foreground">พื้นผิว:</b> {selectedMaterialDefinition.textureMaps ? "ภาพจริง" : "สร้างในระบบ"}</span>
                <span><b className="text-foreground">ความด้าน:</b> {selectedMaterialDefinition.roughness.toFixed(2)}</span>
                <span><b className="text-foreground">Normal strength:</b> {(selectedMaterialDefinition.normalStrength ?? 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {comparisonOpen && (
          <div className="absolute inset-0 z-[85] flex items-center justify-center bg-slate-950/75 p-5 backdrop-blur-sm">
            <div className="w-full max-w-5xl rounded-3xl border border-white/20 bg-white p-5 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-foreground">เปรียบเทียบวัสดุ</p>
                  <p className="text-[11px] text-muted-foreground">เทียบพื้นผิว ราคา ความด้าน และประเภทวัสดุได้สูงสุด 3 แบบ</p>
                </div>
                <button
                  type="button"
                  onClick={() => setComparisonOpen(false)}
                  className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {comparisonMaterials.map((material) => {
                  const preview = previewUrlForMaterial(material)
                  return (
                    <div key={material.id} className="overflow-hidden rounded-2xl border border-border bg-white">
                      <div
                        className="h-36 bg-cover bg-center"
                        style={{
                          backgroundColor: material.color,
                          backgroundImage: preview ? `url(${preview})` : undefined,
                        }}
                      />
                      <div className="space-y-2 p-4 text-[11px]">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-foreground">{material.name}</p>
                            <p className="text-muted-foreground">{material.description}</p>
                          </div>
                          <button type="button" onClick={() => toggleComparison(material.id)} className="text-muted-foreground hover:text-destructive">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3">
                          <span>ประเภท</span><b>{targetLabel(material.target)}</b>
                          <span>ราคา</span><b>{formatMoney(material.price)}/{material.unit}</b>
                          <span>ความด้าน</span><b>{material.roughness.toFixed(2)}</b>
                          <span>พื้นผิว</span><b>{material.textureMaps ? "ภาพจริง" : "PBR"}</b>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="w-full rounded-xl"
                          onClick={() => {
                            chooseMaterial(material)
                            setComparisonOpen(false)
                          }}
                        >
                          เลือกวัสดุนี้
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {materialsOpen && (
          <div className="absolute right-3 top-3 z-50 max-h-[690px] w-[340px] overflow-y-auto rounded-2xl border border-white/80 bg-white/95 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-xl bg-primary/10 p-2 text-primary">
                    <Paintbrush className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">วัสดุและงบประมาณ</p>
                    <p className="text-[10px] text-muted-foreground">ดูตัวอย่างลายวัสดุ แล้วใช้กับชิ้นเดียวหรือทั้งหมด</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                onClick={() => setMaterialsOpen(false)}
              >
                ปิด
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1 sm:grid-cols-3">
              {([
                { key: "floor-tile" as const, label: "กระเบื้องพื้น" },
                { key: "wall-paint" as const, label: "สีทาผนัง" },
                { key: "wallpaper" as const, label: "วอลเปเปอร์" },
                { key: "woodwork" as const, label: "งานไม้" },
                { key: "ceiling" as const, label: "ฝ้าเพดาน" },
                { key: "glass-metal" as const, label: "กระจก/โลหะ" },
              ]).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setMaterialCategory(item.key)}
                  className={`rounded-lg px-1 py-2 text-[10px] font-semibold transition ${
                    materialCategory === item.key
                      ? "bg-white text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={instantApply}
                  onChange={(event) => setInstantApply(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                ใช้บนโมเดลทันทีเมื่อคลิก
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setShowFavoritesOnly((value) => !value)}
                  className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${showFavoritesOnly ? "border-rose-300 bg-rose-50 text-rose-600" : "border-border text-muted-foreground"}`}
                >
                  <Heart className="mr-1 inline h-3 w-3" /> โปรด
                </button>
                <button
                  type="button"
                  disabled={comparisonIds.length < 2}
                  onClick={() => setComparisonOpen(true)}
                  className="rounded-lg border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground disabled:opacity-40"
                >
                  <GitCompareArrows className="mr-1 inline h-3 w-3" /> เทียบ {comparisonIds.length}
                </button>
              </div>
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
              <div
                className="relative h-28 bg-cover bg-center"
                style={{
                  backgroundColor: selectedMaterialDefinition.color,
                  backgroundImage: selectedMaterialPreviewUrl
                    ? `url(${selectedMaterialPreviewUrl})`
                    : undefined,
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/5" />
                <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[9px] font-bold text-slate-700 shadow">
                  {selectedMaterialDefinition.textureMaps ? "REAL TEXTURE" : "PROCEDURAL PBR"}
                </span>
                <button
                  type="button"
                  onClick={() => setTexturePreviewOpen(true)}
                  className="absolute right-2 top-2 rounded-xl bg-slate-950/70 p-2 text-white shadow backdrop-blur-sm hover:bg-slate-950"
                  title="ดูพื้นผิวแบบซูมใกล้"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
                <div className="absolute inset-x-3 bottom-2 text-white">
                  <p className="text-xs font-semibold drop-shadow">{selectedMaterialDefinition.name}</p>
                  <p className="text-[9px] text-white/80 drop-shadow">
                    Roughness {selectedMaterialDefinition.roughness.toFixed(2)} · Scale {selectedMaterialDefinition.textureScale.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {materialCatalog.length === 0 && (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
                  ยังไม่มีวัสดุโปรดในหมวดนี้
                </div>
              )}
              {materialCatalog.map((material) => {
                const active = selectedMaterialId === material.id
                const favorite = favoriteMaterialIds.includes(material.id)
                const comparing = comparisonIds.includes(material.id)
                return (
                  <div
                    key={material.id}
                    className={`flex w-full items-center gap-2 rounded-xl border p-2 text-left transition ${
                      active
                        ? "border-primary bg-primary/5 ring-2 ring-primary/10"
                        : "border-border bg-white hover:border-primary/30 hover:bg-secondary/40"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => chooseMaterial(material)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <MaterialThumbnail material={material} active={active} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-foreground">{material.name}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{material.description}</span>
                        <span className="mt-1 block text-[9px] font-medium text-primary">{targetLabel(material.target)}</span>
                      </span>
                      <span className="text-right text-[10px] font-semibold text-foreground">
                        {formatMoney(material.price)}
                        <span className="block font-normal text-muted-foreground">/{material.unit}</span>
                      </span>
                    </button>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => toggleFavorite(material.id)}
                        className={`rounded-lg p-1.5 ${favorite ? "bg-rose-50 text-rose-500" : "text-muted-foreground hover:bg-secondary"}`}
                        title={favorite ? "นำออกจากรายการโปรด" : "บันทึกเป็นรายการโปรด"}
                      >
                        <Heart className={`h-3.5 w-3.5 ${favorite ? "fill-current" : ""}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleComparison(material.id)}
                        className={`rounded-lg p-1.5 ${comparing ? "bg-blue-50 text-primary" : "text-muted-foreground hover:bg-secondary"}`}
                        title="เพิ่มในรายการเปรียบเทียบ"
                      >
                        <GitCompareArrows className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="mt-2 text-[10px] text-muted-foreground">
              วัสดุที่เลือกใช้กับ {targetLabel(selectedMaterialDefinition.target)} · เปิด Instant Apply เพื่อดูผลและราคาแบบเรียลไทม์
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 rounded-xl"
                disabled={!selected || selectedMaterialTarget !== selectedMaterialDefinition.target}
                onClick={() => applyMaterial("selected")}
              >
                ใช้กับที่เลือก
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-xl"
                disabled={!props.detections.some((item) => targetForDetection(item) === selectedMaterialDefinition.target)}
                onClick={() => applyMaterial("all")}
              >
                ใช้กับทั้งหมด
              </Button>
            </div>

            <div className="mt-3 rounded-2xl border border-border bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-foreground">Texture & Lighting</p>
                <span className="text-[9px] text-muted-foreground">ปรับกับวัตถุที่เลือก</span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1">
                {([
                  { key: "day" as const, label: "กลางวัน", icon: Sun },
                  { key: "warm" as const, label: "อบอุ่น", icon: Lightbulb },
                  { key: "night" as const, label: "กลางคืน", icon: Moon },
                  { key: "studio" as const, label: "สตูดิโอ", icon: WandSparkles },
                ]).map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setLightingPreset(item.key)}
                      className={`rounded-lg px-1 py-2 text-[9px] font-semibold ${lightingPreset === item.key ? "bg-primary text-primary-foreground" : "bg-white text-muted-foreground"}`}
                    >
                      <Icon className="mx-auto mb-1 h-3.5 w-3.5" />
                      {item.label}
                    </button>
                  )
                })}
              </div>
              <label className="mt-3 block text-[10px] font-medium text-muted-foreground">
                ขนาดลาย {(selected?.materialScale ?? 1).toFixed(2)}×
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.05"
                  value={selected?.materialScale ?? 1}
                  disabled={!selected || !selectedMaterialTarget}
                  onChange={(event) => updateSelectedMaterialTransform({ materialScale: Number(event.target.value) })}
                  className="mt-1 w-full"
                />
              </label>
              <label className="mt-2 block text-[10px] font-medium text-muted-foreground">
                หมุนลาย {Math.round(((selected?.materialRotation ?? 0) * 180) / Math.PI)}°
                <input
                  type="range"
                  min="0"
                  max="180"
                  step="15"
                  value={Math.round(((selected?.materialRotation ?? 0) * 180) / Math.PI)}
                  disabled={!selected || !selectedMaterialTarget}
                  onChange={(event) => updateSelectedMaterialTransform({ materialRotation: (Number(event.target.value) * Math.PI) / 180 })}
                  className="mt-1 w-full"
                />
              </label>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-950 p-3 text-white">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ReceiptText className="h-4 w-4 text-blue-300" />
                  <div>
                    <p className="text-xs font-semibold">ประมาณการวัสดุ</p>
                    <p className="text-[9px] text-slate-400">เริ่มคิดราคาเมื่อเลือกและใช้วัสดุกับโมเดลแล้วเท่านั้น</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={exportBudgetCsv}
                  className="rounded-lg bg-white/10 p-2 text-slate-100 hover:bg-white/20 disabled:opacity-40"
                  disabled={!budget.hasScale || budget.lines.length === 0}
                  title="ส่งออก CSV"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>

              {!budget.hasScale ? (
                <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-[10px] text-amber-100">
                  กำหนดมาตราส่วนจริงก่อน ระบบจึงจะคำนวณพื้นที่และราคาได้
                </div>
              ) : budget.lines.length === 0 ? (
                <div className="mt-3 rounded-xl border border-blue-300/20 bg-blue-300/10 p-3 text-[10px] leading-5 text-blue-100">
                  <p className="font-semibold">ยังไม่เริ่มคิดราคา</p>
                  <p className="mt-1 text-blue-100/80">สีและวัสดุที่เห็นหลังเจน 3D เป็นเพียงตัวอย่าง เริ่มคำนวณเมื่อเลือกวัสดุแล้วกดใช้กับวัตถุที่เลือกหรือใช้กับทั้งหมด</p>
                </div>
              ) : (
                <>
                  <div className="mt-3 max-h-[170px] space-y-1.5 overflow-y-auto pr-1">
                    {budget.lines.map((line) => (
                      <div key={line.materialId} className="flex items-center justify-between gap-3 text-[10px]">
                        <span className="min-w-0 truncate text-slate-300">
                          {line.name} · {line.quantity.toFixed(line.unit === "ชิ้น" ? 0 : 2)} {line.unit}
                        </span>
                        <span className="shrink-0 font-semibold">{formatMoney(line.total)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-end justify-between border-t border-white/10 pt-3">
                    <span className="text-[10px] text-slate-400">รวมเฉพาะวัสดุที่เลือกใช้แล้ว</span>
                    <span className="text-lg font-bold text-white">{formatMoney(budget.subtotal)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {editorView === "perspective" && (
          <div className="absolute right-3 top-3 z-20 w-[164px] rounded-2xl border border-white/80 bg-white/92 p-2 shadow-xl backdrop-blur-md">
            <div className="grid grid-cols-3 gap-1.5">
              <Button type="button" size="icon-sm" variant="ghost" className="rounded-xl" title="หมุนซ้าย" onClick={() => runCamera("rotate-left")}>
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon-sm" variant="secondary" className="rounded-xl" title="กลับมุมมองหลัก" onClick={() => runCamera("home")}>
                <Home className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" className="rounded-xl" title="หมุนขวา" onClick={() => runCamera("rotate-right")}>
                <RotateCw className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" className="rounded-xl" title="ซูมเข้า" onClick={() => runCamera("zoom-in")}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" className="rounded-xl" title="มุมมองด้านบน" onClick={() => runCamera("top")}>
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" className="rounded-xl" title="ซูมออก" onClick={() => runCamera("zoom-out")}>
                <ZoomOut className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1">
              {([
                { key: "up" as const, label: "เต็ม" },
                { key: "cutaway" as const, label: "ตัด" },
                { key: "down" as const, label: "ซ่อน" },
              ]).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setWallViewMode(item.key)}
                  className={`rounded-lg px-1 py-1.5 text-[10px] font-semibold ${
                    wallViewMode === item.key
                      ? "bg-white text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {selected && (
              <Button type="button" size="sm" variant="ghost" className="mt-1 h-8 w-full rounded-xl text-xs" onClick={() => runCamera("focus")}>
                <Box className="mr-2 h-3.5 w-3.5" />
                โฟกัสวัตถุ
              </Button>
            )}
          </div>
        )}

        <div className="absolute bottom-24 left-3 z-20 flex items-center gap-1.5 rounded-2xl border border-white/80 bg-white/92 p-2 shadow-xl backdrop-blur-md">
          <Button
            type="button"
            size="icon-sm"
            variant={showDimensions ? "secondary" : "ghost"}
            title="แสดงขนาดทุกชิ้น"
            className="rounded-xl"
            onClick={() => setShowDimensions((value) => !value)}
          >
            <Ruler className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={showGrid ? "secondary" : "ghost"}
            title="แสดง/ซ่อนกริด"
            className="rounded-xl"
            onClick={() => setShowGrid((value) => !value)}
          >
            {showGrid ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
          {selected && buildTool === "select" && (
            <Button
              type="button"
              size="icon-sm"
              variant={inspectorOpen ? "secondary" : "ghost"}
              title="คุณสมบัติวัตถุ"
              className="rounded-xl"
              onClick={() => setInspectorOpen((value) => !value)}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          )}
        </div>

        {selected && buildTool === "select" && !inspectorOpen && (
          <button
            type="button"
            onClick={() => setInspectorOpen(true)}
            className="absolute bottom-20 right-3 z-20 flex items-center gap-2 rounded-full border border-white/80 bg-white/95 px-3 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur-md hover:bg-white"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
            {selected && labelKind(selected.label) === "ceiling" ? "แก้ขนาด/ระดับ" : "แก้ขนาด"}
          </button>
        )}

        {selected && buildTool === "select" && inspectorOpen && (
          <div className="absolute bottom-20 right-3 z-20 max-h-[420px] w-[280px] overflow-y-auto rounded-2xl border border-white/80 bg-white/96 p-3 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-foreground">คุณสมบัติวัตถุ</p>
                <p className="text-[10px] text-muted-foreground">แก้ตัวเลขแล้วกด Enter หรือ “ใช้ค่า”</p>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" size="icon-sm" variant="ghost" className="rounded-xl" title="ทำสำเนา" onClick={duplicateSelected}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" className="rounded-xl" title="ปิดแผง" onClick={() => setInspectorOpen(false)}>
                  ×
                </Button>
              </div>
            </div>

            <div className="mt-3 flex items-end gap-2">
              <label className="min-w-0 flex-1 text-[10px] font-medium text-muted-foreground">
                ความยาว ({props.metersPerPixel ? "เมตร" : "px"})
                <input
                  value={lengthDraft}
                  onChange={(event) => setLengthDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applyExactLength()
                  }}
                  inputMode="decimal"
                  className="mt-1 h-9 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>
              <Button type="button" size="sm" className="h-9 rounded-xl" onClick={applyExactLength}>
                ใช้ค่า
              </Button>
            </div>

            {labelKind(selected.label) === "wall" && (
              <div className="mt-3 space-y-3 rounded-2xl bg-secondary/60 p-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-foreground">ความหนากำแพง</p>
                    <span className="text-[10px] text-muted-foreground">
                      {formatWallThickness(wallThicknessPx(selected.box), props.metersPerPixel)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-end gap-2">
                    <label className="min-w-0 flex-1 text-[10px] font-medium text-muted-foreground">
                      {props.metersPerPixel ? "เซนติเมตร" : "พิกเซล"}
                      <input
                        value={thicknessDraft}
                        onChange={(event) => setThicknessDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") applyExactThickness("selected")
                        }}
                        inputMode="decimal"
                        className="mt-1 h-9 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring/40"
                      />
                    </label>
                    <Button type="button" size="sm" variant="secondary" className="h-9 rounded-xl" onClick={() => applyExactThickness("selected")}>
                      ใช้
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {[10, 15, 20].map((value) => (
                      <Button key={value} type="button" size="sm" variant="outline" className="h-8 rounded-xl text-[11px]" onClick={() => applyPresetThickness(value)}>
                        {value} cm
                      </Button>
                    ))}
                  </div>
                  <Button type="button" size="sm" variant="ghost" className="mt-1 h-8 w-full rounded-xl text-[11px]" onClick={() => applyExactThickness("all")}>
                    ใช้ความหนานี้กับกำแพงทั้งหมด
                  </Button>
                </div>

                <div className="border-t border-border/70 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-foreground">ความสูงกำแพง</p>
                    <span className="text-[10px] text-muted-foreground">{wallHeightOf(selected).toFixed(2)} m</span>
                  </div>
                  <div className="mt-2 flex items-end gap-2">
                    <label className="min-w-0 flex-1 text-[10px] font-medium text-muted-foreground">
                      เมตร
                      <input
                        value={heightDraft}
                        onChange={(event) => setHeightDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") applyWallHeight("selected")
                        }}
                        inputMode="decimal"
                        className="mt-1 h-9 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring/40"
                      />
                    </label>
                    <Button type="button" size="sm" variant="secondary" className="h-9 rounded-xl" onClick={() => applyWallHeight("selected")}>
                      ใช้
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {[2.4, 2.8, 3.2].map((value) => (
                      <Button key={value} type="button" size="sm" variant="outline" className="h-8 rounded-xl text-[11px]" onClick={() => applyWallHeight("selected", value)}>
                        {value.toFixed(1)} m
                      </Button>
                    ))}
                  </div>
                  <Button type="button" size="sm" variant="ghost" className="mt-1 h-8 w-full rounded-xl text-[11px]" onClick={() => applyWallHeight("all")}>
                    ใช้ความสูงนี้กับกำแพงทั้งหมด
                  </Button>
                </div>

                <Button type="button" size="sm" variant="outline" className="h-9 w-full rounded-xl text-[11px]" onClick={useSelectedWallAsDefault}>
                  <Layers3 className="mr-2 h-3.5 w-3.5" />
                  ใช้ขนาดนี้กับกำแพง/ห้องใหม่
                </Button>
              </div>
            )}

            {labelKind(selected.label) === "ceiling" && (
              <div className="mt-3 space-y-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold text-foreground">ระดับฝ้าจากพื้น</p>
                    <p className="text-[9px] text-muted-foreground">เลื่อนฝ้าขึ้นหรือลงในแนวตั้ง</p>
                  </div>
                  <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-bold text-violet-700">
                    {Number(selected.objectHeightM ?? DEFAULT_WALL_HEIGHT).toFixed(2)} m
                  </span>
                </div>

                <input
                  type="range"
                  min="1.8"
                  max="5"
                  step="0.05"
                  value={Number(ceilingHeightDraft) || DEFAULT_WALL_HEIGHT}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    setCeilingHeightDraft(value.toFixed(2))
                    applyCeilingHeight(value)
                  }}
                  className="h-2 w-full cursor-pointer accent-violet-600"
                  aria-label="ระดับความสูงฝ้า"
                />

                <div className="flex items-end gap-2">
                  <label className="min-w-0 flex-1 text-[10px] font-medium text-muted-foreground">
                    ความสูง (เมตร)
                    <input
                      value={ceilingHeightDraft}
                      onChange={(event) => setCeilingHeightDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") applyCeilingHeight()
                      }}
                      inputMode="decimal"
                      className="mt-1 h-9 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-violet-300/60"
                    />
                  </label>
                  <Button type="button" size="sm" className="h-9 rounded-xl" onClick={() => applyCeilingHeight()}>
                    ใช้ค่า
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" size="sm" variant="outline" className="h-9 rounded-xl" onClick={() => nudgeCeilingHeight(-0.1)}>
                    ↓ ลง 10 ซม.
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-9 rounded-xl" onClick={() => nudgeCeilingHeight(0.1)}>
                    ↑ ขึ้น 10 ซม.
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {[2.4, 2.8, 3.2].map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-8 rounded-xl text-[11px]"
                      onClick={() => applyCeilingHeight(value)}
                    >
                      {value.toFixed(1)} m
                    </Button>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground">คีย์ลัด: Page Up / Page Down ขยับครั้งละ 10 ซม.</p>
              </div>
            )}
          </div>
        )}

        <div className="absolute bottom-3 left-1/2 z-30 w-[calc(100%-24px)] max-w-[900px] -translate-x-1/2 rounded-2xl border border-white/80 bg-white/95 p-1.5 shadow-2xl backdrop-blur-xl">
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
            {([
              { key: "select" as const, label: "เลือก", shortcut: "1", icon: MousePointer2 },
              { key: "wall" as const, label: "ผนัง", shortcut: "2", icon: SquareDashed },
              { key: "room" as const, label: "ห้อง", shortcut: "R", icon: RectangleHorizontal },
              { key: "floor" as const, label: "พื้น", shortcut: "5", icon: Grid2X2 },
              { key: "ceiling" as const, label: "ฝ้า", shortcut: "6", icon: PanelTop },
              { key: "door" as const, label: "ประตู", shortcut: "3", icon: DoorOpen },
              { key: "window" as const, label: "หน้าต่าง", shortcut: "4", icon: PanelTop },
            ]).map((item) => {
              const Icon = item.icon
              const active = buildTool === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => chooseTool(item.key)}
                  className={`group flex min-h-[50px] flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-center transition ${
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "border-transparent bg-secondary/60 text-foreground hover:border-primary/20 hover:bg-primary/10"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="mt-1 text-[11px] font-semibold">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <Canvas
          shadows
          dpr={[1, 1.6]}
          camera={{ position: [11, 10, 11], fov: 45, near: 0.1, far: 200 }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          onPointerMissed={() => {
            if (buildTool === "select") props.onSelect(null)
          }}
        >
          <FloorPlanScene
            {...props}
            buildTool={buildTool}
            cameraCommand={cameraCommand}
            cameraNonce={cameraNonce}
            showDimensions={showDimensions}
            showGrid={showGrid}
            viewMode={editorView}
            snapMode={snapMode}
            gridStepPx={gridStepPx}
            wallViewMode={wallViewMode}
            lightingPreset={lightingPreset}
            defaultWallThicknessPx={defaultWallThicknessPx}
            defaultWallHeightM={defaultWallHeightM}
            onNotice={showNotice}
          />
        </Canvas>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border bg-white px-4 py-2 text-[11px] text-muted-foreground">
        <span>คลิกซ้ายแก้วัตถุ · เมาส์กลางหมุน · คลิกขวาเลื่อน · ล้อเมาส์ซูม</span>
        <span className="hidden font-medium text-foreground sm:inline">Snap: {snapLabel}{snapMode === "grid" ? ` ${gridLabel}` : ""}</span>
      </div>
    </div>
  )
}
