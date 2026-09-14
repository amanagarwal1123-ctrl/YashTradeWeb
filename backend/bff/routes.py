import secrets
import time
from datetime import datetime, timedelta
from typing import Literal
from fastapi import APIRouter, Request, Response, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from .canonical import fail, UpstreamError
from .security import browser, cookie, digest, now, rate_limit, staff_session, public_staff, COOKIE, BROWSER, client_ip
from .readiness import ensure_flow
from . import winback

router = APIRouter(prefix='/api')


class Phone(BaseModel):
    model_config = ConfigDict(extra='forbid')
    phone: str = Field(pattern=r'^[6-9][0-9]{9}$')


class Verify(Phone):
    otp: str = Field(pattern=r'^[0-9]{4}$')
    challenge_id: str = Field(min_length=1, max_length=160)


class DeletionConfirm(Verify):
    winback_consent: bool = False  # explicit, unticked by default: keep name/phone for offers after deletion
    reason: Literal[winback.REASONS] | None = None


class DeletionCallback(Verify):
    note: str = Field('', max_length=300)


class Enrollment(Phone):
    name: str = Field(min_length=2, max_length=120)
    shop_name: str = Field(min_length=2, max_length=160)
    location: str = Field(min_length=2, max_length=160)
    consent_terms: Literal[True]
    consent_privacy: Literal[True]

    @field_validator('name', 'shop_name', 'location')
    @classmethod
    def required_text(cls, value):
        if len(value.strip()) < 2:
            raise ValueError('Required field')
        return value.strip()


@router.get('/security/csrf')
async def csrf(request: Request, response: Response):
    raw = request.cookies.get(BROWSER)
    db = request.app.state.db
    existing = await db.bff_browsers.find_one({'_id': digest(raw), 'expires_at': {'$gt': now()}}, {'_id': 0}) if raw else None
    if not existing:
        raw = secrets.token_urlsafe(32)
    # Keep a stable per-browser synchronizer token across tabs.
    secret = request.app.state.cfg.session_secret
    if len(secret) < 32:
        fail(503, 'CONFIGURATION_REQUIRED', 'Website session security is not configured.')
    import hmac, hashlib
    token = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
    await db.bff_browsers.update_one({'_id': digest(raw)}, {'$set': {'csrf_hash': digest(token), 'expires_at': now()+timedelta(days=1)}}, upsert=True)
    cookie(response, BROWSER, raw, 86400)
    return {'csrf_token': token}


def ip_headers(request):
    cfg = request.app.state.cfg
    return {'X-Forwarded-For': client_ip(request)} if cfg.forward_client_ip and cfg.trusted_ingress else {}


async def send(request, body, purpose):
    await ensure_flow(request, 'staff' if purpose == 'login' else purpose)
    bid, _ = await browser(request)
    if purpose == 'enrollment':
        old = await request.app.state.db.bff_drafts.find_one({'_id': bid+':enrollment'}, {'_id': 0})
        if old and old.get('verified_payload'):
            fail(409, 'SUBMISSION_PENDING', 'Resolve the verified submission before requesting a new enrollment code.')
    await rate_limit(request, 'send', body.phone)
    payload = {'phone': body.phone, 'purpose': purpose}
    if purpose == 'login':
        payload['channel'] = 'portal'
    result = await request.app.state.canonical.request('POST', '/auth/send-otp', json=payload,
        key='staff' if purpose == 'login' else 'enrollment', extra=ip_headers(request))
    if not all(k in result for k in ('challenge_id', 'otp_length', 'expires_in', 'resend_after')):
        fail(503, 'CONTRACT_MISMATCH', 'Canonical challenge metadata is incomplete.')
    saved = {'phone': body.phone, 'purpose': purpose, 'challenge': result, 'sent_at': time.time(),
             'expires_at': now()+timedelta(days=1), 'phase': 'otp'}
    if purpose == 'enrollment':
        saved['payload'] = {**body.model_dump(), 'idempotency_key': secrets.token_urlsafe(24), 'consent_version': 'website-shared-v1'}
    await request.app.state.db.bff_drafts.replace_one({'_id': bid+':'+purpose}, saved, upsert=True)
    return result


@router.post('/admin/auth/send-otp')
async def staff_send(body: Phone, request: Request):
    return await send(request, body, 'login')


@router.post('/enroll/send-otp')
async def enrollment_send(body: Enrollment, request: Request):
    return await send(request, body, 'enrollment')


async def get_draft(request, purpose):
    bid, _ = await browser(request)
    draft = await request.app.state.db.bff_drafts.find_one({'_id': bid+':'+purpose, 'expires_at': {'$gt': now()}}, {'_id': 0})
    if not draft:
        fail(400, 'CHALLENGE_REQUIRED', 'Request a fresh verification code.')
    return bid+':'+purpose, draft


async def verify_challenge(request, body, purpose):
    await ensure_flow(request, 'staff' if purpose == 'login' else purpose)
    did, draft = await get_draft(request, purpose)
    if body.phone != draft['phone'] or body.challenge_id != draft['challenge']['challenge_id']:
        fail(400, 'CHALLENGE_MISMATCH', 'Use the code from this verification request.')
    await rate_limit(request, 'verify', body.phone)
    payload = {**body.model_dump(), 'purpose': purpose}
    if purpose == 'login':
        payload['channel'] = 'portal'
    result = await request.app.state.canonical.request('POST', '/auth/verify-otp', json=payload,
        key='staff' if purpose == 'login' else 'enrollment', extra=ip_headers(request))
    return did, draft, result


@router.post('/admin/auth/verify-otp')
async def staff_verify(body: Verify, request: Request, response: Response):
    did, _, tokens = await verify_challenge(request, body, 'login')
    # No privileged website session is created until /me succeeds with an active staff role.
    me = public_staff(await request.app.state.canonical.request('GET', '/auth/me', token=tokens['token']))
    if me.get('id') != tokens.get('user', {}).get('id'):
        fail(401, 'SUBJECT_CHANGED', 'Canonical identity did not match verification.')
    db = request.app.state.db
    old = request.cookies.get(COOKIE)
    if old:
        await db.bff_sessions.delete_one({'_id': digest(old)})
    raw = secrets.token_urlsafe(48)
    await db.bff_sessions.insert_one({'_id': digest(raw), 'canonical_user_id': me['id'], 'phone': me['phone'],
        'access_token': tokens['token'], 'refresh_token': tokens['refresh_token'],
        'access_until': datetime.fromisoformat(tokens['expires_at'].replace('Z', '+00:00')).timestamp(),
        'generation': 0, 'last_active': time.time(), 'expires_at': now()+timedelta(days=30)})
    await db.bff_drafts.delete_one({'_id': did})
    cookie(response, COOKIE, raw, 30*86400)
    return me


@router.get('/admin/auth/me')
async def me(session=Depends(staff_session)):
    return session['user']


@router.post('/admin/auth/logout')
async def logout(request: Request, response: Response):
    db = request.app.state.db
    raw = request.cookies.get(COOKIE, '')
    row = await db.bff_sessions.find_one({'_id': digest(raw)}, {'_id': 0})
    error = None
    try:
        if row:
            from .security import rotate
            if row['access_until'] <= time.time()+45:
                row = await rotate(request, digest(raw), row)
            await request.app.state.canonical.request('POST', '/auth/logout', token=row['access_token'])
    except UpstreamError as exc:
        error = exc
    finally:
        await db.bff_sessions.delete_one({'_id': digest(raw)})
        response.delete_cookie(COOKIE, secure=True, httponly=True, samesite='lax', path='/')
    if error:
        response.status_code = 503
        return {'logged_out': True, 'canonical_revoked': False, 'code': 'REVOCATION_UNCONFIRMED',
                'detail': 'Website session cleared. Canonical family revocation was not confirmed.'}
    return {'logged_out': True, 'canonical_revoked': True}


async def persist_enrollment(request, did, draft):
    if draft.get('phase') == 'complete':
        return draft['result']
    payload = draft.get('verified_payload')
    if not payload:
        fail(401, 'VERIFICATION_REQUIRED', 'Verify the enrollment phone first.')
    try:
        result = await request.app.state.canonical.request('POST', '/integrations/enrollments', key='enrollment', json=payload)
    except UpstreamError as exc:
        if exc.code in {'GRANT_EXPIRED', 'GRANT_INVALID', 'VERIFICATION_REQUIRED', 'DELETED_IDENTITY'}:
            await request.app.state.db.bff_drafts.update_one({'_id': did}, {'$unset': {'verified_payload': ''}, '$set': {'phase': 'verification_required'}})
        raise
    customer = result.get('customer', {})
    if not customer.get('id') or customer.get('phone') != draft['phone'] or not customer.get('step1_complete', customer.get('onboarding_status') == 'completed'):
        fail(503, 'PERSISTENCE_UNCONFIRMED', 'Canonical registration has not been confirmed. Retry this submission, not a new OTP.')
    safe = {'customer': {k: customer.get(k) for k in ('id', 'name', 'phone', 'shop_name', 'location', 'city', 'step1_complete')},
            'download': request.app.state.cfg.downloads()}
    await request.app.state.db.bff_drafts.update_one({'_id': did}, {'$set': {'phase': 'complete', 'canonical_user_id': customer['id'], 'result': safe},
                                                                '$unset': {'verified_payload': '', 'payload': ''}})
    await winback.note_returning(request.app.state.db, request.app.state.cfg, draft['phone'], customer['id'])
    return safe


@router.post('/enroll/verify-otp')
async def enrollment_verify(body: Verify, request: Request):
    did, draft = await get_draft(request, 'enrollment')
    if draft.get('verified_payload') or draft['phase'] == 'complete':
        return await persist_enrollment(request, did, draft)
    # Canonical challenge atomic single-use protects duplicate verification; retries use /complete.
    did, draft, grant = await verify_challenge(request, body, 'enrollment')
    payload = {**draft['payload'], 'verification_grant': grant['verification_grant']}
    await request.app.state.db.bff_drafts.update_one({'_id': did}, {'$set': {'verified_payload': payload, 'phase': 'verified_pending'}})
    return await persist_enrollment(request, did, {**draft, 'verified_payload': payload})


@router.post('/enroll/complete')
async def enrollment_complete(request: Request):
    did, draft = await get_draft(request, 'enrollment')
    return await persist_enrollment(request, did, draft)


@router.post('/enroll/resend-otp')
async def resend(request: Request):
    _, draft = await get_draft(request, 'enrollment')
    if draft.get('verified_payload') or draft['phase'] == 'complete':
        fail(409, 'SUBMISSION_PENDING', 'Retry the verified submission before requesting another OTP.')
    return await send(request, Enrollment(**{k: v for k, v in draft['payload'].items() if k in Enrollment.model_fields}), 'enrollment')


@router.get('/enroll/state')
async def enrollment_state(request: Request):
    try:
        _, draft = await get_draft(request, 'enrollment')
        return {k: draft.get(k) for k in ('phase', 'phone', 'challenge', 'sent_at', 'result')}
    except UpstreamError as e:
        if e.status in (400, 403):
            return {'phase': 'form'}
        raise


@router.get('/public/config')
async def public_config(request: Request):
    return {'company_name': 'Yash Ornaments', 'legal_entity': 'Yash Silver House Pvt. Ltd.',
            'support_email': 'info@yashornaments.in', 'download': request.app.state.cfg.downloads(),
            'privacy_updated': '2026-09-14', 'deletion_sla_days': 30,
            'deletion_url': 'https://register.yashsilver.com/delete-account', 'privacy_url': 'https://register.yashsilver.com/privacy'}


@router.post('/delete/send-otp')
async def deletion_send(body: Phone, request: Request):
    return await send(request, body, 'deletion')


@router.post('/delete/confirm')
async def deletion_confirm(body: DeletionConfirm, request: Request):
    did, draft, grant = await verify_challenge(request, body, 'deletion')
    before = await winback.profile(request, body.phone)  # read once, before erasure, for consented win-back / anonymous churn only
    result = await request.app.state.canonical.request('DELETE', '/integrations/customers/'+body.phone,
        key='enrollment', extra={'X-Verification-Grant': grant['verification_grant']})
    if not result.get('deleted') or not result.get('reference'):
        fail(503, 'DELETION_UNCONFIRMED', 'Canonical deletion was not confirmed.')
    db, cfg = request.app.state.db, request.app.state.cfg
    await winback.remember_deleted_number(db, cfg, body.phone)
    await winback.stage_churn_detail(db, result['reference'], before, body.reason)
    if body.winback_consent:
        await winback.save_contact(db, body.phone, before, 'deletion_optin', 'new', reason=body.reason)
    await db.bff_drafts.delete_many({'phone': body.phone})
    await db.bff_sessions.delete_many({'phone': body.phone})
    cleanup = await consume_deletions(request)
    reference = result['reference']
    return {**result, 'website_cleanup': cleanup, 'winback_contact_kept': body.winback_consent,
            'website_acknowledged': reference in cleanup['acknowledged_events'],
            'deletion_complete': reference in cleanup['completed_events'],
            'awaiting_other_consumers': cleanup['awaiting_other_consumers'],
            'provider_copies_erased': False}


@router.post('/delete/callback')
async def deletion_callback(body: DeletionCallback, request: Request):
    """'Talk to us first': the same deletion OTP proves number ownership, the account is KEPT, and a consented
    callback request is recorded for the team. The canonical verification grant is discarded unused."""
    did, draft, _ = await verify_challenge(request, body, 'deletion')
    before = await winback.profile(request, body.phone)
    reference = await winback.save_contact(request.app.state.db, body.phone, before, 'pre_deletion_callback', 'callback_requested',
                                           note=body.note.strip() or None)
    await request.app.state.db.bff_drafts.delete_one({'_id': did})
    return {'callback_requested': True, 'account_deleted': False, 'reference': reference}


async def consume_deletions(request):
    """Cursor-paginated, consumer-specific deletion feed (app D4). Each event's website cleanup runs
    first; only fully completed cleanup is acknowledged, one event at a time, so a crash, restart or
    partial failure re-delivers the unacknowledged remainder. Acks are idempotent upstream."""
    db, upstream = request.app.state.db, request.app.state.canonical
    snapshot = await request.app.state.readiness.snapshot()
    cursor_feed = snapshot['upstream']['capabilities'].get('deletion_outbox_cursor', False)
    acknowledged, blocked, failed, seen, cursor = 0, 0, 0, 0, ''
    acknowledged_events, completed_events, awaiting = [], [], set()
    for _ in range(50):  # bounded: at most 50 pages x 100 events per reconcile run
        params = {'limit': 100, **({'after': cursor} if cursor else {})}
        page = await upstream.request('GET', '/integrations/deletions', key='enrollment', params=params)
        events = page.get('events')
        if not isinstance(events, list):
            fail(503, 'CONTRACT_MISMATCH', 'Canonical deletion feed shape is not recognised.')
        for event in events:
            seen += 1
            if event.get('type') != 'account_erased' or 'website' in event.get('acknowledged', []) or not event.get('id'):
                continue
            outcome = await cleanup_event(db, event, request.app.state.cfg)
            if outcome == 'blocked':
                blocked += 1
                continue
            try:
                ack = await upstream.request('POST', '/integrations/deletions/'+event['id']+'/ack', key='enrollment')
            except UpstreamError as exc:
                if exc.status == 404:
                    continue  # event withdrawn upstream; nothing to acknowledge
                failed += 1
                continue
            if ack.get('acknowledged') != 'website' or ack.get('event_id') != event['id']:
                fail(503, 'ACK_UNCONFIRMED', 'Website deletion acknowledgement was not confirmed.')
            acknowledged += 1
            acknowledged_events.append(event['id'])
            # required_acknowledgements=["website"] (app ≥ 14 Sep 2026): our acknowledgement completes the deletion.
            # Older events may still list consumers that can never acknowledge; report them, never pretend they did.
            if ack.get('all_acknowledged') is True:
                completed_events.append(event['id'])
            else:
                awaiting.update(set(ack.get('required_acknowledgements') or []) - set(ack.get('acknowledged_by') or []) - {'website'})
        cursor = page.get('next_cursor') if page.get('has_more') else None
        if not cursor:
            break
    else:
        fail(503, 'RECONCILE_INCOMPLETE', 'Deletion feed still has pages; run the reconcile again.')
    return {'acknowledged': acknowledged, 'completed': len(completed_events), 'acknowledged_events': acknowledged_events,
            'completed_events': completed_events, 'awaiting_other_consumers': sorted(awaiting),
            'blocked_private_linkage_review': blocked, 'ack_failed_retry_later': failed, 'events_seen': seen, 'cursor_feed': cursor_feed,
            'provider_copies_erased': False, 'external_erasure_complete': False}


WEBSITE_OWNED = ('bff_sessions', 'bff_drafts', 'bff_cache', 'bff_outbox', 'bff_returning')


async def cleanup_event(db, event, cfg):
    uid = event['user_id'] if isinstance(event.get('user_id'), str) and event['user_id'] else None
    if not uid:
        return 'blocked'
    query = {'$or': [{k: uid} for k in ('canonical_user_id', 'live_user_id', 'user_id', 'subject_id')]}
    # Deleted-number recognition needs the keyed hash before the website's own drafts are erased.
    async for draft in db.bff_drafts.find({'canonical_user_id': uid, 'phone': {'$type': 'string'}}, {'phone': 1}):
        await winback.remember_deleted_number(db, cfg, draft['phone'], event.get('created_at'))
    # Restrict cleanup to website-owned session/draft/cache/outbox collections (consented win-back contacts and
    # anonymous churn rows are not account data and are deliberately not touched here).
    for coll in WEBSITE_OWNED:
        await db[coll].delete_many(query)
    # Acknowledge only what is provably gone: any residual row for this account keeps the event unacknowledged.
    residual = sum([await db[coll].count_documents(query) for coll in WEBSITE_OWNED])
    if residual:
        return 'blocked'
    await winback.record_churn(db, event)
    # Pre-ID drafts cannot be mapped from the documented ID-only event. Wait for expiry,
    # rather than acknowledging an unprovable erasure or inspecting canonical DB directly.
    await db.bff_drafts.delete_many({'expires_at': {'$lte': now()}})
    unresolved = await db.bff_drafts.count_documents({'purpose': 'enrollment', 'canonical_user_id': {'$exists': False}})
    legacy = sum([await db[c].count_documents(query) for c in ('customers', 'staff_users', 'admin_sessions')])
    return 'blocked' if unresolved or legacy else 'clean'


@router.post('/admin/deletions/reconcile')
async def reconcile_deletions(request: Request, session=Depends(staff_session)):
    if session['user']['role'] != 'admin':
        fail(403, 'PERMISSION_DENIED', 'Administrators only.')
    return await consume_deletions(request)