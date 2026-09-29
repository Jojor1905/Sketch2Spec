"""Run: python backend/test_auth.py. No inference, browser, or Redis required."""
import os
from io import BytesIO
from PIL import Image
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from auth_test_helpers import configure_test_auth, login_client

configure_test_auth()
from main import app, _jobs
from auth import Auth, Settings, COOKIE, digest, hasher


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings.load()
        app.state.auth = Auth(self.settings)
        self.client = TestClient(app)
        self.client.headers['Origin'] = 'http://localhost:3000'

    def login(self, **values):
        return self.client.post('/auth/login', json={'username': 'admin1234', 'password': 'admin1234', **values})

    def test_login_cookie_rotation_logout_replay(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'username': 'admin1234'})
        header = response.headers['set-cookie'].lower()
        for value in ['httponly', 'samesite=lax', 'path=/', 'max-age=28800']:
            self.assertIn(value, header)
        self.assertNotIn('secure', header)
        self.assertEqual(response.headers['cache-control'], 'no-store')
        old = self.client.cookies[COOKIE]
        self.assertEqual(self.client.get('/auth/me').status_code, 200)
        self.login()
        new = self.client.cookies[COOKIE]
        self.assertNotEqual(old, new)
        self.assertIsNone(app.state.auth.session(old))
        self.assertNotIn(new, repr(app.state.auth.store.values))
        self.assertEqual(self.client.post('/auth/logout').status_code, 200)
        self.assertIsNone(app.state.auth.session(new))
        self.assertEqual(self.client.post('/auth/logout').status_code, 200)
        self.assertEqual(self.client.get('/auth/me', headers={'Cookie': f'{COOKIE}={new}'}).status_code, 401)

    def test_validation_and_generic_errors(self):
        wrong_user = self.login(username='unknown')
        wrong_password = self.login(password='wrong')
        self.assertEqual(wrong_user.json(), wrong_password.json())
        self.assertEqual(wrong_user.status_code, 401)
        for body in [{}, {'username': 4, 'password': 'secret'}, {'username': 'x', 'password': []},
                     {'username': ' ', 'password': 'secret'}, {'username': 'a'*65, 'password': 'secret'},
                     {'username': 'x', 'password': ''}, {'username': 'x', 'password': 'a'*129}]:
            response = self.client.post('/auth/login', json=body)
            self.assertEqual(response.status_code, 422)
            self.assertNotIn('"input"', response.text)
        self.assertEqual(self.login(username=' admin1234 ').status_code, 200)
        self.assertEqual(self.login(password='admin1234 ').status_code, 401)

    def test_all_routes_require_auth_and_origin(self):
        for method, path in [('POST','/pdf/info'), ('POST','/prepare'), ('POST','/detect'), ('POST','/detect/jobs'), ('GET','/detect/jobs/'+'a'*32), ('DELETE','/detect/jobs/'+'a'*32)]:
            self.assertEqual(self.client.request(method, path).status_code, 401, path)
        for origin in ['', 'null', 'https://evil.example', 'http://localhost:3000.evil.example']:
            self.assertEqual(self.client.post('/auth/login', headers={'Origin': origin}, json={'username':'admin1234','password':'admin1234'}).status_code, 403)
        login_client(self.client)
        for path in ['/auth/logout', '/prepare', '/detect', '/detect/jobs', '/pdf/info']:
            self.assertEqual(self.client.post(path, headers={'Origin': 'https://evil.example'}).status_code, 403)
        self.client.headers.pop('Origin')
        self.assertEqual(self.client.post('/auth/logout').status_code, 403)
        self.assertEqual(self.client.get('/health').status_code, 200)

    def test_expired_malformed_and_unavailable(self):
        self.login()
        token = self.client.cookies[COOKIE]
        with patch('auth.time.time', return_value=10**12):
            self.assertEqual(self.client.get('/auth/me').status_code, 401)
        self.assertIsNone(app.state.auth.session('invalid'))
        with patch.object(app.state.auth.store, 'get', side_effect=RuntimeError('private store error')):
            response = self.client.get('/auth/me')
            self.assertEqual(response.status_code, 503)
            self.assertNotIn('private store', response.text)
        self.assertIsNotNone(app.state.auth.session(token))

    def test_rate_limit_and_cooldown(self):
        for _ in range(10):
            self.assertEqual(self.login(password='wrong').status_code, 401)
        self.assertEqual(self.login().status_code, 429)
        with patch('auth.time.time', return_value=10**12):
            self.assertEqual(self.login().status_code, 200)

    def test_job_ownership(self):
        self.login()
        key = 'a'*32
        _jobs[key] = {'owner': 'someone-else', 'updated_at': 10**12}
        self.assertEqual(self.client.get('/detect/jobs/'+key).status_code, 404)
        self.assertEqual(self.client.delete('/detect/jobs/'+key).status_code, 404)
        self.assertIn(key, _jobs)
        _jobs[key]['owner'] = 'admin1234'
        self.assertEqual(self.client.delete('/detect/jobs/'+key).status_code, 200)

    def test_authenticated_job_creation_and_polling(self):
        self.login()
        image = BytesIO()
        Image.new('RGB', (20, 20), 'white').save(image, format='PNG')
        with patch('main._executor.submit') as submit:
            response = self.client.post('/detect/jobs', files={'file': ('plan.png', image.getvalue(), 'image/png')})
        self.assertEqual(response.status_code, 202)
        submit.assert_called_once()
        key = response.json()['job_id']
        self.assertEqual(_jobs[key]['owner'], 'admin1234')
        response = self.client.get('/detect/jobs/'+key)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'queued')
        self.assertEqual(self.client.delete('/detect/jobs/'+key).status_code, 200)

    def test_peer_limit_ignores_forwarded_headers(self):
        peer_key = 's2s:limit:' + digest('peer:testclient')
        app.state.auth.store.set(peer_key, 60, 60)
        response = self.client.post('/auth/login', headers={'X-Forwarded-For':'203.0.113.9'},
                                    json={'username':'admin1234','password':'admin1234'})
        self.assertEqual(response.status_code, 429)

    def test_production_store_failure_prevents_startup(self):
        self.settings.store_url = 'redis://localhost:6379/0'
        self.settings.environment = 'production'
        with patch('auth.RedisStore', side_effect=ConnectionError('unavailable')), self.assertRaises(ConnectionError):
            Auth(self.settings)

    def test_configured_hash_and_secure_cookie(self):
        self.settings.password_hash = hasher.hash('a-real-test-password')
        self.settings.secure = True
        app.state.auth = Auth(self.settings)
        response = self.login(password='a-real-test-password')
        self.assertEqual(response.status_code, 200)
        self.assertIn('Secure', response.headers['set-cookie'])

    def test_production_guards(self):
        for changes in [{'AUTH_ENV': ''}, {'AUTH_ENV': 'invalid'}, {'AUTH_SESSION_TTL_SECONDS':'0'},
                        {'AUTH_ALLOWED_ORIGINS':'*'}, {'AUTH_ENV':'production'}, {'AUTH_COOKIE_SECURE':'perhaps'}]:
            with patch.dict(os.environ, changes), self.assertRaises((RuntimeError, ValueError)):
                Settings.load()
        valid = dict(AUTH_ENV='production', AUTH_DEMO_ENABLED='false', AUTH_USERNAME='operator',
                     AUTH_PASSWORD_HASH=hasher.hash('production-test-passphrase'), AUTH_COOKIE_SECURE='true',
                     AUTH_ALLOWED_ORIGINS='https://app.example.com', AUTH_SESSION_STORE_URL='redis://localhost:6379/0')
        with patch.dict(os.environ, valid):
            self.assertEqual(Settings.load().environment, 'production')
            for changes in [{'AUTH_DEMO_ENABLED':'true'}, {'AUTH_COOKIE_SECURE':'false'}, {'AUTH_SESSION_STORE_URL':''},
                            {'AUTH_USERNAME':'admin1234'}, {'AUTH_PASSWORD_HASH':hasher.hash('admin1234')}]:
                with patch.dict(os.environ, changes), self.assertRaises(RuntimeError):
                    Settings.load()


if __name__ == '__main__':
    unittest.main(verbosity=2)
