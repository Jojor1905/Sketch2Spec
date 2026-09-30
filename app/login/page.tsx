"use client"

import { FormEvent, Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff, LockKeyhole, ScanSearch, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <LoginScreen />
    </Suspense>
  )
}

function LoginScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const requestedDestination = searchParams.get("next")
  const destination = requestedDestination?.startsWith("/upload") ? requestedDestination : "/upload"

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    if (!username.trim() || !password) {
      setError("Enter both username and password.")
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const payload = await response.json().catch(() => ({})) as { detail?: string }
      if (!response.ok) {
        setError(response.status === 503
          ? "Network error. Check your connection and try again."
          : payload.detail === "Invalid username or password."
            ? "Invalid username or password."
            : payload.detail || "Unable to sign in. Please try again.")
        return
      }
      router.replace(destination)
      router.refresh()
    } catch {
      setError("Network error. Check your connection and try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-10">
      <div aria-hidden className="absolute inset-0 opacity-50 [background-image:linear-gradient(to_right,oklch(0.92_0.002_260)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.92_0.002_260)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div aria-hidden className="absolute -left-24 top-12 size-72 rounded-full bg-primary/10 blur-3xl" />
      <div aria-hidden className="absolute -right-20 bottom-8 size-80 rounded-full bg-success/10 blur-3xl" />

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border bg-card shadow-2xl shadow-primary/10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden min-h-[620px] overflow-hidden bg-slate-950 p-10 text-white lg:block">
          <div aria-hidden className="absolute inset-0 opacity-25 [background-image:linear-gradient(to_right,#93c5fd_1px,transparent_1px),linear-gradient(to_bottom,#93c5fd_1px,transparent_1px)] [background-size:42px_42px]" />
          <div aria-hidden className="absolute left-12 top-36 h-56 w-72 rounded-2xl border border-blue-200/30" />
          <div aria-hidden className="absolute left-28 top-48 h-28 w-32 rounded-xl border border-blue-200/30" />
          <div aria-hidden className="absolute bottom-32 right-10 h-40 w-44 rounded-tl-[5rem] border border-blue-200/30" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center gap-3 text-lg font-semibold">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/30"><ScanSearch className="size-5" /></span>
              Sketch2Spec
            </div>
            <div className="mt-auto max-w-sm">
              <p className="mb-3 text-sm font-medium tracking-[0.2em] text-blue-200">AI ARCHITECTURAL WORKSPACE</p>
              <h1 className="text-4xl font-semibold leading-tight">Turn floor plans into an editable space.</h1>
              <p className="mt-5 text-sm leading-6 text-slate-300">Securely access the workspace to detect walls, doors, and windows, then refine every detail in 2D and 3D.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center p-6 sm:p-10 lg:p-12">
          <Card className="w-full border-0 py-0 shadow-none">
            <CardHeader className="px-0">
              <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground lg:hidden"><ScanSearch className="size-5" /></div>
              <CardTitle className="text-2xl">Welcome back</CardTitle>
              <CardDescription>Sign in to continue to your architectural workspace.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <form className="space-y-5" onSubmit={submit} noValidate>
                <label className="block space-y-2 text-sm font-medium" htmlFor="username">
                  <span>Username</span>
                  <span className="relative block">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="h-11 rounded-xl pl-10" aria-invalid={Boolean(error)} disabled={isSubmitting} />
                  </span>
                </label>
                <label className="block space-y-2 text-sm font-medium" htmlFor="password">
                  <span>Password</span>
                  <span className="relative block">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 rounded-xl pl-10 pr-11" aria-invalid={Boolean(error)} disabled={isSubmitting} />
                    <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={showPassword ? "Hide password" : "Show password"} disabled={isSubmitting}>
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </span>
                </label>
                {error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive" role="alert">{error}</p>}
                <Button type="submit" size="lg" className="h-11 w-full rounded-xl" disabled={isSubmitting}>
                  {isSubmitting ? "Signing in…" : "Sign In"}
                </Button>
              </form>
              <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">Your credentials are verified securely by the Sketch2Spec API.</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  )
}
