"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { DoorOpen, MousePointer2, PanelTop, Plus, SquareDashed, Trash2, Undo2, Redo2, SlidersHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { EditorToolRail } from "@/components/workspace/editor-tool-rail"
import { FocusMaterialPanel } from "@/components/workspace/focus-material-panel"
import { FocusToolbar } from "@/components/workspace/focus-toolbar"
import { furnitureCatalogItem } from "@/lib/furniture"
import { materialById, targetForDetection, type MaterialTarget } from "@/lib/materials"
import { resizeWallThicknessAroundCenter, wallThicknessPx } from "@/lib/wall-thickness"
import {
  boxFromEdges,
  clampBox,
  colorByLabel,
  createDetection,
  labelKind,
  type Detection,
  type ImageSize,
} from "@/lib/floor-plan"

type CornerMode = "nw" | "ne" | "sw" | "se"
type DragMode = "move" | "wall-start" | "wall-end" | "wall-thickness-start" | "wall-thickness-end" | CornerMode

type DragState = {
  id: string
  mode: DragMode
  startClientX: number
  startClientY: number
  startBox: Detection["box"]
  imageRect: DOMRect
  startDetections: Detection[]
  pointerId: number
  moved: boolean
}

type Props = {
  focusMode?: boolean
  onExitFocus?: () => void
  onSwitchWorkspace?: (view: "2d" | "3d") => void
  imageUrl: string
  imageSize: ImageSize
  metersPerPixel: number | null
  detections: Detection[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onLiveChange: (detections: Detection[]) => void
  onCommit: (detections: Detection[]) => void
  onAdd: (detection: Detection) => void
  onDeleteSelected: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onOpenDetails: () => void
  detailsOpen: boolean
}

const SNAP_SCREEN_PX = 10
const MIN_WALL_LENGTH_PX = 8

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values.map((value) => Math.round(value * 100) / 100)))
}

function snapValue(value: number, candidates: number[], threshold: number) {
  let best = value
  let bestDistance = threshold + 1
  for (const candidate of candidates) {
    const distance = Math.abs(value - candidate)
    if (distance <= threshold && distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

function wallOrientation(box: Detection["box"]) {
  return box.width >= box.height ? "horizontal" : "vertical"
}

function wallCenter(box: Detection["box"]) {
  return { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 }
}

function snapMovedBox(
  box: Detection["box"],
  id: string,
  detections: Detection[],
  image: ImageSize,
  threshold: number,
) {
  const xCandidates = [0, image.width]
  const yCandidates = [0, image.height]

  detections.forEach((detection) => {
    if (detection.id === id) return
    const center = wallCenter(detection.box)
    xCandidates.push(detection.box.x1, detection.box.x2, center.x)
    yCandidates.push(detection.box.y1, detection.box.y2, center.y)
  })

  const xs = uniqueNumbers(xCandidates)
  const ys = uniqueNumbers(yCandidates)
  const width = box.width
  const height = box.height
  const center = wallCenter(box)

  const xOptions = [
    { source: box.x1, target: snapValue(box.x1, xs, threshold), offset: 0 },
    { source: box.x2, target: snapValue(box.x2, xs, threshold), offset: -width },
    { source: center.x, target: snapValue(center.x, xs, threshold), offset: -width / 2 },
  ]
  const yOptions = [
    { source: box.y1, target: snapValue(box.y1, ys, threshold), offset: 0 },
    { source: box.y2, target: snapValue(box.y2, ys, threshold), offset: -height },
    { source: center.y, target: snapValue(center.y, ys, threshold), offset: -height / 2 },
  ]
  const bestX = xOptions.sort((a, b) => Math.abs(a.source - a.target) - Math.abs(b.source - b.target))[0]
  const bestY = yOptions.sort((a, b) => Math.abs(a.source - a.target) - Math.abs(b.source - b.target))[0]

  const x1 = bestX.target + bestX.offset
  const y1 = bestY.target + bestY.offset
  return clampBox(boxFromEdges(x1, y1, x1 + width, y1 + height), image)
}

function snapWallEndpoint(
  box: Detection["box"],
  id: string,
  detections: Detection[],
  image: ImageSize,
  mode: "wall-start" | "wall-end",
  threshold: number,
) {
  const orientation = wallOrientation(box)
  const center = wallCenter(box)
  const otherWalls = detections.filter(
    (detection) => detection.id !== id && labelKind(detection.label) === "wall",
  )

  if (orientation === "horizontal") {
    const candidates = [0, image.width]
    otherWalls.forEach((wall) => {
      const otherCenter = wallCenter(wall.box)
      candidates.push(wall.box.x1, wall.box.x2, otherCenter.x)
      if (
        wallOrientation(wall.box) === "vertical" &&
        center.y >= wall.box.y1 - threshold &&
        center.y <= wall.box.y2 + threshold
      ) {
        candidates.push(otherCenter.x)
      }
    })
    if (mode === "wall-start") {
      const x1 = Math.min(snapValue(box.x1, uniqueNumbers(candidates), threshold), box.x2 - MIN_WALL_LENGTH_PX)
      return clampBox(boxFromEdges(x1, box.y1, box.x2, box.y2), image)
    }
    const x2 = Math.max(snapValue(box.x2, uniqueNumbers(candidates), threshold), box.x1 + MIN_WALL_LENGTH_PX)
    return clampBox(boxFromEdges(box.x1, box.y1, x2, box.y2), image)
  }

  const candidates = [0, image.height]
  otherWalls.forEach((wall) => {
    const otherCenter = wallCenter(wall.box)
    candidates.push(wall.box.y1, wall.box.y2, otherCenter.y)
    if (
      wallOrientation(wall.box) === "horizontal" &&
      center.x >= wall.box.x1 - threshold &&
      center.x <= wall.box.x2 + threshold
    ) {
      candidates.push(otherCenter.y)
    }
  })
  if (mode === "wall-start") {
    const y1 = Math.min(snapValue(box.y1, uniqueNumbers(candidates), threshold), box.y2 - MIN_WALL_LENGTH_PX)
    return clampBox(boxFromEdges(box.x1, y1, box.x2, box.y2), image)
  }
  const y2 = Math.max(snapValue(box.y2, uniqueNumbers(candidates), threshold), box.y1 + MIN_WALL_LENGTH_PX)
  return clampBox(boxFromEdges(box.x1, box.y1, box.x2, y2), image)
}

function snapCornerBox(
  box: Detection["box"],
  id: string,
  detections: Detection[],
  image: ImageSize,
  mode: CornerMode,
  threshold: number,
) {
  const xCandidates = [0, image.width]
  const yCandidates = [0, image.height]
  detections.forEach((detection) => {
    if (detection.id === id) return
    xCandidates.push(detection.box.x1, detection.box.x2)
    yCandidates.push(detection.box.y1, detection.box.y2)
  })

  let { x1, y1, x2, y2 } = box
  if (mode.includes("w")) x1 = snapValue(x1, uniqueNumbers(xCandidates), threshold)
  if (mode.includes("e")) x2 = snapValue(x2, uniqueNumbers(xCandidates), threshold)
  if (mode.includes("n")) y1 = snapValue(y1, uniqueNumbers(yCandidates), threshold)
  if (mode.includes("s")) y2 = snapValue(y2, uniqueNumbers(yCandidates), threshold)
  return clampBox(boxFromEdges(x1, y1, x2, y2), image)
}

export function FloorPlan2DEditor({
  focusMode = false,
  onExitFocus, onSwitchWorkspace,
  imageUrl,
  imageSize,
  metersPerPixel,
  detections,
  selectedId,
  onSelect,
  onLiveChange,
  onCommit,
  onAdd,
  onDeleteSelected,
  onUndo, onRedo, canUndo, canRedo, onOpenDetails, detailsOpen,
}: Props) {
  const imageRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const detectionsRef = useRef(detections)
  const [showLabels, setShowLabels] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [snapGuide, setSnapGuide] = useState<Detection["box"] | null>(null)
  const [editingDimensionId, setEditingDimensionId] = useState<string | null>(null)
  const [dimensionDraft, setDimensionDraft] = useState("")
  const additionsRef = useRef(0)
  const [isDragging, setIsDragging] = useState(false)
  const [focusMaterialOpen, setFocusMaterialOpen] = useState(false)
  const [focusMaterialTarget, setFocusMaterialTarget] = useState<MaterialTarget>("wall")
  const [focusMaterialSearch, setFocusMaterialSearch] = useState("")
  const [focusMaterialPreviewId, setFocusMaterialPreviewId] = useState<string | null>(null)

  useEffect(() => {
    if (focusMode) return
    setFocusMaterialOpen(false)
    setFocusMaterialPreviewId(null)
  }, [focusMode])

  useEffect(() => {
    detectionsRef.current = detections
  }, [detections])

  const selected = useMemo(
    () => detections.find((detection) => detection.id === selectedId) ?? null,
    [detections, selectedId],
  )
  const selectedTarget = selected && targetForDetection(selected)
  useEffect(() => {
    if (selectedTarget) setFocusMaterialTarget(selectedTarget)
    setFocusMaterialPreviewId(null)
  }, [selectedId, selectedTarget])

  function chooseFocusMaterial(materialId: string) {
    if (!selected || targetForDetection(selected) !== focusMaterialTarget) return
    onCommit(detections.map(detection => detection.id === selected.id ? { ...detection, materialId } : detection))
    setFocusMaterialPreviewId(null)
  }
  const visibleDimensionIds = useMemo(() => {
    if (!metersPerPixel) return new Set<string>()
    const candidates = detections.filter(detection => labelKind(detection.label) === "wall")
      .sort((a, b) => Math.max(b.box.width, b.box.height) - Math.max(a.box.width, a.box.height))
    const chosen: Detection[] = []
    for (const wall of candidates) {
      if (chosen.length >= 6) break
      const center = wallCenter(wall.box)
      if (chosen.some(previous => {
        const other = wallCenter(previous.box)
        return Math.hypot(center.x - other.x, center.y - other.y) < 55
      })) continue
      chosen.push(wall)
    }
    return new Set(chosen.map(wall => wall.id))
  }, [detections, metersPerPixel])

  function commitDimension(detection: Detection) {
    if (!metersPerPixel) return
    const meters = Number(dimensionDraft)
    setEditingDimensionId(null)
    if (!Number.isFinite(meters) || meters <= 0) return
    const lengthPx = meters / metersPerPixel
    const horizontal = wallOrientation(detection.box) === "horizontal"
    const box = horizontal
      ? boxFromEdges(detection.box.x1, detection.box.y1, detection.box.x1 + lengthPx, detection.box.y2)
      : boxFromEdges(detection.box.x1, detection.box.y1, detection.box.x2, detection.box.y1 + lengthPx)
    const nextBox = clampBox(box, imageSize)
    onCommit(detections.map(item => item.id === detection.id ? { ...item, box: nextBox } : item))
  }

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (!drag.moved && Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) < 3) return
      drag.moved = true

      const scaleX = imageSize.width / Math.max(drag.imageRect.width, 1)
      const scaleY = imageSize.height / Math.max(drag.imageRect.height, 1)
      const dx = (event.clientX - drag.startClientX) * scaleX
      const dy = (event.clientY - drag.startClientY) * scaleY
      let nextBox = { ...drag.startBox }

      if (drag.mode === "move") {
        nextBox = clampBox(
          boxFromEdges(
            drag.startBox.x1 + dx,
            drag.startBox.y1 + dy,
            drag.startBox.x2 + dx,
            drag.startBox.y2 + dy,
          ),
          imageSize,
        )
      } else if (drag.mode === "wall-start" || drag.mode === "wall-end") {
        const orientation = wallOrientation(drag.startBox)
        if (orientation === "horizontal") {
          nextBox = drag.mode === "wall-start"
            ? boxFromEdges(
                Math.min(drag.startBox.x1 + dx, drag.startBox.x2 - MIN_WALL_LENGTH_PX),
                drag.startBox.y1,
                drag.startBox.x2,
                drag.startBox.y2,
              )
            : boxFromEdges(
                drag.startBox.x1,
                drag.startBox.y1,
                Math.max(drag.startBox.x2 + dx, drag.startBox.x1 + MIN_WALL_LENGTH_PX),
                drag.startBox.y2,
              )
        } else {
          nextBox = drag.mode === "wall-start"
            ? boxFromEdges(
                drag.startBox.x1,
                Math.min(drag.startBox.y1 + dy, drag.startBox.y2 - MIN_WALL_LENGTH_PX),
                drag.startBox.x2,
                drag.startBox.y2,
              )
            : boxFromEdges(
                drag.startBox.x1,
                drag.startBox.y1,
                drag.startBox.x2,
                Math.max(drag.startBox.y2 + dy, drag.startBox.y1 + MIN_WALL_LENGTH_PX),
              )
        }
        nextBox = clampBox(nextBox, imageSize)
      } else if (drag.mode === "wall-thickness-start" || drag.mode === "wall-thickness-end") {
        const horizontal = wallOrientation(drag.startBox) === "horizontal"
        const crossDelta = horizontal ? dy : dx
        const direction = drag.mode === "wall-thickness-start" ? -1 : 1
        nextBox = resizeWallThicknessAroundCenter(
          drag.startBox,
          wallThicknessPx(drag.startBox) + 2 * direction * crossDelta,
          imageSize,
        )
      } else {
        let { x1, y1, x2, y2 } = drag.startBox
        if (drag.mode.includes("w")) x1 += dx
        if (drag.mode.includes("e")) x2 += dx
        if (drag.mode.includes("n")) y1 += dy
        if (drag.mode.includes("s")) y2 += dy
        nextBox = clampBox(boxFromEdges(x1, y1, x2, y2), imageSize)
      }

      const nextDetections = drag.startDetections.map((detection) =>
        detection.id === drag.id ? { ...detection, box: nextBox } : detection,
      )
      if (snapEnabled && !event.shiftKey && drag.mode !== "wall-thickness-start" && drag.mode !== "wall-thickness-end") {
        const threshold = Math.max(SNAP_SCREEN_PX * scaleX, SNAP_SCREEN_PX * scaleY)
        const snapped = drag.mode === "move"
          ? snapMovedBox(nextBox, drag.id, drag.startDetections, imageSize, threshold)
          : drag.mode === "wall-start" || drag.mode === "wall-end"
            ? snapWallEndpoint(nextBox, drag.id, drag.startDetections, imageSize, drag.mode, threshold)
            : snapCornerBox(nextBox, drag.id, drag.startDetections, imageSize, drag.mode, threshold)
        setSnapGuide(
          Math.abs(snapped.x1 - nextBox.x1) > 0.25 || Math.abs(snapped.y1 - nextBox.y1) > 0.25 ||
          Math.abs(snapped.x2 - nextBox.x2) > 0.25 || Math.abs(snapped.y2 - nextBox.y2) > 0.25
            ? snapped : null,
        )
      } else setSnapGuide(null)
      detectionsRef.current = nextDetections
      onLiveChange(nextDetections)
    }

    function onPointerUp(event: PointerEvent) {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (!drag.moved) { dragRef.current = null; setIsDragging(false); return }

      const scaleX = imageSize.width / Math.max(drag.imageRect.width, 1)
      const scaleY = imageSize.height / Math.max(drag.imageRect.height, 1)
      const threshold = Math.max(SNAP_SCREEN_PX * scaleX, SNAP_SCREEN_PX * scaleY)
      const current = detectionsRef.current.find((item) => item.id === drag.id)
      let committed = detectionsRef.current

      if (current && snapEnabled && !event.shiftKey && drag.mode !== "wall-thickness-start" && drag.mode !== "wall-thickness-end") {
        let finalBox = current.box
        if (drag.mode === "move") {
          finalBox = snapMovedBox(current.box, drag.id, drag.startDetections, imageSize, threshold)
        } else if (drag.mode === "wall-start" || drag.mode === "wall-end") {
          finalBox = snapWallEndpoint(
            current.box,
            drag.id,
            drag.startDetections,
            imageSize,
            drag.mode,
            threshold,
          )
        } else {
          finalBox = snapCornerBox(
            current.box,
            drag.id,
            drag.startDetections,
            imageSize,
            drag.mode,
            threshold,
          )
        }
        committed = detectionsRef.current.map((item) =>
          item.id === drag.id ? { ...item, box: finalBox } : item,
        )
      }

      dragRef.current = null
      setSnapGuide(null)
      detectionsRef.current = committed
      setIsDragging(false)
      onLiveChange(committed)
      onCommit(committed)
    }

    function cancelDrag() {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null
      setSnapGuide(null)
      detectionsRef.current = drag.startDetections
      setIsDragging(false)
      onLiveChange(drag.startDetections)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && dragRef.current) {
        event.preventDefault()
        cancelDrag()
      } else if (event.key === "Escape" && focusMode && focusMaterialOpen) {
        const target = event.target as HTMLElement | null
        if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return
        event.preventDefault()
        setFocusMaterialOpen(false)
        setFocusMaterialPreviewId(null)
      }
    }
    window.addEventListener("blur", cancelDrag)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", cancelDrag)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", cancelDrag)
      window.removeEventListener("blur", cancelDrag)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [focusMaterialOpen, focusMode, imageSize, onCommit, onLiveChange, snapEnabled])

  function beginDrag(event: React.PointerEvent, detection: Detection, mode: DragMode) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const imageRect = imageRef.current?.getBoundingClientRect()
    if (!imageRect) return

    onSelect(detection.id)
    dragRef.current = {
      id: detection.id,
      pointerId: event.pointerId,
      moved: false,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox: { ...detection.box },
      imageRect,
      startDetections: detections.map((item) => ({ ...item, box: { ...item.box } })),
    }
    setIsDragging(true)
  }

  function addObject(kind: "wall" | "door" | "window") {
    const detection = createDetection(kind, imageSize)
    const offset = (additionsRef.current++ % 6) * Math.max(12, imageSize.height * 0.035)
    detection.box = clampBox(boxFromEdges(detection.box.x1, detection.box.y1 + offset, detection.box.x2, detection.box.y2 + offset), imageSize)
    onAdd(detection)
  }

  const nameFor = (label: string) => ({ wall: "ผนัง", door: "ประตู", window: "หน้าต่าง", floor: "พื้น", ceiling: "ฝ้า", furniture: "เฟอร์นิเจอร์", object: "วัตถุ" }[labelKind(label)] ?? label)

  return (
    <div className={focusMode ? "flex h-full min-h-0 flex-col" : "space-y-3"} aria-label="เครื่องมือแก้ไขแปลน">
      {focusMode && onExitFocus && onSwitchWorkspace && <FocusToolbar view="2d" onExit={onExitFocus} onView={onSwitchWorkspace} onUndo={onUndo} onRedo={onRedo} canUndo={canUndo} canRedo={canRedo} onAdd={addObject} toolLabel="Drag a wall to move; drag its handles to resize" />}
      {focusMode && <EditorToolRail mode="2d" focusMode activeTool="select" materialsOpen={focusMaterialOpen} advancedOpen={detailsOpen} onTool={tool => {
        if (tool === "select") setFocusMaterialOpen(false)
        if (tool === "wall" || tool === "door" || tool === "window") addObject(tool)
      }} onMaterials={() => setFocusMaterialOpen(open => !open)} onAdvanced={onOpenDetails} />}
      {focusMode && focusMaterialOpen && <FocusMaterialPanel target={focusMaterialTarget} selectedTarget={selectedTarget} currentMaterialId={selected?.materialId} search={focusMaterialSearch} onTarget={target => { setFocusMaterialTarget(target); setFocusMaterialPreviewId(null) }} onSearch={setFocusMaterialSearch} onPreview={setFocusMaterialPreviewId} onApply={chooseFocusMaterial} onClose={() => { setFocusMaterialOpen(false); setFocusMaterialPreviewId(null) }} />}
      {!focusMode && <div className="sticky top-2 z-30 space-y-3 rounded-2xl border border-border bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="toolbar" aria-label="เพิ่มและแก้ไขวัตถุ">
            <Button type="button" className="rounded-xl" onClick={() => addObject("wall")}><Plus className="h-4 w-4" /><SquareDashed className="h-4 w-4" />เพิ่มผนัง</Button>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => addObject("door")}><Plus className="h-4 w-4" /><DoorOpen className="h-4 w-4" />เพิ่มประตู</Button>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => addObject("window")}><Plus className="h-4 w-4" /><PanelTop className="h-4 w-4" />เพิ่มหน้าต่าง</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onUndo} disabled={!canUndo} aria-label="ย้อนกลับการแก้ไขแปลน"><Undo2 className="h-4 w-4" />ย้อนกลับ</Button>
            <Button type="button" variant="outline" size="sm" onClick={onRedo} disabled={!canRedo} aria-label="ทำซ้ำการแก้ไขแปลน"><Redo2 className="h-4 w-4" />ทำซ้ำ</Button>
            <Button type="button" variant="outline" size="sm" onClick={onOpenDetails} aria-expanded={detailsOpen}><SlidersHorizontal className="h-4 w-4" />รายละเอียด / ขนาดจริง</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="flex items-center gap-2 text-sm" role="status"><MousePointer2 className="h-4 w-4 shrink-0 text-primary" />{selected ? `เลือก${nameFor(selected.label)}แล้ว · ลากเพื่อย้าย หรือจับจุดเพื่อปรับขนาด` : `มี ${detections.length} วัตถุ · คลิกกรอบบนแปลนเพื่อเลือกและแก้ไข`}</p>
          <Button type="button" variant={selected ? "destructive" : "outline"} size="sm" onClick={onDeleteSelected} disabled={!selected}><Trash2 className="h-4 w-4" />ลบวัตถุที่เลือก</Button>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <label className="flex items-center gap-2"><input type="checkbox" checked={snapEnabled} onChange={e => setSnapEnabled(e.target.checked)} />ดูดตำแหน่งอัตโนมัติ</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />แสดงชื่อทั้งหมด</label>
          <span>Delete / Backspace = ลบ · Esc = ยกเลิกการลาก</span>
        </div>
      </div>}

      <div
        className={`relative flex items-center justify-center overflow-auto rounded-2xl bg-[#EDEFF2] ${focusMode ? "min-h-0 flex-1 p-2" : "min-h-[560px] p-4"} ${isDragging ? "cursor-grabbing select-none" : ""}`}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onSelect(null)
        }}
      >
        <div className="relative w-fit max-w-full" data-testid="plan-edit-surface">
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Floor plan editor"
            draggable={false}
            className={`block max-w-full rounded-xl object-contain shadow-lg ${focusMode ? "max-h-[calc(100dvh-28px)]" : "max-h-[720px]"}`}
            onPointerDown={() => onSelect(null)}
          />

          {detections.map((detection) => {
            const left = (detection.box.x1 / imageSize.width) * 100
            const top = (detection.box.y1 / imageSize.height) * 100
            const width = (detection.box.width / imageSize.width) * 100
            const height = (detection.box.height / imageSize.height) * 100
            const color = detection.id === selectedId && focusMaterialPreviewId && targetForDetection(detection) === focusMaterialTarget ? materialById(focusMaterialPreviewId, focusMaterialTarget).color : colorByLabel(detection.label)
            const isSelected = detection.id === selectedId
            const isWall = labelKind(detection.label) === "wall"
            const furnitureItem = labelKind(detection.label) === "furniture" ? furnitureCatalogItem(detection.furnitureCatalogId) : null
            const orientation = wallOrientation(detection.box)

            return (
              <div
                key={detection.id}
                role="button"
                tabIndex={0}
                aria-label={`เลือก${furnitureItem?.name ?? nameFor(detection.label)}`}
                aria-pressed={isSelected}
                data-object-id={detection.id}
                onPointerDown={(event) => beginDrag(event, detection, "move")}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(detection.id) }
                }}
                className={`absolute touch-none rounded-none border-2 transition-shadow ${isSelected ? "z-20 cursor-move ring-4 ring-white/80 shadow-xl" : "z-10 cursor-pointer"}`}
                style={{
                  left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`,
                  minWidth: 8, minHeight: 8, borderColor: detection.floorTiles ? "transparent" : color, backgroundColor: detection.floorTiles ? "transparent" : `${color}20`,
                  ...(detection.floorTiles ? { pointerEvents: "none" as const, borderWidth: 0, boxShadow: "none" } : {}),
                }}
              >
                {detection.floorTiles && <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {detection.floorTiles.map((tile, index) => <rect key={index} x={tile.x1*100} y={tile.y1*100} width={(tile.x2-tile.x1)*100} height={(tile.y2-tile.y1)*100} fill={`${color}30`} stroke={isSelected ? color : "none"} strokeWidth="1" vectorEffect="non-scaling-stroke" style={{pointerEvents:"auto"}} />)}
                </svg>}
                {furnitureItem && <div aria-hidden="true" className="pointer-events-none absolute inset-[3px] flex items-center justify-center overflow-hidden rounded-md border border-orange-500/70 bg-amber-50/80" style={{ transform: `rotate(${-(detection.furnitureRotationY ?? 0)}rad)` }}>
                  <span className="absolute left-0 right-0 top-0 h-1 bg-orange-600/65" />
                  <span className="max-w-full truncate px-1 text-[9px] font-semibold text-orange-950">{furnitureItem.name}</span>
                </div>}
                {(isSelected || showLabels) && <span className="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded-full px-2 py-[2px] text-[10px] font-medium text-white shadow-sm" style={{ backgroundColor: color }}>
                  {detection.roomName ?? (furnitureItem ? furnitureItem.name : `${nameFor(detection.label)} ${Math.round(detection.confidence * 100)}%`)}
                </span>}

                {isWall && metersPerPixel && (isSelected || visibleDimensionIds.has(detection.id)) && (
                  <div className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
                    {editingDimensionId === detection.id ? (
                      <input
                        autoFocus
                        aria-label="Wall length in meters"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={dimensionDraft}
                        onChange={event => setDimensionDraft(event.target.value)}
                        onPointerDown={event => event.stopPropagation()}
                        onBlur={() => setEditingDimensionId(null)}
                        onKeyDown={event => {
                          event.stopPropagation()
                          if (event.key === "Enter") commitDimension(detection)
                          if (event.key === "Escape") setEditingDimensionId(null)
                        }}
                        className="w-20 rounded-md border-2 border-sky-500 bg-white px-1.5 py-1 text-center text-xs font-semibold text-slate-900 shadow focus:outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        aria-label={`Edit wall length, ${(Math.max(detection.box.width, detection.box.height) * metersPerPixel).toFixed(2)} meters`}
                        title="Click to edit wall length"
                        onPointerDown={event => event.stopPropagation()}
                        onClick={event => {
                          event.stopPropagation()
                          onSelect(detection.id)
                          setDimensionDraft((Math.max(detection.box.width, detection.box.height) * metersPerPixel).toFixed(2))
                          setEditingDimensionId(detection.id)
                        }}
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${isSelected ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 bg-white/95 text-slate-800 hover:border-sky-400"}`}
                      >
                        {(Math.max(detection.box.width, detection.box.height) * metersPerPixel).toFixed(2)} m
                      </button>
                    )}
                  </div>
                )}

                {isSelected && isWall && (
                  <>
                    <button
                      type="button"
                      aria-label="ปรับปลายกำแพงด้านเริ่มต้น"
                      className={`absolute h-5 w-5 rounded-full border-2 border-white shadow ${orientation === "horizontal" ? "-left-2.5 top-1/2 -translate-y-1/2 cursor-ew-resize" : "left-1/2 -top-2.5 -translate-x-1/2 cursor-ns-resize"}`}
                      style={{ backgroundColor: color }}
                      onPointerDown={(event) => beginDrag(event, detection, "wall-start")}
                    />
                    <button
                      type="button"
                      aria-label="ปรับปลายกำแพงด้านสิ้นสุด"
                      className={`absolute h-5 w-5 rounded-full border-2 border-white shadow ${orientation === "horizontal" ? "-right-2.5 top-1/2 -translate-y-1/2 cursor-ew-resize" : "bottom-[-10px] left-1/2 -translate-x-1/2 cursor-ns-resize"}`}
                      style={{ backgroundColor: color }}
                      onPointerDown={(event) => beginDrag(event, detection, "wall-end")}
                    />
                    <button
                      type="button"
                      aria-label="Resize wall thickness, first side"
                      title="Drag to change wall thickness"
                      className={`absolute z-30 rounded-full border-2 border-white bg-sky-700 shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${orientation === "horizontal" ? "-top-1.5 left-1/2 h-3 w-8 -translate-x-1/2 cursor-ns-resize" : "-left-1.5 top-1/2 h-8 w-3 -translate-y-1/2 cursor-ew-resize"}`}
                      onPointerDown={(event) => beginDrag(event, detection, "wall-thickness-start")}
                    />
                    <button
                      type="button"
                      aria-label="Resize wall thickness, second side"
                      title="Drag to change wall thickness"
                      className={`absolute z-30 rounded-full border-2 border-white bg-sky-700 shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${orientation === "horizontal" ? "-bottom-1.5 left-1/2 h-3 w-8 -translate-x-1/2 cursor-ns-resize" : "-right-1.5 top-1/2 h-8 w-3 -translate-y-1/2 cursor-ew-resize"}`}
                      onPointerDown={(event) => beginDrag(event, detection, "wall-thickness-end")}
                    />
                  </>
                )}

                {isSelected && !isWall && (["nw", "ne", "sw", "se"] as const).map((mode) => {
                  const classes = {
                    nw: "-left-2 -top-2 cursor-nwse-resize",
                    ne: "-right-2 -top-2 cursor-nesw-resize",
                    sw: "-bottom-2 -left-2 cursor-nesw-resize",
                    se: "-bottom-2 -right-2 cursor-nwse-resize",
                  }
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-label={`Resize ${mode}`}
                      className={`pointer-events-auto absolute h-4 w-4 rounded-full border-2 border-white shadow ${classes[mode]}`}
                      style={{ backgroundColor: color }}
                      onPointerDown={(event) => beginDrag(event, detection, mode)}
                    />
                  )
                })}
              </div>
            )
          })}
          {snapGuide && (
            <div aria-hidden="true" className="pointer-events-none absolute z-40 border-2 border-dashed border-sky-500 bg-sky-400/10"
              style={{
                left: `${snapGuide.x1 / imageSize.width * 100}%`,
                top: `${snapGuide.y1 / imageSize.height * 100}%`,
                width: `${snapGuide.width / imageSize.width * 100}%`,
                height: `${snapGuide.height / imageSize.height * 100}%`,
              }}>
              <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-600" />
            </div>
          )}
        </div>
      </div>

      {!focusMode && <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        กดเพิ่มวัตถุแล้วลากไปยังตำแหน่งที่ต้องการ • คลิกระยะบนผนังเพื่อแก้ความยาว • กรอบสีน้ำเงินแสดงตำแหน่งที่จะดูด และกด Shift เพื่อข้ามชั่วคราว
      </p>}
    </div>
  )
}
