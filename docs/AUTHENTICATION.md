# Local login and authentication

Sketch2Spec uses Next.js route handlers for same-origin browser requests and FastAPI for credential verification and session ownership. The landing page and login page are public; `/upload` and the processing APIs require a valid session.

## Local setup (PowerShell, from the repository root)

Install frontend dependencies with `npm ci` if needed. Create a Python virtual environment if one does not already exist:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements-test.txt
Copy-Item .env.example .env.local
Copy-Item backend/.env.example backend/.env
backend/.venv/Scripts/python -m uvicorn main:app --app-dir backend --env-file backend/.env --host 127.0.0.1 --port 8000 --no-proxy-headers
```

Run `npm run dev` in a second terminal. Open `http://localhost:3000/login` and enter username **admin1234** and password **admin1234**. These defaults work only with explicit local demo mode. Use `localhost` consistently; other browser origins must be added explicitly to both allowlists.

Do not overwrite existing local environment files when copying examples; merge settings if files already exist. Next.js loads `.env.local`; FastAPI receives variables from the process environment or Uvicorn's explicit `--env-file` argument. Restart the relevant server after changing settings. Actual environment files are ignored by Git.

## Configuration

| Setting | Process | Behavior |
| --- | --- | --- |
| `DETECTION_API_URL` | Next.js server | Required upstream HTTP(S) origin; local example `http://localhost:8000`. Never exposed to browser code. |
| `AUTH_ALLOWED_ORIGINS` | Both servers | Required comma-separated exact frontend origins. No wildcards, paths, trailing slash, or opaque origins. |
| `AUTH_ENV` | FastAPI | Required: `development`, `test`, or `production`. |
| `AUTH_DEMO_ENABLED` | FastAPI | Defaults false; `true` explicitly enables local demo credentials. Production rejects it. |
| `AUTH_USERNAME` | FastAPI | Demo default `admin1234`; production requires an explicit different account. Case-sensitive; outer whitespace is trimmed. |
| `AUTH_PASSWORD_HASH` | FastAPI | Required Argon2 hash outside demo mode. Demo mode derives a hash server-side if omitted. |
| `AUTH_SESSION_TTL_SECONDS` | FastAPI | Default 28800 (eight hours); allowed range 60–86400. Absolute expiry, no renewal. |
| `AUTH_SESSION_STORE_URL` | FastAPI | Redis connection URL; mandatory in production. Example without credentials: `redis://127.0.0.1:6379/0`. |
| `AUTH_COOKIE_SECURE` | FastAPI | Defaults true; false allowed only for local HTTP development/test origins. Production enforces true. |
| `NEXT_PUBLIC_DETECTION_API_URL` | Legacy | Preserved in the example for compatibility; current browser health and processing requests use `/api` and no longer read this setting. |

Generate a production hash without putting the password into command history:

```powershell
backend/.venv/Scripts/python -c "from getpass import getpass; from argon2 import PasswordHasher; print(PasswordHasher().hash(getpass('Password: ')))"
```

Put the generated hash into the backend environment via a secret manager or ignored file. Production rejects the demo username/password, insecure cookies, non-HTTPS allowed origins, or missing Redis. Redis must be reachable at startup; failures during requests return 503 and never authorize access.

## Session and deployment behavior

- The `sketch2spec_session` cookie is host-only, HTTP-only, SameSite=Lax, Path=/, and Secure in production. It contains 32 random bytes encoded as a URL-safe token. Only its SHA-256 digest, account identity, and absolute expiry are stored server-side. Login rotates it; logout revokes it and clears the cookie.
- Local memory storage is single-process and resets when FastAPI restarts. Production uses Redis with TTLs and atomic rate-limit counters shared across workers. Provision Redis with authentication, restricted network access, TLS where needed (`rediss://`), and persistent storage/AOF. Use a dedicated database and a no-eviction policy; deploy Redis with a durability/availability policy suitable for session revocation. Do not expose Redis publicly.
- Login limits are 10 attempts per normalized account and 60 per socket peer in a fixed 60-second window, including successful attempts. Cooldown ends automatically. Forwarded IP headers are discarded by the bridge. Run Uvicorn with `--no-proxy-headers`; behind Next.js the peer limit intentionally applies to the bridge as a whole. Account limits remain shared. A future per-browser IP policy needs an explicitly authenticated proxy trust boundary.
- Mutating endpoints require an exact allowed `Origin`, including login/logout, even for CLI clients. Missing, `null`, and untrusted origins return 403. Strict Origin validation on every mutation is the CSRF protection; no JavaScript-readable session/CSRF cookie is needed for this same-origin application. The bridge forwards the original Origin, never an invented trusted Origin. CORS is an exact allowlist, not the authorization boundary.
- TLS must terminate at a trusted frontend reverse proxy; the Next.js-to-FastAPI connection should remain private or use HTTPS. Do not trust client-supplied forwarding headers. Browser auth traffic only uses the Next.js origin. The bridge accepts a fixed set of endpoints/methods and forwards the one session cookie plus required content headers.
- Auth and backend responses are uncached. Production FastAPI disables OpenAPI/docs. Public health returns readiness and format/size capabilities, without model filenames or private diagnostics.
- Detection jobs remain in the existing process-local store. Their owner is checked on polling/deletion. Multi-worker detection still requires sticky routing or a future shared job store; Redis sessions do not change the detection architecture.
- Browser project data remains device-local in IndexedDB. Login does not encrypt or isolate projects between people sharing a browser profile. Logout/expiry preserves saved projects. Use separate browser profiles on shared devices. No credentials or session tokens are stored in browser storage or returned in JSON.

## Tests

```powershell
npm run check
node tests/rooms.cjs
node tests/floor-plan-repair.cjs
backend/.venv/Scripts/python backend/test_auth.py
backend/.venv/Scripts/python backend/test_api_smoke.py
backend/.venv/Scripts/python backend/test_auth_browser.py
```

Browser tests require both local servers and installed Google Chrome. Existing browser regressions now sign in through the real API using `auth_test_helpers.py`. `TEST_AUTH_USERNAME` and `TEST_AUTH_PASSWORD` can supply a non-demo test account. Auth unit tests configure their own isolated test environment and do not perform inference. Run existing editor tests using their file-level instructions; `test_browser_workflow.py` additionally requires a detectable floor-plan image.

On Windows, set `$env:PYTHONUTF8='1'` before running browser tests so Thai console output and exported project files use UTF-8. Login test fixtures count toward the real rate limit; wait one minute between batches if a batch exceeds ten logins for the same account.

Implementation references: [Next.js cookies](https://nextjs.org/docs/app/api-reference/functions/cookies), [Argon2 password hashing](https://argon2-cffi.readthedocs.io/en/stable/), and [Redis atomic rate-limit counters](https://redis.io/docs/latest/commands/incr/).
