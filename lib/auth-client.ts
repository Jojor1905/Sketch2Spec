export type User = { username: string }

let expired = false
let sessionController = new AbortController()
export function sessionRestored() {
  expired = false
  if (sessionController.signal.aborted) sessionController = new AbortController()
}
export function sessionExpired() {
  expired = true
  sessionController.abort()
  window.dispatchEvent(new Event('session-expired'))
}

export async function authenticatedFetch(url: string, init?: RequestInit) {
  if (expired) throw new Error('Session expired. Please sign in again. Your saved project remains on this device.')
  const response = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store',
    signal: init?.signal ? AbortSignal.any([init.signal, sessionController.signal]) : sessionController.signal })
  if (response.status === 401) {
    sessionExpired()
    throw new Error('Session expired. Please sign in again. Your saved project remains on this device.')
  }
  return response
}

export function safeDestination(value: string | null | undefined) {
  return value === '/upload' ? value : '/upload'
}
