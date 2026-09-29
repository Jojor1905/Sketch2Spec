"use client"

import { motion } from "framer-motion"
import {
  Wand2,
  Move3D,
  Palette,
  Calculator,
  Eye,
  Download,
} from "lucide-react"

const features = [
  {
    icon: Wand2,
    title: "Smart AI Detection",
    description:
      "Our AI accurately detects walls, doors, and windows from any floor plan — even hand-drawn sketches.",
  },
  {
    icon: Move3D,
    title: "Intuitive 3D Editing",
    description:
      "Drag, resize, and modify your 3D model with simple controls. No architectural experience needed.",
  },
  {
    icon: Palette,
    title: "Real Material Library",
    description:
      "Browse thousands of real-world tiles, paints, wallpapers, and wood finishes with live previews.",
  },
  {
    icon: Calculator,
    title: "Live Budget Tracking",
    description:
      "See real-time cost calculations as you choose materials. Know exactly what your renovation costs.",
  },
  {
    icon: Eye,
    title: "Before & After Views",
    description:
      "Compare your original plan with the finished visualization side by side for complete confidence.",
  },
  {
    icon: Download,
    title: "Export Everything",
    description:
      "Download your 3D renders, material list, and detailed budget as polished PDFs ready to share.",
  },
]

export function Features() {
  return (
    <section id="features" className="scroll-mt-24 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-sm font-semibold uppercase tracking-widest text-primary"
          >
            Features
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            Everything you need to plan your dream home
          </motion.h2>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="rounded-2xl border border-border/60 bg-card p-8 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
