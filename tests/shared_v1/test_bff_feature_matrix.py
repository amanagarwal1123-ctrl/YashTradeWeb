"""Shared-v1 BFF major feature regression matrix with isolated canonical ASGI.

# module: origin ingress alias + enrollment persistence + role scopes + proxy contracts + media/pdf binary bridges
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import io
from datetime import datetime, timezone
from pathlib import Path
import sys

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from test_bff_auth_session import _csrf, _headers, _login_staff, bff_client, object_store, shared_apps


PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
)


def _ingress_headers(csrf: str, website_origin: str | None = "https://website.test"):
    headers = {
        "origin": "https://yash-scheme-hub.cluster-8.preview.emergentcf.cloud",
        "sec-fetch-site": "same-origin",
        "x-csrf-token": csrf,
    }
    if website_origin is not None:
        headers["x-website-origin"] = website_origin
    return headers


async def _login(client: AsyncClient, app_ctx: dict, phone: str):
    verify = None
    for attempt in range(2):
        try:
            verify = await _login_staff(client, app_ctx["sent_otps"], phone)
            break
        except Exception as exc:
            if attempt == 0 and ("AutoReconnect" in repr(exc) or "connection closed" in repr(exc)):
                await asyncio.sleep(0.25)
                continue
            raise
    assert verify is not None
    assert verify.status_code == 200, verify.text
    return verify.json()


@pytest.mark.anyio
async def test_ingress_alias_requires_matching_x_website_origin(bff_client):
    # module: ingress alias is accepted only with explicit matching x-website-origin
    csrf = await _csrf(bff_client)
    missing = await bff_client.post(
        "/api/admin/auth/send-otp",
        json={"phone": "9000000101"},
        headers=_ingress_headers(csrf, website_origin=None),
    )
    assert missing.status_code == 403
    assert missing.json()["code"] == "ORIGIN_REJECTED"

    mismatch = await bff_client.post(
        "/api/admin/auth/send-otp",
        json={"phone": "9000000101"},
        headers=_ingress_headers(csrf, website_origin="https://evil.example"),
    )
    assert mismatch.status_code == 403
    assert mismatch.json()["code"] == "ORIGIN_REJECTED"


@pytest.mark.anyio
async def test_ingress_alias_with_matching_x_website_origin_is_accepted(bff_client):
    # module: proven ingress rewrite path (cluster alias) with custom website-origin header
    csrf = await _csrf(bff_client)
    ok = await bff_client.post(
        "/api/admin/auth/send-otp",
        json={"phone": "9000000101"},
        headers=_ingress_headers(csrf),
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["challenge_id"]
    assert body["otp_length"] == 4


@pytest.mark.anyio
async def test_admin_invalid_phone_rejected_with_422(bff_client):
    # module: invalid-phone external probe contract (no OTP send)
    csrf = await _csrf(bff_client)
    bad = await bff_client.post("/api/admin/auth/send-otp", json={"phone": "123"}, headers=_headers(csrf))
    assert bad.status_code == 422
    assert bad.json()["code"] == "VALIDATION_ERROR"


@pytest.mark.anyio
async def test_enrollment_persists_once_and_verify_replay_returns_same_customer(bff_client, shared_apps):
    # module: enrollment persistence once, idempotent replay, no duplicate canonical user writes
    csrf = await _csrf(bff_client)
    payload = {
        "phone": "9000000111",
        "name": "TEST Enrollee",
        "shop_name": "TEST Zero-01",
        "location": "Pune 001",
        "consent_terms": True,
        "consent_privacy": True,
    }
    sent = await bff_client.post("/api/enroll/send-otp", json=payload, headers=_headers(csrf))
    assert sent.status_code == 200, sent.text
    otp = shared_apps["sent_otps"][(payload["phone"], "enrollment")]

    verify = await bff_client.post(
        "/api/enroll/verify-otp",
        json={"phone": payload["phone"], "otp": otp, "challenge_id": sent.json()["challenge_id"]},
        headers=_headers(csrf),
    )
    assert verify.status_code == 200, verify.text
    first = verify.json()
    assert first["customer"]["phone"] == payload["phone"]

    replay = await bff_client.post(
        "/api/enroll/verify-otp",
        json={"phone": payload["phone"], "otp": otp, "challenge_id": sent.json()["challenge_id"]},
        headers=_headers(csrf),
    )
    assert replay.status_code == 200, replay.text
    assert replay.json()["customer"]["id"] == first["customer"]["id"]

    count = await shared_apps["canonical_db"].users.count_documents({"phone": payload["phone"]})
    assert count == 1


@pytest.mark.anyio
async def test_enrollment_grant_expired_transitions_to_verification_required(bff_client, shared_apps, monkeypatch):
    # module: expired/invalid grant clears verified payload and requires re-verification
    original = shared_apps["bff_app"].state.canonical.request

    async def expired_grant(method, path, **kwargs):
        if method == "POST" and path == "/integrations/enrollments":
            raise shared_apps["website_server"].UpstreamError(401, "GRANT_EXPIRED", "forced expired grant")
        return await original(method, path, **kwargs)

    monkeypatch.setattr(shared_apps["bff_app"].state.canonical, "request", expired_grant)

    csrf = await _csrf(bff_client)
    payload = {
        "phone": "9000000112",
        "name": "TEST Grant",
        "shop_name": "TEST Shop",
        "location": "Jaipur",
        "consent_terms": True,
        "consent_privacy": True,
    }
    sent = await bff_client.post("/api/enroll/send-otp", json=payload, headers=_headers(csrf))
    assert sent.status_code == 200, sent.text
    otp = shared_apps["sent_otps"][(payload["phone"], "enrollment")]
    verify = await bff_client.post(
        "/api/enroll/verify-otp",
        json={"phone": payload["phone"], "otp": otp, "challenge_id": sent.json()["challenge_id"]},
        headers=_headers(csrf),
    )
    assert verify.status_code == 401
    assert verify.json()["code"] == "GRANT_EXPIRED"

    state = await bff_client.get("/api/enroll/state")
    assert state.status_code == 200
    assert state.json()["phase"] == "verification_required"


@pytest.mark.anyio
async def test_billing_role_session_and_mutation_restrictions(bff_client, shared_apps):
    # module: billing session works for read-scope while requests mutation/metrics remain restricted
    me = await _login(bff_client, shared_apps, "9000000104")
    assert me["role"] == "billing_executive"

    rates = await bff_client.get("/api/bff/rates/latest")
    assert rates.status_code == 200, rates.text

    csrf = await _csrf(bff_client)

    denied_claim = await bff_client.post(
        "/api/bff/requests/race-bill-1/claim",
        json={"version": 0, "idempotency_key": "bill-claim-1"},
        headers=_headers(csrf),
    )
    assert denied_claim.status_code == 403
    assert denied_claim.json()["code"] == "PERMISSION_DENIED"

    denied_metrics = await bff_client.get("/api/bff/requests/metrics/summary?start=2035-01-01&end=2035-01-01")
    assert denied_metrics.status_code == 403
    assert denied_metrics.json()["code"] == "PERMISSION_DENIED"


@pytest.mark.anyio
async def test_telecaller_cannot_mutate_rates(bff_client, shared_apps):
    # module: telecaller denied billing-owned rate mutations
    me = await _login(bff_client, shared_apps, "9000000105")
    assert me["role"] == "telecaller"
    csrf = await _csrf(bff_client)
    denied = await bff_client.post("/api/bff/rates", json={"version": 0, "silver_physical_rate": 123.4}, headers=_headers(csrf))
    assert denied.status_code == 403
    assert denied.json()["code"] == "PERMISSION_DENIED"


@pytest.mark.anyio
async def test_admin_customer_phone_patch_blocked_at_bff(bff_client, shared_apps):
    # module: targeted customer phone correction blocked at BFF contract edge
    me = await _login(bff_client, shared_apps, "9000000101")
    assert me["role"] == "admin"
    csrf = await _csrf(bff_client)
    blocked = await bff_client.patch(
        "/api/bff/customers/u_cust",
        json={"phone": "9000000999", "version": 0, "idempotency_key": "cust-patch-1"},
        headers=_headers(csrf),
    )
    assert blocked.status_code == 422
    assert blocked.json()["code"] == "TARGETED_PHONE_CHANGE_UNSUPPORTED"


@pytest.mark.anyio
async def test_requests_claim_race_and_stale_version_guard(shared_apps):
    # module: query queue claim race + stale version enforcement from BFF proxy to canonical
    now = datetime.now(timezone.utc).isoformat()
    await shared_apps["canonical_db"].requests.insert_one(
        {
            "id": "race-bff-1",
            "request_type": "callback",
            "status": "pending",
            "user_id": "u_cust",
            "user_name": "TEST Customer",
            "user_phone": "9000000103",
            "user_city": "Pune",
            "shop_name": "Shop",
            "assignee_id": "",
            "assigned_to": "",
            "created_at": now,
            "updated_at": now,
            "pending_since": now,
            "version": 0,
            "events": [{"id": "ev-race-1", "type": "creation", "actor_id": "u_cust", "actor_role": "customer", "timestamp": now, "status": "pending"}],
        }
    )

    async with AsyncClient(transport=ASGITransport(app=shared_apps["bff_app"]), base_url="https://website.test") as tele1, AsyncClient(
        transport=ASGITransport(app=shared_apps["bff_app"]), base_url="https://website.test"
    ) as tele2:
        await _login(tele1, shared_apps, "9000000102")
        await _login(tele2, shared_apps, "9000000105")
        csrf1 = await _csrf(tele1)
        csrf2 = await _csrf(tele2)

        stale = await tele1.patch(
            "/api/bff/requests/race-bff-1",
            json={"action": "update", "status": "completed"},
            headers=_headers(csrf1),
        )
        assert stale.status_code == 428
        assert stale.json()["code"] == "VERSION_REQUIRED"

        claim1 = await tele1.post(
            "/api/bff/requests/race-bff-1/claim",
            json={"version": 0, "idempotency_key": "claim-race-1"},
            headers=_headers(csrf1),
        )
        assert claim1.status_code == 200, claim1.text

        claim2 = await tele2.post(
            "/api/bff/requests/race-bff-1/claim",
            json={"version": 0, "idempotency_key": "claim-race-2"},
            headers=_headers(csrf2),
        )
        assert claim2.status_code in (409, 422)


@pytest.mark.anyio
async def test_products_upload_and_crud_roundtrip_preserves_media_path(bff_client, shared_apps, object_store):
    # module: multipart image upload + product create/get bridge with canonical media path rewrite
    me = await _login(bff_client, shared_apps, "9000000101")
    assert me["role"] == "admin"
    csrf = await _csrf(bff_client)

    image_bytes = Path("/root/yash-contract/backend/fixtures/catalog-v1/silver.jpg").read_bytes()
    upload = await bff_client.post(
        "/api/bff/products/upload-image",
        files={"file": ("silver.jpg", image_bytes, "image/jpeg")},
        headers=_headers(csrf),
    )
    assert upload.status_code == 200, upload.text
    upload_body = upload.json()
    media_url = upload_body["url"]
    assert media_url.startswith("/api/files/")
    assert upload_body["content_type"] == "image/jpeg"
    assert upload_body["permanent"] is True

    stored_path = media_url.replace("/api/files/", "", 1)
    assert stored_path in object_store
    stored_bytes, stored_content_type = object_store[stored_path]
    assert stored_content_type == "image/jpeg"

    with Image.open(io.BytesIO(image_bytes)) as original_img, Image.open(io.BytesIO(stored_bytes)) as stored_img:
        assert stored_img.format == "JPEG"
        assert stored_img.size == original_img.size

    thumb_path = upload_body["thumbnail_path"]
    assert thumb_path in object_store
    thumb_bytes, thumb_content_type = object_store[thumb_path]
    assert thumb_content_type == "image/jpeg"
    with Image.open(io.BytesIO(thumb_bytes)) as thumb_img:
        assert thumb_img.format == "JPEG"
        assert max(thumb_img.size) == 320

    create = await bff_client.post(
        "/api/bff/products",
        json={
            "product_code": "TEST-BFF-SKU-001",
            "title": "TEST BFF Product",
            "metal_type": "silver",
            "category": "chain",
            "visibility": "hidden",
            "images": [media_url],
        },
        headers=_headers(csrf),
    )
    assert create.status_code == 200, create.text
    created = create.json()

    fetched = await bff_client.get(f"/api/bff/products/{created['id']}")
    assert fetched.status_code == 200, fetched.text
    full = fetched.json()
    assert full["product_code"] == "TEST-BFF-SKU-001"
    assert full["images"][0].startswith("/api/files/")


@pytest.mark.anyio
async def test_pdf_sample_download_and_chunk_acknowledgement(bff_client, shared_apps):
    # module: sample PDF bytes + upload init/chunk acknowledgement through BFF proxy
    await _login(bff_client, shared_apps, "9000000101")
    sample_resp = await bff_client.get("/api/bff/pdf-template/sample.pdf")
    assert sample_resp.status_code == 200
    assert sample_resp.content[:4] == b"%PDF"

    sample = Path("/root/yash-contract/backend/fixtures/catalog-v1/sample.pdf").read_bytes()
    await shared_apps["canonical_db"].batches.update_one(
        {"id": "b1"},
        {
            "$set": {
                "id": "b1",
                "name": "TEST Batch 1",
                "status": "active",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            "$setOnInsert": {"created_at": datetime.now(timezone.utc).isoformat()},
        },
        upsert=True,
    )

    sha = hashlib.sha256(sample).hexdigest()
    chunk_size = 1024 * 1024
    total_chunks = (len(sample) + chunk_size - 1) // chunk_size

    init = await bff_client.post(
        "/api/bff/pdf-upload/init",
        json={
            "batch_id": "b1",
            "filename": "sample.pdf",
            "file_size": len(sample),
            "sha256": sha,
            "total_chunks": total_chunks,
            "mode": "template_v1",
        },
        headers=_headers(await _csrf(bff_client)),
    )
    assert init.status_code == 200, init.text
    upload_id = init.json()["upload_id"]

    chunk0 = sample[:chunk_size]
    c0 = await bff_client.post(
        f"/api/bff/pdf-upload/{upload_id}/chunk",
        params={"chunk_index": 0},
        headers={**_headers(await _csrf(bff_client)), "x-chunk-sha256": hashlib.sha256(chunk0).hexdigest()},
        files={"file": ("chunk-0.bin", chunk0, "application/octet-stream")},
    )
    assert c0.status_code == 200, c0.text

    status = await bff_client.get(f"/api/bff/pdf-upload/{upload_id}/status")
    assert status.status_code == 200, status.text
    assert 0 in status.json().get("received_chunk_indices", [])
