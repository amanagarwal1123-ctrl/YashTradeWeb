import asyncio
import hashlib
import hmac
import ipaddress
import secrets
import time
from datetime import datetime, timezone, timedelta
from pymongo import ReturnDocument
from fastapi import Request
from fastapi.responses import JSONResponse
from .canonical import fail, UpstreamError

COOKIE = '__Host-yash_session'
BROWSER = '__Host-yash_browser'
STAFF = {'admin', 'telecaller', 'billing_executive', 'upload_executive'}


def now():
    return datetime.now(timezone.utc)


def digest(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def cookie(response, name, value, seconds):
    response.set_cookie(name, value, max_age=seconds, secure=True, httponly=True, samesite='lax', path='/')


def client_ip(request):
    peer = request.client.host if request.client else 'unknown'
    cfg = request.app.state.cfg
    try:
        networks = [ipaddress.ip_network(v) for v in cfg.trusted_ingress]
        if not any(ipaddress.ip_address(peer) in net for net in networks):
            return peer
        # Walk right-to-left; never trust an attacker-prepended address.
        chain = [v.strip() for v in request.headers.get('x-forwarded-for', '').split(',') if v.strip()] + [peer]
        for value in reversed(chain):
            if not any(ipaddress.ip_address(value) in net for net in networks):
                return value
    except ValueError:
        return peer
    return peer


async def rate_limit(request, action, phone=''):
    db = request.app.state.db
    limits = [('ip:'+client_ip(request), 80), ('browser:'+request.cookies.get(BROWSER, ''), 30), ('phone:'+phone, 20)]
    if action.startswith('mutation:'):
        # Up to64 one-MiB PDF chunks must not exhaust an OTP-sized20 limit.
        limits = [('ip:'+client_ip(request), 600), ('browser:'+request.cookies.get(BROWSER, ''), 400)]
    for key, maximum in limits:
        bucket = int(time.time()) // 600
        row = await db.bff_limits.find_one_and_update({'_id': digest(action+key+str(bucket))},
            {'$inc': {'count': 1}, '$setOnInsert': {'expires_at': now()+timedelta(minutes=20)}},
            upsert=True, projection={'_id': 0}, return_document=ReturnDocument.AFTER)
        if row['count'] > maximum:
            fail(429, 'BFF_RATE_LIMIT', 'Too many attempts. Please wait before trying again.')


async def browser(request):
    raw = request.cookies.get(BROWSER, '')
    row = await request.app.state.db.bff_browsers.find_one({'_id': digest(raw), 'expires_at': {'$gt': now()}}, {'_id': 0}) if raw else None
    if not row:
        fail(403, 'BROWSER_REQUIRED', 'Reload this page to start a secure request.')
    return digest(raw), row


async def security_middleware(request, call_next):
    try:
        if request.url.path.startswith('/api/') and request.method not in {'GET', 'HEAD', 'OPTIONS'}:
            origin, cfg = request.headers.get('origin'), request.app.state.cfg
            # The observed preview ingress rewrites Origin to an exact cloud alias.
            # Never derive trust from Host/X-Forwarded-Host. On that path ALSO require
            # the same-origin JS custom header (CORS preflight remains denied), CSRF
            # cookie+token and Fetch-Metadata checks. Missing Origin is always denied.
            direct = origin in cfg.origins
            pinned_ingress = origin in cfg.ingress_origins and request.headers.get('x-website-origin') in cfg.origins
            if not (direct or pinned_ingress):
                fail(403, 'ORIGIN_REJECTED', 'Request origin is not permitted.')
            if request.headers.get('sec-fetch-site') == 'cross-site':
                fail(403, 'ORIGIN_REJECTED', 'Cross-site request rejected.')
            _, row = await browser(request)
            csrf = request.headers.get('x-csrf-token', '')
            if not csrf or not hmac.compare_digest(digest(csrf), row['csrf_hash']):
                fail(403, 'CSRF_REJECTED', 'Security token expired. Reload the form before retrying.')
        response = await call_next(request)
    except UpstreamError as exc:
        response = JSONResponse({'code': exc.code, 'detail': exc.detail}, status_code=exc.status)
    response.headers['Cache-Control'] = 'private, no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    return response


def public_staff(user):
    role = 'telecaller' if user.get('role') == 'executive' else user.get('role')
    if role not in STAFF:
        fail(403, 'STAFF_ONLY', 'Customers use the Yash Trade App, not the staff console.')
    if any(user.get(k) in {'inactive', 'disabled', 'blocked', 'deleted'} for k in ('status', 'account_status')) or user.get('account_status', user.get('status')) != 'active':
        fail(403, 'ACCOUNT_INACTIVE', 'This staff account is not active.')
    return {k: user.get(k) for k in ('id', 'name', 'phone', 'account_status', 'status')} | {'role': role}


async def rotate(request, sid, row):
    """Persistent CAS lease: a lost/uncertain refresh ends the session, never reuses its token."""
    db, upstream = request.app.state.db, request.app.state.canonical
    for _ in range(120):
        fresh = await db.bff_sessions.find_one({'_id': sid}, {'_id': 0})
        if not fresh:
            fail(401, 'SESSION_REVOKED', 'Please sign in again.')
        if fresh.get('access_until', 0) > time.time()+45:
            return fresh
        if fresh.get('refresh_owner'):
            if fresh.get('refresh_deadline', 0) < time.time():
                await db.bff_sessions.delete_one({'_id': sid})
                fail(401, 'REFRESH_UNCERTAIN', 'Refresh was interrupted. A fresh login is required.')
            await asyncio.sleep(.1)
            continue
        owner = secrets.token_urlsafe(24)
        claimed = await db.bff_sessions.find_one_and_update({'_id': sid, 'generation': fresh['generation'], 'refresh_owner': {'$exists': False}},
            {'$set': {'refresh_owner': owner, 'refresh_deadline': time.time()+120}}, projection={'_id': 0}, return_document=ReturnDocument.AFTER)
        if not claimed:
            continue
        try:
            tokens = await upstream.request('POST', '/auth/refresh', json={'refresh_token': claimed['refresh_token']})
            if tokens.get('user', {}).get('id') != claimed['canonical_user_id']:
                fail(401, 'SUBJECT_CHANGED', 'Canonical subject changed; sign in again.')
            public_staff(tokens['user'])
            changes = {'access_token': tokens['token'], 'refresh_token': tokens['refresh_token'],
                       'access_until': datetime.fromisoformat(tokens['expires_at'].replace('Z', '+00:00')).timestamp()}
            saved = await db.bff_sessions.update_one({'_id': sid, 'refresh_owner': owner},
                {'$set': changes, '$inc': {'generation': 1}, '$unset': {'refresh_owner': '', 'refresh_deadline': ''}})
            if not saved.modified_count:
                fail(401, 'SESSION_REVOKED', 'Session ended during refresh.')
            return {**claimed, **changes}
        except Exception:
            await db.bff_sessions.delete_one({'_id': sid})
            fail(401, 'REFRESH_ENDED', 'Refresh could not be confirmed. Please sign in again.')
    fail(503, 'REFRESH_IN_PROGRESS', 'Session refresh is in progress. Retry the read shortly.')


async def staff_session(request: Request):
    raw = request.cookies.get(COOKIE, '')
    sid, db = digest(raw), request.app.state.db
    row = await db.bff_sessions.find_one({'_id': sid, 'expires_at': {'$gt': now()}, 'last_active': {'$gt': time.time()-7200}}, {'_id': 0}) if raw else None
    if not row:
        fail(401, 'AUTH_REQUIRED', 'Please sign in to the staff console.')
    if row.get('access_until', 0) <= time.time()+45:
        row = await rotate(request, sid, row)
    try:
        me = public_staff(await request.app.state.canonical.request('GET', '/auth/me', token=row['access_token']))
        if me['id'] != row['canonical_user_id']:
            fail(401, 'SUBJECT_CHANGED', 'Session subject changed.')
    except UpstreamError as e:
        if e.status in (401, 403):
            await db.bff_sessions.delete_one({'_id': sid})
        raise
    await db.bff_sessions.update_one({'_id': sid}, {'$set': {'last_active': time.time()}})
    return {'sid': sid, 'token': row['access_token'], 'user': me}