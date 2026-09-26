"use client"

import { materialsFor, type MaterialTarget } from "@/lib/materials"

const categories = ["floor", "wall", "door", "window", "ceiling"] as const

type Props = {
  target: MaterialTarget
  selectedTarget: MaterialTarget | null
  currentMaterialId?: string
  search: string
  onTarget: (target: MaterialTarget) => void
  onSearch: (value: string) => void
  onPreview: (materialId: string | null) => void
  onApply: (materialId: string) => void
  onClose: () => void
}

/** Compact catalog presentation over the same canonical detections as the normal editor. */
export function FocusMaterialPanel({ target, selectedTarget, currentMaterialId, search, onTarget, onSearch, onPreview, onApply, onClose }: Props) {
  const materials = materialsFor(target).filter(material =>
    `${material.name} ${material.description} ${material.product?.brand ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  )

  return <div aria-label="Focus material catalog" className="absolute left-20 top-16 z-[65] max-h-[min(620px,calc(100%-80px))] w-[min(320px,calc(100%-92px))] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-md">
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm font-semibold">Materials</p>
      <button type="button" aria-label="Close materials" title="Close materials" className="rounded-lg px-2 py-1 text-xs hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary" onClick={onClose}>Close</button>
    </div>
    <p className="mt-1 text-[11px] text-slate-500">Select an object, then choose its finish.</p>
    <input type="search" aria-label="Search focus materials" placeholder="Search materials" value={search} onChange={event => onSearch(event.target.value)} className="mt-3 h-9 w-full rounded-lg border px-2 text-xs focus-visible:outline-2 focus-visible:outline-primary" />
    <div className="mt-3 flex flex-wrap gap-1">
      {categories.map(category => <button key={category} type="button" aria-pressed={target === category} className={`rounded-lg border px-2 py-1 text-[11px] capitalize focus-visible:outline-2 focus-visible:outline-primary ${target === category ? "border-primary bg-primary/10 text-primary" : "hover:bg-slate-100"}`} onClick={() => onTarget(category)}>{category}</button>)}
    </div>
    <div className="mt-3 space-y-1.5">
      {materials.map(material => <button key={material.id} type="button" data-material-id={material.id} aria-label={`Apply ${material.name}`} disabled={selectedTarget !== target} aria-pressed={currentMaterialId === material.id} onMouseEnter={() => onPreview(material.id)} onMouseLeave={() => onPreview(null)} onFocus={() => onPreview(material.id)} onBlur={() => onPreview(null)} onClick={() => onApply(material.id)} className="flex w-full items-center gap-2 rounded-xl border p-2 text-left text-xs hover:border-primary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
        <span className="h-9 w-9 shrink-0 rounded-md border" style={{ background: material.color, backgroundImage: material.previewImage ? `url(${material.previewImage})` : undefined, backgroundSize: "cover" }} />
        <span className="min-w-0"><span className="block truncate font-medium">{material.name}</span><span className="block text-[10px] text-slate-500">{material.product?.brand ?? "Sketch2Spec"} · {material.price === null ? "Price unavailable" : `Reference ฿${material.price.toLocaleString()}/${material.unit}`}</span></span>
      </button>)}
    </div>
  </div>
}
