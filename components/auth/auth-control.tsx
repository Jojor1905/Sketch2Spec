"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { User } from "@/lib/auth-client"

export function AuthControl() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const busy = useRef(false)
  useEffect(() => {
    let active = true
    fetch('/api/auth/me', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
      .then(async response => { if (response.ok) { const value: User = await response.json(); if (active) setUser(value) } })
      .catch(() => {}).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  async function logout() {
    if (busy.current) return
    busy.current = true
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', signal: AbortSignal.timeout(10000) })
      if (!response.ok) throw new Error()
      setUser(null)
      window.location.assign('/login')
    } catch { setError('Could not sign out. Please try again.') }
    finally { busy.current = false; setLoading(false) }
  }
  return <div className="flex flex-col gap-1">
    {user ? <Button variant="outline" onClick={logout} disabled={loading}>{loading ? 'Signing out…' : 'Sign out'}</Button> : <Button asChild variant="outline" disabled={loading}><Link href="/login">Sign in</Link></Button>}
    {error && <p role="alert" className="max-w-52 text-sm text-destructive">{error}</p>}
  </div>
}
