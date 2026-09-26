"use client"

import { useEffect, useState } from "react"
import { Copy, EyeOff, Maximize2, Move3D, Paintbrush, RotateCw, SlidersHorizontal, Star, Trash2 } from "lucide-react"
import { availableContextActions, type ContextAction, type ContextEntity } from "@/lib/context-actions"

const icon = {
  move: Move3D,
  rotate: RotateCw,
  resize: Maximize2,
  duplicate: Copy,
  favorite: Star,
  hide: EyeOff,
  delete: Trash2,
  paint: Paintbrush,
  details: SlidersHorizontal,
} satisfies Record<ContextAction, typeof Move3D>

type Props = {
  entity: ContextEntity
  context: string
  walk: boolean
  canPaint: boolean
  favorite: boolean
  rotationDegrees: number
  activeAction: "select" | "move" | "resize" | "material"
  materialsOpen: boolean
  onAction: (action: ContextAction) => void
  onRotate: (degrees: number) => void
}

export function ObjectContextMenu({ entity, context, walk, canPaint, favorite, rotationDegrees, activeAction, materialsOpen, onAction, onRotate }: Props) {
  const [rotationOpen, setRotationOpen] = useState(false)
  const [rotationDraft, setRotationDraft] = useState(rotationDegrees.toFixed(0))
  useEffect(() => { setRotationDraft(rotationDegrees.toFixed(0)) }, [rotationDegrees])
  const actions = availableContextActions(entity, walk, canPaint)
  if (!actions.length) return null

  function commitRotation(degrees = Number(rotationDraft)) {
    if (!Number.isFinite(degrees)) return
    onRotate(degrees)
    setRotationDraft(degrees.toFixed(0))
  }

  return <div role="menu" aria-label={`${entity === "furniture" ? "Furniture" : entity === "wall" ? "Wall" : "Floor"} actions`} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} className={`rounded-2xl border border-white/80 bg-white/96 p-2.5 text-slate-800 shadow-2xl backdrop-blur-md ${entity === "furniture" && !walk ? "w-[280px]" : "w-max max-w-[280px]"}`}>
    <p className="max-w-[255px] truncate px-1 text-[11px] font-semibold">{entity === "furniture" ? "Object" : entity === "wall" ? "Wall" : "Floor"}</p>
    <p className="max-w-[255px] truncate px-1 text-[10px] text-slate-500" title={context}>{context}</p>
    <div className={`mt-2 grid gap-1 ${actions.length === 1 ? "grid-cols-1" : actions.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
      {actions.map(action => {
        const Icon = icon[action]
        const label = action === "favorite" && favorite ? "Remove favorite" : action.charAt(0).toUpperCase() + action.slice(1)
        const pressed = action === "favorite" ? favorite : action === "rotate" ? rotationOpen : action === "paint" ? materialsOpen : action === activeAction
        return <button key={action} type="button" role={action === "favorite" ? "menuitemcheckbox" : "menuitem"} aria-label={label} title={label} aria-checked={action === "favorite" ? favorite : undefined} data-active={pressed} className={`flex min-w-0 flex-col items-center gap-1 rounded-xl p-1 text-[10px] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${pressed ? "bg-primary/10 text-primary" : "hover:bg-slate-100"} ${action === "delete" ? "text-red-700" : ""}`} onClick={() => {
          if (action === "rotate") setRotationOpen(open => !open)
          else { setRotationOpen(false); onAction(action) }
        }}>
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm"><Icon aria-hidden="true" className="h-4 w-4" /></span>
          <span className="truncate">{action === "favorite" ? "Favorite" : label}</span>
        </button>
      })}
    </div>
    {rotationOpen && <div className="mt-2 flex items-end gap-1 border-t pt-2 text-[10px]">
      <button type="button" aria-label="Rotate left 15 degrees" title="Rotate left 15 degrees" className="h-8 rounded-lg border px-2 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary" onClick={() => commitRotation(rotationDegrees - 15)}>−15°</button>
      <label className="min-w-0 flex-1">Degrees<input type="number" aria-label="Object rotation degrees" value={rotationDraft} onChange={event => setRotationDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") commitRotation() }} className="mt-0.5 h-8 w-full rounded-lg border px-1.5 text-xs focus-visible:outline-2 focus-visible:outline-primary" /></label>
      <button type="button" aria-label="Apply object rotation" title="Apply object rotation" className="h-8 rounded-lg border px-2 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary" onClick={() => commitRotation()}>Apply</button>
      <button type="button" aria-label="Rotate right 15 degrees" title="Rotate right 15 degrees" className="h-8 rounded-lg border px-2 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary" onClick={() => commitRotation(rotationDegrees + 15)}>+15°</button>
    </div>}
  </div>
}
