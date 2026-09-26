import { labelKind, type Detection, type ImageSize, type WallSide } from "./floor-plan"
import { roomWallFaces, wallFaceIntervalAt } from "./rooms"

export type WallSurface = {
  wallId: string
  side: WallSide
  position: number
  start: number
  end: number
  roomId: string | null
  roomName: string | null
  context: "interior" | "exterior"
}

export type SurfaceRayHit = {
  point: { x: number; y: number; z: number }
  normal?: { x: number; y: number; z: number }
  uv?: { x: number; y: number }
}

/** The event normal must already be transformed into world coordinates. */
export function wallSideFromNormal(wall: Detection, normal: { x: number; z: number }): WallSide | null {
  if (labelKind(wall.label) !== "wall") return null
  const cross = wall.box.width >= wall.box.height ? normal.z : normal.x
  if (Math.abs(cross) <= 0.5) return null
  return cross > 0 ? "positive" : "negative"
}

export function wallPositionFromHit(
  wall: Detection,
  point: { x: number; z: number },
  imageSize: ImageSize,
  worldScale: number,
): number {
  const horizontal = wall.box.width >= wall.box.height
  const coordinate = horizontal
    ? point.x / worldScale + imageSize.width / 2
    : point.z / worldScale + imageSize.height / 2
  const start = horizontal ? wall.box.x1 : wall.box.y1
  const length = horizontal ? wall.box.width : wall.box.height
  return length > 0 ? Math.max(0, Math.min(1, (coordinate - start) / length)) : 0
}

/** Resolve the exact clicked span; unmatched face area is exterior. */
export function resolveWallSurface(
  wall: Detection,
  side: WallSide,
  position: number,
  rooms: Detection[],
): WallSurface {
  for (const room of rooms) {
    if (labelKind(room.label) !== "floor") continue
    const face = roomWallFaces(room, wall).find((candidate) =>
      candidate.side === side && position >= candidate.start - 1e-6 && position <= candidate.end + 1e-6,
    )
    if (face) return {
      wallId: wall.id, side, position, start: face.start, end: face.end,
      roomId: room.id, roomName: room.roomName ?? null, context: "interior",
    }
  }
  const exterior = wallFaceIntervalAt(rooms, wall, side, position)
  return {
    wallId: wall.id, side, position, start: exterior.start, end: exterior.end,
    roomId: null, roomName: null, context: "exterior",
  }
}
