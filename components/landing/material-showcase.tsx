"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check } from "lucide-react"

const materials = [
  { id: "marble", name: "Carrara Marble", category: "Floor Tiles", price: "$45/sqft", color: "bg-[#e8e4df]" },
  { id: "oak", name: "Natural Oak", category: "Wood Flooring", price: "$12/sqft", color: "bg-[#c8a97e]" },
  { id: "sage", name: "Sage Green", category: "Wall Paint", price: "$38/gal", color: "bg-[#9caf88]" },
  { id: "slate", name: "Dark Slate", category: "Floor Tiles", price: "$28/sqft", color: "bg-[#5c6370]" },
  { id: "cream", name: "Warm Cream", category: "Wall Paint", price: "$32/gal", color: "bg-[#f0e6d3]" },
  { id: "walnut", name: "American Walnut", category: "Wood Flooring", price: "$18/sqft", color: "bg-[#5c3d2e]" },
]

export function MaterialShowcase() {
  const [selected, setSelected] = useState("marble")

  const activeMaterial = materials.find((m) => m.id === selected)

  return (
    <section id="materials" className="scroll-mt-24 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-sm font-semibold uppercase tracking-widest text-primary"
          >
            Material Library
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            Browse real-world materials and see them live
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
            className="mx-auto mt-4 max-w-lg text-pretty text-muted-foreground"
          >
            Select from thousands of tiles, paints, and finishes. Apply them instantly and watch prices update in real time.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="mx-auto mt-14 max-w-4xl"
        >
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-lg">
            {/* Preview area */}
            <div className="relative flex min-h-[240px] items-center justify-center bg-secondary/30 p-8 md:min-h-[300px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={selected}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className="text-center"
                >
                  <div className={`mx-auto h-32 w-32 rounded-2xl ${activeMaterial?.color} shadow-md ring-4 ring-card md:h-40 md:w-40`} />
                  <h3 className="mt-5 text-lg font-semibold text-foreground">{activeMaterial?.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activeMaterial?.category} &middot; {activeMaterial?.price}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Swatches */}
            <div className="flex flex-wrap items-center justify-center gap-3 border-t border-border/60 px-6 py-5">
              {materials.map((mat) => (
                <button
                  key={mat.id}
                  onClick={() => setSelected(mat.id)}
                  className={`relative h-12 w-12 rounded-xl ${mat.color} shadow-sm ring-2 transition-all ${
                    selected === mat.id
                      ? "ring-primary scale-110"
                      : "ring-transparent hover:ring-border hover:scale-105"
                  }`}
                  aria-label={`Select ${mat.name}`}
                >
                  {selected === mat.id && (
                    <motion.div
                      layoutId="material-check"
                      className="absolute inset-0 flex items-center justify-center rounded-xl bg-primary/20"
                    >
                      <Check className="h-4 w-4 text-primary" />
                    </motion.div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
