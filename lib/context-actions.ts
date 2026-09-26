import { labelKind, type Detection } from "./floor-plan"

export type ContextEntity = "furniture" | "wall" | "floor"
export type ContextAction = "move" | "rotate" | "resize" | "duplicate" | "favorite" | "hide" | "delete" | "paint" | "details"

export function contextEntityFor(detection: Detection | null): ContextEntity | null {
  if (!detection) return null
  const kind = labelKind(detection.label)
  if (kind === "furniture" || kind === "object") return "furniture"
  if (kind === "wall" || kind === "floor") return kind
  return null
}

export function availableContextActions(entity: ContextEntity, walk: boolean, canPaint = true): ContextAction[] {
  if (walk) return canPaint ? ["paint"] : []
  if (entity === "furniture") return canPaint
    ? ["move", "rotate", "resize", "duplicate", "favorite", "hide", "delete", "paint"]
    : ["move", "rotate", "resize", "duplicate", "favorite", "hide", "delete"]
  if (entity === "wall") return ["duplicate", "paint", "hide", "details"]
  return ["paint", "hide", "details"]
}
