"""Run with local servers: python backend/test_auth_browser.py (installed Chrome)."""
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ORIGIN = 'http://localhost:3000'
OUT = Path(__file__).parent / 'test_results'
OUT.mkdir(exist_ok=True)


def fill(page, password='admin1234'):
    page.get_by_label('Username /').fill('admin1234')
    page.get_by_label('Password /', exact=False).fill(password)


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 900})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(ORIGIN + '/upload')
    expect(page).to_have_url(re.compile(r'/login\?next=/upload$'))
    page.get_by_role('button', name='Sign in', exact=True).click()
    expect(page.get_by_text('Enter a username of 1–64 characters.')).to_be_visible()
    expect(page.get_by_label('Username /')).to_be_focused()
    fill(page, 'wrong-password')
    page.get_by_role('button', name='Show password').click()
    expect(page.locator('#password')).to_have_attribute('type', 'text')
    page.get_by_role('button', name='Hide password').click()
    page.get_by_role('button', name='Sign in', exact=True).click()
    expect(page.get_by_text('Invalid username or password.')).to_be_visible()
    expect(page.locator('#password')).to_have_value('')
    expect(page.locator('#username')).to_have_value('admin1234')
    page.route('**/api/auth/login', lambda route: route.fulfill(status=503, json={'detail':'unavailable'}))
    fill(page)
    page.get_by_role('button', name='Sign in', exact=True).click()
    expect(page.get_by_text('Sign-in service unavailable. Please try again.')).to_be_visible()
    expect(page.get_by_role('button', name='Sign in', exact=True)).to_be_enabled()
    page.unroute('**/api/auth/login')

    pending = []
    page.route('**/api/auth/login', lambda route: pending.append(route))
    fill(page)
    page.get_by_role('button', name='Sign in', exact=True).click()
    expect(page.get_by_role('button', name='Signing in…', exact=True)).to_be_disabled()
    page.locator('form').evaluate("form => form.requestSubmit()")
    page.wait_for_timeout(100)
    assert len(pending) == 1
    pending[0].fulfill(status=503, json={'detail':'unavailable'})
    expect(page.get_by_role('button', name='Sign in', exact=True)).to_be_enabled()
    page.unroute('**/api/auth/login')

    for width, height in [(320, 740), (768, 1024), (1280, 900)]:
        page.set_viewport_size({'width':width,'height':height})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        expect(page.get_by_role('button', name='Sign in', exact=True)).to_be_visible()
        page.screenshot(path=str(OUT / f'login-{width}.png'), full_page=True)
    page.locator('#username').focus()
    page.keyboard.press('Tab')
    expect(page.locator('#password')).to_be_focused()
    page.keyboard.press('Tab')
    expect(page.get_by_role('button', name='Show password')).to_be_focused()
    print('PASS: validation, accessible labels/tab order, errors, password visibility, responsive login', flush=True)

    page.goto(ORIGIN + '/login?next=https://evil.example')
    fill(page)
    page.get_by_role('button', name='Sign in', exact=True).click()
    expect(page).to_have_url(ORIGIN + '/upload')
    expect(page.get_by_role('button', name='Sign out', exact=True)).to_be_visible()
    cookies = context.cookies()
    session = next(cookie for cookie in cookies if cookie['name'] == 'sketch2spec_session')
    assert session['httpOnly'] and session['sameSite'] == 'Lax' and not session['secure']
    assert 'sketch2spec_session' not in page.evaluate('document.cookie')
    assert page.evaluate('Object.keys(localStorage).length + Object.keys(sessionStorage).length') == 0
    page.reload()
    expect(page.get_by_role('button', name='Sign out', exact=True)).to_be_visible()
    page.goto(ORIGIN + '/login')
    expect(page).to_have_url(ORIGIN + '/upload')
    print('PASS: real login, safe redirect, HTTP-only session, refresh persistence, authenticated login redirect', flush=True)

    page.route('**/api/auth/logout', lambda route: route.fulfill(status=503,json={'detail':'unavailable'}))
    page.get_by_role('button', name='Sign out', exact=True).click()
    expect(page.get_by_text('Could not sign out. Please try again.')).to_be_visible()
    page.unroute('**/api/auth/logout')
    page.get_by_role('button', name='Sign out', exact=True).click()
    expect(page).to_have_url(ORIGIN + '/login')
    assert context.request.get(ORIGIN+'/api/auth/me').status == 401
    page.go_back()
    expect(page.get_by_role('button',name='Sign out',exact=True)).not_to_be_visible()
    print('PASS: logout retry, revocation, and back navigation protection', flush=True)

    page.goto(ORIGIN+'/login')
    fill(page)
    page.get_by_role('button',name='Sign in',exact=True).click()
    expect(page).to_have_url(ORIGIN+'/upload')
    expect(page.get_by_role('button', name='Sign out', exact=True)).to_be_visible()
    context.clear_cookies()
    page.evaluate("window.dispatchEvent(new Event('focus'))")
    expect(page.get_by_role('heading',name='Please sign in again')).to_be_visible()
    expect(page.get_by_label('อัปโหลดแปลน',exact=True)).not_to_be_visible()
    print('PASS: expired session hides workspace and offers sign-in', flush=True)
    assert not errors, errors
    browser.close()
