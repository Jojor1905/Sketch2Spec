import { NextResponse } from "next/server"

import { backendUrl, SESSION_COOKIE, sessionCookie } from "../session"

export async function POST(request: Request) {
  let credentials: { username?: unknown; password?: unknown }
  try {
    credentials = await request.json()
  } catch {
    return NextResponse.json({ detail: "Invalid username or password." }, { status: 401 })
  }

  if (typeof credentials.username !== "string" || typeof credentials.password !== "string") {
    return NextResponse.json({ detail: "Invalid username or password." }, { status: 401 })
  }

  try {
    const upstream = await fetch(`${backendUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: credentials.username, password: credentials.password }),
      cache: "no-store",
    })
    if (!upstream.ok) {
      return NextResponse.json({ detail: "Invalid username or password." }, { status: 401 })
    }

    const payload = await upstream.json() as { access_token?: unknown; username?: unknown }
    if (typeof payload.access_token !== "string" || typeof payload.username !== "string") {
      return NextResponse.json({ detail: "Unable to start a session." }, { status: 502 })
    }

    const response = NextResponse.json({ username: payload.username })
    response.cookies.set(SESSION_COOKIE, payload.access_token, sessionCookie)
    return response
  } catch {
    return NextResponse.json({ detail: "Unable to reach the authentication service." }, { status: 503 })
  }
}
