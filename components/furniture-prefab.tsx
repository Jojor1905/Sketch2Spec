"use client"

import { Component, Suspense, useMemo, type ErrorInfo, type ReactNode } from "react"
import { Edges, Html, useGLTF } from "@react-three/drei"
import { Material, Mesh, MeshStandardMaterial } from "three"
import type { FurnitureCatalogItem, FurnitureInstance } from "@/lib/furniture"

type Props = {
  item: FurnitureCatalogItem
  instance: FurnitureInstance
  selected: boolean
  tint?: string
}

function Fallback({ item, instance, failed = false }: Props & { failed?: boolean }) {
  const width = item.widthM * instance.scale.x
  const depth = item.depthM * instance.scale.z
  const height = item.heightM * instance.scale.y
  return <group rotation={[0, instance.rotationY, 0]}>
    <mesh position={[0, item.floorOffset + height / 2, 0]} castShadow receiveShadow userData={{ furnitureFallback: true }}>
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial color={failed ? "#D9A9A0" : "#C8BBA9"} roughness={0.9} />
      <Edges color={failed ? "#9F403B" : "#8B7864"} />
    </mesh>
    {failed && <Html position={[0, height + 0.28, 0]} center distanceFactor={10} style={{ pointerEvents: "none" }}>
      <span className="whitespace-nowrap rounded bg-white/95 px-2 py-1 text-[10px] text-amber-800 shadow">Model unavailable · showing fallback</span>
    </Html>}
  </group>
}

class ModelBoundary extends Component<Props & { children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.warn(`Furniture model unavailable: ${this.props.item.modelUrl}`, error)
  }
  render() {
    return this.state.failed ? <Fallback {...this.props} failed /> : this.props.children
  }
}

function LoadedModel({ item, instance, selected, tint }: Props) {
  // useGLTF caches the parsed GLB by URL. Clone only when a catalog item changes,
  // so moving an instance does not reload or rebuild its mesh tree.
  const { scene } = useGLTF(item.modelUrl)
  const model = useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse(object => {
      if (object instanceof Mesh) {
        object.castShadow = true
        object.receiveShadow = true
        if (tint) {
          const tinted = (material: Material) => {
            const copy = material.clone()
            if (copy instanceof MeshStandardMaterial) copy.color.set(tint)
            return copy
          }
          object.material = Array.isArray(object.material)
            ? object.material.map(material => tinted(material))
            : tinted(object.material)
        }
      }
    })
    return clone
  }, [scene, tint])
  const width = item.widthM * instance.scale.x
  const depth = item.depthM * instance.scale.z
  const height = item.heightM * instance.scale.y
  return <group rotation={[0, instance.rotationY, 0]}>
    <primitive object={model} position={[0, item.floorOffset, 0]} scale={[instance.scale.x, instance.scale.y, instance.scale.z]} />
    {selected && <mesh position={[0, item.floorOffset + height / 2, 0]} renderOrder={25}>
      <boxGeometry args={[width + .04, height + .04, depth + .04]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      <Edges color="#C22828" threshold={1} />
    </mesh>}
  </group>
}

export function FurniturePrefab(props: Props) {
  return <ModelBoundary {...props}>
    <Suspense fallback={<Fallback {...props} />}>
      <LoadedModel {...props} />
    </Suspense>
  </ModelBoundary>
}
