"""Consent-based win-back, anonymised churn insight and deleted-number recognition (website-local).

The website keeps NO account data after a verified deletion. It keeps only:
  * bff_winback_contacts — people who explicitly ticked the offers opt-in while deleting, or asked for a
    callback before deleting (name/phone/shop/place + consent record; expires after 12 months; erasable);
  * bff_churn — anonymous deletion statistics (months, place, source, reason; no identifier of any kind);
  * bff_deleted_numbers — a keyed one-way hash of a deleted number (24 months) so a later registration
    of the same number can be flagged to staff; the number itself is not kept.
"""
import hashlib
import hmac
import re
import secrets
from datetime import timedelta
from typing import Literal
from fastapi import APIRouter, Request, Depends
from pydantic import BaseModel, ConfigDict, Field
from .canonical import fail, UpstreamError
from .security import staff_session, now, digest

router = APIRouter(prefix='/api/admin/winback')
ROLES = {'admin', 'telecaller'}
CONSENT_VERSION = 'winback-offers-v1'
REASONS = ('not_buying', 'other_supplier', 'app_problems', 'too_many_messages', 'privacy', 'other')
SOURCES = ('deletion_optin', 'pre_deletion_callback')
STATUSES = ('new', 'callback_requested', 'contacted', 'converted', 'opted_out')
CONTACT_TTL, HASH_TTL, DETAIL_TTL = timedelta(days=365), timedelta(days=730), timedelta(days=30)
PUBLIC = ('id', 'phone', 'name', 'shop_name', 'location', 'source', 'status', 'reason', 'note', 'consent_version',
          'consented_at', 'opted_out_at', 'history')


def number_hash(cfg, phone):
    key = hashlib.sha256(b'winback-number-hash:' + cfg.session_secret.encode()).digest()
    return hmac.new(key, phone.encode(), hashlib.sha256).hexdigest()


def month(value):
    return value[:7] if isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}.*', value) else None


def place(value):
    return value.strip().title()[:80] if isinstance(value, str) and value.strip() else None


async def profile(request, phone):
    """Best-effort canonical profile read for a number the customer has just verified; never blocks the flow."""
    try:
        result = await request.app.state.canonical.request('GET', '/integrations/customers/' + phone, key='enrollment')
        return result.get('customer') or {} if isinstance(result, dict) else {}
    except UpstreamError:
        return {}


async def save_contact(db, phone, customer, source, status, reason=None, note=None):
    stamp = now()
    doc = {'_id': secrets.token_urlsafe(12), 'phone': phone, 'name': (customer.get('name') or '')[:120],
           'shop_name': (customer.get('shop_name') or '')[:160], 'location': (customer.get('location') or customer.get('city') or '')[:160],
           'source': source, 'status': status, 'reason': reason, 'note': note, 'consent_version': CONSENT_VERSION,
           'consented_at': stamp.isoformat(), 'history': [], 'expires_at': stamp + CONTACT_TTL}
    await db.bff_winback_contacts.insert_one(doc)
    return doc['_id']


async def remember_deleted_number(db, cfg, phone, deleted_at=None):
    await db.bff_deleted_numbers.update_one({'_id': number_hash(cfg, phone)}, {'$setOnInsert': {
        'deleted_at': deleted_at if isinstance(deleted_at, str) and deleted_at else now().isoformat(), 'expires_at': now() + HASH_TTL}}, upsert=True)


async def stage_churn_detail(db, reference, customer, reason):
    """Anonymous detail for the coming erasure event, merged by the D4 consumer; keyed by the hashed reference only."""
    await db.bff_churn_pending.update_one({'_id': digest(reference)}, {'$set': {
        'registered_month': month(customer.get('registered_at') or customer.get('created_at')),
        'location': place(customer.get('location') or customer.get('city')), 'reason': reason, 'source': 'website',
        'expires_at': now() + DETAIL_TTL}}, upsert=True)


async def record_churn(db, event):
    """One anonymous row per erasure event (idempotent through a hashed mark); the row never carries an identifier."""
    mark = digest('churn:' + event['id'])
    if await db.bff_churn_marks.find_one({'_id': mark}, {'_id': 1}):
        return
    detail = await db.bff_churn_pending.find_one_and_delete({'_id': digest(event['id'])}) or {}
    await db.bff_churn.insert_one({'_id': secrets.token_urlsafe(12), 'deleted_month': month(event.get('created_at')) or now().strftime('%Y-%m'),
                                   'registered_month': detail.get('registered_month'), 'location': detail.get('location'),
                                   'reason': detail.get('reason'), 'source': detail.get('source', 'app'), 'recorded_at': now().isoformat()})
    await db.bff_churn_marks.insert_one({'_id': mark, 'expires_at': now() + timedelta(days=90)})


async def note_returning(db, cfg, phone, customer_id):
    hit = await db.bff_deleted_numbers.find_one({'_id': number_hash(cfg, phone)}, {'_id': 0})
    if hit:
        await db.bff_returning.update_one({'_id': customer_id}, {'$setOnInsert': {
            'canonical_user_id': customer_id, 'enrolled_at': now().isoformat(), 'previously_deleted_at': hit['deleted_at']}}, upsert=True)
    return bool(hit)


def public(doc):
    return {'id': doc['_id'], **{k: doc.get(k) for k in PUBLIC if k != 'id'}}


def staff(session):
    if session['user']['role'] not in ROLES:
        fail(403, 'PERMISSION_DENIED', 'Administrators and telecallers only.')
    return session['user']


class Action(BaseModel):
    model_config = ConfigDict(extra='forbid')
    action: Literal['contacted', 'converted', 'reopen']
    note: str = Field('', max_length=500)


class Match(BaseModel):
    model_config = ConfigDict(extra='forbid')
    phones: list[str] = Field(max_length=100)


@router.get('/contacts')
async def contacts(request: Request, status: str = '', source: str = '', page: int = 1, limit: int = 20, session=Depends(staff_session)):
    staff(session)
    page, limit = max(page, 1), min(max(limit, 1), 100)
    query = {**({'status': status} if status in STATUSES else {}), **({'source': source} if source in SOURCES else {})}
    db = request.app.state.db
    total = await db.bff_winback_contacts.count_documents(query)
    rows = await db.bff_winback_contacts.find(query).sort('consented_at', -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {'contacts': [public(r) for r in rows], 'total': total, 'page': page, 'limit': limit, 'pages': -(-total // limit) if total else 0,
            'statuses': STATUSES, 'sources': SOURCES, 'reasons': REASONS}


@router.patch('/contacts/{cid}')
async def update_contact(cid: str, body: Action, request: Request, session=Depends(staff_session)):
    user = staff(session)
    status = {'contacted': 'contacted', 'converted': 'converted', 'reopen': 'new'}[body.action]
    entry = {'at': now().isoformat(), 'actor_id': user['id'], 'actor_name': user.get('name'), 'action': body.action, 'note': body.note.strip()}
    updated = await request.app.state.db.bff_winback_contacts.find_one_and_update(
        {'_id': cid, 'status': {'$ne': 'opted_out'}}, {'$set': {'status': status}, '$push': {'history': entry}}, return_document=True)
    if not updated:
        fail(404, 'CONTACT_NOT_FOUND', 'Win-back contact not found or already opted out.')
    return public(updated)


@router.post('/contacts/{cid}/opt-out')
async def opt_out(cid: str, request: Request, session=Depends(staff_session)):
    """Consent withdrawal: personal details are erased immediately; only the anonymous outcome remains."""
    user = staff(session)
    entry = {'at': now().isoformat(), 'actor_id': user['id'], 'actor_name': user.get('name'), 'action': 'opted_out', 'note': ''}
    updated = await request.app.state.db.bff_winback_contacts.find_one_and_update({'_id': cid}, {
        '$set': {'status': 'opted_out', 'opted_out_at': now().isoformat(), 'history': [entry]},
        '$unset': {'phone': '', 'name': '', 'shop_name': '', 'location': '', 'note': ''}}, return_document=True)
    if not updated:
        fail(404, 'CONTACT_NOT_FOUND', 'Win-back contact not found.')
    return public(updated)


@router.get('/churn')
async def churn(request: Request, months: int = 12, session=Depends(staff_session)):
    staff(session)
    months = min(max(months, 1), 36)
    stamp = now()
    index = stamp.year * 12 + stamp.month - months  # first month of the window (inclusive), current month counted
    cutoff = f'{index // 12:04d}-{index % 12 + 1:02d}'
    db = request.app.state.db
    rows = await db.bff_churn.find({'deleted_month': {'$gte': cutoff}}, {'_id': 0}).to_list(10000)
    by_month, by_place, by_reason = {}, {}, {}
    for row in rows:
        bucket = by_month.setdefault(row['deleted_month'], {'month': row['deleted_month'], 'total': 0, 'website': 0, 'app': 0})
        bucket['total'] += 1
        bucket[row.get('source') if row.get('source') in ('website', 'app') else 'app'] += 1
        by_place[row.get('location') or 'Unknown'] = by_place.get(row.get('location') or 'Unknown', 0) + 1
        by_reason[row.get('reason') or 'not_given'] = by_reason.get(row.get('reason') or 'not_given', 0) + 1
    contacts = db.bff_winback_contacts
    return {'months': months, 'from_month': cutoff, 'total': len(rows),
            'by_month': sorted(by_month.values(), key=lambda b: b['month'], reverse=True),
            'by_location': sorted(({'location': k, 'count': v} for k, v in by_place.items()), key=lambda b: -b['count'])[:15],
            'by_reason': sorted(({'reason': k, 'count': v} for k, v in by_reason.items()), key=lambda b: -b['count']),
            'winback': {'opted_in': await contacts.count_documents({'source': 'deletion_optin'}),
                        'callbacks': await contacts.count_documents({'source': 'pre_deletion_callback'}),
                        'converted': await contacts.count_documents({'status': 'converted'}),
                        'opted_out': await contacts.count_documents({'status': 'opted_out'})},
            'returning': await db.bff_returning.count_documents({}), 'anonymous': True}


@router.get('/returning')
async def returning(request: Request, session=Depends(staff_session)):
    staff(session)
    rows = await request.app.state.db.bff_returning.find({}, {'_id': 0}).sort('enrolled_at', -1).limit(200).to_list(200)
    return {'returning': rows, 'note': 'Effective only when the canonical app permits a deleted number to register again.'}


@router.post('/match')
async def match(body: Match, request: Request, session=Depends(staff_session)):
    """Flags which of the supplied directory numbers were deleted earlier; numbers are hashed in memory, never stored."""
    staff(session)
    cfg, db = request.app.state.cfg, request.app.state.db
    phones = [p for p in dict.fromkeys(body.phones) if re.fullmatch(r'[6-9][0-9]{9}', p)]
    hashes = {number_hash(cfg, p): p for p in phones}
    hits = await db.bff_deleted_numbers.find({'_id': {'$in': list(hashes)}}).to_list(len(hashes))
    return {'returning': {hashes[h['_id']]: h['deleted_at'] for h in hits}}
