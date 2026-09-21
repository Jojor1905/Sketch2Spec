"use client"

import { introducesFloorOverlap } from "@/lib/rooms"
import { rebuildRoomFloors, removeDuplicateWalls } from "@/lib/floor-plan-repair"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  CheckCircle2,
  Crop,
  Download,
  FolderOpen,
  FileImage,
  FileText,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  RefreshCcw,
  RotateCw,
  ScanSearch,
  Trash2,
  Undo2,
  Upload,
  Wand2,
} from "lucide-react"

import { FloorPlan2DEditor } from "@/components/floor-plan-2d-editor"
import { BackendStatus } from "@/components/backend-status"
import { downloadProject, parseProjectFile } from "@/lib/project-file"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import { ImageEditor } from "@/components/upload-image-editor"
import { Button } from "@/components/ui/button"
import { clearActiveProject, loadActiveProject, saveActiveProject } from "@/lib/project-storage"
import { analyzeFloorPlan } from "@/lib/floor-plan-quality"
import { getPdfPageCountInBrowser, renderPdfPageInBrowser } from "@/lib/pdf-client"
import { DEFAULT_MATERIAL } from "@/lib/materials"
import {
  boxFromEdges,
  clampBox,
  cloneDetections,
  colorByLabel,
  detectionsEqual,
  labelKind,
  normalizeDetection,
  type Detection,
  type ImageSize,
} from "@/lib/floor-plan"

const EditableFloorPlan3D = dynamic(
  () =>
    import("@/components/editable-floor-plan-3d").then(
      (module) => module.EditableFloorPlan3D,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[620px] items-center justify-center rounded-2xl bg-secondary/40 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        กำลังเปิดพื้นที่แก้ไข 3 มิติ...
      </div>
    ),
  },
)

type DetectionResponse = {
  image: ImageSize
  count: number
  detections: Array<Omit<Detection, "id"> & { id?: string }>
}

type DetectionJobResponse = {
  id: string
  status: "queued" | "running" | "complete" | "failed"
  phase: ProcessingPhase
  progress: number
  message: string
  result: DetectionResponse | null
  error: string | null
}

type PdfInfoResponse = {
  page_count: number
}

type ProcessingPhase =
  | "idle"
  | "preparing"
  | "walls"
  | "openings"
  | "generating"
  | "complete"
  | "error"

type SavedSession = {
  fileName: string
  fileType: string
  previewDataUrl: string
  imageSize: ImageSize | null
  detections: Detection[]
  metersPerPixel: number | null
  floorMaterialId?: string
}

type WorkspaceView = "2d" | "3d"

const API_URL =
  process.env.NEXT_PUBLIC_DETECTION_API_URL ?? "http://localhost:8000"

const MAX_FILE_SIZE = 25 * 1024 * 1024
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const MAX_HISTORY = 80

const phaseDetails: Record<
  ProcessingPhase,
  { title: string; description: string; progress: number }
> = {
  idle: {
    title: "พร้อมเริ่มวิเคราะห์",
    description: "ตรวจสอบภาพแล้วกด Run AI Detection",
    progress: 0,
  },
  preparing: {
    title: "กำลังเตรียมภาพ",
    description: "ปรับรูปแบบและขนาดไฟล์ให้เหมาะกับโมเดล",
    progress: 20,
  },
  walls: {
    title: "กำลังค้นหาผนัง",
    description: "AI กำลังตรวจหาแนวผนังจากภาพแปลน",
    progress: 48,
  },
  openings: {
    title: "กำลังวิเคราะห์ช่องเปิด",
    description: "AI กำลังตรวจหาประตูและหน้าต่าง",
    progress: 72,
  },
  generating: {
    title: "กำลังสร้าง Workspace",
    description: "กำลังจัดผลตรวจจับให้แก้ไขได้ทั้งแบบ 2D และ 3D",
    progress: 92,
  },
  complete: {
    title: "พร้อมตรวจสอบและแก้ไข",
    description: "เพิ่ม ลบ ลาก และปรับขนาดวัตถุได้แล้ว",
    progress: 100,
  },
  error: {
    title: "ประมวลผลไม่สำเร็จ",
    description: "ตรวจสอบว่า Backend เปิดอยู่ แล้วลองใหม่อีกครั้ง",
    progress: 0,
  },
}

function readFileAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("ไม่สามารถอ่านไฟล์ภาพได้"))
    reader.readAsDataURL(file)
  })
}

function sleep(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }
    const abort = () => {
      window.clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", abort)
      resolve()
    }, milliseconds)
    signal?.addEventListener("abort", abort, { once: true })
  })
}

async function dataUrlToFile(dataUrl: string, name: string, type: string) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], name, {
    type: type || blob.type || "image/jpeg",
    lastModified: Date.now(),
  })
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}

function formatLength(valuePx: number, metersPerPixel: number | null) {
  if (!metersPerPixel) return `${Math.round(valuePx)} px`
  return `${(valuePx * metersPerPixel).toFixed(2)} m`
}

function wallOrientation(box: Detection["box"]) {
  return box.width >= box.height ? "horizontal" : "vertical"
}

function boxCenter(box: Detection["box"]) {
  return {
    x: (box.x1 + box.x2) / 2,
    y: (box.y1 + box.y2) / 2,
  }
}

function wallThickness(box: Detection["box"]) {
  return wallOrientation(box) === "horizontal" ? box.height : box.width
}

function resizeWallThickness(
  box: Detection["box"],
  targetThicknessPx: number,
  imageSize: ImageSize,
) {
  const safeThickness = Math.max(4, Math.min(targetThicknessPx, Math.max(imageSize.width, imageSize.height)))
  const center = boxCenter(box)
  if (wallOrientation(box) === "horizontal") {
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

function formatThickness(valuePx: number, metersPerPixel: number | null) {
  if (!metersPerPixel) return `${Math.round(valuePx)} px`
  return `${Math.round(valuePx * metersPerPixel * 100)} cm`
}

function summarizeCounts(detections: Detection[]) {
  const counts = { wall: 0, door: 0, window: 0, other: 0 }
  detections.forEach((detection) => {
    const label = detection.label.toLowerCase()
    if (label.includes("wall")) counts.wall += 1
    else if (label.includes("door")) counts.door += 1
    else if (label.includes("window")) counts.window += 1
    else counts.other += 1
  })
  return counts
}

function findAutomaticScaleReference(detections: Detection[]) {
  const walls = detections.filter((detection) => labelKind(detection.label) === "wall")
  const candidates = walls.length > 0 ? walls : detections
  return candidates.reduce<Detection | null>((longest, current) => {
    if (!longest) return current
    const longestLength = Math.max(longest.box.width, longest.box.height)
    const currentLength = Math.max(current.box.width, current.box.height)
    return currentLength > longestLength ? current : longest
  }, null)
}

export default function UploadPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const projectInputRef = useRef<HTMLInputElement | null>(null)
  const flushSaveRef = useRef<(() => void) | null>(null)
  const pendingSaveRef = useRef<number | null>(null)
  const detectionAbortRef = useRef<AbortController | null>(null)
  const historyRef = useRef<Detection[][]>([])
  const historyIndexRef = useRef(-1)

  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [storageMessage, setStorageMessage] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const [file, setFile] = useState<File | null>(null)
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState<ImageSize | null>(null)
  const [editableDetections, setEditableDetections] = useState<Detection[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("2d")
  const [metersPerPixel, setMetersPerPixel] = useState<number | null>(null)
  const [floorMaterialId, setFloorMaterialId] = useState(DEFAULT_MATERIAL.floor)
  const [knownLength, setKnownLength] = useState("")
  const [wallThicknessDraft, setWallThicknessDraft] = useState("")
  const [historyVersion, setHistoryVersion] = useState(0)
  const [isDropActive, setIsDropActive] = useState(false)
  const [phase, setPhase] = useState<ProcessingPhase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [editorFile, setEditorFile] = useState<File | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isRestoring, setIsRestoring] = useState(true)
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [backendProgress, setBackendProgress] = useState(0)
  const [pdfSource, setPdfSource] = useState<File | null>(null)
  const [pdfPageCount, setPdfPageCount] = useState(0)
  const [pdfPage, setPdfPage] = useState(1)
  const [isPdfChooserOpen, setIsPdfChooserOpen] = useState(false)

  const isProcessing = ["preparing", "walls", "openings", "generating"].includes(phase)
  const currentPhase = phaseDetails[phase]
  const hasWorkspace = Boolean(imageSize)
  const canUndo = historyIndexRef.current > 0
  const canRedo = historyIndexRef.current >= 0 && historyIndexRef.current < historyRef.current.length - 1

  const selectedDetection = useMemo(
    () => editableDetections.find((detection) => detection.id === selectedId) ?? null,
    [editableDetections, selectedId],
  )
  const automaticScaleReference = findAutomaticScaleReference(editableDetections)
  const scaleReferenceDetection =
    selectedDetection && labelKind(selectedDetection.label) === "wall"
      ? selectedDetection
      : automaticScaleReference
  const countSummary = useMemo(() => summarizeCounts(editableDetections), [editableDetections])
  const qualityIssues = useMemo(() => imageSize ? analyzeFloorPlan(editableDetections, imageSize) : [], [editableDetections, imageSize])
  const selectedIsWall = selectedDetection ? labelKind(selectedDetection.label) === "wall" : false
  const fileSummary = useMemo(() => {
    if (!file) return null
    return `${file.name} • ${(file.size / 1024 / 1024).toFixed(2)} MB`
  }, [file])

  useEffect(() => {
    if (!selectedDetection || labelKind(selectedDetection.label) !== "wall") {
      setWallThicknessDraft("")
      return
    }

    const thicknessPx = wallThickness(selectedDetection.box)
    setWallThicknessDraft(
      metersPerPixel
        ? Math.round(thicknessPx * metersPerPixel * 100).toString()
        : Math.round(thicknessPx).toString(),
    )
  }, [metersPerPixel, selectedDetection])

  useEffect(() => {
    if (phase === "complete") {
      setLeftPanelOpen(false)
    }
  }, [phase])

  const showLeftPanel = !hasWorkspace || leftPanelOpen
  const showRightPanel = hasWorkspace && workspaceView === "2d" && rightPanelOpen
  const workspaceLayoutClass = !hasWorkspace
    ? "xl:grid-cols-[300px_minmax(0,1fr)]"
    : workspaceView === "3d"
      ? showLeftPanel
        ? "xl:grid-cols-[230px_minmax(0,1fr)]"
        : "xl:grid-cols-[minmax(0,1fr)]"
      : showLeftPanel && showRightPanel
        ? "xl:grid-cols-[250px_minmax(0,1fr)_330px]"
        : showLeftPanel
          ? "xl:grid-cols-[250px_minmax(0,1fr)]"
          : showRightPanel
            ? "xl:grid-cols-[minmax(0,1fr)_330px]"
            : "xl:grid-cols-[minmax(0,1fr)]"

  const resetHistory = useCallback((detections: Detection[]) => {
    const snapshot = cloneDetections(detections)
    historyRef.current = [snapshot]
    historyIndexRef.current = 0
    setEditableDetections(snapshot)
    setHistoryVersion((value) => value + 1)
  }, [])

  const commitDetections = useCallback((detections: Detection[]) => {
    const next = cloneDetections(detections)
    const current = historyRef.current[historyIndexRef.current]
    if (current && introducesFloorOverlap(current, next)) {
      setEditableDetections(cloneDetections(current))
      setError("พื้นทับห้องอื่น จึงคืนตำแหน่งเดิมให้แล้ว เลือกพื้นห้องเดิมเพื่อเปลี่ยนวัสดุ หรือกดแบ่งพื้นตามห้อง")
      return
    }

    if (current && detectionsEqual(current, next)) {
      setEditableDetections(next)
      return
    }

    const truncated = historyRef.current.slice(0, historyIndexRef.current + 1)
    truncated.push(next)
    const limited = truncated.slice(-MAX_HISTORY)
    historyRef.current = limited
    historyIndexRef.current = limited.length - 1
    setEditableDetections(next)
    setHistoryVersion((value) => value + 1)
  }, [])

  const setLiveDetections = useCallback((detections: Detection[]) => {
    setEditableDetections(cloneDetections(detections))
  }, [])

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current -= 1
    const snapshot = cloneDetections(historyRef.current[historyIndexRef.current])
    setEditableDetections(snapshot)
    if (selectedId && !snapshot.some((detection) => detection.id === selectedId)) {
      setSelectedId(null)
    }
    setHistoryVersion((value) => value + 1)
  }, [selectedId])

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current += 1
    const snapshot = cloneDetections(historyRef.current[historyIndexRef.current])
    setEditableDetections(snapshot)
    setHistoryVersion((value) => value + 1)
  }, [])

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    const next = editableDetections.filter((detection) => detection.id !== selectedId)
    commitDetections(next)
    setSelectedId(null)
  }, [commitDetections, editableDetections, selectedId])

  useEffect(() => {
    void historyVersion
  }, [historyVersion])

  useEffect(() => {
    let isMounted = true

    async function restoreSession() {
      try {
        const saved = await loadActiveProject()
        if (!saved || !isMounted) return

        const restoredFile = await dataUrlToFile(
          saved.previewDataUrl,
          saved.fileName,
          saved.fileType,
        )
        if (!isMounted) return

        const restoredDetections = (saved.detections ?? []).map((detection, index) =>
          normalizeDetection(detection as Detection, index),
        )
        setFile(restoredFile)
        setPreviewDataUrl(saved.previewDataUrl)
        setImageSize(saved.imageSize)
        setMetersPerPixel(saved.metersPerPixel ?? null)
        setFloorMaterialId(saved.floorMaterialId ?? DEFAULT_MATERIAL.floor)
        resetHistory(restoredDetections)
        setPhase(saved.imageSize ? "complete" : "idle")
        setBackendProgress(saved.imageSize ? 100 : 0)
      } catch {
        if (isMounted) setStorageMessage("กู้คืนงานล่าสุดไม่สำเร็จ ข้อมูลเดิมยังถูกเก็บไว้ ลองโหลดหน้าใหม่หรือเปิดไฟล์สำรอง")
      } finally {
        if (isMounted) setIsRestoring(false)
      }
    }

    void restoreSession()

    return () => {
      isMounted = false
      detectionAbortRef.current?.abort()
    }
  }, [resetHistory])

  useEffect(() => {
    if (isRestoring || isProcessing || !file || !previewDataUrl) return

    const save = () => {
      pendingSaveRef.current = null
      setSaveStatus("saving")
      void saveActiveProject({
        fileName: file.name,
        fileType: file.type,
        previewDataUrl,
        imageSize,
        detections: editableDetections,
        metersPerPixel,
        floorMaterialId,
        updatedAt: Date.now(),
      }).then(() => setSaveStatus("saved")).catch(() => setSaveStatus("error"))
    }
    flushSaveRef.current = save
    const saveTimer = window.setTimeout(save, 250)
    pendingSaveRef.current = saveTimer

    return () => { window.clearTimeout(saveTimer); pendingSaveRef.current = null }
  }, [editableDetections, file, floorMaterialId, imageSize, isRestoring, isProcessing, metersPerPixel, previewDataUrl])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable
      if (isTyping || pendingAction || isEditorOpen || isPdfChooserOpen || isProcessing) return

      const commandPressed = event.ctrlKey || event.metaKey
      const isKeyZ = event.code === "KeyZ" || event.key.toLowerCase() === "z"
      const isKeyY = event.code === "KeyY" || event.key.toLowerCase() === "y"

      // KeyboardEvent.code identifies the physical key, so Undo/Redo work
      // with both Thai and English keyboard layouts.
      if (commandPressed && isKeyZ) {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }

      if (commandPressed && isKeyY) {
        event.preventDefault()
        redo()
        return
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault()
        deleteSelected()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [deleteSelected, redo, selectedId, undo, pendingAction, isEditorOpen, isPdfChooserOpen, isProcessing])

  useEffect(() => {
    function flush() {
      if (pendingSaveRef.current !== null) {
        window.clearTimeout(pendingSaveRef.current)
        flushSaveRef.current?.()
      }
    }
    function onVisibility() { if (document.visibilityState === "hidden") flush() }
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      flush()
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  function cancelActiveDetection() {
    detectionAbortRef.current?.abort()
    detectionAbortRef.current = null
  }

  function validateFile(nextFile: File) {
    const supported = ACCEPTED_TYPES.includes(nextFile.type) || isPdf(nextFile)
    if (!supported) throw new Error("รองรับไฟล์ JPG, PNG, WebP และ PDF เท่านั้น")
    if (nextFile.size === 0) throw new Error("ไฟล์ว่าง กรุณาเลือกไฟล์แปลนที่มีข้อมูล")
    if (nextFile.size > MAX_FILE_SIZE) {
      throw new Error("ไฟล์มีขนาดเกิน 25 MB กรุณาลดขนาดไฟล์ก่อนอัปโหลด")
    }
  }

  async function preparePdf(pdfFile: File, selectedPage = 1) {
    setPhase("preparing")

    // Convert in the browser first. This keeps PDF upload working even when
    // an older backend is still running and does not expose /prepare.
    try {
      return await renderPdfPageInBrowser(pdfFile, selectedPage, 2000)
    } catch (browserError) {
      const formData = new FormData()
      formData.append("file", pdfFile)

      const response = await fetch(`${API_URL}/prepare?page=${selectedPage}`, {
        method: "POST",
        body: formData,
      })
      if (!response.ok) {
        const backendMessage = await extractError(response)
        const browserMessage = browserError instanceof Error ? browserError.message : ""
        throw new Error(
          backendMessage || browserMessage || "ไม่สามารถแปลง PDF เป็นรูปภาพได้",
        )
      }

      const blob = await response.blob()
      const stem = pdfFile.name.replace(/\.pdf$/i, "") || "floor-plan"
      return new File([blob], `${stem}-page-${selectedPage}.png`, {
        type: "image/png",
        lastModified: Date.now(),
      })
    }
  }

  async function inspectPdf(pdfFile: File) {
    // Read page count in the browser first so page selection does not depend on
    // the backend version. Fall back to the backend for unusual PDF files.
    try {
      return { page_count: await getPdfPageCountInBrowser(pdfFile) }
    } catch (browserError) {
      const formData = new FormData()
      formData.append("file", pdfFile)
      const response = await fetch(`${API_URL}/pdf/info`, {
        method: "POST",
        body: formData,
      })
      if (!response.ok) {
        const backendMessage = await extractError(response)
        const browserMessage = browserError instanceof Error ? browserError.message : ""
        throw new Error(
          backendMessage || browserMessage || "ไม่สามารถอ่านข้อมูลหน้า PDF ได้",
        )
      }
      return (await response.json()) as PdfInfoResponse
    }
  }

  async function openPdfPage(pageNumber: number) {
    if (!pdfSource) return
    try {
      setError(null)
      setPhase("preparing")
      const imageFile = await preparePdf(pdfSource, pageNumber)
      setPdfPage(pageNumber)
      setEditorFile(imageFile)
      setIsEditorOpen(true)
      setIsPdfChooserOpen(false)
      setPhase("idle")
    } catch (caught) {
      setPhase("error")
      setError(caught instanceof Error ? caught.message : "ไม่สามารถเปิดหน้า PDF ได้")
    }
  }

  function choosePlan(nextFile: File | undefined) {
    if (!nextFile || isProcessing || isRestoring || importing) return
    try {
      validateFile(nextFile)
      if (hasWorkspace) confirmReplace(() => void handleFile(nextFile))
      else void handleFile(nextFile)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ไฟล์ไม่ถูกต้อง")
    }
  }

  async function handleFile(nextFile: File | undefined) {
    if (!nextFile) return

    if (isProcessing || isRestoring) return
    setError(null)

    try {
      validateFile(nextFile)
      if (isPdf(nextFile)) {
        setPhase("preparing")
        const info = await inspectPdf(nextFile)
        if (info.page_count < 1) throw new Error("PDF ไม่มีหน้าที่สามารถนำเข้าได้")
        setPdfSource(nextFile)
        setPdfPageCount(info.page_count)
        setPdfPage(1)
        if (info.page_count > 1) {
          setIsPdfChooserOpen(true)
          setPhase("idle")
        } else {
          const imageFile = await preparePdf(nextFile, 1)
          setEditorFile(imageFile)
          setIsEditorOpen(true)
          setPhase("idle")
        }
      } else {
        setPdfSource(null)
        setPdfPageCount(0)
        setEditorFile(nextFile)
        setIsEditorOpen(true)
        setPhase("idle")
      }
    } catch (caught) {
      setPhase("error")
      setError(caught instanceof Error ? caught.message : "ไม่สามารถเปิดไฟล์ได้")
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function applyEditedImage(editedFile: File, dataUrl: string, preparedSize: ImageSize) {
    cancelActiveDetection()
    setWorkspaceView("2d")
    setFloorMaterialId(DEFAULT_MATERIAL.floor)
    setKnownLength("")
    setFile(editedFile)
    setPreviewDataUrl(dataUrl)
    setImageSize(preparedSize)
    setSelectedId(null)
    setMetersPerPixel(null)
    resetHistory([])
    setError(null)
    setPhase("idle")
    setRightPanelOpen(false)
    setLeftPanelOpen(true)
    setIsEditorOpen(false)
    setEditorFile(null)
  }

  function clearProject() {
    cancelActiveDetection()
    if (pendingSaveRef.current) window.clearTimeout(pendingSaveRef.current)
    void clearActiveProject().catch(() => setStorageMessage("ล้างงานที่บันทึกไว้ไม่สำเร็จ กรุณาลองอีกครั้ง"))
    setSaveStatus("idle")
    setFloorMaterialId(DEFAULT_MATERIAL.floor)
    setFile(null)
    setPreviewDataUrl(null)
    setImageSize(null)
    resetHistory([])
    setSelectedId(null)
    setMetersPerPixel(null)
    setKnownLength("")
    setWorkspaceView("2d")
    setPhase("idle")
    setError(null)
    setEditorFile(null)
    setIsEditorOpen(false)
    setPdfSource(null)
    setPdfPageCount(0)
    setPdfPage(1)
    setIsPdfChooserOpen(false)
    setBackendProgress(0)
  }

  function confirmReplace(action: () => void) {
    if (file) setPendingAction(() => action)
    else action()
  }

  function exportProject() {
    if (!file || !previewDataUrl) return
    downloadProject({ fileName: file.name, fileType: file.type, previewDataUrl, imageSize, detections: editableDetections, metersPerPixel, floorMaterialId, updatedAt: Date.now() })
  }

  async function importProject(nextFile: File | undefined) {
    if (!nextFile || isProcessing || importing) return
    setImporting(true)
    setError(null)
    try {
      if (nextFile.size > 40 * 1024 * 1024) throw new Error("ไฟล์โปรเจกต์มีขนาดเกิน 40 MB")
      const saved = parseProjectFile(await nextFile.text())
      const restoredFile = await dataUrlToFile(saved.previewDataUrl, saved.fileName, saved.fileType)
      const bitmap = await createImageBitmap(restoredFile)
      bitmap.close()
      confirmReplace(() => {
        cancelActiveDetection()
        setFile(restoredFile)
        setPreviewDataUrl(saved.previewDataUrl)
        setImageSize(saved.imageSize)
        resetHistory(saved.detections.map((d, index) => normalizeDetection(d as Detection, index)))
        setMetersPerPixel(saved.metersPerPixel)
        setKnownLength("")
        setFloorMaterialId(saved.floorMaterialId ?? DEFAULT_MATERIAL.floor)
        setSelectedId(null)
        setWorkspaceView("2d")
        setPhase(saved.imageSize ? "complete" : "idle")
        setBackendProgress(saved.imageSize ? 100 : 0)
        setStorageMessage(null)
        setError(null)
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เปิดโปรเจกต์ไม่สำเร็จ")
    } finally {
      setImporting(false)
      if (projectInputRef.current) projectInputRef.current.value = ""
    }
  }

  async function runDetection() {
    if (!file || isProcessing) return

    cancelActiveDetection()
    const controller = new AbortController()
    detectionAbortRef.current = controller
    setError(null)
    setPhase("preparing")
    setBackendProgress(5)
    let timedOut = false
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort() }, 120000)

    const runLegacyDetection = async () => {
      setPhase("walls")
      setBackendProgress(35)
      const legacyFormData = new FormData()
      legacyFormData.append("file", file)
      const legacyResponse = await fetch(`${API_URL}/detect`, {
        method: "POST",
        body: legacyFormData,
        signal: controller.signal,
      })
      if (!legacyResponse.ok) {
        const message = await extractError(legacyResponse)
        throw new Error(message || "AI Detection ไม่สำเร็จ")
      }
      setPhase("openings")
      setBackendProgress(82)
      return (await legacyResponse.json()) as DetectionResponse
    }

    try {
      let result: DetectionResponse | null = null
      const formData = new FormData()
      formData.append("file", file)
      const createResponse = await fetch(`${API_URL}/detect/jobs`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      })

      // Backward compatibility: the original backend only exposes POST /detect.
      // A 404/405 here means the user is still running that working backend version.
      if (createResponse.status === 404 || createResponse.status === 405) {
        result = await runLegacyDetection()
      } else {
        if (!createResponse.ok) {
          const message = await extractError(createResponse)
          throw new Error(message || "ไม่สามารถเริ่ม AI Detection ได้")
        }

        const created = (await createResponse.json()) as { job_id: string }
        while (!result) {
          await sleep(280, controller.signal)
          const statusResponse = await fetch(`${API_URL}/detect/jobs/${created.job_id}`, {
            signal: controller.signal,
            cache: "no-store",
          })

          // If an older/restarted backend loses the in-memory job, retry using
          // the original synchronous endpoint instead of showing "Not Found".
          if (statusResponse.status === 404 || statusResponse.status === 405) {
            result = await runLegacyDetection()
            break
          }
          if (!statusResponse.ok) {
            const message = await extractError(statusResponse)
            throw new Error(message || "ไม่สามารถอ่านสถานะ AI ได้")
          }

          const job = (await statusResponse.json()) as DetectionJobResponse
          setBackendProgress(Math.max(0, Math.min(100, Number(job.progress) || 0)))
          if (job.phase === "preparing" || job.phase === "walls" || job.phase === "openings") {
            setPhase(job.phase)
          }
          if (job.status === "failed") {
            throw new Error(job.error || job.message || "AI Detection ไม่สำเร็จ")
          }
          if (job.status === "complete" && job.result) result = job.result
        }
      }

      const normalized = result.detections.map((detection, index) =>
        normalizeDetection(detection, index),
      )
      setPhase("generating")
      setBackendProgress(96)
      await sleep(120, controller.signal)
      if (controller.signal.aborted) return
      setImageSize(result.image)
      const cleaned = removeDuplicateWalls(normalized)
      resetHistory(rebuildRoomFloors(cleaned, result.image))
      setMetersPerPixel(null)
      setKnownLength("")
      setSelectedId(null)
      setWorkspaceView("2d")
      setPhase("complete")
      setBackendProgress(100)
    } catch (caught) {
      if (controller.signal.aborted) {
        if (timedOut) {
          setPhase("error")
          setError("AI ใช้เวลานานเกิน 2 นาที ลองตรวจการเชื่อมต่อแล้วกดตรวจจับอีกครั้ง งานเดิมยังอยู่")
        }
        return
      }
      setPhase("error")
      setBackendProgress(0)
      const message = caught instanceof Error ? caught.message : "Backend error"
      setError(
        message === "Not Found"
          ? "Frontend กับ Backend เป็นคนละเวอร์ชัน กรุณารีสตาร์ต Backend จากโฟลเดอร์โปรเจกต์นี้"
          : caught instanceof TypeError
            ? "เชื่อมต่อ AI ไม่ได้ กรุณาเปิด backend แล้วลองอีกครั้ง งานเดิมยังอยู่"
            : message,
      )
    } finally {
      window.clearTimeout(timeout)
      if (detectionAbortRef.current === controller) detectionAbortRef.current = null
    }
  }

  function updateSelectedBox(field: "x1" | "y1" | "width" | "height", rawValue: string) {
    if (!selectedDetection || !imageSize) return
    const value = Number(rawValue)
    if (!Number.isFinite(value)) return

    const current = selectedDetection.box
    let x1 = current.x1
    let y1 = current.y1
    let width = current.width
    let height = current.height

    if (field === "x1") x1 = value
    if (field === "y1") y1 = value
    if (field === "width") width = value
    if (field === "height") height = value

    const nextBox = clampBox(boxFromEdges(x1, y1, x1 + width, y1 + height), imageSize)
    commitDetections(
      editableDetections.map((detection) =>
        detection.id === selectedDetection.id ? { ...detection, box: nextBox } : detection,
      ),
    )
  }

  function updateSelectedLabel(label: string) {
    if (!selectedDetection) return
    commitDetections(
      editableDetections.map((detection) =>
        detection.id === selectedDetection.id
          ? { ...detection, label, class_id: -1, confidence: 1 }
          : detection,
      ),
    )
  }

  function calibrateScale() {
    const reference = scaleReferenceDetection
    const meters = Number(knownLength)
    const pixelLength = reference
      ? Math.max(reference.box.width, reference.box.height)
      : 0
    if (!reference || !Number.isFinite(meters) || meters <= 0 || pixelLength <= 0) {
      setError("กรุณากรอกความยาวจริงเป็นเมตร ระบบจะเลือกผนังยาวสุดให้อัตโนมัติ")
      return
    }
    setMetersPerPixel(meters / pixelLength)
    setSelectedId(reference.id)
    setError(null)
  }

  function selectAutomaticScaleReference() {
    if (!automaticScaleReference) {
      setError("ยังไม่พบผนังหรือวัตถุที่ใช้เป็นระยะอ้างอิง")
      return
    }
    setSelectedId(automaticScaleReference.id)
    setError(null)
  }

  function targetThicknessFromInput() {
    const value = Number(wallThicknessDraft)
    if (!Number.isFinite(value) || value <= 0) return null
    return metersPerPixel ? value / 100 / metersPerPixel : value
  }

  function applyWallThickness(scope: "selected" | "all") {
    if (!selectedDetection || !imageSize || labelKind(selectedDetection.label) !== "wall") return
    const targetPx = targetThicknessFromInput()
    if (!targetPx) {
      setError("กรุณากรอกความหนากำแพงเป็นตัวเลข")
      return
    }

    const next = editableDetections.map((detection) => {
      if (labelKind(detection.label) !== "wall") return detection
      if (scope === "selected" && detection.id !== selectedDetection.id) return detection
      return { ...detection, box: resizeWallThickness(detection.box, targetPx, imageSize) }
    })

    commitDetections(next)
    setError(null)
  }

  function applyWallThicknessPreset(valueCm: number, scope: "selected" | "all") {
    if (!selectedDetection || !imageSize || labelKind(selectedDetection.label) !== "wall") return
    const currentThickness = wallThickness(selectedDetection.box)
    const targetPx = metersPerPixel
      ? valueCm / 100 / metersPerPixel
      : Math.max(6, Math.round((valueCm / 15) * currentThickness))

    const next = editableDetections.map((detection) => {
      if (labelKind(detection.label) !== "wall") return detection
      if (scope === "selected" && detection.id !== selectedDetection.id) return detection
      return { ...detection, box: resizeWallThickness(detection.box, targetPx, imageSize) }
    })

    commitDetections(next)
    setWallThicknessDraft(
      metersPerPixel
        ? valueCm.toString()
        : Math.round(targetPx).toString(),
    )
    setError(null)
  }

  return (
    <main className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 sm:py-8">
      <AlertDialog open={Boolean(pendingAction)} onOpenChange={open => { if (!open) setPendingAction(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>แทนที่งานปัจจุบันหรือไม่?</AlertDialogTitle><AlertDialogDescription>การทำรายการนี้อาจแทนที่แปลนหรือผลแก้ไขเดิม กดสำรองโปรเจกต์ก่อน หากต้องการเก็บงานนี้ไว้</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>เก็บงานเดิม</AlertDialogCancel><AlertDialogAction onClick={() => { const action = pendingAction; setPendingAction(null); action?.() }}>ดำเนินการต่อ</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {isPdfChooserOpen && pdfSource && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary"><FileText className="h-6 w-6" /></div>
              <div className="min-w-0">
                <h2 className="font-semibold">เลือกหน้าจาก PDF</h2>
                <p className="truncate text-sm text-muted-foreground">{pdfSource.name}</p>
              </div>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
              ไฟล์นี้มี {pdfPageCount} หน้า เลือกหน้าที่เป็นแปลนบ้านก่อนเปิด Crop & Rotate
            </p>
            <label className="mt-4 block text-sm font-medium">หน้าที่ต้องการนำเข้า
              <input
                type="number"
                min={1}
                max={pdfPageCount}
                value={pdfPage}
                onChange={(event) => setPdfPage(Math.min(pdfPageCount, Math.max(1, Number(event.target.value) || 1)))}
                className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring/40"
              />
            </label>
            <div className="mt-5 flex gap-2">
              <Button type="button" variant="ghost" className="flex-1 rounded-xl" onClick={() => { setIsPdfChooserOpen(false); setPdfSource(null); setPhase(imageSize ? "complete" : "idle") }}>ยกเลิก</Button>
              <Button type="button" className="flex-1 rounded-xl" onClick={() => void openPdfPage(pdfPage)}>เปิดหน้านี้</Button>
            </div>
          </div>
        </div>
      )}

      {isEditorOpen && editorFile && (
        <ImageEditor
          file={editorFile}
          onCancel={() => {
            setIsEditorOpen(false)
            setEditorFile(null)
            setPhase(imageSize ? "complete" : "idle")
          }}
          onApply={applyEditedImage}
        />
      )}

      <div className="mx-auto max-w-[1900px]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 sm:mb-8">
          <Button type="button" variant="ghost" className="rounded-2xl" onClick={() => { if (pendingSaveRef.current !== null) { window.clearTimeout(pendingSaveRef.current); flushSaveRef.current?.() } router.push("/") }}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            กลับหน้าแรก
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            {hasWorkspace && (
              <>
                <Button
                  type="button"
                  size="icon-sm"
                  variant={showLeftPanel ? "secondary" : "outline"}
                  className="rounded-xl"
                  onClick={() => setLeftPanelOpen((value) => !value)}
                  title={showLeftPanel ? "ซ่อนแผงไฟล์" : "แสดงแผงไฟล์"}
                >
                  {showLeftPanel ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                </Button>
                {workspaceView === "2d" && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={showRightPanel ? "secondary" : "outline"}
                    className="rounded-xl"
                    onClick={() => setRightPanelOpen((value) => !value)}
                    title={showRightPanel ? "ซ่อนรายละเอียด" : "แสดงรายละเอียด"}
                  >
                    {showRightPanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                  </Button>
                )}
              </>
            )}
            {file && (
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => confirmReplace(clearProject)} disabled={isRestoring || importing || isProcessing}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                เริ่มใหม่
              </Button>
            )}
            <Button type="button" variant="outline" className="rounded-2xl" onClick={() => projectInputRef.current?.click()} disabled={isProcessing || isRestoring || importing}>
              <FolderOpen className="mr-2 h-4 w-4" />{importing ? "กำลังเปิด..." : "เปิดโปรเจกต์"}
            </Button>
            {file && <Button type="button" variant="outline" className="rounded-2xl" onClick={exportProject} disabled={isProcessing || isRestoring}><Download className="mr-2 h-4 w-4" />สำรองโปรเจกต์</Button>}
            <input ref={projectInputRef} type="file" accept=".json" className="hidden" aria-label="เปิดไฟล์โปรเจกต์" onChange={event => void importProject(event.target.files?.[0])} />
            <div className="space-y-1 px-2">
              <BackendStatus />
              {file && <p role="status" className="text-[11px] text-muted-foreground">{saveStatus === "saved" ? "บันทึกงานในเบราว์เซอร์นี้แล้ว" : saveStatus === "error" ? "บันทึกงานไม่สำเร็จ" : "กำลังบันทึกงาน…"}</p>}
            </div>
          </div>
        </div>

        {(error || storageMessage || saveStatus === "error") && (
          <div role="alert" className="mb-4 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="min-w-0 break-words">{error || storageMessage || "บันทึกอัตโนมัติไม่สำเร็จ กรุณากดสำรองโปรเจกต์เพื่อเก็บงานลงเครื่อง"}</p>
            <button type="button" className="ml-auto shrink-0 text-xs underline" onClick={() => { setError(null); setStorageMessage(null) }}>ปิดข้อความ</button>
          </div>
        )}
        <div className={`grid gap-4 ${workspaceLayoutClass}`}>

          {showLeftPanel && (
          <aside className="h-fit rounded-3xl border border-border bg-card p-4 shadow-sm xl:sticky xl:top-6">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-lg font-semibold tracking-tight">{hasWorkspace ? "ไฟล์แปลน" : "นำเข้าแปลนบ้าน"}</h1>
              {hasWorkspace && (
                <Button type="button" size="icon-sm" variant="ghost" className="rounded-xl" onClick={() => setLeftPanelOpen(false)} title="ซ่อนแผงไฟล์">
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              อัปโหลด ตรวจจับ แล้วแก้ผลลัพธ์ได้ทั้งแบบ 2D และ 3D
            </p>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault()
                setIsDropActive(true)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setIsDropActive(true)
              }}
              onDragLeave={(event) => {
                event.preventDefault()
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setIsDropActive(false)
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                setIsDropActive(false)
                choosePlan(event.dataTransfer.files?.[0])
              }}
              className={`${hasWorkspace ? "hidden" : "mt-6 flex"} min-h-44 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center transition ${
                isDropActive
                  ? "scale-[1.01] border-primary bg-primary/15"
                  : "border-primary/30 bg-primary/5 hover:bg-primary/10"
              }`}
            >
              <Upload className="mb-3 h-9 w-9 text-primary" />
              <span className="font-medium">ลากไฟล์มาวางที่นี่</span>
              <span className="mt-1 text-xs text-muted-foreground">หรือคลิกเพื่อเลือกไฟล์</span>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
                {['JPG', 'PNG', 'WebP', 'PDF'].map((type) => (
                  <span key={type} className="rounded-full bg-background px-2 py-1">{type}</span>
                ))}
              </div>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
              className="hidden"
              onChange={(event) => { const next = event.target.files?.[0]; event.target.value = ""; choosePlan(next) }} disabled={isProcessing || isRestoring || importing} aria-label="อัปโหลดแปลน"
            />

            {file && (
              <div className="mt-4 rounded-2xl border border-border bg-secondary/40 p-3">
                <div className="flex items-start gap-3">
                  <FileImage className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{fileSummary}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => hasWorkspace ? confirmReplace(() => { setEditorFile(file); setIsEditorOpen(true) }) : (setEditorFile(file), setIsEditorOpen(true))} disabled={isProcessing}>
                    <Crop className="mr-2 h-4 w-4" />Crop
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => hasWorkspace ? confirmReplace(() => { setEditorFile(file); setIsEditorOpen(true) }) : (setEditorFile(file), setIsEditorOpen(true))} disabled={isProcessing}>
                    <RotateCw className="mr-2 h-4 w-4" />Rotate
                  </Button>
                </div>
              </div>
            )}

            <Button type="button" onClick={() => editableDetections.length ? confirmReplace(() => void runDetection()) : void runDetection()} disabled={!file || isProcessing || isRestoring || importing} className="mt-5 w-full rounded-2xl">
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {isProcessing ? "AI กำลังทำงาน..." : editableDetections.length ? "ตรวจจับใหม่" : "Run AI Detection"}
            </Button>

            {isProcessing && detectionAbortRef.current && <Button type="button" variant="outline" className="mt-2 w-full rounded-2xl" onClick={() => { cancelActiveDetection(); setPhase(imageSize ? "complete" : "idle"); setBackendProgress(0) }}>ยกเลิกการรอผล</Button>}
            <div className={`mt-4 rounded-2xl border border-border ${hasWorkspace ? "p-3" : "p-4"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{currentPhase.title}</p>
                {phase === "complete" && <CheckCircle2 className="h-5 w-5 text-success" />}
                {phase === "error" && <AlertTriangle className="h-5 w-5 text-destructive" />}
                {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{currentPhase.description}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                <div className={`h-full rounded-full transition-all duration-500 ${phase === "error" ? "bg-destructive" : "bg-primary"}`} style={{ width: `${isProcessing ? backendProgress : currentPhase.progress}%` }} />
              </div>
            </div>


          </aside>
          )}

          <div className="min-w-0 space-y-4">
            <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-2 shadow-sm sm:p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-secondary/60 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold">{workspaceView === "3d" ? "สำรวจและแก้ไขโมเดล 3D" : "แก้ไขแปลน / AI Detection"}</p>
                  <p className="hidden text-xs text-muted-foreground sm:block">
                    {workspaceView === "3d"
                      ? "แก้โครงสร้างและตรวจผลในมุมมอง 3D"
                      : "เพิ่มวัตถุ → คลิกเลือก → ลากหรือปรับขนาด → เปิดดู 3D"}
                  </p>
                </div>
                {hasWorkspace ? (
                  <div className="flex rounded-xl border border-border bg-background p-1">
                    <Button type="button" size="sm" variant={workspaceView === "2d" ? "default" : "ghost"} className="rounded-lg" onClick={() => setWorkspaceView("2d")}>
                      <ScanSearch className="mr-2 h-4 w-4" />2D Review
                    </Button>
                    <Button type="button" size="sm" variant={workspaceView === "3d" ? "default" : "ghost"} className="rounded-lg" onClick={() => { setSelectedId(null); setWorkspaceView("3d") }}>
                      <Box className="mr-2 h-4 w-4" />3D Editor
                    </Button>
                  </div>
                ) : (
                  <span className="rounded-full bg-background px-3 py-1 text-xs text-muted-foreground">{file ? "Image ready" : "Waiting for upload"}</span>
                )}
              </div>

              {isRestoring && (
                <div className="flex min-h-[520px] items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังกู้คืนงานล่าสุด...
                </div>
              )}

              {!isRestoring && !previewDataUrl && (
                <div className="flex min-h-[520px] items-center justify-center rounded-2xl bg-secondary/40 p-6 text-center text-muted-foreground">
                  <div className="max-w-sm">
                    <Upload className="mx-auto mb-4 h-10 w-10 text-primary" />
                    <p className="font-medium text-foreground">ยังไม่มีภาพแปลน</p>
                    <p className="mt-2 text-sm">เลือกไฟล์จากด้านซ้าย แล้ว Crop หรือ Rotate ก่อนส่งให้ AI</p>
                  </div>
                </div>
              )}

              {!isRestoring && previewDataUrl && !hasWorkspace && (
                <div className="relative flex min-h-[520px] items-center justify-center overflow-hidden rounded-2xl bg-[#F3F4F6] p-4">
                  <img src={previewDataUrl} alt="Floor plan preview" className="block max-h-[680px] max-w-full rounded-xl object-contain shadow-lg" />
                </div>
              )}

              {hasWorkspace && previewDataUrl && imageSize && workspaceView === "2d" && (
                <FloorPlan2DEditor
                  imageUrl={previewDataUrl}
                  imageSize={imageSize}
                  detections={editableDetections}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onLiveChange={setLiveDetections}
                  onCommit={commitDetections}
                  onAdd={(detection) => {
                    commitDetections([...editableDetections, detection])
                    setSelectedId(detection.id)
                  }}
                  onDeleteSelected={deleteSelected}
                  onUndo={undo}
                  onRedo={redo}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  onOpenDetails={() => setRightPanelOpen(value => !value)}
                  detailsOpen={rightPanelOpen}
                />
              )}

              {hasWorkspace && imageSize && workspaceView === "3d" && (
                <EditableFloorPlan3D
                  previewDataUrl={previewDataUrl ?? undefined}
                  imageUrl={previewDataUrl}
                  detections={editableDetections}
                  imageSize={imageSize}
                  selectedId={selectedId}
                  metersPerPixel={metersPerPixel}
                  floorMaterialId={floorMaterialId}
                  onFloorMaterialChange={setFloorMaterialId}
                  onSelect={setSelectedId}
                  onLiveChange={setLiveDetections}
                  onCommit={commitDetections}
                  onDeleteSelected={deleteSelected}
                  onUndo={undo}
                  onRedo={redo}
                  canUndo={canUndo}
                  canRedo={canRedo}
                />
              )}

              {isProcessing && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-6 backdrop-blur-[2px]">
                  <div className="w-full max-w-md rounded-3xl border border-white/20 bg-white/95 p-6 text-center shadow-2xl">
                    <Loader2 className="mx-auto h-9 w-9 animate-spin text-primary" />
                    <p className="mt-4 font-semibold">{currentPhase.title}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{currentPhase.description}</p>
                    <div className="mt-5 h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${isProcessing ? backendProgress : currentPhase.progress}%` }} />
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>

          {showRightPanel && (
          <aside className="h-fit min-h-[560px] overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-sm xl:sticky xl:top-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  รายละเอียดวัตถุ
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  คลิกวัตถุบนแปลนเพื่อแก้รายละเอียด หรือกำหนดมาตราส่วนจริง
                </p>
              </div>
              <ScanSearch className="h-5 w-5 text-primary" />
            </div>

            {!hasWorkspace && (
              <div className="mt-8 rounded-2xl border border-dashed border-border p-6 text-center">
                <FileText className="mx-auto h-9 w-9 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">ยังไม่มีผลลัพธ์</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">อัปโหลดภาพ แล้วกด Run AI Detection</p>
              </div>
            )}



            {hasWorkspace && imageSize && (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-primary/10 p-4">
                    <p className="text-3xl font-semibold text-primary">{editableDetections.length}</p>
                    <p className="text-xs text-muted-foreground">objects</p>
                  </div>
                  <div className="rounded-2xl bg-secondary/60 p-4">
                    <p className="text-sm font-semibold">{imageSize.width} × {imageSize.height}</p>
                    <p className="mt-1 text-xs text-muted-foreground">processed pixels</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl border border-border p-2"><p className="font-semibold text-primary">{countSummary.wall}</p><p className="text-muted-foreground">Walls</p></div>
                  <div className="rounded-xl border border-border p-2"><p className="font-semibold text-success">{countSummary.door}</p><p className="text-muted-foreground">Doors</p></div>
                  <div className="rounded-xl border border-border p-2"><p className="font-semibold text-cyan-600">{countSummary.window}</p><p className="text-muted-foreground">Windows</p></div>
                </div>

                <div className={`rounded-2xl border p-3 ${qualityIssues.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className={`text-sm font-semibold ${qualityIssues.length ? "text-amber-800" : "text-emerald-800"}`}>
                        {qualityIssues.length ? `ควรตรวจเพิ่ม ${qualityIssues.length} จุด` : "โครงสร้างเบื้องต้นพร้อมใช้งาน"}
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        ตรวจผนังสั้น ผนังซ้อน ช่องว่าง และประตูหรือหน้าต่างที่ยังไม่ติดผนัง
                      </p>
                    </div>
                    {qualityIssues.length ? <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
                  </div>
                  <Button type="button" size="sm" variant="outline" className="mt-2 w-full" onClick={() => {
                    const next = removeDuplicateWalls(editableDetections)
                    commitDetections(rebuildRoomFloors(next, imageSize!))
                    setSelectedId(null)
                  }}>แก้ผนังซ้ำ / แบ่งพื้นตามห้อง</Button>
                  <p className="mt-2 text-[11px] text-muted-foreground">สร้างพื้นใหม่แทนพื้นเดิม แยกตามห้องปิดและไม่ซ้อนกัน ถ้าผนังเปิดอยู่ต้องแก้แนวก่อน · ย้อนกลับได้</p>
                  {qualityIssues.length > 0 && (
                    <div className="mt-3 max-h-36 space-y-1.5 overflow-y-auto">
                      {qualityIssues.slice(0, 5).map((issue) => (
                        <button
                          key={issue.id}
                          type="button"
                          onClick={() => setSelectedId(issue.detectionIds[0] ?? null)}
                          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-left text-[11px] leading-relaxed text-slate-700 transition hover:border-amber-400"
                        >
                          {issue.message}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedDetection ? (
                  <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">วัตถุที่เลือก</p>
                      <Button type="button" size="icon-sm" variant="ghost" className="rounded-xl text-destructive hover:text-destructive" onClick={deleteSelected} title="ลบวัตถุ">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {workspaceView === "2d" ? (
                      <>
                        <label className="mt-3 block text-xs font-medium text-muted-foreground">ชนิดวัตถุ</label>
                        <select value={selectedDetection.label.toLowerCase().includes("wall") ? "wall" : selectedDetection.label.toLowerCase().includes("door") ? "door" : selectedDetection.label.toLowerCase().includes("window") ? "window" : selectedDetection.label.toLowerCase().includes("floor") ? "floor" : selectedDetection.label} onChange={(event) => updateSelectedLabel(event.target.value)} className="mt-1 h-9 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40">
                          <option value="wall">wall</option>
                          <option value="door">door</option>
                          <option value="window">window</option>
                          <option value="floor">floor</option>
                        </select>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {([
                            ["x1", "X"],
                            ["y1", "Y"],
                            ["width", "Width"],
                            ["height", "Height"],
                          ] as const).map(([field, label]) => (
                            <label key={field} className="text-[11px] text-muted-foreground">
                              {label}
                              <input type="number" min={0} value={Math.round(selectedDetection.box[field])} onChange={(event) => updateSelectedBox(field, event.target.value)} className="mt-1 h-9 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40" />
                            </label>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between rounded-xl bg-background px-3 py-2 text-xs">
                          <span className="text-muted-foreground">ประเภท</span>
                          <span className="font-semibold capitalize text-foreground">{selectedDetection.label}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-background px-3 py-2 text-xs">
                          <span className="text-muted-foreground">ความยาว</span>
                          <span className="font-semibold text-foreground">{formatLength(Math.max(selectedDetection.box.width, selectedDetection.box.height), metersPerPixel)}</span>
                        </div>
                        {selectedIsWall && (
                          <div className="rounded-xl border border-border bg-background p-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">ความหนากำแพง</span>
                              <span className="font-semibold text-foreground">{formatThickness(wallThickness(selectedDetection.box), metersPerPixel)}</span>
                            </div>
                            <div className="mt-2 flex items-end gap-2">
                              <label className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                                กำหนดเอง ({metersPerPixel ? "cm" : "px"})
                                <input
                                  type="number"
                                  min="1"
                                  step={metersPerPixel ? "1" : "1"}
                                  value={wallThicknessDraft}
                                  onChange={(event) => setWallThicknessDraft(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") applyWallThickness("selected")
                                  }}
                                  className="mt-1 h-9 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring/40"
                                />
                              </label>
                              <Button type="button" size="sm" className="h-9 rounded-xl" onClick={() => applyWallThickness("selected")}>
                                ใช้
                              </Button>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-1.5">
                              {[10, 15, 20].map((value) => (
                                <Button
                                  key={value}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 rounded-xl px-1 text-[11px]"
                                  onClick={() => applyWallThicknessPreset(value, "selected")}
                                >
                                  {value} cm
                                </Button>
                              ))}
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <Button type="button" size="sm" variant="secondary" className="rounded-xl text-[11px]" onClick={() => applyWallThickness("all")}>
                                ใช้กับทุกผนัง
                              </Button>
                              <Button type="button" size="sm" variant="ghost" className="rounded-xl text-[11px]" onClick={() => applyWallThicknessPreset(15, "all")}>
                                ทุกผนัง 15 cm
                              </Button>
                            </div>
                            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                              ปรับโดยยึดแนวกึ่งกลางไว้ จึงไม่ทำให้ตำแหน่งผนังเลื่อน
                            </p>
                          </div>
                        )}
                        <p className="rounded-xl bg-primary/10 px-3 py-2 text-[11px] leading-relaxed text-primary">
                          ลากตัววัตถุเพื่อย้าย ลากจุดปลายเพื่อปรับความยาว และปรับความหนาจากช่องด้านบน
                        </p>
                      </div>
                    )}

                    {workspaceView === "2d" && (
                      <div className="mt-3 rounded-xl bg-background p-3 text-xs text-muted-foreground">
                        ขนาด: <span className="font-medium text-foreground">{formatLength(selectedDetection.box.width, metersPerPixel)} × {formatLength(selectedDetection.box.height, metersPerPixel)}</span>
                        {selectedIsWall && (
                          <div className="mt-2 rounded-xl border border-border bg-secondary/40 p-2">
                            <div className="flex items-center justify-between">
                              <span>ความหนากำแพง</span>
                              <span className="font-semibold text-foreground">{formatThickness(wallThickness(selectedDetection.box), metersPerPixel)}</span>
                            </div>
                            <div className="mt-2 flex gap-2">
                              <input
                                type="number"
                                value={wallThicknessDraft}
                                onChange={(event) => setWallThicknessDraft(event.target.value)}
                                className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring/40"
                                placeholder={metersPerPixel ? "cm" : "px"}
                              />
                              <Button type="button" size="sm" className="h-8 rounded-lg" onClick={() => applyWallThickness("selected")}>ใช้</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">คลิกกรอบใน 2D หรือวัตถุใน 3D เพื่อแก้ไข</div>
                )}

                <div className="rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">กำหนดมาตราส่วนจริง</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        ไม่ต้องเลือกกำแพงก่อน ระบบจะใช้ผนังที่ยาวที่สุดให้อัตโนมัติ
                      </p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
                      ตั้งครั้งเดียว
                    </span>
                  </div>

                  {scaleReferenceDetection ? (
                    <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium text-muted-foreground">ระยะอ้างอิงที่ระบบจะใช้</p>
                          <p className="mt-0.5 truncate text-xs font-semibold text-foreground">
                            {selectedDetection && selectedDetection.id === scaleReferenceDetection.id && labelKind(selectedDetection.label) === "wall"
                              ? "กำแพงที่เลือก"
                              : labelKind(scaleReferenceDetection.label) === "wall"
                                ? "กำแพงยาวสุดอัตโนมัติ"
                                : "วัตถุยาวสุดอัตโนมัติ"}
                            {` · ${Math.round(Math.max(scaleReferenceDetection.box.width, scaleReferenceDetection.box.height))} px`}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 rounded-lg px-2 text-[10px]"
                          onClick={selectAutomaticScaleReference}
                        >
                          เลือกให้อัตโนมัติ
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                      ยังไม่พบผนังสำหรับใช้เป็นระยะอ้างอิง
                    </div>
                  )}

                  <div className="mt-3">
                    <label className="text-[11px] font-medium text-foreground">ความยาวจริงของกำแพงนี้</label>
                    <div className="mt-1.5 flex gap-2">
                      <div className="relative min-w-0 flex-1">
                        <input
                          value={knownLength}
                          onChange={(event) => setKnownLength(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") calibrateScale()
                          }}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="เช่น 5"
                          className="h-10 w-full rounded-xl border border-input bg-background px-3 pr-14 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">เมตร</span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="h-10 rounded-xl px-4"
                        onClick={calibrateScale}
                        disabled={!scaleReferenceDetection || !knownLength}
                      >
                        ใช้กับทั้งแปลน
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[3, 4, 5, 6].map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setKnownLength(String(value))}
                          className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                        >
                          {value} m
                        </button>
                      ))}
                    </div>
                  </div>

                  {metersPerPixel && (
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-success/10 px-3 py-2 text-xs text-success">
                      <div>
                        <span className="font-semibold">ตั้งมาตราส่วนสำเร็จ</span>
                        <span className="ml-1">1 px = {metersPerPixel.toFixed(5)} m</span>
                      </div>
                      <button type="button" className="font-medium underline underline-offset-2" onClick={() => setMetersPerPixel(null)}>ตั้งใหม่</button>
                    </div>
                  )}
                </div>

                {workspaceView === "2d" && (
                  <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                    {editableDetections.map((detection) => (
                    <button key={detection.id} type="button" onClick={() => setSelectedId(detection.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === detection.id ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colorByLabel(detection.label) }} />
                          <span className="truncate text-sm font-medium">{detection.label}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{Math.round(detection.confidence * 100)}%</span>
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">x {Math.round(detection.box.x1)}, y {Math.round(detection.box.y1)} • {Math.round(detection.box.width)} × {Math.round(detection.box.height)} px</p>
                    </button>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={undo} disabled={!canUndo}><Undo2 className="mr-2 h-4 w-4" />Undo</Button>
                  <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={redo} disabled={!canRedo}><Redo2 className="mr-2 h-4 w-4" />Redo</Button>
                </div>
              </div>
            )}

            {file && (
              <Button type="button" variant="ghost" className="mt-5 w-full rounded-xl text-destructive hover:text-destructive" onClick={() => confirmReplace(clearProject)} disabled={isRestoring || importing || isProcessing}>
                <Trash2 className="mr-2 h-4 w-4" />ล้างไฟล์และผลลัพธ์
              </Button>
            )}
          </aside>
          )}
        </div>
      </div>
    </main>
  )
}

async function extractError(response: Response) {
  const text = await response.text()
  try {
    const payload = JSON.parse(text) as { detail?: unknown }
    return typeof payload.detail === "string" ? payload.detail : response.statusText
  } catch {
    return text || response.statusText
  }
}
