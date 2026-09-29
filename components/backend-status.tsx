"use client"

import { useCallback, useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"

const API_URL = process.env.NEXT_PUBLIC_DETECTION_API_URL ?? "http://localhost:8000"

export function BackendStatus() {
  const [status, setStatus] = useState<"checking" | "ready" | "offline" | "degraded">("checking")
  const check = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`${API_URL}/health`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000), cache: "no-store" })
      if (!response.ok) throw new Error("Unavailable")
      const data = await response.json()
      if (!signal?.aborted) setStatus(data.status === "ok" && data.model_ready ? "ready" : "degraded")
    } catch {
      if (!signal?.aborted) setStatus("offline")
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    void check(controller.signal)
    const timer = window.setInterval(() => void check(controller.signal), 30000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [check])
  const labels = { checking: "กำลังตรวจ AI", ready: "AI พร้อมเชื่อมต่อ", offline: "ยังเชื่อมต่อ AI ไม่ได้", degraded: "AI ยังไม่พร้อม" }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" role="status" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${status === "ready" ? "bg-emerald-600" : status === "checking" ? "bg-slate-400" : "bg-amber-500"}`} />
      <span className="text-muted-foreground">{labels[status]}</span>
      {(status === "offline" || status === "degraded") && <>
        <span className="text-muted-foreground">เปิด AI บนเครื่องแล้วลองอีกครั้ง</span>
        <button type="button" onClick={() => void check()} className="rounded-md p-1 text-primary hover:bg-primary/10" aria-label="ตรวจการเชื่อมต่อ AI อีกครั้ง"><RefreshCw className="h-3.5 w-3.5" /></button>
      </>}
    </div>
  )
}
