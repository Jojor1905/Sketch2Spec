"use client"

import { motion } from "framer-motion"
import { Upload, ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pt-32 pb-20 md:pt-40 md:pb-28">
      {/* Soft background decoration */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-20 left-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-20 right-1/4 h-80 w-80 rounded-full bg-success/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI-Powered Home Planning
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-balance text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl"
          >
            Turn your floor plan into a{" "}
            <span className="text-primary">3D home</span>{" "}
            in minutes
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground"
          >
            Upload any floor plan &mdash; printed or hand-drawn. Our AI detects walls, doors, and windows, 
            generates a 3D model, and lets you apply real materials with live budget calculations.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          >
            <Button asChild size="lg" className="gap-2 rounded-2xl px-8 text-base shadow-lg shadow-primary/20">
              <Link href="/upload">
                <Upload className="h-4.5 w-4.5" />
                Upload Floor Plan
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2 rounded-2xl px-8 text-base">
              <Link href="#how-it-works">
                See How It Works
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </motion.div>
        </div>

        {/* Animated floor plan to 3D mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="mx-auto mt-16 max-w-4xl"
        >
          <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl shadow-primary/5">
            <div className="flex items-center gap-2 border-b border-border/60 bg-secondary/50 px-5 py-3">
              <div className="h-3 w-3 rounded-full bg-destructive/40" />
              <div className="h-3 w-3 rounded-full bg-warning/60" />
              <div className="h-3 w-3 rounded-full bg-success/60" />
              <span className="ml-3 text-xs text-muted-foreground">Sketch2Spec &mdash; AI Workspace</span>
            </div>
            <div className="relative flex min-h-[340px] items-center justify-center bg-secondary/20 p-8 md:min-h-[420px]">
              <FloorPlanToThreeD />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function FloorPlanToThreeD() {
  return (
    <div className="flex flex-col items-center gap-6 md:flex-row md:gap-12">
      {/* 2D Floor Plan */}
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.7 }}
        className="relative"
      >
        <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-card p-6 shadow-lg">
          <svg width="180" height="140" viewBox="0 0 180 140" className="text-foreground">
            {/* Outer walls */}
            <rect x="10" y="10" width="160" height="120" fill="none" stroke="currentColor" strokeWidth="3" rx="2" />
            {/* Room dividers */}
            <line x1="90" y1="10" x2="90" y2="80" stroke="currentColor" strokeWidth="2.5" />
            <line x1="90" y1="80" x2="170" y2="80" stroke="currentColor" strokeWidth="2.5" />
            <line x1="10" y1="80" x2="60" y2="80" stroke="currentColor" strokeWidth="2.5" />
            {/* Doors (gaps) */}
            <line x1="60" y1="78" x2="80" y2="78" stroke="hsl(142 71% 45%)" strokeWidth="3" strokeLinecap="round" />
            <line x1="88" y1="90" x2="88" y2="115" stroke="hsl(142 71% 45%)" strokeWidth="3" strokeLinecap="round" />
            {/* Windows (cyan) */}
            <line x1="30" y1="10" x2="60" y2="10" stroke="hsl(187 85% 53%)" strokeWidth="4" strokeLinecap="round" />
            <line x1="120" y1="10" x2="150" y2="10" stroke="hsl(187 85% 53%)" strokeWidth="4" strokeLinecap="round" />
            {/* Room labels */}
            <text x="40" y="50" textAnchor="middle" className="fill-muted-foreground text-[10px] font-medium">Living</text>
            <text x="130" y="50" textAnchor="middle" className="fill-muted-foreground text-[10px] font-medium">Bedroom</text>
            <text x="40" y="110" textAnchor="middle" className="fill-muted-foreground text-[10px] font-medium">Kitchen</text>
            <text x="130" y="110" textAnchor="middle" className="fill-muted-foreground text-[10px] font-medium">Bath</text>
          </svg>
          <p className="mt-2 text-center text-xs font-medium text-muted-foreground">2D Floor Plan</p>
        </div>
      </motion.div>

      {/* Arrow */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 1.0 }}
        className="flex flex-col items-center gap-1"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <Sparkles className="h-5 w-5" />
        </div>
        <span className="text-xs font-medium text-primary">AI Magic</span>
      </motion.div>

      {/* 3D House */}
      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 1.2 }}
        className="relative"
      >
        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-lg">
          <svg width="180" height="140" viewBox="0 0 180 140" className="text-foreground">
            {/* 3D isometric house */}
            {/* Front face */}
            <polygon points="30,90 90,60 90,130 30,130" fill="hsl(217 91% 60% / 0.15)" stroke="hsl(217 91% 60%)" strokeWidth="2" />
            {/* Right face */}
            <polygon points="90,60 160,80 160,130 90,130" fill="hsl(217 91% 60% / 0.08)" stroke="hsl(217 91% 60%)" strokeWidth="2" />
            {/* Roof left */}
            <polygon points="20,90 95,40 95,60 30,90" fill="hsl(217 91% 60% / 0.2)" stroke="hsl(217 91% 60%)" strokeWidth="2" />
            {/* Roof right */}
            <polygon points="95,40 170,70 160,80 95,60" fill="hsl(217 91% 60% / 0.12)" stroke="hsl(217 91% 60%)" strokeWidth="2" />
            {/* Door */}
            <rect x="50" y="100" width="18" height="28" rx="2" fill="hsl(142 71% 45% / 0.3)" stroke="hsl(142 71% 45%)" strokeWidth="1.5" />
            {/* Window front */}
            <rect x="40" y="80" width="14" height="12" rx="1" fill="hsl(187 85% 53% / 0.25)" stroke="hsl(187 85% 53%)" strokeWidth="1.5" />
            {/* Window side */}
            <rect x="110" y="85" width="20" height="14" rx="1" fill="hsl(187 85% 53% / 0.2)" stroke="hsl(187 85% 53%)" strokeWidth="1.5" />
          </svg>
          <p className="mt-2 text-center text-xs font-medium text-muted-foreground">3D Model</p>
        </div>
      </motion.div>
    </div>
  )
}
