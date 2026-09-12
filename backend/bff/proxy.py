"""Explicit method/resource allowlist; no user-selected privileged destination."""
import re
from fastapi import APIRouter, Request, Depends
from .security import staff_session, STAFF, rate_limit
from .canonical import fail, UpstreamError
from .readiness import ensure_capability

router = APIRouter(prefix='/api/bff')
A = {'admin'}
T = {'admin', 'telecaller'}
B = {'admin', 'billing_executive'}
ID = r'[A-Za-z0-9_-]+'
RULES = [
    # Static search precedes the dynamic customer reference so 'search' is never treated as an ID (D2).
    ('GET', r'customers', A), ('GET', 'customers/search', B), ('GET|PATCH', rf'customers/{ID}', A),
    ('GET|POST', 'integrations/staff', A), ('PATCH|DELETE', rf'integrations/staff/{ID}', A),
    ('POST', rf'integrations/staff/{ID}/convert', A),
    ('GET', r'requests|requests/catalog|requests/staff-options', STAFF),
    ('GET', rf'requests/{ID}/history', STAFF), ('GET', 'requests/metrics/summary', T),
    ('PATCH', rf'requests/{ID}', T), ('POST', rf'requests/{ID}/claim', T),
    ('GET', 'rates/latest|rates/audit|rates/history|rate-list', B), ('POST', 'rates|rate-list', B),
    ('PUT|DELETE', rf'rate-list/{ID}', B),
    ('GET|POST', 'products', A), ('GET|PUT', rf'products/{ID}', A), ('POST', 'products/upload-image', A),
    ('GET', 'categories|analytics/dashboard|admin/media/usage', A), ('POST', 'admin/media/lifecycle-audit', A),
    ('GET', r'files/[A-Za-z0-9_./-]+', STAFF),
    ('GET', r'pdf-template/capabilities|pdf-template/sample.pdf|pdf-template/authoring.json', A),
    ('POST', 'pdf-template/export|pdf-upload/init', A),
    ('GET', rf'pdf-upload/{ID}/(status|preview)', A),
    ('POST', rf'pdf-upload/{ID}/(chunk|complete|pause|resume|cancel|commit)', A),
    ('GET', rf'pdf-upload/{ID}/rows/{ID}/image|pdf-upload/{ID}/pages/[0-9]+/image', A),
    ('PATCH', rf'pdf-upload/{ID}/rows/{ID}', A),
    ('GET|POST', 'batches', A), ('GET|PUT|DELETE', rf'batches/{ID}', A),
    ('GET', rf'batches/{ID}/images', A), ('PATCH', rf'batches/{ID}/visibility', A),
    ('POST', rf'batches/{ID}/images/delete', A),
    ('GET', 'banners/all|banners', A), ('POST', 'banners|banners/upload', A), ('PUT|DELETE', rf'banners/{ID}', A),
    ('GET', 'telecaller/customers|telecaller/summary', T),
    ('GET', rf'telecaller/customers/{ID}/activity', T), ('POST', rf'telecaller/customers/{ID}/action', T),
    ('GET|POST', 'rewards/config', A), ('POST', 'rewards/credit|rewards/deduct', B),
    ('GET', rf'rewards/customer/{ID}', B),
    ('GET|POST', 'about|schemes|brands|showroom|exhibitions|knowledge|stories', A),
    ('PUT|DELETE', rf'(schemes|brands|showroom|exhibitions)/{ID}', A),
    ('DELETE', rf'about/{ID}', A), ('GET', 'admin/deletion-requests|admin/ai/reports', A),
]


def authorize(method, path, role):
    if '..' in path or '//' in path or '%' in path:
        fail(400, 'INVALID_PATH', 'Invalid resource path.')
    for methods, pattern, roles in RULES:
        if method in methods.split('|') and re.fullmatch(pattern, path):
            if role not in roles:
                fail(403, 'PERMISSION_DENIED', 'Your current role cannot perform this operation.')
            return
    fail(404, 'UNSUPPORTED_OPERATION', 'This operation is not available in the website console.')


async def bounded_body(request, maximum):
    data = bytearray()
    async for part in request.stream():
        data.extend(part)
        if len(data) > maximum:
            fail(413, 'BODY_TOO_LARGE', 'Request exceeds the bounded transfer limit.')
    return bytes(data)


@router.api_route('/{path:path}', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
async def proxy(path: str, request: Request, session=Depends(staff_session)):
    authorize(request.method, path, session['user']['role'])
    params = dict(request.query_params)
    if 'limit' in params:
        try:
            if not 1 <= int(params['limit']) <= 100:
                raise ValueError()
        except ValueError:
            fail(422, 'INVALID_PAGINATION', 'Page size must be between 1 and 100.')
    if 'page' in params:
        try:
            if int(params['page']) < 1:
                raise ValueError()
        except ValueError:
            fail(422, 'INVALID_PAGINATION', 'Page must be at least 1.')
    if path == 'requests' and params.get('customer_id'):
        # Older app builds silently ignore customer_id (D3); never show another customer's history.
        await ensure_capability(request, 'customer_id_history', 'Complete customer history requires the updated Yash Trade App backend.')
    if request.method != 'GET':
        await rate_limit(request, 'mutation:'+session['user']['id'])
    upstream = request.app.state.canonical
    extra = {k: v for k, v in request.headers.items() if k in ('x-chunk-sha256', 'idempotency-key')}
    multipart = request.headers.get('content-type', '').startswith('multipart/form-data')
    media = path.startswith('files/') or path.endswith('/image') and params.get('metadata') != 'true' or path.endswith('.pdf') or path == 'pdf-template/export'
    try:
        if multipart:
            # One negotiated chunk or one image per request; raw multipart retained exactly.
            if not (path.endswith('/chunk') or path in ('products/upload-image', 'banners/upload')):
                fail(415, 'UNSUPPORTED_UPLOAD', 'Use the reviewed upload operation.')
            cap = (2 if path.endswith('/chunk') else 11)*1024*1024
            payload = await bounded_body(request, cap)
            return await upstream.binary(request.method, '/'+path, token=session['token'], params=params,
                                         content=payload, content_type=request.headers['content-type'], extra=extra)
        body = None
        if request.method in ('POST', 'PUT', 'PATCH'):
            import json
            raw = await bounded_body(request, 256*1024)
            try:
                body = json.loads(raw) if raw else {}
            except ValueError:
                fail(422, 'INVALID_JSON', 'Invalid request body.')
            if not isinstance(body, dict):
                fail(422, 'INVALID_JSON', 'An object is required.')
            if path.startswith('customers/') and 'phone' in body:
                fail(422, 'TARGETED_PHONE_CHANGE_UNSUPPORTED', 'Customer phone correction requires a separately supported canonical operation.')
            if re.fullmatch(rf'requests/{ID}(/claim)?', path) and ('version' not in body or not body.get('idempotency_key')):
                fail(428, 'VERSION_REQUIRED', 'Use the current request version and a stable mutation key.')
        if media:
            return await upstream.binary(request.method, '/'+path, token=session['token'], json=body, params=params)
        result = await upstream.request(request.method, '/'+path, token=session['token'], json=body, params=params, extra=extra)
        # Rewrite ONLY the exact configured canonical prefix. External legacy hosts remain
        # external and receive no canonical credentials from browser image rendering.
        prefix = request.app.state.cfg.base + '/files/'
        def media_refs(value):
            if isinstance(value, str) and value.startswith(prefix):
                return '/api/files/' + value[len(prefix):]
            if isinstance(value, list):
                return [media_refs(v) for v in value]
            if isinstance(value, dict):
                return {k: media_refs(v) for k, v in value.items() if k != '_id'}
            return value
        return media_refs(result)
    except UpstreamError as e:
        if e.status == 401:
            await request.app.state.db.bff_sessions.delete_one({'_id': session['sid']})
        raise