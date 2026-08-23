"use client"

import { motion } from "framer-motion"
import { Upload, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export function CTA() {
  return (
    <section className="px-6 py-20 md:py-28">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-2xl bg-primary px-8 py-16 text-center text-primary-foreground shadow-xl shadow-primary/20 md:px-16 md:py-20"
        >
          {/* Subtle decorative shapes */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary-foreground/5" />
            <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-primary-foreground/5" />
          </div>

          <div className="relative">
            <h2 className="mx-auto max-w-xl text-balance text-3xl font-bold tracking-tight md:text-4xl">
              Ready to visualize your dream home?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-pretty text-base text-primary-foreground/80">
              Upload your floor plan today and transform it into an interactive 3D experience &mdash; completely free to start.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="gap-2 rounded-2xl px-8 text-base font-semibold text-foreground shadow-lg"
              >
                <Link href="/upload">
                  <Upload className="h-4.5 w-4.5" />
                  Upload Floor Plan
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="gap-2 rounded-2xl px-8 text-base text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <Link href="#how-it-works">
                  Learn More
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
