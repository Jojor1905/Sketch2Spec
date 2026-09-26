import { boxFromEdges, clampBox, type DetectionBox, type ImageSize } from "./floor-plan"

/** Wall thickness is the short axis of the canonical detection box, in image pixels. */
export function wallThicknessPx(box: DetectionBox) {
  return box.width >= box.height ? box.height : box.width
}

/** Keep the short axis usable without letting it flip the wall's orientation. */
export function resizeWallThicknessAroundCenter(
  box: DetectionBox,
  targetThicknessPx: number,
  imageSize: ImageSize,
) {
  const horizontal = box.width >= box.height
  const length = horizontal ? box.width : box.height
  const maximum = Math.max(4, Math.min(length - 1, Math.min(imageSize.width, imageSize.height) * 0.35))
  const thickness = Math.min(Math.max(targetThicknessPx, 4), maximum)

  if (horizontal) {
    const center = (box.y1 + box.y2) / 2
    return clampBox(boxFromEdges(box.x1, center - thickness / 2, box.x2, center + thickness / 2), imageSize, 4)
  }
  const center = (box.x1 + box.x2) / 2
  return clampBox(boxFromEdges(center - thickness / 2, box.y1, center + thickness / 2, box.y2), imageSize, 4)
}
