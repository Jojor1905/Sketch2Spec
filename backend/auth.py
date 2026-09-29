"""Server-owned opaque sessions. No authentication material is returned to JS."""
from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import threading
import time
from dataclasses import dataclass
from urllib.parse import urlsplit

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, StrictStr, field_validator

COOKIE = "sketch2spec_session"
hasher = PasswordHasher()


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


@dataclass
class Settings:
    environment: str
    username: str
    password_hash: str
    origins: list[str]
    secure: bool
    ttl: int
    store_url: str

    @classmethod
    def load(cls):
        environment = os.getenv("AUTH_ENV", "")
        if environment not in {"development", "test", "production"}:
            raise RuntimeError("Set AUTH_ENV explicitly to development, test, or production")
        demo_value = os.getenv("AUTH_DEMO_ENABLED", "false")
        secure_value = os.getenv("AUTH_COOKIE_SECURE", "true")
        if demo_value not in {"true", "false"} or secure_value not in {"true", "false"}:
            raise RuntimeError("Authentication boolean settings must be true or false")
        demo, secure = demo_value == "true", secure_value == "true"
        username = os.getenv("AUTH_USERNAME", "admin1234" if demo else "").strip()
        password_hash = os.getenv("AUTH_PASSWORD_HASH", "")
        if demo and not password_hash:
            password_hash = hasher.hash("admin1234")
        origins = [v.strip() for v in os.getenv("AUTH_ALLOWED_ORIGINS", "").split(",") if v.strip()]
        ttl = int(os.getenv("AUTH_SESSION_TTL_SECONDS", "28800"))
        store_url = os.getenv("AUTH_SESSION_STORE_URL", "")
        if not 1 <= len(username) <= 64 or not password_hash or not origins or not 60 <= ttl <= 86400:
            raise RuntimeError("Invalid or missing authentication configuration")
        try:
            hasher.check_needs_rehash(password_hash)
        except (InvalidHashError, ValueError) as exc:
            raise RuntimeError("AUTH_PASSWORD_HASH must be an Argon2 hash") from exc
        for origin in origins:
            parsed = urlsplit(origin)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
                raise RuntimeError("AUTH_ALLOWED_ORIGINS must contain exact origins")
            if (demo or not secure) and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
                raise RuntimeError("Demo and non-Secure cookies require local origins")
            if environment == "production" and parsed.scheme != "https":
                raise RuntimeError("Production origins require HTTPS")
        if store_url and urlsplit(store_url).scheme not in {"redis", "rediss"}:
            raise RuntimeError("AUTH_SESSION_STORE_URL must use Redis")
        if environment == "production":
            if demo or not secure or not store_url or username == "admin1234":
                raise RuntimeError("Production requires secure cookies, Redis, and explicit non-demo credentials")
            try:
                if hasher.verify(password_hash, "admin1234"):
                    raise RuntimeError("Production cannot use the demo password")
            except VerificationError:
                pass
        return cls(environment, username, password_hash, origins, secure, ttl, store_url)


class MemoryStore:
    """Local single-process store; all entries have bounded lifetimes."""
    def __init__(self):
        self.values = {}
        self.lock = threading.Lock()

    def get(self, key):
        with self.lock:
            entry = self.values.get(key)
            return entry[0] if entry and entry[1] > time.time() else None

    def set(self, key, value, ttl):
        with self.lock:
            now = time.time()
            self.values = {k: v for k, v in self.values.items() if v[1] > now}
            self.values[key] = (value, now + ttl)

    def delete(self, key):
        with self.lock:
            self.values.pop(key, None)

    def increment(self, key, ttl):
        with self.lock:
            now = time.time()
            self.values = {k: v for k, v in self.values.items() if v[1] > now}
            value, expiry = self.values.get(key, (0, now + ttl))
            self.values[key] = (value + 1, expiry)
            return value + 1


class RedisStore:
    def __init__(self, url):
        from redis import Redis
        self.client = Redis.from_url(url, decode_responses=True, socket_connect_timeout=3, socket_timeout=3)
        self.client.ping()

    def get(self, key):
        value = self.client.get(key)
        return json.loads(value) if value else None

    def set(self, key, value, ttl):
        self.client.set(key, json.dumps(value), ex=ttl)

    def delete(self, key):
        self.client.delete(key)

    def increment(self, key, ttl):
        return self.client.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, key, ttl)


class Auth:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.store = RedisStore(settings.store_url) if settings.store_url else MemoryStore()
        self.dummy_hash = hasher.hash(secrets.token_urlsafe(32))

    def call(self, operation, *args):
        try:
            return getattr(self.store, operation)(*args)
        except Exception as exc:
            raise HTTPException(503, "Authentication service unavailable") from exc

    def session(self, token):
        if not token or not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
            return None
        session = self.call("get", "s2s:session:" + digest(token))
        if not session or session["expires"] <= time.time():
            return None
        return session

    def revoke(self, token):
        if token:
            self.call("delete", "s2s:session:" + digest(token))


def auth_service(request: Request) -> Auth:
    return request.app.state.auth


def check_origin(request: Request):
    # Missing and opaque origins are rejected, including for non-browser callers.
    if request.headers.get("origin") not in auth_service(request).settings.origins:
        raise HTTPException(403, "Untrusted request origin")


def require_user(request: Request):
    session = auth_service(request).session(request.cookies.get(COOKIE))
    if not session:
        raise HTTPException(401, "Authentication required")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        check_origin(request)
    return {"username": session["username"]}


class Credentials(BaseModel):
    username: StrictStr
    password: StrictStr

    @field_validator("username")
    @classmethod
    def username_valid(cls, value):
        value = value.strip()
        if not 1 <= len(value) <= 64:
            raise ValueError("Username must contain 1–64 characters")
        return value

    @field_validator("password")
    @classmethod
    def password_valid(cls, value):
        if not 1 <= len(value) <= 128:
            raise ValueError("Password must contain 1–128 characters")
        return value


router = APIRouter(prefix="/auth")


@router.post("/login", dependencies=[Depends(check_origin)])
def login(credentials: Credentials, request: Request, response: Response):
    auth = auth_service(request)
    # Ignore forwarded client addresses: the socket peer is the only trusted address.
    peer = request.client.host if request.client else "unknown"
    counts = [auth.call("increment", "s2s:limit:" + digest(kind + value), 60)
              for kind, value in [("account:", credentials.username), ("peer:", peer)]]
    if counts[0] > 10 or counts[1] > 60:
        raise HTTPException(429, "Too many login attempts. Try again in one minute.", headers={"Retry-After": "60"})
    known = secrets.compare_digest(credentials.username.encode(), auth.settings.username.encode())
    try:
        valid = hasher.verify(auth.settings.password_hash if known else auth.dummy_hash, credentials.password)
    except (VerificationError, InvalidHashError):
        valid = False
    if not known or not valid:
        raise HTTPException(401, "Invalid username or password")
    auth.revoke(request.cookies.get(COOKIE))
    token = secrets.token_urlsafe(32)
    auth.call("set", "s2s:session:" + digest(token), {"username": credentials.username, "expires": time.time() + auth.settings.ttl}, auth.settings.ttl)
    response.set_cookie(COOKIE, token, max_age=auth.settings.ttl, httponly=True, secure=auth.settings.secure, samesite="lax", path="/")
    return {"username": credentials.username}


@router.get("/me")
def me(user=Depends(require_user)):
    return user


@router.post("/logout", dependencies=[Depends(check_origin)])
def logout(request: Request, response: Response):
    auth = auth_service(request)
    auth.revoke(request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE, path="/", secure=auth.settings.secure, httponly=True, samesite="lax")
    return {"ok": True}
