"use client"

import Link from "next/link"
import { useRef, useState, type FormEvent } from "react"
import { Eye, EyeOff, Home, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function LoginForm({ destination, unavailable }: { destination: string; unavailable: boolean }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(unavailable ? 'Sign-in service unavailable. Please try again.' : '')
  const [fields, setFields] = useState<{ username?: string; password?: string }>({})
  const submitting = useRef(false)
  const usernameInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    const problems = {
      username: username.trim().length < 1 || username.trim().length > 64 ? 'Enter a username of 1–64 characters.' : undefined,
      password: password.length < 1 || password.length > 128 ? 'Enter a password of 1–128 characters.' : undefined,
    }
    setFields(problems)
    setError('')
    if (problems.username || problems.password) {
      (problems.username ? usernameInput : passwordInput).current?.focus()
      return
    }
    submitting.current = true
    setPending(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
        signal: AbortSignal.timeout(15000), credentials: 'same-origin',
      })
      if (response.ok) { window.location.assign(destination); return }
      if (response.status === 401) { setPassword(''); setError('Invalid username or password.'); passwordInput.current?.focus() }
      else if (response.status === 429) setError('Too many login attempts. Please try again in one minute.')
      else if (response.status === 422) setError('Check your username and password and try again.')
      else setError('Sign-in service unavailable. Please try again.')
    } catch { setError('Sign-in service unavailable. Please try again.') }
    finally { submitting.current = false; setPending(false) }
  }

  return <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
    <div className="w-full max-w-md">
      <Link href="/" className="mb-8 flex items-center justify-center gap-2.5 text-xl font-semibold tracking-tight">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Home aria-hidden="true" className="h-5 w-5" /></span>Sketch2Spec
      </Link>
      <Card>
        <CardHeader><h1 className="text-2xl font-semibold">Sign in / เข้าสู่ระบบ</h1><CardDescription>เข้าสู่ระบบเพื่อเริ่มออกแบบแปลนบ้านของคุณ</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={submit} noValidate className="space-y-5" aria-busy={pending}>
            <div className="space-y-2"><Label htmlFor="username">Username / ชื่อผู้ใช้</Label>
              <Input ref={usernameInput} id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e => setUsername(e.target.value)} aria-invalid={!!fields.username} aria-describedby={fields.username ? 'username-error' : undefined} className="h-11" />
              {fields.username && <p id="username-error" role="alert" className="text-sm text-destructive">{fields.username}</p>}
            </div>
            <div className="space-y-2"><Label htmlFor="password">Password / รหัสผ่าน</Label>
              <div className="relative"><Input ref={passwordInput} id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!fields.password} aria-describedby={fields.password ? 'password-error' : undefined} className="h-11 pr-12" />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-11 w-11" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</Button>
              </div>
              {fields.password && <p id="password-error" role="alert" className="text-sm text-destructive">{fields.password}</p>}
            </div>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <Button type="submit" disabled={pending} className="h-11 w-full rounded-xl">{pending && <LoaderCircle aria-hidden="true" className="animate-spin" />}{pending ? 'Signing in…' : 'Sign in'}</Button>
            <span role="status" className="sr-only">{pending ? 'Signing in…' : ''}</span>
          </form>
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-sm text-muted-foreground"><Link href="/" className="underline underline-offset-4">Back to Sketch2Spec</Link></p>
    </div>
  </main>
}
