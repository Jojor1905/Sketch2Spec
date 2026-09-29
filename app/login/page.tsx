"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

const API_URL = process.env.NEXT_PUBLIC_DETECTION_API_URL ?? "http://localhost:8000"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const next = "/"

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("")
    try {
      const response = await fetch(`${API_URL}/auth/login`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) })
      if (!response.ok) throw new Error("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
      router.replace(next)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "เข้าสู่ระบบไม่สำเร็จ") }
    finally { setLoading(false) }
  }

  return <main className="grid min-h-screen place-items-center bg-slate-50 p-5"><section className="w-full max-w-md rounded-3xl border bg-white p-7 shadow-xl sm:p-9"><div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><KeyRound /></div><h1 className="text-2xl font-bold">เข้าสู่ Sketch2Spec</h1><p className="mt-2 text-sm text-muted-foreground">ลงชื่อเข้าใช้เพื่อเริ่มวิเคราะห์แปลนและแก้ไขโมเดล 3D</p><form className="mt-7 space-y-4" onSubmit={submit}><label className="block text-sm font-medium">Username<input required autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border px-3" /></label><label className="block text-sm font-medium">Password<input required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border px-3" /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button className="h-11 w-full rounded-xl" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Log in</Button><Button type="button" variant="outline" className="h-11 w-full rounded-xl" disabled={loading} onClick={() => { setUsername("admin1234"); setPassword("admin1234") }}>ใช้บัญชีทดลอง</Button></form></section></main>
}
