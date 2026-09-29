import { NextRequest } from "next/server"
import { backendUrl, SESSION_COOKIE } from "@/lib/auth-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function bridge(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const path = '/' + (await context.params).path.join('/')
  const method = request.method
  const allowed = (method === 'GET' && ['/health', '/auth/me'].includes(path)) ||
    (method === 'POST' && ['/auth/login', '/auth/logout', '/pdf/info', '/prepare', '/detect', '/detect/jobs'].includes(path)) ||
    (['GET', 'DELETE'].includes(method) && /^\/detect\/jobs\/[a-f0-9]{32}$/.test(path))
  if (!allowed) return Response.json({ detail: 'Not found' }, { status: 404 })
  const headers = new Headers()
  if (!['GET', 'HEAD'].includes(method)) {
    const origin = request.headers.get('origin')
    const origins = (process.env.AUTH_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim())
    if (!origin || !origins.includes(origin)) return Response.json({ detail: 'Untrusted request origin' }, { status: 403 })
    headers.set('origin', origin)
  }
  const cookie = request.cookies.get(SESSION_COOKIE)?.value
  if (cookie && /^[A-Za-z0-9_-]{43}$/.test(cookie)) headers.set('cookie', `${SESSION_COOKIE}=${cookie}`)
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)
  try {
    const target = backendUrl(path)
    for (const key of ['page', 'confidence']) {
      const value = request.nextUrl.searchParams.get(key)
      if (value !== null) target.searchParams.set(key, value)
    }
    const init: RequestInit = {
      method, headers, cache: 'no-store', redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(125000)]),
    }
    if (!['GET', 'HEAD'].includes(method) && request.body) {
      // A replayable body lets Node fetch relay 401 responses correctly.
      // Bound actual bytes (not just Content-Length), keeping multipart bytes intact.
      const limit = path.startsWith('/auth/') ? 4096 : 26 * 1024 * 1024
      const reader = request.body.getReader()
      const chunks: Uint8Array[] = []
      let length = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > limit) {
          await reader.cancel()
          return Response.json({ detail: 'Request too large' }, { status: 413, headers: { 'Cache-Control': 'no-store' } })
        }
        chunks.push(value)
      }
      const body = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
      init.body = body
    }
    const upstream = await fetch(target, init)
    const output = new Headers({ 'Cache-Control': 'no-store' })
    for (const key of ['content-type', 'content-disposition', 'retry-after', 'x-image-width', 'x-image-height', 'x-pdf-page', 'x-pdf-pages']) {
      const value = upstream.headers.get(key)
      if (value) output.set(key, value)
    }
    for (const cookie of upstream.headers.getSetCookie()) output.append('set-cookie', cookie)
    return new Response(upstream.body, { status: upstream.status, headers: output })
  } catch {
    return Response.json({ detail: 'Service unavailable. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

export { bridge as GET, bridge as POST, bridge as DELETE }
