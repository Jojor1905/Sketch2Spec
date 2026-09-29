"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DoorOpen, Ellipsis, Footprints, Grid2X2, MousePointer2, Paintbrush, PanelTop, RectangleHorizontal, RotateCw, Sofa, SquareDashed } from "lucide-react"

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
  { key: "furniture", label: "Add furniture", icon: Sofa },
] as const

export function EditorToolRail({ activeTool, materialsOpen, advancedOpen, onTool, onMaterials, onAdvanced, focusMode = false, mode = "3d" }: Props) {
  const walkOnly = focusMode && activeTool === "walk"
  const visiblePrimary = mode === "2d" ? primary.filter(item => ["select", "wall", "door", "window"].includes(item.key)) : primary
  const toolButton = (key: Tool, label: string, Icon: typeof RotateCw) => <Tooltip key={key}><TooltipTrigger asChild><button type="button" aria-label={label} aria-pressed={activeTool === key} onClick={() => onTool(key)} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border focus-visible:outline-2 focus-visible:outline-primary ${activeTool === key ? "border-primary bg-primary/10 text-primary" : "border-transparent text-slate-600 hover:bg-slate-100"}`}><Icon aria-hidden="true" className="h-5 w-5" /></button></TooltipTrigger><TooltipContent side="top" className="z-[120]">{label}</TooltipContent></Tooltip>
  return (
    <nav aria-label={focusMode ? "Focus editor tools" : "3D editor tools"} className="absolute bottom-3 left-1/2 z-[60] flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 flex-wrap justify-center gap-1 rounded-2xl border border-white/80 bg-white/95 p-1.5 shadow-xl backdrop-blur-md">
      {!walkOnly && visiblePrimary.map(({key,label,icon}) => toolButton(key,label,icon))}
      <Tooltip><TooltipTrigger asChild><button type="button" aria-label="Materials" aria-pressed={materialsOpen} onClick={onMaterials} className={`flex h-10 w-10 items-center justify-center rounded-xl border ${materialsOpen ? "border-primary bg-primary/10 text-primary" : "border-transparent hover:bg-slate-100"}`}><Paintbrush className="h-5 w-5" /></button></TooltipTrigger><TooltipContent side="top" className="z-[120]">วัสดุและสี</TooltipContent></Tooltip>
      {!walkOnly && <Tooltip><TooltipTrigger asChild><button type="button" aria-label={mode === "2d" ? "More details" : "More tools"} aria-expanded={advancedOpen} onClick={onAdvanced} className="flex h-10 w-10 items-center justify-center rounded-xl border border-transparent hover:bg-slate-100"><Ellipsis className="h-5 w-5" /></button></TooltipTrigger><TooltipContent side="top" className="z-[120]">เครื่องมือเพิ่มเติม</TooltipContent></Tooltip>}
      {mode === "3d" && !walkOnly && advancedOpen && <div className="absolute bottom-full mb-2 flex gap-1 rounded-2xl border bg-white p-1.5 shadow-lg">{advanced.map(({key,label,icon}) => toolButton(key,label,icon))}</div>}
    </nav>
  )
}
