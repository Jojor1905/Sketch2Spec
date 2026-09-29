# Sketch2Spec Login / Authentication Implementation Prompt

Implement Login / Authentication for Sketch2Spec using the requirements below. This document is a prompt for a future implementation task; creating this document alone does not authorize implementing the feature.

## 1. Inspect the repository and preserve existing work

- Work from the `Sketch2Spec` repository root. Read applicable `AGENTS.md` instructions and inspect `git status`, existing diffs, architecture, dependencies, and tests before editing.
- Follow the existing Next.js App Router + React + TypeScript frontend and Python FastAPI backend. Do not replace the stack or rewrite unrelated code.
- The inspected frontend uses Next.js 16.2.6, React 19, TypeScript, Tailwind CSS 4, shadcn/ui with the `new-york` style, Radix primitives, and Lucide icons. Recheck installed versions before implementation and use their supported APIs.
- Read `components.json`, `app/layout.tsx`, `app/globals.css`, `components/ui/`, `components/landing/navbar.tsx`, `app/upload/page.tsx`, `backend/main.py`, `.env.example`, `package.json`, and existing tests.
- `/` is the public landing page. `/upload` currently contains the client-side upload, detection, 2D/3D editing, materials, and project workflow. Preserve these behaviors.
- The frontend currently calls FastAPI using `NEXT_PUBLIC_DETECTION_API_URL`, defaulting to `http://localhost:8000`. FastAPI currently exposes `/health`, `/pdf/info`, `/prepare`, `/detect`, and detection job creation, polling, and deletion routes. Inspect all callers before adding authentication.
- Existing project persistence uses browser storage. Keep authentication credentials and sessions separate from that storage.

## 2. User experience and design system

- Add `/login` with Sketch2Spec branding, a username field, password field, and a clear sign-in button. Match existing Thai/English language conventions.
- Reuse existing `Button`, `Input`, `Label`, `Card`, alert, and spinner components where appropriate, plus `@/lib/utils` and existing import aliases. Use React Hook Form and Zod if useful; both already exist in the repository.
- Use the design tokens in `app/globals.css`: warm white background, white cards, soft blue primary, neutral text, existing radii, spacing, borders, and focus rings. Preserve the existing typography and global layout. Avoid adding a competing design system or unrelated global CSS changes.
- Support mobile widths from 320px, tablet, and desktop without horizontal overflow. Keep the form readable and centered with sensible maximum width and touch targets.
- Provide visible labels, keyboard navigation, password-manager-compatible `username` and `current-password` autocomplete values, accessible error associations, and an accessible show/hide password control.
- Show loading state during submission, prevent duplicate requests, and restore controls after failure. Announce errors and loading state accessibly.
- Distinguish invalid credentials from service unavailability without exposing backend internals. Never reveal whether a username exists. Keep the username after failure and clear the password after an invalid-credentials response.
- Add suitable login/logout controls to existing desktop and mobile navigation. Do not add registration, password recovery, social login, or account management in this task.

## 3. Demo credentials and validation

- The default local demo username must be `admin1234`.
- The default local demo password must be `admin1234`.
- Make demo mode an explicit server-side development setting. Permit these defaults only in local development; reject demo mode/default credentials in production.
- Authenticate on the FastAPI server. Never compare credentials in browser code or use a client-side flag as proof of authentication.
- Validate inputs on both frontend and backend: username must be a string of 1–64 characters after trimming; password must be a string of 1–128 characters and must not be trimmed or silently transformed. Reject missing, empty, malformed, and oversized input with clear field messages where appropriate.
- Treat credential matching as case-sensitive and apply the same username normalization on both sides. Do not impose signup password rules on login.
- Store configured production credentials as a password hash using a maintained password hashing library. Never store or log plaintext production passwords. Use the library's verification routine, including a dummy hash verification for unknown usernames to reduce timing differences.

## 4. Authentication architecture and API contract

- Keep FastAPI as the authority for credential verification, session creation, validation, expiry, and revocation. Put reusable authentication code in a focused backend module and use FastAPI dependencies to protect endpoints.
- Use a same-origin Next.js route-handler bridge for browser auth and protected backend requests. Configure the upstream FastAPI URL in a server-only environment variable. Forward only required headers and the session cookie; correctly relay `Set-Cookie`, status codes, response types, uploads, and cancellation behavior. Do not create an arbitrary URL proxy.
- Browser requests should target the Next.js origin. Keep backend endpoints independently protected so direct requests to FastAPI cannot bypass authentication. Preserve existing backend response contracts and upload limits.
- Implement backend `POST /auth/login`, `GET /auth/me`, and `POST /auth/logout`, exposed through corresponding `/api/auth/*` Next.js handlers.
- Login accepts JSON `{ "username": "...", "password": "..." }`, returns a minimal user object on success, and sets the session cookie. Invalid credentials return a generic 401; invalid input returns a consistent validation response; throttled requests return 429.
- `/auth/me` returns a minimal user identity for a valid session and 401 for absent, invalid, revoked, or expired sessions. Never return the session token or password hash in JSON.
- Logout revokes the server session and expires the cookie using matching cookie path/domain settings. Make logout idempotent and require POST. Return to `/login` after confirmed logout; show a retryable error if revocation fails.
- Use consistent typed frontend response handling. Handle 401 from all protected API calls, including detection polling, without retry loops or falling back to an unprotected legacy endpoint.
- Mark authentication and user-specific responses `Cache-Control: no-store`; do not cache session validation across users.

## 5. Sessions, cookies, and security

- Use a cryptographically random opaque session token with at least 256 bits of entropy. Store only a hash of the token with user identity and absolute expiry in a server-side session store. Rotate the token on successful login and invalidate it on logout.
- A development-only in-memory store is acceptable when explicitly documented as single-process and cleared by restart. Production must use a shared persistent store that supports expiry and revocation across workers; fail startup if production storage is not configured. Document the selected store and required setup.
- Set the session cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production over HTTPS. Use a host-only cookie; permit non-Secure cookies only for explicit local HTTP development. Align browser cookie lifetime with server expiry, defaulting to eight hours with no implicit indefinite renewal.
- Never put credentials or session tokens in localStorage, sessionStorage, IndexedDB, URLs, frontend bundles, analytics, or logs. Never expose secrets through `NEXT_PUBLIC_*` variables.
- Protect state-changing cookie-authenticated endpoints, including login and logout, against CSRF. Validate the request origin against an exact configured allowlist and implement a session-bound CSRF token where needed; define handling for missing origins and test it. SameSite and CORS alone are not sufficient authorization checks.
- Apply the same CSRF policy at the backend for direct requests; trusted bridge forwarding must preserve the evidence needed for validation and must not trust arbitrary client-supplied forwarding headers.
- Replace permissive production CORS behavior with explicit allowed origins when CORS is needed. Never combine credentialed requests with wildcard origins. Document trusted reverse-proxy settings.
- Rate-limit login attempts by normalized account and trusted client address, with bounded cooldown and generic responses. Use shared enforcement in production. Do not let permanent account lockouts become a denial-of-service mechanism.
- Validate redirects against a local destination allowlist. Reject absolute URLs, protocol-relative URLs, encoded bypasses, and login loops; default to `/upload`.
- Fail closed when session verification or its store is unavailable. Show a service error without exposing protected content. Avoid logging cookies, authorization headers, passwords, hashes, or CSRF tokens.

## 6. Protected routes and integration

- Keep `/` and `/login` public. Protect `/upload` and any nested protected workspace routes with server-side session verification before rendering their client components.
- Preserve the existing client editor through a small server wrapper or protected layout. A navigation guard may improve UX, but backend validation and server-rendered route checks remain mandatory. Do not rely on cookie presence alone.
- An unauthenticated visit to `/upload` redirects to `/login?next=/upload`. After login, navigate to an allowed original destination or `/upload`. Authenticated visitors to `/login` should go to `/upload`.
- Protect `/pdf/info`, `/prepare`, `/detect`, `/detect/jobs`, and both GET and DELETE `/detect/jobs/{job_id}`. Associate jobs with the authenticated user and enforce ownership for polling/deletion; a guessed job ID must not grant access.
- Keep a minimal health check public so `components/backend-status.tsx` remains useful. Review API documentation exposure and avoid exposing private diagnostic data.
- Update relevant upload, PDF, detection, polling, and cancellation calls to the authenticated bridge. Preserve multipart boundaries, binary response handling, and metadata headers used by the UI.
- When a session expires during editing, stop protected requests and offer sign-in without silently deleting locally saved project work. Clear in-memory authentication state on logout and recheck authorization after browser back/forward navigation or reload.
- Existing browser project storage is not an authenticated multi-user database. Document its device-local behavior and any shared-device limitations; do not claim that login provides server-side project isolation or destructively clear projects without an explicit requirement.

## 7. Environment variables and setup documentation

Add documented examples to the appropriate example environment files during implementation. Preserve existing variables. Explain which process reads each variable, how the backend loads its environment, and which values require restart.

| Variable | Consumer and requirement |
| --- | --- |
| `AUTH_ENV` | FastAPI: explicit `development`, `test`, or `production`; missing/invalid values fail safely. |
| `AUTH_DEMO_ENABLED` | FastAPI: default false; explicitly enable only for local demo/test setup. |
| `AUTH_USERNAME` | FastAPI: `admin1234` in demo mode; explicit production account required. |
| `AUTH_PASSWORD_HASH` | FastAPI: required production password hash; document a safe hash-generation command. Demo mode may derive the demo hash server-side. |
| `AUTH_SESSION_TTL_SECONDS` | FastAPI: default `28800`, validate positive bounded values. |
| `AUTH_SESSION_STORE_URL` | FastAPI: selected shared production session store; never publish a real credential in examples. |
| `AUTH_COOKIE_SECURE` | Server cookie handling: false only in local HTTP development, enforced true in production. |
| `AUTH_ALLOWED_ORIGINS` | FastAPI and relevant bridge validation: exact frontend origins, such as `http://localhost:3000` for development. |
| `DETECTION_API_URL` | Next.js server only: upstream FastAPI origin, e.g. `http://localhost:8000`. |
| `NEXT_PUBLIC_DETECTION_API_URL` | Existing public configuration: preserve compatibility for any remaining public health call, or document migration of that call to a same-origin handler. Never use for secrets. |

Document cookie naming and any additional settings required by the chosen store, CSRF mechanism, or rate limiter. Use placeholders for secrets and fail startup on insecure production configuration. Keep real `.env` files ignored. Include local frontend/backend startup instructions and the exact demo login steps; production must never fall back to `admin1234`.

## 8. Testing and acceptance criteria

- Add backend tests using the existing FastAPI TestClient/httpx style. Authentication tests must run without YOLO inference or Blender; isolate external storage and use deterministic clocks for expiry tests where possible.
- Cover successful demo login, configured hash verification, incorrect username/password, missing/oversized/non-string input, cookie attributes, malformed/expired/revoked sessions, rotation, logout, replay after logout, rate limiting, and production configuration rejection.
- Verify every protected backend route rejects unauthenticated direct requests before expensive processing. Test job ownership, valid authenticated requests, CSRF failures, untrusted origins, and store outage behavior.
- Add browser coverage using the repository's Playwright approach: direct `/upload` access, successful login, refresh persistence, invalid credentials, backend outage, duplicate submission prevention, safe redirects, logout, expired sessions, and browser back navigation.
- Test responsive layout at 320px, tablet, and desktop widths, keyboard-only operation, labels, focus visibility, error announcements, and password visibility control.
- Update existing API/browser tests to authenticate through fixtures rather than disabling protection. Recheck upload/PDF preparation, detection jobs, 2D/3D editing, materials, and project save/load/export behavior.
- Run `npm run check` (lint, TypeScript, and production build), relevant existing `tests/*.cjs` checks using their documented commands, `python backend/test_api_smoke.py`, new auth tests, and affected browser tests. Inspect test entry points and requirements before choosing commands; do not invent an existing test script.
- Verify that production build output and browser storage contain no secrets or session tokens. Confirm actual cookie headers in local and production-mode tests.
- Report exact commands and results. Separate pre-existing failures and unavailable external dependencies from regressions; do not claim unrun tests passed or weaken checks to make them pass.

## 9. Git safety and final delivery

- Preserve all existing staged, unstaged, and untracked work. This repository may already have substantial local changes; record the baseline before implementation.
- Do not run destructive resets, clean commands, checkout/restore over user changes, blanket formatting, or unrelated dependency upgrades. Never stage all files automatically.
- Do not commit, push, force-push, switch branches, or modify Git history unless the user separately requests it.
- Keep changes limited to authentication, the integration points required to enforce it, relevant tests, and setup documentation. Review the final diff for unrelated changes and accidental credentials.
- Finish with a concise summary of behavior, changed files, environment/setup steps, local demo credentials, test results, and any remaining limitations. Do not declare production readiness while required security or verification work is incomplete.
