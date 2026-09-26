"use client"

import { Box, DoorOpen, Footprints, Home, Maximize2, Minimize2, MousePointer2, Move3D, PanelTop, Plus, Redo2, RotateCw, ScanSearch, SquareDashed, Undo2 } from "lucide-react"
import { useState } from "react"

type Props = {
  view: "2d" | "3d"
  onExit: () => void
  onView: (view: "2d" | "3d") => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  walkActive?: boolean
  onWalkToggle?: () => void
  toolLabel?: string
  activeAction?: "select" | "move" | "resize" | "material"
  onAction?: (action: "select" | "move" | "resize") => void
  onAdd?: (kind: "wall" | "door" | "window") => void
  canManipulate?: boolean
  onResetCamera?: () => void
  cameraView?: "plan" | "perspective"
  onCameraViewToggle?: () => void
}

const button = "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40"

export function FocusToolbar({ view, onExit, onView, onUndo, onRedo, canUndo, canRedo, walkActive, onWalkToggle, toolLabel, activeAction, onAction, onAdd, canManipulate, onResetCamera, cameraView, onCameraViewToggle }: Props) {
  const [addOpen, setAddOpen] = useState(false)
  return <div role="toolbar" aria-label="Focus workspace controls" onKeyDown={event => { if (event.key === "Escape" && addOpen) { event.preventDefault(); event.stopPropagation(); setAddOpen(false) } }} className="absolute left-1/2 top-3 z-[70] flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 flex-nowrap items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-xl backdrop-blur-md">
    <button type="button" className={`${button} bg-primary/10 text-primary hover:bg-primary/15`} aria-label="Exit Focus Mode" aria-keyshortcuts="F Escape" title="Exit Focus Mode (F or Esc)" onClick={onExit}>
      <Minimize2 aria-hidden="true" className="h-4 w-4" /><span className="hidden sm:inline">Exit Focus</span>
    </button>
    <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-slate-200" />
    <button type="button" className={button} aria-label="Undo" title="Undo" onClick={onUndo} disabled={!canUndo}><Undo2 aria-hidden="true" className="h-4 w-4" /></button>
    <button type="button" className={button} aria-label="Redo" title="Redo" onClick={onRedo} disabled={!canRedo}><Redo2 aria-hidden="true" className="h-4 w-4" /></button>
    <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-slate-200" />
    <button type="button" className={`${button} ${view === "2d" ? "bg-primary text-white hover:bg-primary/90" : ""}`} aria-label="2D Review" title="2D Review" aria-pressed={view === "2d"} onClick={() => onView("2d")}><ScanSearch aria-hidden="true" className="h-4 w-4" /><span className="hidden sm:inline">2D</span></button>
    <button type="button" className={`${button} ${view === "3d" ? "bg-primary text-white hover:bg-primary/90" : ""}`} aria-label="3D Editor" title="3D Editor" aria-pressed={view === "3d"} onClick={() => onView("3d")}><Box aria-hidden="true" className="h-4 w-4" /><span className="hidden sm:inline">3D</span></button>
    {onWalkToggle && <button type="button" className={`${button} ${walkActive ? "bg-primary text-white hover:bg-primary/90" : ""}`} aria-label={walkActive ? "Exit Walk Mode" : "Enter Walk Mode"} title={walkActive ? "Exit Walk Mode" : "Enter Walk Mode"} aria-pressed={Boolean(walkActive)} onClick={onWalkToggle}><Footprints aria-hidden="true" className="h-4 w-4" /><span className="hidden sm:inline">Walk</span></button>}
    {!walkActive && onCameraViewToggle && <button type="button" className={button} aria-label={cameraView === "plan" ? "Perspective camera" : "Top view camera"} title={cameraView === "plan" ? "Perspective camera" : "Top view camera"} onClick={onCameraViewToggle}>{cameraView === "plan" ? <RotateCw aria-hidden="true" className="h-4 w-4" /> : <ScanSearch aria-hidden="true" className="h-4 w-4" />}</button>}
    {!walkActive && (onAction || onAdd) && <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-slate-200" />}
    {!walkActive && onAction && <>
      {([{ key: "select", label: "Select", icon: MousePointer2 }, { key: "move", label: "Move", icon: Move3D }, { key: "resize", label: "Resize", icon: Maximize2 }] as const).map(({ key, label, icon: Icon }) => <button key={key} type="button" className={`${button} ${activeAction === key ? "bg-primary/10 text-primary" : ""}`} aria-label={label} title={label} aria-pressed={activeAction === key} disabled={key !== "select" && !canManipulate} onClick={() => onAction(key)}><Icon aria-hidden="true" className="h-4 w-4" /><span className="hidden xl:inline">{label}</span></button>)}
    </>}
    {!walkActive && onAdd && <div className="relative">
      <button type="button" className={button} aria-label="Add object" title="Add object" aria-expanded={addOpen} onClick={() => setAddOpen(open => !open)}><Plus aria-hidden="true" className="h-4 w-4" /><span className="hidden sm:inline">Add</span></button>
      {addOpen && <div role="menu" aria-label="Add objects" className="absolute right-0 top-11 z-[80] min-w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">{([{ key: "wall", label: "Wall", icon: SquareDashed }, { key: "door", label: "Door", icon: DoorOpen }, { key: "window", label: "Window", icon: PanelTop }] as const).map(({ key, label, icon: Icon }) => <button key={key} role="menuitem" type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary" onClick={() => { onAdd(key); setAddOpen(false) }}><Icon aria-hidden="true" className="h-4 w-4" />{label}</button>)}</div>}
    </div>}
    {!walkActive && onResetCamera && <button type="button" className={button} aria-label="Reset camera" title="Reset camera" onClick={onResetCamera}><Home aria-hidden="true" className="h-4 w-4" /></button>}
    {toolLabel && <span className="hidden max-w-28 truncate border-l border-slate-200 pl-2 text-[11px] text-slate-600 lg:inline" title={toolLabel}>{toolLabel}</span>}
  </div>
}
