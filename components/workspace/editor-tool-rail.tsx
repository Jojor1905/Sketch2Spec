"use client"

import { DoorOpen, Ellipsis, Footprints, Grid2X2, Layers3, MousePointer2, Paintbrush, PanelTop, RectangleHorizontal, RotateCw, Sofa, SquareDashed } from "lucide-react"

type Tool = "orbit" | "walk" | "select" | "wall" | "room" | "floor" | "ceiling" | "furniture" | "door" | "window"

type Props = {
  activeTool: Tool
  materialsOpen: boolean
  advancedOpen: boolean
  onTool: (tool: Tool) => void
  onMaterials: () => void
  onAdvanced: () => void
  focusMode?: boolean
  mode?: "2d" | "3d"
}

const primary = [
  { key: "orbit", label: "Orbit", icon: RotateCw },
  { key: "walk", label: "Walk", icon: Footprints },
  { key: "select", label: "Select", icon: MousePointer2 },
  { key: "wall", label: "Add wall", icon: SquareDashed },
  { key: "door", label: "Add door", icon: DoorOpen },
  { key: "window", label: "Add window", icon: PanelTop },
] as const

const advanced = [
  { key: "room", label: "Draw room", icon: RectangleHorizontal },
  { key: "floor", label: "Draw floor", icon: Grid2X2 },
  { key: "ceiling", label: "Add ceiling", icon: Layers3 },
  { key: "furniture", label: "Add furniture", icon: Sofa },
] as const

export function EditorToolRail({ activeTool, materialsOpen, advancedOpen, onTool, onMaterials, onAdvanced, focusMode = false, mode = "3d" }: Props) {
  const walkOnly = focusMode && activeTool === "walk"
  const visiblePrimary = mode === "2d" ? primary.filter(item => ["select", "wall", "door", "window"].includes(item.key)) : primary
  return (
    <nav aria-label={focusMode ? "Focus editor tools" : "3D editor tools"} className={`absolute left-3 z-[60] flex w-14 flex-col gap-1 rounded-2xl border border-white/80 bg-white/95 p-1.5 shadow-xl backdrop-blur-md ${focusMode ? "top-16" : "top-3"}`}>
      {!walkOnly && visiblePrimary.map(({ key, label, icon: Icon }) => (
        <button key={key} type="button" title={label} aria-label={label} aria-pressed={activeTool === key}
          onClick={() => onTool(key)}
          className={`flex h-11 w-11 items-center justify-center rounded-xl border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${activeTool === key ? "border-primary bg-primary/10 text-primary" : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-100"}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </button>
      ))}
      {!walkOnly && <div className="my-1 border-t border-slate-200" />}
      <button type="button" title="Materials" aria-label="Materials" aria-pressed={materialsOpen} onClick={onMaterials}
        className={`flex h-11 w-11 items-center justify-center rounded-xl border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${materialsOpen ? "border-primary bg-primary/10 text-primary" : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-100"}`}>
        <Paintbrush aria-hidden="true" className="h-5 w-5" />
      </button>
      {!walkOnly && <button type="button" title={mode === "2d" ? "More details" : "More tools"} aria-label={mode === "2d" ? "More details" : "More tools"} aria-expanded={advancedOpen} onClick={onAdvanced}
        className={`flex h-11 w-11 items-center justify-center rounded-xl border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${advancedOpen ? "border-primary bg-primary/10 text-primary" : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-100"}`}>
        <Ellipsis aria-hidden="true" className="h-5 w-5" />
      </button>}
      {mode === "3d" && !walkOnly && advancedOpen && advanced.map(({ key, label, icon: Icon }) => (
        <button key={key} type="button" title={label} aria-label={label} aria-pressed={activeTool === key} onClick={() => onTool(key)}
          className={`flex h-11 w-11 items-center justify-center rounded-xl border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${activeTool === key ? "border-primary bg-primary/10 text-primary" : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-100"}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </button>
      ))}
    </nav>
  )
}
