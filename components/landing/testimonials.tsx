"use client"

import { motion } from "framer-motion"
import { Star } from "lucide-react"

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Homeowner",
    content:
      "I had no idea what my renovation would look like until I used PlanCraft. Uploading my hand-drawn sketch and seeing a 3D model within minutes was incredible.",
    rating: 5,
    initials: "SC",
  },
  {
    name: "Marcus Johnson",
    role: "Interior Designer",
    content:
      "This tool saves me hours of work. I can show clients material options with live pricing right in the 3D model. It changed how I run consultations.",
    rating: 5,
    initials: "MJ",
  },
  {
    name: "Elena Rodriguez",
    role: "First-time Renovator",
    content:
      "As someone who can barely read a floor plan, PlanCraft made everything visual and easy. I finally understood the budget breakdown before committing.",
    rating: 5,
    initials: "ER",
  },
]

export function Testimonials() {
  return (
    <section className="px-6 py-20 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-sm font-semibold uppercase tracking-widest text-primary"
          >
            Testimonials
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            Loved by homeowners and professionals
          </motion.h2>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="flex flex-col rounded-2xl border border-border/60 bg-card p-8 shadow-sm"
            >
              <div className="mb-4 flex gap-0.5">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star key={j} className="h-4 w-4 fill-warning text-warning" />
                ))}
              </div>
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                {`"${t.content}"`}
              </p>
              <div className="mt-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
