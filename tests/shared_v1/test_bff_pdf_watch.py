"""Website auto-retry for reviewed PDF imports (bff/pdf_watch.py) over the isolated pinned app.

# module: reproduces the production failure — the app's per-page subprocess budget is exceeded mid-analysis
#         (phase error, RENDER_TIMEOUT, checkpoint kept) — and proves the website resumes from the checkpoint
#         with the same staff session until review, stops on non-transient errors, gives up after the per-page
#         budget, restarts on an operator resume, and is owner/admin scoped.
"""

# ruff: noqa: F811 -- pytest fixtures are imported for discovery and named as test arguments
from __future__ import annotations

import asyncio
import hashlib
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from pymongo import ReturnDocument

from test_bff_auth_session import _csrf, _headers, _login_staff, bff_client, object_store, shared_apps

if "/app/backend" not in sys.path:
    sys.path.insert(0, "/app/backend")
from bff import pdf_watch  # noqa: E402

SAMPLE = Path("/root/yash-contract/backend/fixtures/catalog-v1/sample.pdf")


async def _upload(client, app_ctx):
    """Init + chunks + complete through the BFF for the pinned sample PDF; returns the upload id."""
    sample = SAMPLE.read_bytes()
    now = datetime.now(timezone.utc).isoformat()
    await app_ctx["canonical_db"].batches.update_one({"id": "b1"}, {"$set": {"id": "b1", "name": "TEST Batch 1", "status": "active", "updated_at": now},
                                                                     "$setOnInsert": {"created_at": now}}, upsert=True)
    chunk = 1024 * 1024
    total = (len(sample) + chunk - 1) // chunk
    init = await client.post("/api/bff/pdf-upload/init", json={"batch_id": "b1", "filename": "sample.pdf", "file_size": len(sample),
                                                                "sha256": hashlib.sha256(sample).hexdigest(), "total_chunks": total, "mode": "template_v1"},
                             headers=_headers(await _csrf(client)))
    assert init.status_code == 200, init.text
    jid = init.json()["upload_id"]
    for i in range(total):
        part = sample[i * chunk:(i + 1) * chunk]
        sent = await client.post(f"/api/bff/pdf-upload/{jid}/chunk", params={"chunk_index": i},
                                 headers={**_headers(await _csrf(client)), "x-chunk-sha256": hashlib.sha256(part).hexdigest()},
                                 files={"file": (f"chunk-{i}.bin", part, "application/octet-stream")})
        assert sent.status_code == 200, sent.text
    done = await client.post(f"/api/bff/pdf-upload/{jid}/complete", headers=_headers(await _csrf(client)))
    assert done.status_code == 200 and done.json()["phase"] == "queued", done.text
    return jid


async def _run_worker(app_ctx, jid):
    """One pass of the pinned app's analysis worker (as production's background loop would do)."""
    from shared import pdf_jobs
    job = await app_ctx["canonical_db"].import_jobs.find_one_and_update({"id": jid, "phase": "queued"},
        {"$set": {"phase": "analyzing", "lease": uuid.uuid4().hex}}, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    assert job, "job was not re-queued"
    await pdf_jobs.process_job(job)
    return await app_ctx["canonical_db"].import_jobs.find_one({"id": jid}, {"_id": 0, "phase": 1, "error": 1, "next_page": 1})


async def _until(predicate, timeout=8.0):
    for _ in range(int(timeout / 0.05)):
        value = await predicate()
        if value:
            return value
        await asyncio.sleep(0.05)
    raise AssertionError("condition not met in time")


@pytest.fixture
def fast_watch(monkeypatch):
    monkeypatch.setattr(pdf_watch, "POLL_SECONDS", 0.05)
    monkeypatch.setattr(pdf_watch, "backoff", lambda attempt: 0.01)


def _fail_pages(monkeypatch, app_ctx, pages, message="RENDER_TIMEOUT: page exceeds the resource budget"):
    """Make the pinned parser fail on the given page indices exactly as a starved app server would (budget exceeded)."""
    from shared import pdf_jobs
    real = pdf_jobs.run_parser
    pending = dict(pages)

    async def flaky(source, page=-1, mode="template_v1", crop=None):
        if pending.get(page, 0) > 0:
            pending[page] -= 1
            raise ValueError(message)
        return await real(source, page, mode, crop)
    monkeypatch.setattr(pdf_jobs, "run_parser", flaky)
    return pending


@pytest.mark.anyio
async def test_page_budget_timeout_is_resumed_from_checkpoint_until_review(bff_client, shared_apps, monkeypatch, fast_watch):
    watch, website_db = shared_apps["bff_app"].state.pdf_watch, shared_apps["website_db"]
    try:
        await _login_staff(bff_client, shared_apps["sent_otps"], "9000000101")
        jid = await _upload(bff_client, shared_apps)
        record = await website_db.bff_pdf_watch.find_one({"_id": jid})
        assert record["active"] is True and record["owner_id"] == "u_admin", "watcher armed by the BFF on /complete"

        pending = _fail_pages(monkeypatch, shared_apps, {1: 1})  # page 2 exceeds the budget once, like production page 20
        state = await _run_worker(shared_apps, jid)
        assert state["phase"] == "error" and state["error"].startswith("RENDER_TIMEOUT:") and state["next_page"] == 1, "checkpoint kept"

        # The website notices the transient error and re-queues the job with the same staff session.
        job = await _until(lambda: shared_apps["canonical_db"].import_jobs.find_one({"id": jid, "phase": "queued"}, {"_id": 0, "phase": 1, "error": 1}))
        assert job.get("error") is None
        shown = await bff_client.get(f"/api/admin/pdf-watch/{jid}")
        assert shown.status_code == 200, shown.text
        assert shown.json()["active"] is True and shown.json()["total_resumes"] == 1 and shown.json()["attempts"] == 1 and shown.json()["page"] == 1
        assert shown.json()["last_error"].startswith("RENDER_TIMEOUT:") and "sid" not in shown.text

        state = await _run_worker(shared_apps, jid)  # the app worker picks the re-queued job up and finishes
        assert state["phase"] == "review" and pending[1] == 0
        finished = await _until(lambda: website_db.bff_pdf_watch.find_one({"_id": jid, "active": False}))
        assert finished["stopped_reason"] == "finished"
        rows = await shared_apps["canonical_db"].import_rows.count_documents({"job_id": jid})
        assert rows == 3, "every page analysed exactly once across the resume"
        status = await bff_client.get(f"/api/bff/pdf-upload/{jid}/status")
        assert status.json()["phase"] == "review" and status.json()["product_count"] == 3
    finally:
        watch.shutdown()


@pytest.mark.anyio
async def test_per_page_budget_then_operator_resume_restarts_and_pause_stops(bff_client, shared_apps, monkeypatch, fast_watch):
    watch, website_db = shared_apps["bff_app"].state.pdf_watch, shared_apps["website_db"]
    monkeypatch.setattr(pdf_watch, "MAX_ATTEMPTS_PER_PAGE", 2)
    try:
        await _login_staff(bff_client, shared_apps["sent_otps"], "9000000101")
        jid = await _upload(bff_client, shared_apps)
        _fail_pages(monkeypatch, shared_apps, {1: 99})
        for expected_resumes in (1, 2):
            state = await _run_worker(shared_apps, jid)
            assert state["phase"] == "error"
            await _until(lambda: shared_apps["canonical_db"].import_jobs.find_one({"id": jid, "phase": "queued"}, {"_id": 0}))
            record = await website_db.bff_pdf_watch.find_one({"_id": jid})
            assert record["total_resumes"] == expected_resumes
        state = await _run_worker(shared_apps, jid)
        assert state["phase"] == "error"
        gave_up = await _until(lambda: website_db.bff_pdf_watch.find_one({"_id": jid, "active": False}))
        assert gave_up["stopped_reason"] == "page_retry_exhausted" and gave_up["attempts"] == 2 and gave_up["page"] == 1
        await asyncio.sleep(0.2)
        assert (await shared_apps["canonical_db"].import_jobs.find_one({"id": jid}, {"_id": 0}))["phase"] == "error", "no further resumes after giving up"

        # Operator clicks Resume analysis → the proxy restarts the watcher with a fresh per-page budget.
        resumed = await bff_client.post(f"/api/bff/pdf-upload/{jid}/resume", headers=_headers(await _csrf(bff_client)))
        assert resumed.status_code == 200 and resumed.json()["phase"] == "queued"
        record = await website_db.bff_pdf_watch.find_one({"_id": jid})
        assert record["active"] is True and record["attempts"] == 0 and record["stopped_reason"] is None

        # Operator pauses → the watcher stands down and never resumes a paused import.
        paused = await bff_client.post(f"/api/bff/pdf-upload/{jid}/pause", headers=_headers(await _csrf(bff_client)))
        assert paused.status_code == 200 and paused.json()["phase"] == "paused"
        record = await _until(lambda: website_db.bff_pdf_watch.find_one({"_id": jid, "active": False}))
        assert record["stopped_reason"] == "paused_by_operator"
        await asyncio.sleep(0.2)
        assert (await shared_apps["canonical_db"].import_jobs.find_one({"id": jid}, {"_id": 0}))["phase"] == "paused"
        stopped = await bff_client.post(f"/api/admin/pdf-watch/{jid}/stop", headers=_headers(await _csrf(bff_client)))
        assert stopped.status_code == 200 and stopped.json()["active"] is False
    finally:
        watch.shutdown()


@pytest.mark.anyio
async def test_source_errors_are_not_retried_and_records_are_owner_scoped(bff_client, shared_apps, monkeypatch, fast_watch):
    watch, website_db = shared_apps["bff_app"].state.pdf_watch, shared_apps["website_db"]
    try:
        await _login_staff(bff_client, shared_apps["sent_otps"], "9000000101")
        jid = await _upload(bff_client, shared_apps)
        _fail_pages(monkeypatch, shared_apps, {1: 99}, "BOUNDARY_ERROR: Missing, duplicate, mismatched or split product markers; keep each block on one page")
        state = await _run_worker(shared_apps, jid)
        assert state["phase"] == "error"
        record = await _until(lambda: website_db.bff_pdf_watch.find_one({"_id": jid, "active": False}))
        assert record["stopped_reason"] == "needs_correction" and record["total_resumes"] == 0
        await asyncio.sleep(0.2)
        assert (await shared_apps["canonical_db"].import_jobs.find_one({"id": jid}, {"_id": 0}))["phase"] == "error", "a PDF defect is never auto-resumed"
        assert (await bff_client.get(f"/api/admin/pdf-watch/{jid}")).json()["stopped_reason"] == "needs_correction"
        missing = await bff_client.get("/api/admin/pdf-watch/not-a-job")
        assert missing.status_code == 404 and missing.json()["code"] == "WATCH_NOT_FOUND"
        await bff_client.post("/api/admin/auth/logout", headers=_headers(await _csrf(bff_client)))

        await _login_staff(bff_client, shared_apps["sent_otps"], "9000000104")  # billing executive
        denied = await bff_client.get(f"/api/admin/pdf-watch/{jid}")
        assert denied.status_code == 403 and denied.json()["code"] == "PERMISSION_DENIED"
    finally:
        watch.shutdown()


@pytest.mark.anyio
async def test_watcher_stops_when_the_website_session_ends(bff_client, shared_apps, monkeypatch, fast_watch):
    watch, website_db = shared_apps["bff_app"].state.pdf_watch, shared_apps["website_db"]
    try:
        await _login_staff(bff_client, shared_apps["sent_otps"], "9000000101")
        jid = await _upload(bff_client, shared_apps)
        _fail_pages(monkeypatch, shared_apps, {1: 99})
        state = await _run_worker(shared_apps, jid)
        assert state["phase"] == "error"
        await _until(lambda: shared_apps["canonical_db"].import_jobs.find_one({"id": jid, "phase": "queued"}, {"_id": 0}))
        await website_db.bff_sessions.delete_many({})  # sign-out / expiry: the website never keeps a session alive for itself
        state = await _run_worker(shared_apps, jid)
        assert state["phase"] == "error"
        record = await _until(lambda: website_db.bff_pdf_watch.find_one({"_id": jid, "active": False}))
        assert record["stopped_reason"] == "session_ended"
        assert "access_token" not in str(record) and "sid" in record, "only the session id is referenced, never a token"
    finally:
        watch.shutdown()
