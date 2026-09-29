"use client"

import { floorBoxes, roomWallFaces, type PaintScope } from "@/lib/rooms"
import type { Detection, WallSide } from "@/lib/floor-plan"

export type RoomSurface = { wallId: string; side: WallSide; start: number; end: number }

export function WallPaintPicker({ rooms, detections, room, scope, selectedId, side, position, onRoom, onScope, onSurface, onRebuild }: {
  rooms: Detection[]; detections: Detection[]; room: Detection | null; scope: PaintScope
  selectedId: string | null; side: WallSide; position?: number
  onRoom: (id: string) => void; onScope: (scope: PaintScope) => void
  onSurface: (surface: RoomSurface) => void; onRebuild: () => void
}) {
  const surfaces = room ? detections.flatMap(wall => roomWallFaces(room,wall).map(face=>({ ...face, wallId:wall.id, box:wall.box }))) : []
  const active = (surface: RoomSurface) => scope==="face" && selectedId===surface.wallId && side===surface.side && position!==undefined && position>=surface.start && position<=surface.end
  const direction = (f: typeof surfaces[number]) => f.box.width>=f.box.height ? (f.side==="positive"?"ด้านบน":"ด้านล่าง") : (f.side==="positive"?"ด้านซ้าย":"ด้านขวา")
  const b=room?.box
  const padding=b ? Math.max(b.width,b.height)*.18 : 1
  const radius=b ? Math.max(b.width,b.height)*.12 : 1
  return <section className="mt-3 space-y-3 rounded-xl border bg-slate-50 p-3" aria-label="เลือกผนังที่จะทาสี">
    <p className="text-sm font-semibold">1. เลือกบริเวณที่จะทา</p>
    <div className="grid grid-cols-3 gap-1" role="group" aria-label="ทาสีผนังแบบไหน">
      {([{scope:"room",label:"ทั้งห้อง"},{scope:"face",label:"ผนังเดียว"},{scope:"all",label:"ทั้งแปลน"}] as const).map(option=><button key={option.scope} type="button" aria-pressed={scope===option.scope} onClick={()=>onScope(option.scope)} className={`rounded-lg border px-1 py-2 text-xs font-medium ${scope===option.scope?"border-primary bg-primary text-white":"bg-white"}`}>{option.label}</button>)}
    </div>
    {(scope==="room" || scope==="face") && <>
      <label className="block text-xs font-medium">ห้องที่จะทาสี
        <select aria-label="ห้องที่จะทาสีผนัง" value={room?.id ?? ""} onChange={e=>onRoom(e.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2">
          <option value="" disabled>เลือกห้อง</option>
          {rooms.map((r,i)=><option key={r.id} value={r.id}>{r.roomName ?? `ห้อง ${i+1}`}</option>)}
        </select>
      </label>
      {room && b && <>
        <p className="text-xs text-muted-foreground">{scope==="room"?"ทาผนังด้านในทุกด้านของห้องนี้":"กดหมายเลขบนภาพ หรือปุ่มด้านล่างเพื่อเลือกผนัง"}</p>
        <svg viewBox={`${b.x1-padding} ${b.y1-padding} ${b.width+padding*2} ${b.height+padding*2}`} className="h-28 w-full rounded-lg border bg-white" aria-label={`ผนังของ${room.roomName ?? "ห้อง"}`}>
          {floorBoxes(room).map((tile,i)=><rect key={i} x={tile.x1} y={tile.y1} width={tile.width} height={tile.height} fill="#f3e8ff" />)}
          {surfaces.map((f,i)=>{
            const horizontal=f.box.width>=f.box.height
            const length=horizontal?f.box.width:f.box.height
            const start=(horizontal?f.box.x1:f.box.y1)+f.start*length
            const end=(horizontal?f.box.x1:f.box.y1)+f.end*length
            const cross=horizontal?(f.side==="positive"?f.box.y2:f.box.y1):(f.side==="positive"?f.box.x2:f.box.x1)
            const x=horizontal?(start+end)/2:cross, y=horizontal?cross:(start+end)/2
            const selected=scope==="room" || active(f)
            return <g key={`${f.wallId}:${f.side}:${f.start}`} role="button" tabIndex={0} aria-label={`เลือกผนัง ${i+1} ${direction(f)}`} aria-pressed={active(f)} onClick={()=>onSurface(f)} onKeyDown={e=>{if(e.key==="Enter" || e.key===" "){e.preventDefault();onSurface(f)}}} className="cursor-pointer outline-none focus:opacity-60">
              <line x1={horizontal?start:cross} y1={horizontal?cross:start} x2={horizontal?end:cross} y2={horizontal?cross:end} stroke="transparent" strokeWidth={radius*3} />
              <line x1={horizontal?start:cross} y1={horizontal?cross:start} x2={horizontal?end:cross} y2={horizontal?cross:end} stroke={selected?"#9333ea":"#94a3b8"} strokeWidth={radius*.65} />
              <circle cx={x} cy={y} r={radius} fill={selected?"#9333ea":"#475569"} />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={radius*1.2} pointerEvents="none">{i+1}</text>
            </g>
          })}
        </svg>
        {scope==="face" && <div className="grid grid-cols-2 gap-1">
          {surfaces.map((f,i)=><button type="button" key={`${f.wallId}:${f.side}:${f.start}`} aria-pressed={active(f)} onClick={()=>onSurface(f)} className={`min-h-10 rounded-lg border p-2 text-left text-xs ${active(f)?"border-purple-500 bg-purple-50 text-purple-800":"bg-white"}`}>{i+1}. {direction(f)}</button>)}
        </div>}
        {!surfaces.length && <p role="status" className="text-xs text-amber-700">ยังหาผนังที่ติดห้องนี้ไม่พบ กดแบ่งพื้นตามห้องใหม่ หรือแก้แนวผนังที่ขาดก่อน</p>}
      </>}
      {!rooms.length && <p className="text-xs text-amber-700">ต้องแบ่งห้องก่อนจึงเลือกผนังรายห้องได้</p>}
      {(!rooms.length || !surfaces.length) && <button type="button" onClick={onRebuild} className="rounded-lg border bg-white px-3 py-2 text-xs">แบ่งพื้นตามห้อง</button>}
    </>}
    {scope==="all" && <p className="text-xs text-amber-700">ทาทุกผนังทั้งสองฝั่ง รวมด้านนอกบ้าน</p>}
    {scope==="selected" && <p className="text-xs">ทาผนังชิ้นที่เลือกทั้งสองฝั่ง</p>}
    {scope==="face" && surfaces.length>0 && !surfaces.some(active) && <p role="status" className="text-xs text-amber-700">เลือกหมายเลขผนังด้านในห้องนี้ก่อนทาสี</p>}
    <p className="text-[11px] text-purple-700">สีม่วงในโมเดลแสดงบริเวณที่จะทา</p>
    <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">ตัวเลือกเพิ่มเติม</summary>
      <button type="button" disabled={!selectedId || !detections.some(d=>d.id===selectedId && d.label.toLowerCase().includes("wall"))} onClick={()=>onScope("selected")} className="mt-2 rounded-lg border bg-white p-2 disabled:opacity-40">ทาผนังชิ้นที่เลือกทั้งสองฝั่ง</button>
    </details>
  </section>
}
