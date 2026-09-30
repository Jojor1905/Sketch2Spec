import { cookies } from "next/headers"

export const SESSION_COOKIE = "sketch2spec_session"
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60

export function backendUrl() {
  return (process.env.NEXT_PUBLIC_DETECTION_API_URL ?? "http://localhost:8000").replace(/\/$/, "")
}

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value
}

export const sessionCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
}
