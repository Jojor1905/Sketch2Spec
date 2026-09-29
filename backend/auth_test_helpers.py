"""Sign in through real endpoints; never disable authentication in regressions."""
import os


def configure_test_auth():
    os.environ.update(AUTH_ENV="test", AUTH_DEMO_ENABLED="true", AUTH_COOKIE_SECURE="false",
                      AUTH_ALLOWED_ORIGINS="http://localhost:3000", AUTH_USERNAME="admin1234",
                      AUTH_PASSWORD_HASH="", AUTH_SESSION_STORE_URL="")


def login_client(client):
    client.headers.update({"Origin": "http://localhost:3000"})
    response = client.post("/auth/login", json={"username": "admin1234", "password": "admin1234"})
    response.raise_for_status()
    return client


def login_page(page):
    origin = os.getenv("TEST_FRONTEND_URL", "http://localhost:3000")
    response = page.context.request.post(origin + "/api/auth/login", headers={"Origin": origin},
        data={"username": os.getenv("TEST_AUTH_USERNAME", "admin1234"), "password": os.getenv("TEST_AUTH_PASSWORD", "admin1234")})
    assert response.ok, f"Test login failed: HTTP {response.status}"
