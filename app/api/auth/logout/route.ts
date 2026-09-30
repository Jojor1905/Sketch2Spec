import { NextResponse } from "next/server"

import { backendUrl, SESSION_COOKIE, sessionCookie, sessionToken } from "../session"

export async function POST() {
  const token = await sessionToken()
  if (token) {
    try {
      await fetch(`${backendUrl()}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
    } catch {
      // The browser session is still cleared even if Cloud Run is unavailable.
    }
  }

  const response = NextResponse.json({ logged_out: true })
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookie, maxAge: 0 })
  return response
}
