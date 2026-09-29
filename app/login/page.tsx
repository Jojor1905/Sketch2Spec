import { redirect } from "next/navigation"
import { currentUser } from "@/lib/auth-server"
import { LoginForm } from "@/components/auth/login-form"
import { safeDestination } from "@/lib/auth-client"

export const dynamic = 'force-dynamic'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  let user = null
  let unavailable = false
  try { user = await currentUser() } catch { unavailable = true }
  if (user) redirect('/upload')
  return <LoginForm destination={safeDestination((await searchParams).next)} unavailable={unavailable} />
}
