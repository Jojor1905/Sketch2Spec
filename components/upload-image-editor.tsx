"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Crop, RotateCcw, RotateCw, X } from "lucide-react"

import { Button } from "@/components/ui/button"

type CropBox = {
  x: number
  y: number
  width: number
  height: number
}

type ImageEditorProps = {
  file: File
  onCancel: () => void
  onApply: (file: File, previewDataUrl: string, imageSize: { width: number; height: number }) => void
}

const MAX_OUTPUT_SIZE = 1800
const MIN_CROP_SIZE = 16

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function outputFileName(fileName: string) {
  const stem = fileName.replace(/\.[^/.]+$/, "") || "floor-plan"
  return `${stem}-edited.jpg`
}

export function ImageEditor({ file, onCancel, onApply }: ImageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)

  const [rotation, setRotation] = useState(0)
  const [cropBox, setCropBox] = useState<CropBox | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const image = imageRef.current

    if (!canvas || !image) return

    const normalizedRotation = ((rotation % 360) + 360) % 360
    const swapsSides = normalizedRotation === 90 || normalizedRotation === 270
    const rawWidth = swapsSides ? image.naturalHeight : image.naturalWidth
    const rawHeight = swapsSides ? image.naturalWidth : image.naturalHeight
    const scale = Math.min(1, MAX_OUTPUT_SIZE / Math.max(rawWidth, rawHeight))

    canvas.width = Math.max(1, Math.round(rawWidth * scale))
    canvas.height = Math.max(1, Math.round(rawHeight * scale))

    const context = canvas.getContext("2d")
    if (!context) return

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.save()
    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate((normalizedRotation * Math.PI) / 180)

    const drawWidth = image.naturalWidth * scale
    const drawHeight = image.naturalHeight * scale
    context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
    context.restore()

    setCropBox({ x: 0, y: 0, width: canvas.width, height: canvas.height })
  }, [rotation])

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    let active = true
    imageRef.current = null
    setIsLoading(true)
    setError(null)
    setCropBox(null)

    const image = new Image()
    image.onload = () => {
      if (!active) return
      imageRef.current = image
      setError(null)
      setIsLoading(false)
    }
    image.onerror = () => {
      if (!active) return
      setIsLoading(false)
      setError("ไม่สามารถเปิดรูปภาพนี้เพื่อแก้ไขได้")
    }
    image.src = objectUrl

    return () => {
      active = false
      image.onload = null
      image.onerror = null
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  useEffect(() => {
    if (!isLoading && imageRef.current) {
      renderCanvas()
    }
  }, [rotation, isLoading, renderCanvas])

  function pointerPosition(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    return {
      x: clamp((event.clientX - rect.left) * (canvas.width / rect.width), 0, canvas.width),
      y: clamp((event.clientY - rect.top) * (canvas.height / rect.height), 0, canvas.height),
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const start = pointerPosition(event)
    dragStartRef.current = start
    setCropBox({ x: start.x, y: start.y, width: 0, height: 0 })
    setIsSelecting(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isSelecting || !dragStartRef.current) return

    const current = pointerPosition(event)
    const start = dragStartRef.current
    setCropBox({
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
      width: Math.abs(current.x - start.x),
      height: Math.abs(current.y - start.y),
    })
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isSelecting) return

    setIsSelecting(false)
    dragStartRef.current = null

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    setCropBox((current) => {
      const canvas = canvasRef.current
      if (!canvas || !current) return current

      if (current.width < MIN_CROP_SIZE || current.height < MIN_CROP_SIZE) {
        return { x: 0, y: 0, width: canvas.width, height: canvas.height }
      }

      return current
    })
  }

  function applyEdit() {
    const sourceCanvas = canvasRef.current
    if (!sourceCanvas || !cropBox) return

    const sx = Math.round(clamp(cropBox.x, 0, sourceCanvas.width - 1))
    const sy = Math.round(clamp(cropBox.y, 0, sourceCanvas.height - 1))
    const sw = Math.max(1, Math.round(clamp(cropBox.width, 1, sourceCanvas.width - sx)))
    const sh = Math.max(1, Math.round(clamp(cropBox.height, 1, sourceCanvas.height - sy)))

    const outputCanvas = document.createElement("canvas")
    outputCanvas.width = sw
    outputCanvas.height = sh

    const context = outputCanvas.getContext("2d")
    if (!context) {
      setError("เบราว์เซอร์ไม่สามารถประมวลผลภาพได้")
      return
    }

    context.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh)

    outputCanvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("ไม่สามารถสร้างไฟล์ภาพหลังแก้ไขได้")
          return
        }

        const editedFile = new File([blob], outputFileName(file.name), {
          type: "image/jpeg",
          lastModified: Date.now(),
        })
        onApply(editedFile, outputCanvas.toDataURL("image/jpeg", 0.9), { width: sw, height: sh })
      },
      "image/jpeg",
      0.9,
    )
  }

  const cropStyle = cropBox && canvasRef.current
    ? {
        left: `${(cropBox.x / canvasRef.current.width) * 100}%`,
        top: `${(cropBox.y / canvasRef.current.height) * 100}%`,
        width: `${(cropBox.width / canvasRef.current.width) * 100}%`,
        height: `${(cropBox.height / canvasRef.current.height) * 100}%`,
      }
    : undefined

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold">Crop & Rotate</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              ลากบนรูปเพื่อเลือกพื้นที่ที่ต้องการเก็บไว้ จากนั้นกดใช้รูปนี้
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="rounded-xl" onClick={onCancel}>
            <X className="h-5 w-5" />
            <span className="sr-only">Close editor</span>
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-secondary/50 p-4 sm:p-6">
          {isLoading && (
            <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
              กำลังเตรียมรูปภาพ...
            </div>
          )}

          {error && (
            <div className="flex min-h-[420px] items-center justify-center text-sm text-destructive">
              {error}
            </div>
          )}

          {!error && (
            <div className="mx-auto w-fit max-w-full">
              <div className="relative select-none overflow-hidden rounded-2xl bg-white shadow-xl">
                <canvas
                  ref={canvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className={`block max-h-[62vh] max-w-full touch-none ${isLoading ? "hidden" : "cursor-crosshair"}`}
                />
                {!isLoading && cropStyle && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute border-2 border-primary shadow-[0_0_0_9999px_rgba(15,23,42,0.48)]"
                    style={cropStyle}
                  >
                    <span className="absolute -left-1 -top-1 h-3 w-3 rounded-full bg-primary" />
                    <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-primary" />
                    <span className="absolute -bottom-1 -left-1 h-3 w-3 rounded-full bg-primary" />
                    <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-primary" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setRotation((value) => value - 90)} disabled={isLoading || Boolean(error)}>
              <RotateCcw className="mr-2 h-4 w-4" />
              หมุนซ้าย
            </Button>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setRotation((value) => value + 90)} disabled={isLoading || Boolean(error)}>
              <RotateCw className="mr-2 h-4 w-4" />
              หมุนขวา
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="rounded-xl"
              onClick={() => {
                const canvas = canvasRef.current
                if (canvas) setCropBox({ x: 0, y: 0, width: canvas.width, height: canvas.height })
              }}
              disabled={isLoading || Boolean(error)}
            >
              <Crop className="mr-2 h-4 w-4" />
              ใช้ทั้งภาพ
            </Button>
          </div>

          <div className="flex gap-2 sm:justify-end">
            <Button type="button" variant="ghost" className="flex-1 rounded-xl sm:flex-none" onClick={onCancel}>
              ยกเลิก
            </Button>
            <Button type="button" className="flex-1 rounded-xl sm:flex-none" onClick={applyEdit} disabled={isLoading || !cropBox || Boolean(error)}>
              ใช้รูปนี้
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
