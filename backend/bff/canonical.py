"""Only this adapter makes network calls. Credentials never follow redirects."""
import re
import httpx
from fastapi.responses import StreamingResponse


class UpstreamError(Exception):
    def __init__(self, status, code, detail, fields=None):
        self.status, self.code, self.detail, self.fields = status, code, detail, fields


def fail(status, code, detail):
    raise UpstreamError(status, code, detail)


class Canonical:
    def __init__(self, cfg, transport=None):
        self.cfg, self.transport = cfg, transport

    def headers(self, path, token=None, key=None, extra=None):
        if not self.cfg.valid_base:
            fail(503, 'CONFIGURATION_REQUIRED', 'The verification service is not configured. Please contact the website administrator.')
        if not re.fullmatch(r'/[A-Za-z0-9_./-]+', path) or '..' in path or '//' in path:
            fail(400, 'INVALID_UPSTREAM_PATH', 'Invalid canonical resource path.')
        headers = {'Accept': 'application/json'}
        if key:
            name, value = ('X-Staff-Service-Key', self.cfg.staff_key) if key == 'staff' else ('X-Integration-Key', self.cfg.enrollment_key)
            if len(value) < 32 or (self.cfg.staff_key and self.cfg.staff_key == self.cfg.enrollment_key):
                fail(503, 'CONFIGURATION_REQUIRED', 'Separate canonical enrollment and staff credentials must be configured privately on both systems.')
            permitted = ('/auth/send-otp', '/auth/verify-otp')
            if path not in permitted and not (key == 'enrollment' and path.startswith('/integrations/') and not path.startswith('/integrations/staff')):
                fail(403, 'CREDENTIAL_SCOPE', 'Service credential is not permitted for this route.')
            headers[name] = value
        if token:
            headers['Authorization'] = 'Bearer ' + token
        for k, v in (extra or {}).items():
            if k.lower() in {'x-chunk-sha256', 'idempotency-key', 'x-verification-grant', 'x-forwarded-for'}:
                headers[k] = v
        return headers

    def client(self):
        return httpx.AsyncClient(transport=self.transport, timeout=httpx.Timeout(25, read=90), follow_redirects=False, trust_env=False)

    def error(self, r):
        if 200 <= r.status_code < 300:
            return
        try:
            body = r.json()
        except ValueError:
            body = {}
        code = body.get('code', 'CANONICAL_ERROR') if isinstance(body, dict) else 'CANONICAL_ERROR'
        if code in {'SERVICE_KEY_INVALID', 'INTEGRATION_KEY_INVALID', 'CONFIGURATION_REQUIRED'}:
            fail(503, 'AUTH_SERVICE_UNAVAILABLE', 'The verification service is temporarily unavailable. Please contact the website administrator.')
        detail = body.get('detail') if isinstance(body, dict) else None
        if not isinstance(detail, str):
            detail = 'Canonical request rejected. Review the submitted fields.'
        # Canonical validation error arrays can echo credentials; never forward them.
        for secret in (self.cfg.staff_key, self.cfg.enrollment_key, self.cfg.session_secret):
            if secret:
                detail = detail.replace(secret, '[redacted]')
        fail(r.status_code if r.status_code >= 400 else 503, code, detail[:1200])

    async def request(self, method, path, *, token=None, key=None, json=None, params=None, extra=None):
        headers = self.headers(path, token, key, extra)
        try:
            async with self.client() as client:
                r = await client.request(method, self.cfg.base + path, headers=headers, params=params, json=json)
                self.error(r)
                if r.status_code == 204:
                    return {}
                return r.json()
        except (httpx.HTTPError, ValueError):
            fail(503, 'UPSTREAM_UNCERTAIN', 'The canonical service did not confirm this request. No automatic mutation retry was made.')

    async def binary(self, method, path, *, token, params=None, json=None, content=None, content_type=None, extra=None, max_bytes=64*1024*1024):
        headers = self.headers(path, token, extra=extra)
        if content_type:
            headers['Content-Type'] = content_type
        client = self.client()
        try:
            req = client.build_request(method, self.cfg.base + path, headers=headers, params=params, json=json, content=content)
            r = await client.send(req, stream=True)
            if not 200 <= r.status_code < 300:
                await r.aread()
                self.error(r)
            typ = r.headers.get('content-type', '').split(';')[0]
            if typ == 'application/json':
                await r.aread()
                result = r.json()
                await r.aclose(); await client.aclose()
                return result
            if typ not in {'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'}:
                fail(503, 'UNSAFE_MEDIA', 'Unsupported canonical media response.')
            if int(r.headers.get('content-length', 0)) > max_bytes:
                fail(413, 'MEDIA_TOO_LARGE', 'Canonical media exceeds the bounded transfer limit.')
        except (httpx.HTTPError, ValueError):
            await client.aclose()
            fail(503, 'UPSTREAM_UNCERTAIN', 'Transfer interrupted. Reconcile status before retrying.')
        except Exception:
            await client.aclose()
            raise

        async def stream():
            size = 0
            try:
                async for chunk in r.aiter_bytes(65536):
                    size += len(chunk)
                    if size > max_bytes:
                        raise IOError('Bounded canonical transfer exceeded')
                    yield chunk
            finally:
                await r.aclose(); await client.aclose()
        return StreamingResponse(stream(), media_type=typ, headers={'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff', **({'Content-Disposition': 'attachment; filename="Yash-Catalog-v1.pdf"'} if typ == 'application/pdf' else {})})