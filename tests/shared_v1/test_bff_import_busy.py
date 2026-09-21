"""Reviewed PDF import while the pinned app is busy elsewhere (bff/proxy.py chunk retry).

# module: reproduces the production report "Another update is in progress; retry shortly" during chunk upload —
#         the app serialises EVERY storage write (chunks, analysis previews, commit images) on one `media-budget`
#         lock and answers 409 OPERATION_IN_PROGRESS without waiting — and proves the BFF resends the
#         checksum-bound chunk after a short wait, surfaces the code truthfully when the lock persists, and never
#         retries the long-running commit itself (the browser waits for the outcome instead).
"""

# ruff: noqa: F811 -- pytest fixtures are imported for discovery and named as test arguments
from __future__ import annotations

import hashlib
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from test_bff_auth_session import _csrf, _headers, _login_staff, bff_client, object_store, shared_apps

if "/app/backend" not in sys.path:
    sys.path.insert(0, "/app/backend")
from bff import proxy  # noqa: E402

SAMPLE = Path("/root/yash-contract/backend/fixtures/catalog-v1/sample.pdf")
CHUNK = 1024 * 1024


async def _init(client, app_ctx):
    sample = SAMPLE.read_bytes()
    now = datetime.now(timezone.utc).isoformat()
    await app_ctx["canonical_db"].batches.update_one({"id": "b1"}, {"$set": {"id": "b1", "name": "TEST Batch 1", "status": "active", "updated_at": now},
                                                                     "$setOnInsert": {"created_at": now}}, upsert=True)
    total = (len(sample) + CHUNK - 1) // CHUNK
    init = await client.post("/api/bff/pdf-upload/init", json={"batch_id": "b1", "filename": "sample.pdf", "file_size": len(sample),
                                                                "sha256": hashlib.sha256(sample).hexdigest(), "total_chunks": total, "mode": "template_v1"},
                             headers=_headers(await _csrf(client)))
    assert init.status_code == 200, init.text
    return init.json()["upload_id"], sample


async def _chunk(client, jid, sample, index):
    part = sample[index * CHUNK:(index + 1) * CHUNK]
    return await client.post(f"/api/bff/pdf-upload/{jid}/chunk", params={"chunk_index": index},
                             headers={**_headers(await _csrf(client)), "x-chunk-sha256": hashlib.sha256(part).hexdigest()},
                             files={"file": (f"chunk-{index}.bin", part, "application/octet-stream")})


async def _hold_lock(app_ctx, key, seconds):
    """Exactly what another in-flight app write leaves behind: an unexpired row in the app's operation_locks."""
    await app_ctx["canonical_db"].operation_locks.replace_one({"_id": key}, {"_id": key, "owner": "test-other-writer",
        "expires_at": datetime.now(timezone.utc) + timedelta(seconds=seconds)}, upsert=True)


@pytest.mark.anyio
async def test_chunk_upload_waits_out_the_app_storage_lock(bff_client, shared_apps, monkeypatch):
    monkeypatch.setattr(proxy, "CHUNK_BUSY_BACKOFF", 0.3)  # 0.3+0.6+0.9+1.2+1.5 s of patience
    await _login_staff(bff_client, shared_apps["sent_otps"], "9000000101")
    jid, sample = await _init(bff_client, shared_apps)
    await _hold_lock(shared_apps, "media-budget", 1.2)
    sent = await _chunk(bff_client, jid, sample, 0)
    assert sent.status_code == 200, sent.text
    assert sent.json()["received"] == 0 and not sent.json().get("duplicate")
    job = await shared_apps["canonical_db"].import_jobs.find_one({"id": jid}, {"_id": 0, "manifest": 1, "bytes_received": 1})
    assert set(job["manifest"]) == {"0"} and job["bytes_received"] == CHUNK, "stored exactly once after the lock cleared"


@pytest.mark.anyio
async def test_persistent_app_lock_is_reported_and_the_same_chunk_resumes_later(bff_client, shared_apps, monkeypatch):
    monkeypatch.setattr(proxy, "CHUNK_BUSY_BACKOFF", 0.01)
    await _login_staff(bff_client, shared_apps["sent_otps"], "9000000101")
    jid, sample = await _init(bff_client, shared_apps)
    # app ≥ 8438b3b waits up to 30 s for the media budget itself; the per-chunk lock still refuses at once (wait_seconds=0).
    await _hold_lock(shared_apps, f"chunk:{jid}:0", 60)
    busy = await _chunk(bff_client, jid, sample, 0)
    assert busy.status_code == 409 and busy.json()["code"] == "OPERATION_IN_PROGRESS", busy.text
    status = await bff_client.get(f"/api/bff/pdf-upload/{jid}/status")
    assert status.json()["phase"] == "uploading" and status.json()["received_chunk_indices"] == [] and status.json()["bytes_received"] == 0
    await shared_apps["canonical_db"].operation_locks.delete_one({"_id": f"chunk:{jid}:0"})
    sent = await _chunk(bff_client, jid, sample, 0)  # the browser's own retry loop
    assert sent.status_code == 200 and sent.json()["received"] == 0, sent.text
    again = await _chunk(bff_client, jid, sample, 0)
    assert again.status_code == 200 and again.json().get("duplicate") is True, "repeat of an acknowledged chunk stays idempotent"


@pytest.mark.anyio
async def test_other_busy_mutations_are_not_retried_by_the_proxy(bff_client, shared_apps, monkeypatch):
    monkeypatch.setattr(proxy, "CHUNK_BUSY_BACKOFF", 0.01)
    calls = {"n": 0}
    original = shared_apps["bff_app"].state.canonical.request

    async def counting(method, path, **kw):
        if path.endswith("/cancel"):
            calls["n"] += 1
        return await original(method, path, **kw)
    monkeypatch.setattr(shared_apps["bff_app"].state.canonical, "request", counting)
    await _login_staff(bff_client, shared_apps["sent_otps"], "9000000101")
    jid, _ = await _init(bff_client, shared_apps)
    await _hold_lock(shared_apps, "import:" + jid, 60)
    calls["n"] = 0
    cancel = await bff_client.post(f"/api/bff/pdf-upload/{jid}/cancel", headers=_headers(await _csrf(bff_client)))
    assert cancel.status_code == 409 and cancel.json()["code"] == "OPERATION_IN_PROGRESS", cancel.text
    assert calls["n"] == 1, "a locked long-running mutation is reported once, never replayed by the website"
    job = await shared_apps["canonical_db"].import_jobs.find_one({"id": jid}, {"_id": 0, "phase": 1})
    assert job["phase"] == "uploading"
