import { NextResponse } from "next/server"

import { backendUrl, sessionToken } from "../../auth/session"

type RouteContext = { params: Promise<{ path: string[] }> }

async function proxy(request: Request, context: RouteContext) {
  const token = await sessionToken()
  if (!token) return NextResponse.json({ detail: "Authentication required." }, { status: 401 })

  const { path } = await context.params
  const pathname = path.map(encodeURIComponent).join("/")
  const url = new URL(`${backendUrl()}/${pathname}`)
  url.search = new URL(request.url).search

  const headers = new Headers({ Authorization: `Bearer ${token}` })
  const contentType = request.headers.get("content-type")
  const accept = request.headers.get("accept")
  if (contentType) headers.set("content-type", contentType)
  if (accept) headers.set("accept", accept)

  try {
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
    })
    const responseHeaders = new Headers()
    for (const header of ["content-type", "content-disposition", "x-image-width", "x-image-height", "x-pdf-page"]) {
      const value = upstream.headers.get(header)
      if (value) responseHeaders.set(header, value)
    }
    return new NextResponse(await upstream.arrayBuffer(), { status: upstream.status, headers: responseHeaders })
  } catch {
    return NextResponse.json({ detail: "Detection service is unavailable." }, { status: 503 })
  }
}

export const GET = proxy
export const POST = proxy
export const DELETE = proxy
