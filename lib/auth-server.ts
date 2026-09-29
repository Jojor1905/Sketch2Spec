import "server-only"
import { cookies } from "next/headers"

export const SESSION_COOKIE = "sketch2spec_session"

export function backendUrl(path: string) {
  const origin = process.env.DETECTION_API_URL
  if (!origin) throw new Error("DETECTION_API_URL is required")
  const url = new URL(origin)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error("Invalid backend origin")
  }
  return new URL(path, url)
}

export async function currentUser(): Promise<{ username: string } | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const response = await fetch(backendUrl('/auth/me'), {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
    cache: 'no-store', signal: AbortSignal.timeout(5000), redirect: 'error',
  })
  if (response.status === 401) return null
  if (!response.ok) throw new Error('Authentication service unavailable')
  return response.json()
}
