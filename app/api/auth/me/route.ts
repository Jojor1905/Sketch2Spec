import { NextResponse } from "next/server"

import { backendUrl, sessionToken } from "../session"

export async function GET() {
  const token = await sessionToken()
  if (!token) return NextResponse.json({ detail: "Authentication required." }, { status: 401 })

  try {
    const upstream = await fetch(`${backendUrl()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    if (!upstream.ok) return NextResponse.json({ detail: "Authentication required." }, { status: 401 })
    return NextResponse.json(await upstream.json())
  } catch {
    return NextResponse.json({ detail: "Unable to reach the authentication service." }, { status: 503 })
  }
}
