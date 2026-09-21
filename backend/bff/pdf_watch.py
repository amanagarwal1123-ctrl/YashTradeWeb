"""Keeps a reviewed PDF import moving on the operator's behalf — bounded, same session, resume only.

The canonical app analyses one page per resource-limited subprocess (25 s wall, 22 s CPU, 512 MiB) and
checkpoints `next_page`. On a busy app server a page can exceed that budget; the job then stops in phase
`error` and needs POST /pdf-upload/{jid}/resume, which continues from the checkpoint. This watcher polls the
job with the staff session that started it and re-queues bounded retries per page, so a long import finishes
even when the browser tab is closed. It never edits rows, never commits, never publishes, never keeps a
session alive, and stops the moment the session ends or the operator pauses/cancels.
"""
import asyncio
import time
from datetime import timedelta
from types import SimpleNamespace
from fastapi import APIRouter, Request, Depends
from .canonical import fail, UpstreamError
from .security import staff_session, rotate, now

router = APIRouter(prefix='/api/admin/pdf-watch')
TRANSIENT = ('RENDER_TIMEOUT:', 'RENDER_RESOURCE_LIMIT:', 'IMPORT_PROCESSING_FAILED:')
FINAL = ('review', 'committed', 'cancelled', 'expired')
PUBLIC = ('phase', 'page', 'attempts', 'total_resumes', 'last_error', 'last_resume_at', 'stopped_reason', 'started_at', 'updated_at')
POLL_SECONDS, MAX_ATTEMPTS_PER_PAGE, MAX_TOTAL_RESUMES, MAX_HOURS = 10, 5, 400, 6


def backoff(attempt):
    return min(15 * attempt, 60)


class ImportWatch:
    def __init__(self, app):
        self.app, self.tasks = app, {}

    @property
    def db(self):
        return self.app.state.db.bff_pdf_watch

    async def start(self, jid, sid, owner_id):
        """(Re)start after complete/resume: a fresh per-page attempt budget, same owner session."""
        stamp = now()
        await self.db.update_one({'_id': jid}, {'$set': {'sid': sid, 'owner_id': owner_id, 'active': True, 'attempts': 0, 'stopped_reason': None,
                                                          'started_at': stamp.isoformat(), 'updated_at': stamp.isoformat(), 'expires_at': stamp + timedelta(days=7)},
                                                 '$setOnInsert': {'page': None, 'phase': None, 'total_resumes': 0, 'last_error': None}}, upsert=True)
        self.spawn(jid)

    def spawn(self, jid):
        task = self.tasks.get(jid)
        if not task or task.done():
            self.tasks[jid] = asyncio.create_task(self.run(jid))

    async def stop(self, jid, reason, extra=None):
        await self.db.update_one({'_id': jid}, {'$set': {'active': False, 'stopped_reason': reason, 'updated_at': now().isoformat(), **(extra or {})}})
        task = self.tasks.pop(jid, None)
        if task and task is not asyncio.current_task():
            task.cancel()

    async def restore(self):
        async for doc in self.db.find({'active': True}, {'_id': 1}):
            self.spawn(doc['_id'])

    def shutdown(self):
        for task in self.tasks.values():
            task.cancel()
        self.tasks.clear()

    async def token(self, sid):
        sessions = self.app.state.db.bff_sessions
        row = await sessions.find_one({'_id': sid, 'expires_at': {'$gt': now()}, 'last_active': {'$gt': time.time() - 7200}}, {'_id': 0})
        if not row:
            return None
        if row.get('access_until', 0) <= time.time() + 45:
            row = await rotate(SimpleNamespace(app=self.app), sid, row)
        return row['access_token']

    async def run(self, jid):
        deadline, failures = time.time() + MAX_HOURS * 3600, 0
        while time.time() < deadline:
            doc = await self.db.find_one({'_id': jid})
            if not doc or not doc.get('active'):
                return
            try:
                token = await self.token(doc['sid'])
            except Exception:
                token = None
            if not token:
                return await self.stop(jid, 'session_ended')
            try:
                status = await self.app.state.canonical.request('GET', f'/pdf-upload/{jid}/status', token=token)
                failures = 0
            except UpstreamError as e:
                if e.status in (401, 403, 404):
                    return await self.stop(jid, 'access_ended')
                failures += 1
                if failures >= 12:
                    return await self.stop(jid, 'app_unreachable')
                await asyncio.sleep(POLL_SECONDS)
                continue
            phase, page = status.get('phase'), status.get('pages_processed')
            progressed = page != doc.get('page')
            attempts = 0 if progressed else doc.get('attempts', 0)
            updates = {'phase': phase, 'page': page, 'attempts': attempts, 'updated_at': now().isoformat()}
            if phase in FINAL:
                return await self.stop(jid, 'finished', updates)
            if phase in ('paused', 'uploading'):
                return await self.stop(jid, 'paused_by_operator' if phase == 'paused' else 'upload_incomplete', updates)
            if phase == 'error':
                error = str(status.get('error') or '')
                updates['last_error'] = error
                if not error.startswith(TRANSIENT):
                    return await self.stop(jid, 'needs_correction', updates)
                if attempts >= MAX_ATTEMPTS_PER_PAGE:
                    return await self.stop(jid, 'page_retry_exhausted', updates)
                if doc.get('total_resumes', 0) >= MAX_TOTAL_RESUMES:
                    return await self.stop(jid, 'resume_budget_exhausted', updates)
                await asyncio.sleep(backoff(attempts + 1))
                try:
                    token = await self.token(doc['sid'])
                    if not token:
                        return await self.stop(jid, 'session_ended', updates)
                    await self.app.state.canonical.request('POST', f'/pdf-upload/{jid}/resume', token=token)
                    updates.update({'attempts': attempts + 1, 'total_resumes': doc.get('total_resumes', 0) + 1, 'last_resume_at': now().isoformat(), 'phase': 'queued'})
                except UpstreamError as e:
                    if e.status in (401, 403, 404):
                        return await self.stop(jid, 'access_ended', updates)
            await self.db.update_one({'_id': jid}, {'$set': updates})
            await asyncio.sleep(POLL_SECONDS)
        await self.stop(jid, 'time_budget_exhausted')


def public(doc):
    return {'upload_id': doc.get('upload_id') or doc.get('_id'), 'active': bool(doc.get('active')), 'max_attempts_per_page': MAX_ATTEMPTS_PER_PAGE,
            **{k: doc.get(k) for k in PUBLIC}}


CONTENT_ROLES = ('admin', 'upload_executive')


async def owned(request, jid, session):
    """Content roles only (admin / Upload Executive), owner-scoped read of the watch record as plain JSON fields."""
    if session['user']['role'] not in CONTENT_ROLES:
        fail(403, 'PERMISSION_DENIED', 'Content roles only.')
    fields = ('owner_id', 'active', *PUBLIC)
    doc = await request.app.state.pdf_watch.db.find_one({'_id': jid}, {'_id': 0, **{k: 1 for k in fields}})
    if not doc or doc.get('owner_id') != session['user']['id']:
        fail(404, 'WATCH_NOT_FOUND', 'No website auto-retry record for this import.')
    return {'upload_id': jid, **{k: doc.get(k) for k in fields}}


@router.get('/{jid}')
async def show(jid: str, request: Request, session=Depends(staff_session)):
    return public(await owned(request, jid, session))


@router.post('/{jid}/stop')
async def stop(jid: str, request: Request, session=Depends(staff_session)):
    await owned(request, jid, session)
    await request.app.state.pdf_watch.stop(jid, 'stopped_by_operator')
    return public(await owned(request, jid, session))
