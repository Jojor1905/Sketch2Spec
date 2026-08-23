import { labelKind, type Detection, type DetectionBox, type ImageSize } from "@/lib/floor-plan"

export type FloorPlanIssue = {
  id: string
  severity: "warning" | "info"
  kind: "short-wall" | "duplicate-wall" | "wall-gap" | "floating-opening"
  message: string
  detectionIds: string[]
}

function orientation(box: DetectionBox) {
  return box.width >= box.height ? "horizontal" : "vertical"
}

function center(box: DetectionBox) {
  return { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 }
}

function pointToBoxDistance(x: number, y: number, box: DetectionBox) {
  const dx = Math.max(box.x1 - x, 0, x - box.x2)
  const dy = Math.max(box.y1 - y, 0, y - box.y2)
  return Math.hypot(dx, dy)
}

function intervalOverlap(a1: number, a2: number, b1: number, b2: number) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
}

export function analyzeFloorPlan(detections: Detection[], imageSize: ImageSize): FloorPlanIssue[] {
  const walls = detections.filter((item) => labelKind(item.label) === "wall")
  const openings = detections.filter((item) => {
    const kind = labelKind(item.label)
    return kind === "door" || kind === "window"
  })
  const issues: FloorPlanIssue[] = []
  const baseThreshold = Math.max(5, Math.max(imageSize.width, imageSize.height) * 0.008)

  for (const wall of walls) {
    const major = Math.max(wall.box.width, wall.box.height)
    const minor = Math.max(1, Math.min(wall.box.width, wall.box.height))
    if (major < Math.max(12, minor * 1.6)) {
      issues.push({
        id: `short-${wall.id}`,
        severity: "warning",
        kind: "short-wall",
        message: "ผนังสั้นผิดปกติ อาจเป็นกรอบตรวจจับที่ต้องลบหรือยืดเพิ่ม",
        detectionIds: [wall.id],
      })
    }
  }

  for (let index = 0; index < walls.length; index += 1) {
    const first = walls[index]
    const firstOrientation = orientation(first.box)
    const firstCenter = center(first.box)
    const firstThickness = Math.min(first.box.width, first.box.height)

    for (let otherIndex = index + 1; otherIndex < walls.length; otherIndex += 1) {
      const second = walls[otherIndex]
      const secondOrientation = orientation(second.box)
      const secondCenter = center(second.box)
      const secondThickness = Math.min(second.box.width, second.box.height)

      if (firstOrientation === secondOrientation) {
        const centerDistance = firstOrientation === "horizontal"
          ? Math.abs(firstCenter.y - secondCenter.y)
          : Math.abs(firstCenter.x - secondCenter.x)
        const lineTolerance = Math.max(baseThreshold, Math.min(firstThickness, secondThickness) * 0.45)
        if (centerDistance <= lineTolerance) {
          const overlap = firstOrientation === "horizontal"
            ? intervalOverlap(first.box.x1, first.box.x2, second.box.x1, second.box.x2)
            : intervalOverlap(first.box.y1, first.box.y2, second.box.y1, second.box.y2)
          const shorter = Math.max(
            1,
            Math.min(
              Math.max(first.box.width, first.box.height),
              Math.max(second.box.width, second.box.height),
            ),
          )
          if (overlap / shorter > 0.65) {
            issues.push({
              id: `duplicate-${first.id}-${second.id}`,
              severity: "warning",
              kind: "duplicate-wall",
              message: "พบผนังแนวเดียวกันซ้อนกัน ควรตรวจว่าต้องเก็บทั้งสองชิ้นหรือไม่",
              detectionIds: [first.id, second.id],
            })
          }
        }
      }

      const endpointsA = firstOrientation === "horizontal"
        ? [{ x: first.box.x1, y: firstCenter.y }, { x: first.box.x2, y: firstCenter.y }]
        : [{ x: firstCenter.x, y: first.box.y1 }, { x: firstCenter.x, y: first.box.y2 }]
      const endpointsB = secondOrientation === "horizontal"
        ? [{ x: second.box.x1, y: secondCenter.y }, { x: second.box.x2, y: secondCenter.y }]
        : [{ x: secondCenter.x, y: second.box.y1 }, { x: secondCenter.x, y: second.box.y2 }]

      let nearest = Number.POSITIVE_INFINITY
      for (const a of endpointsA) {
        for (const b of endpointsB) nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y))
      }
      if (nearest > 1 && nearest <= Math.max(baseThreshold * 1.8, (firstThickness + secondThickness) * 0.75)) {
        issues.push({
          id: `gap-${first.id}-${second.id}`,
          severity: "info",
          kind: "wall-gap",
          message: "ปลายผนังสองชิ้นอยู่ใกล้กันแต่ยังไม่เชื่อมสนิท",
          detectionIds: [first.id, second.id],
        })
      }
    }
  }

  for (const opening of openings) {
    const openingCenter = center(opening.box)
    const nearest = walls.reduce(
      (best, wall) => Math.min(best, pointToBoxDistance(openingCenter.x, openingCenter.y, wall.box)),
      Number.POSITIVE_INFINITY,
    )
    const threshold = Math.max(baseThreshold * 2.5, Math.max(opening.box.width, opening.box.height) * 0.8)
    if (!Number.isFinite(nearest) || nearest > threshold) {
      issues.push({
        id: `opening-${opening.id}`,
        severity: "warning",
        kind: "floating-opening",
        message: `${labelKind(opening.label) === "door" ? "ประตู" : "หน้าต่าง"}ยังไม่ยึดกับผนัง`,
        detectionIds: [opening.id],
      })
    }
  }

  return issues.slice(0, 30)
}
