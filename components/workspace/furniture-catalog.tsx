"use client"

import { useMemo, useState } from "react"
import { X } from "lucide-react"
import { FURNITURE_CATALOG, FURNITURE_CATEGORIES, type FurnitureCategory, type FurnitureCatalogItem } from "@/lib/furniture"

type Props = {
  selectedId: string | null
  onSelect: (item: FurnitureCatalogItem) => void
  onClose: () => void
}

export function FurnitureCatalog({ selectedId, onSelect, onClose }: Props) {
  const [category, setCategory] = useState<FurnitureCategory>("All")
  const [query, setQuery] = useState("")
  const items = useMemo(() => FURNITURE_CATALOG.filter(item =>
    (category === "All" || item.category === category) &&
    item.name.toLowerCase().includes(query.trim().toLowerCase()),
  ), [category, query])

  return <aside aria-label="Furniture Catalog" className="absolute bottom-3 left-20 top-3 z-40 flex w-[min(320px,calc(100%-100px))] flex-col overflow-hidden rounded-2xl border border-white/80 bg-white/96 shadow-2xl backdrop-blur-md sm:w-[340px]">
    <div className="flex items-start justify-between border-b px-4 py-3">
      <div><h3 className="text-sm font-semibold">Furniture</h3><p className="text-[11px] text-muted-foreground">Choose a piece, then click the floor.</p></div>
      <button type="button" aria-label="Close Furniture Catalog" title="Close Furniture Catalog" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary"><X aria-hidden="true" className="h-4 w-4" /></button>
    </div>
    <div className="p-3 pb-0">
      <input aria-label="Search furniture" placeholder="Search furniture…" value={query} onChange={event => setQuery(event.target.value)} className="w-full rounded-lg border px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary" />
      <div className="mt-2 flex gap-1 overflow-x-auto pb-2" aria-label="Furniture categories">
        {FURNITURE_CATEGORIES.map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)} className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] focus-visible:outline-2 focus-visible:outline-primary ${category === value ? "border-primary bg-primary text-white" : "border-slate-200 hover:bg-slate-100"}`}>{value}</button>)}
      </div>
    </div>
    <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto p-3 pt-1">
      {items.map(item => <button key={item.id} type="button" aria-label={`Place ${item.name}`} aria-pressed={selectedId === item.id} onClick={() => onSelect(item)} className={`self-start overflow-hidden rounded-xl border text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selectedId === item.id ? "border-primary ring-2 ring-primary/20" : "border-slate-200 hover:border-primary/50"}`}>
        <img src={item.thumbnail} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
        <span className="block px-2.5 pb-2.5 pt-1.5"><span className="block truncate text-xs font-semibold">{item.name}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{Math.round(item.widthM * 100)} × {Math.round(item.depthM * 100)} cm</span></span>
      </button>)}
      {!items.length && <p className="col-span-2 py-8 text-center text-xs text-muted-foreground">No furniture matches this search.</p>}
    </div>
  </aside>
}
