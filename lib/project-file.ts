import { z } from "zod"
import type { StoredProject } from "@/lib/project-storage"

const finite = z.number().finite()
const detection = z.object({
  id: z.string().min(1),
  class_id: finite,
  label: z.string().min(1).max(100),
  confidence: finite.min(0).max(1),
  box: z.object({ x1: finite, y1: finite, x2: finite, y2: finite, width: finite.nonnegative(), height: finite.nonnegative() }),
  wallHeightM: finite.positive().optional(),
  materialId: z.string().optional(),
  materialApplied: z.boolean().optional(),
  materialScale: finite.positive().optional(),
  materialRotation: finite.optional(),
  objectHeightM: finite.nonnegative().optional(),
  furnitureCatalogId: z.string().max(100).optional(),
  furnitureRotationY: finite.optional(),
  furnitureHeightScale: finite.positive().optional(),
  hiddenInEditor: z.boolean().optional(),
  favorite: z.boolean().optional(),
  roomBoundaryTolerancePx: finite.nonnegative().optional(),
  roomName: z.string().max(100).optional(),
  floorTiles: z.array(z.object({x1: finite.min(0).max(1), y1: finite.min(0).max(1), x2: finite.min(0).max(1), y2: finite.min(0).max(1)}).refine(t => t.x2 > t.x1 && t.y2 > t.y1)).min(1).max(10000).optional(),
  wallFinishes: z.array(z.object({side: z.enum(["positive", "negative"]), start: finite.min(0).max(1), end: finite.min(0).max(1), materialId: z.string(), materialScale: finite.positive().optional(), materialRotation: finite.optional()}).refine(f => f.end > f.start)).max(2000).optional(),
})

const projectFile = z.object({
  format: z.literal("sketch2spec"),
  version: z.literal(1),
  project: z.object({
    fileName: z.string().min(1).max(500),
    fileType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    previewDataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
    imageSize: z.object({ width: finite.positive().max(20000), height: finite.positive().max(20000) }).nullable(),
    detections: z.array(detection).max(20000),
    metersPerPixel: finite.positive().nullable(),
    floorMaterialId: z.string().optional(),
    updatedAt: finite,
  }).refine(p => p.imageSize !== null || p.detections.length === 0),
})

export function parseProjectFile(text: string): StoredProject {
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new Error("อ่านไฟล์โปรเจกต์ไม่ได้ กรุณาเลือกไฟล์ .sketch2spec.json ที่สมบูรณ์") }
  const parsed = projectFile.safeParse(data)
  if (!parsed.success) throw new Error("ไฟล์โปรเจกต์ไม่ถูกต้อง กรุณาเลือกไฟล์ .sketch2spec.json ที่บันทึกจากแอป")
  const ids = parsed.data.project.detections.map(d => d.id)
  if (new Set(ids).size !== ids.length) throw new Error("ไฟล์โปรเจกต์มีรหัสวัตถุซ้ำกัน")
  return parsed.data.project
}

export function downloadProject(project: StoredProject) {
  const blob = new Blob([JSON.stringify({ format: "sketch2spec", version: 1, project }, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${project.fileName.replace(/\.[^.]+$/, "")}.sketch2spec.json`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
