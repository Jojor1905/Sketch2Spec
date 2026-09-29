import { redirect } from "next/navigation"
import { currentUser } from "@/lib/auth-server"
import { SessionGuard } from "@/components/auth/session-guard"

export const dynamic = 'force-dynamic'

export default async function UploadLayout({ children }: { children: React.ReactNode }) {
  let user
  try { user = await currentUser() } catch {
    return <main className="mx-auto max-w-md p-6 pt-24"><h1 className="text-xl font-semibold">Sign-in service unavailable</h1><p className="mt-3">Please retry in a moment. Your saved project remains on this device.</p><a className="mt-4 inline-block text-primary underline" href="/upload">Try again</a></main>
  }
  if (!user) redirect('/login?next=/upload')
  return <SessionGuard>{children}</SessionGuard>
}
