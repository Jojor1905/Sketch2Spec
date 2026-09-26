"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { Vector2, Vector3, type PerspectiveCamera } from "three"
import { labelKind, type Detection, type ImageSize, type WallSide } from "@/lib/floor-plan"
import { wallPositionFromHit, wallSideFromNormal, type SurfaceRayHit } from "@/lib/surface-selection"
import { buildWalkCollision, canWalkAt, walkSpawn } from "@/lib/walk-collision"

type Props = {
  detections: Detection[]
  imageSize: ImageSize
  scale: number
  openingsByWall: Map<string, Detection[]>
  onLocked: (locked: boolean) => void
  onExit: () => void
  onHover: (id: string | null, side?: WallSide) => void
  onSelect: (id: string, side?: WallSide, position?: number, hit?: SurfaceRayHit) => void
}

/** Browser pointer lock keeps mouse look separate from catalog pointer interaction. */
export function WalkController({ detections, imageSize, scale, openingsByWall, onLocked, onExit, onHover, onSelect }: Props) {
  const { camera, gl, scene, raycaster } = useThree()
  const collision = useMemo(() => buildWalkCollision(detections,imageSize,scale,openingsByWall),[detections,imageSize,scale,openingsByWall])
  const callbacks = useRef({ onLocked, onExit, onHover, onSelect })
  callbacks.current = { onLocked, onExit, onHover, onSelect }
  const currentDetections = useRef(detections)
  currentDetections.current = detections
  const keys = useRef(new Set<string>())
  const selectedUnlock = useRef(false)
  const locked = useRef(false)
  const elapsed = useRef(0)
  const lastHover = useRef("")

  function crosshairHit() {
    raycaster.setFromCamera(new Vector2(0,0),camera)
    for (const intersection of raycaster.intersectObjects(scene.children,true)) {
      let object: typeof intersection.object | null = intersection.object
      while (object && !object.userData.editorId) object = object.parent
      const id = object?.userData.editorId as string | undefined
      const detection = currentDetections.current.find(item => item.id === id)
      if (!detection) continue
      const normal = intersection.face?.normal.clone().transformDirection(intersection.object.matrixWorld)
      const side = labelKind(detection.label) === "wall" && normal ? wallSideFromNormal(detection,normal) ?? undefined : undefined
      return { intersection, detection, normal, side }
    }
    return null
  }

  useEffect(() => {
    const start = walkSpawn(detections,imageSize,scale,collision)
    camera.position.set(start.x,1.65,start.z)
    gl.domElement.dataset.walkEyeHeight = "1.65"
    gl.domElement.dataset.walkPosition = `${start.x.toFixed(3)},${start.z.toFixed(3)}`
    camera.rotation.order = "YXZ"
    camera.rotation.set(0,0,0)
    const perspective = camera as PerspectiveCamera
    const oldFov = perspective.fov
    perspective.fov = 68
    perspective.updateProjectionMatrix()
    const canvas = gl.domElement
    const lockChange = () => {
      const active = document.pointerLockElement === canvas
      locked.current = active
      callbacks.current.onLocked(active)
      if (!active) {
        keys.current.clear()
        lastHover.current = ""
        callbacks.current.onHover(null)
        if (selectedUnlock.current) selectedUnlock.current = false
        else callbacks.current.onExit()
      }
    }
    const look = (event: MouseEvent) => {
      if (!locked.current) return
      camera.rotation.y -= event.movementX * 0.0022
      camera.rotation.x = Math.max(-Math.PI*0.44,Math.min(Math.PI*0.44,camera.rotation.x-event.movementY*0.0022))
    }
    const keyDown = (event: KeyboardEvent) => {
      if (!locked.current) return
      if (["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","ShiftLeft","ShiftRight"].includes(event.code)) {
        event.preventDefault()
        keys.current.add(event.code)
      }
    }
    const keyUp = (event: KeyboardEvent) => keys.current.delete(event.code)
    const selectAtCrosshair = (event: MouseEvent) => {
      if (!locked.current || event.button !== 0) return
      const hit = crosshairHit()
      if (hit) {
        const { intersection, detection, normal, side } = hit
        const position = side ? wallPositionFromHit(detection,intersection.point,imageSize,scale) : undefined
        callbacks.current.onSelect(detection.id,side,position,{
          point:{x:intersection.point.x,y:intersection.point.y,z:intersection.point.z},
          normal:normal ? {x:normal.x,y:normal.y,z:normal.z} : undefined,
          uv:intersection.uv ? {x:intersection.uv.x,y:intersection.uv.y} : undefined,
        })
        selectedUnlock.current = true
        document.exitPointerLock()
      }
    }
    document.addEventListener("pointerlockchange",lockChange)
    document.addEventListener("mousemove",look)
    window.addEventListener("keydown",keyDown)
    window.addEventListener("keyup",keyUp)
    canvas.addEventListener("mousedown",selectAtCrosshair,true)
    return () => {
      document.removeEventListener("pointerlockchange",lockChange)
      document.removeEventListener("mousemove",look)
      window.removeEventListener("keydown",keyDown)
      window.removeEventListener("keyup",keyUp)
      canvas.removeEventListener("mousedown",selectAtCrosshair,true)
      if (document.pointerLockElement === canvas) document.exitPointerLock()
      perspective.fov = oldFov
      perspective.updateProjectionMatrix()
      delete canvas.dataset.walkEyeHeight
      delete canvas.dataset.walkPosition
      callbacks.current.onLocked(false)
    }
    // Mode entry has one camera setup. Geometry changes affect collision via useMemo below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((_, delta) => {
    if (!locked.current) return
    elapsed.current += delta
    if (elapsed.current >= 0.1) {
      elapsed.current = 0
      const hit = crosshairHit()
      const key = hit ? `${hit.detection.id}:${hit.side ?? ""}` : ""
      if (key !== lastHover.current) { lastHover.current = key; callbacks.current.onHover(hit?.detection.id ?? null,hit?.side) }
    }
    const forward = camera.getWorldDirection(new Vector3())
    forward.y = 0
    if (forward.lengthSq() < 1e-6) return
    forward.normalize()
    const right = new Vector3().crossVectors(forward,new Vector3(0,1,0)).normalize()
    const direction = new Vector3()
    if (keys.current.has("KeyW") || keys.current.has("ArrowUp")) direction.add(forward)
    if (keys.current.has("KeyS") || keys.current.has("ArrowDown")) direction.sub(forward)
    if (keys.current.has("KeyD") || keys.current.has("ArrowRight")) direction.add(right)
    if (keys.current.has("KeyA") || keys.current.has("ArrowLeft")) direction.sub(right)
    if (direction.lengthSq() === 0) return
    const speed = (keys.current.has("ShiftLeft") || keys.current.has("ShiftRight")) ? 3.3 : 2.2
    direction.normalize().multiplyScalar(Math.min(delta,0.05)*speed)
    const x = camera.position.x+direction.x, z = camera.position.z+direction.z
    if (canWalkAt(x,camera.position.z,collision)) camera.position.x=x
    if (canWalkAt(camera.position.x,z,collision)) camera.position.z=z
    camera.position.y=1.65
    gl.domElement.dataset.walkPosition = `${camera.position.x.toFixed(3)},${camera.position.z.toFixed(3)}`
  })
  return null
}
