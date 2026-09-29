"use client"

import { Suspense } from "react"
import { Canvas } from "@react-three/fiber"
import {
  Bounds,
  Clone,
  Environment,
  Html,
  OrbitControls,
  useGLTF,
} from "@react-three/drei"

function Model() {
  const { scene } = useGLTF("/house.glb")

  return (
    <Bounds fit clip observe margin={1.15}>
      <Clone object={scene} />
    </Bounds>
  )
}

function LoadingModel() {
  return (
    <Html center>
      <div className="whitespace-nowrap rounded-full bg-white/90 px-4 py-2 text-xs font-medium text-slate-700 shadow-lg">
        กำลังโหลดโมเดล 3 มิติ...
      </div>
    </Html>
  )
}

export function HouseModel() {
  return (
    <div className="h-[560px] w-full overflow-hidden rounded-2xl border border-border bg-[#2B2B2B] sm:h-[640px]">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [10, 10, 10], fov: 45, near: 0.1, far: 200 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <fog attach="fog" args={["#2B2B2B", 12, 42]} />
        <ambientLight intensity={1.35} />
        <directionalLight position={[10, 14, 8]} intensity={2} />
        <directionalLight position={[-8, 6, -6]} intensity={0.6} />
        <gridHelper args={[30, 30, "#555555", "#3B3B3B"]} />

        <Suspense fallback={<LoadingModel />}>
          <Environment preset="city" />
          <Model />
        </Suspense>

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={3}
          maxDistance={45}
          maxPolarAngle={Math.PI / 2.02}
        />
      </Canvas>
    </div>
  )
}

useGLTF.preload("/house.glb")
