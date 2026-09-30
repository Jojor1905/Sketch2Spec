import { NextResponse, type NextRequest } from "next/server"

const SESSION_COOKIE = "sketch2spec_session"

export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value)
  const { pathname, search } = request.nextUrl

  if (pathname.startsWith("/upload") && !hasSession) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/upload", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/upload/:path*", "/login"],
}
