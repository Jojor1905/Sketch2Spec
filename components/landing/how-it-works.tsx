"use client"

import { motion } from "framer-motion"
import { Upload, ScanSearch, Box, Paintbrush } from "lucide-react"

const steps = [
  {
    icon: Upload,
    step: "01",
    title: "Upload Floor Plan",
    description: "Drag and drop your printed or hand-drawn floor plan. We support images, PDFs, and blueprint scans.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: ScanSearch,
    step: "02",
    title: "AI Detects Layout",
    description: "Our AI automatically identifies walls, doors, windows, and room boundaries with high accuracy.",
    color: "bg-success/10 text-success",
  },
  {
    icon: Box,
    step: "03",
    title: "Generate 3D House",
    description: "Watch your 2D plan transform into an interactive 3D model you can orbit, zoom, and explore.",
    color: "bg-chart-4/10 text-chart-4",
  },
  {
    icon: Paintbrush,
    step: "04",
    title: "Apply & Budget",
    description: "Browse real materials, apply them to your 3D model, and get instant budget calculations.",
    color: "bg-warning/10 text-warning",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-sm font-semibold uppercase tracking-widest text-primary"
          >
            How It Works
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            From sketch to 3D model in four simple steps
          </motion.h2>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group relative rounded-2xl border border-border/60 bg-card p-8 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${step.color}`}>
                <step.icon className="h-5.5 w-5.5" />
              </div>
              <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
                Step {step.step}
              </span>
              <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
