"use client"

import { useEffect, useState } from "react"
import { sessionExpired, sessionRestored } from "@/lib/auth-client"

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'ready' | 'checking' | 'expired' | 'offline'>('ready')
  useEffect(() => {
    let active = true
    const expired = () => setState('expired')
    const check = async () => {
      setState('checking')
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
        if (!active) return
        if (response.status === 401) sessionExpired()
        else {
          if (response.ok) sessionRestored()
          setState(response.ok ? 'ready' : 'offline')
        }
      } catch { if (active) setState('offline') }
    }
    const visible = () => { if (document.visibilityState === 'visible') void check() }
    window.addEventListener('session-expired', expired)
    window.addEventListener('pageshow', check)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', visible)
    void check()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void check() }, 60000)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('session-expired', expired)
      window.removeEventListener('pageshow', check)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])
  return <><div hidden={state !== 'ready'}>{children}</div>{state !== 'ready' && <main className="mx-auto max-w-md p-6 pt-24" role="alert">
    <h1 className="text-xl font-semibold">{state === 'expired' ? 'Please sign in again' : state === 'checking' ? 'Checking your session…' : 'Sign-in service unavailable'}</h1>
    <p className="my-4">Your saved project remains on this device.</p>
    {state === 'expired' ? <a href="/login?next=/upload" className="text-primary underline">Sign in</a> : state === 'offline' ? <a href="/upload" className="text-primary underline">Try again</a> : null}
  </main>}</>
}
