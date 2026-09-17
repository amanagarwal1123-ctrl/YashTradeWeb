"""BFF shared-v1 auth/session integration tests with isolated canonical ASGI + Mongo.

# module: website BFF auth split-login + CSRF/session hardening + refresh coordination
"""

from __future__ import annotations

import asyncio
import hashlib
import importlib.util
import os
import secrets
import sys
import uuid
from datetime import datetime, timezone

import pytest
from dotenv import load_dotenv, dotenv_values
from httpx import ASGITransport, AsyncClient
from motor.motor_asyncio import AsyncIOMotorClient
import fitz  # noqa: F401

load_dotenv("/app/backend/.env")
FRONTEND_URL = (dotenv_values('/app/frontend/.env').get('REACT_APP_BACKEND_URL') or '').rstrip('/')


def _load_module(alias: str, path: str):
    spec = importlib.util.spec_from_file_location(alias, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load module {alias} from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _headers(csrf: str):
    return {
        "origin": "https://website.test",
        "sec-fetch-site": "same-origin",
        "x-csrf-token": csrf,
    }


async def _csrf(client: AsyncClient):
    r = await client.get("/api/security/csrf")
    assert r.status_code == 200, r.text
    token = r.json().get("csrf_token")
    assert isinstance(token, str) and token
    return token


async def _login_staff(client: AsyncClient, sent_otps: dict, phone: str):
    csrf = await _csrf(client)
    sent = await client.post("/api/admin/auth/send-otp", json={"phone": phone}, headers=_headers(csrf))
    assert sent.status_code == 200, sent.text
    challenge_id = sent.json()["challenge_id"]
    otp = sent_otps[(phone, "login")]
    verify = await client.post(
        "/api/admin/auth/verify-otp",
        json={"phone": phone, "otp": otp, "challenge_id": challenge_id},
        headers=_headers(csrf),
    )
    return verify


@pytest.fixture
async def shared_apps(monkeypatch):
    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        pytest.skip("MONGO_URL missing")

    client = AsyncIOMotorClient(mongo_url)
    canonical_db_name = f"canonical_test_{uuid.uuid4().hex[:8]}"
    website_db_name = f"website_test_{uuid.uuid4().hex[:8]}"
    canonical_db = client[canonical_db_name]
    website_db = client[website_db_name]
    await client.drop_database(canonical_db_name)
    await client.drop_database(website_db_name)

    sent_otps: dict[tuple[str, str], str] = {}
    object_store: dict[str, tuple[bytes, str]] = {}

    async def fake_sms(phone: str, otp: str, purpose: str):
        sent_otps[(phone, purpose)] = otp

    def fake_put(path: str, data: bytes, content_type: str):
        object_store[path] = (bytes(data), content_type)
        return {"path": path}

    def fake_get(path: str):
        if path not in object_store:
            raise FileNotFoundError(path)
        return object_store[path]

    monkeypatch.setenv("JWT_SECRET", secrets.token_urlsafe(48))
    # Test-runner PyMuPDF 1.28 emits the legacy fitz warning on stdout. Keep the
    # pinned worker's JSON stdout clean without editing app source/resource limits.
    monkeypatch.setenv("PYMUPDF_MESSAGE", "fd:2")
    monkeypatch.setenv("ENROLLMENT_INTEGRATION_KEY", secrets.token_urlsafe(48))
    monkeypatch.setenv("STAFF_SERVICE_KEY", secrets.token_urlsafe(48))
    monkeypatch.setenv("MONGO_URL", mongo_url)
    monkeypatch.setenv("DB_NAME", canonical_db_name)

    if "/root/yash-contract/backend" not in sys.path:
        sys.path.insert(0, "/root/yash-contract/backend")
    canonical_server = _load_module("canonical_server_shared_tests", "/root/yash-contract/backend/server.py")
    from shared import core as canonical_core

    canonical_core.configure(canonical_db, fake_sms, fake_put, fake_get)
    canonical_server.db = canonical_db
    await canonical_core.ensure_indexes()

    now = datetime.now(timezone.utc).isoformat()
    await canonical_db.users.insert_many(
        [
            {
                "id": "u_admin",
                "phone": "9000000101",
                "phone_normalized": "9000000101",
                "name": "TEST Admin",
                "role": "admin",
                "status": "active",
                "account_status": "active",
                "session_version": 0,
                "phone_verified": True,
                "onboarding_status": "completed",
                "shop_name": "HQ",
                "location": "Delhi",
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "u_tele",
                "phone": "9000000102",
                "phone_normalized": "9000000102",
                "name": "TEST Tele",
                "role": "telecaller",
                "status": "active",
                "account_status": "active",
                "session_version": 0,
                "phone_verified": True,
                "onboarding_status": "completed",
                "shop_name": "TC",
                "location": "Ludhiana",
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "u_tele2",
                "phone": "9000000105",
                "phone_normalized": "9000000105",
                "name": "TEST Tele 2",
                "role": "telecaller",
                "status": "active",
                "account_status": "active",
                "session_version": 0,
                "phone_verified": True,
                "onboarding_status": "completed",
                "shop_name": "TC2",
                "location": "Surat",
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "u_cust",
                "phone": "9000000103",
                "phone_normalized": "9000000103",
                "name": "TEST Customer",
                "role": "customer",
                "status": "active",
                "account_status": "active",
                "session_version": 0,
                "phone_verified": True,
                "onboarding_status": "completed",
                "shop_name": "Shop",
                "location": "Pune",
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "u_bill",
                "phone": "9000000104",
                "phone_normalized": "9000000104",
                "name": "TEST Billing",
                "role": "billing_executive",
                "status": "active",
                "account_status": "active",
                "session_version": 0,
                "phone_verified": True,
                "onboarding_status": "completed",
                "shop_name": "Billing",
                "location": "Mumbai",
                "created_at": now,
                "updated_at": now,
            },
        ]
    )

    if "/app/backend" not in sys.path:
        sys.path.insert(0, "/app/backend")
    website_server = _load_module("website_server_shared_tests", "/app/backend/server.py")
    from bff.config import ANDROID_STORE_URL

    origins = ("https://website.test", FRONTEND_URL) if FRONTEND_URL else ("https://website.test",)

    cfg = website_server.Settings(
        mongo_url=mongo_url,
        db_name=website_db_name,
        origins=origins,
        base="https://canonical.test/api",
        enrollment_key=os.environ["ENROLLMENT_INTEGRATION_KEY"],
        staff_key=os.environ["STAFF_SERVICE_KEY"],
        session_secret=secrets.token_urlsafe(48),
        build_commit="test-commit",
        trusted_ingress=(),
        forward_client_ip=False,
        android_url=ANDROID_STORE_URL,  # live listing, as production ships it
        ingress_origins=("https://yash-scheme-hub.cluster-8.preview.emergentcf.cloud",),
    )
    provider = website_server.Canonical(cfg, transport=ASGITransport(app=canonical_server.app))
    bff_app = website_server.create_app(settings=cfg, database=website_db, provider=provider)

    try:
        yield {
            "mongo": client,
            "canonical_db_name": canonical_db_name,
            "website_db_name": website_db_name,
            "canonical_db": canonical_db,
            "website_db": website_db,
            "canonical_server": canonical_server,
            "website_server": website_server,
            "bff_app": bff_app,
            "cfg": cfg,
            "sent_otps": sent_otps,
            "object_store": object_store,
        }
    finally:
        await client.drop_database(canonical_db_name)
        await client.drop_database(website_db_name)
        client.close()


@pytest.fixture
async def bff_client(shared_apps):
    async with AsyncClient(transport=ASGITransport(app=shared_apps["bff_app"]), base_url="https://website.test") as client:
        yield client


@pytest.fixture
async def object_store(shared_apps):
    return shared_apps["object_store"]


@pytest.mark.anyio
async def test_staff_portal_login_sets_secure_session_cookie_only_for_staff(bff_client, shared_apps):
    # module: split-login happy path for staff portal via canonical challenge + /auth/me
    verify = await _login_staff(bff_client, shared_apps["sent_otps"], "9000000101")
    assert verify.status_code == 200, verify.text
    assert verify.json()["role"] == "admin"

    session_raw = bff_client.cookies.get("__Host-yash_session")
    assert isinstance(session_raw, str) and len(session_raw) > 20

    session_id = hashlib.sha256(session_raw.encode()).hexdigest()
    row = await shared_apps["website_db"].bff_sessions.find_one({"_id": session_id}, {"_id": 0})
    assert row is not None
    assert row["canonical_user_id"] == "u_admin"

    direct = await shared_apps["website_db"].bff_sessions.find_one({"_id": session_raw}, {"_id": 1})
    assert direct is None

    me = await bff_client.get("/api/admin/auth/me")
    assert me.status_code == 200, me.text
    assert me.json()["id"] == "u_admin"


@pytest.mark.anyio
async def test_customer_cannot_create_staff_session_on_portal_flow(bff_client, shared_apps):
    # module: split-login bug regression - customer login must not create staff cookie/session
    csrf = await _csrf(bff_client)
    sent = await bff_client.post("/api/admin/auth/send-otp", json={"phone": "9000000103"}, headers=_headers(csrf))
    assert sent.status_code == 200, sent.text
    otp = shared_apps["sent_otps"][("9000000103", "login")]

    verify = await bff_client.post(
        "/api/admin/auth/verify-otp",
        json={"phone": "9000000103", "otp": otp, "challenge_id": sent.json()["challenge_id"]},
        headers=_headers(csrf),
    )
    assert verify.status_code == 403
    assert verify.json()["code"] == "STAFF_ONLY"

    assert bff_client.cookies.get("__Host-yash_session") is None
    count = await shared_apps["website_db"].bff_sessions.count_documents({})
    assert count == 0


@pytest.mark.anyio
async def test_csrf_and_origin_enforced_for_mutations(bff_client):
    # module: origin + CSRF middleware checks
    await _csrf(bff_client)
    no_csrf = await bff_client.post(
        "/api/admin/auth/send-otp",
        json={"phone": "9000000101"},
        headers={"origin": "https://website.test", "sec-fetch-site": "same-origin"},
    )
    assert no_csrf.status_code == 403
    assert no_csrf.json()["code"] == "CSRF_REJECTED"

    csrf = await _csrf(bff_client)
    bad_origin = await bff_client.post(
        "/api/admin/auth/send-otp",
        json={"phone": "9000000101"},
        headers={"origin": "https://evil.example", "sec-fetch-site": "same-origin", "x-csrf-token": csrf},
    )
    assert bad_origin.status_code == 403
    assert bad_origin.json()["code"] == "ORIGIN_REJECTED"


@pytest.mark.anyio
async def test_same_service_and_enrollment_key_fails_closed(shared_apps):
    # module: fail-closed key separation for portal credential scope
    cfg = shared_apps["website_server"].Settings(
        mongo_url=shared_apps["cfg"].mongo_url,
        db_name=shared_apps["website_db_name"],
        origins=("https://website.test",),
        base=shared_apps["cfg"].base,
        enrollment_key=shared_apps["cfg"].staff_key,
        staff_key=shared_apps["cfg"].staff_key,
        session_secret=secrets.token_urlsafe(48),
        build_commit="test-commit",
        trusted_ingress=(),
        forward_client_ip=False,
    )
    provider = shared_apps["website_server"].Canonical(cfg, transport=ASGITransport(app=shared_apps["canonical_server"].app))
    app = shared_apps["website_server"].create_app(settings=cfg, database=shared_apps["website_db"], provider=provider)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://website.test") as client:
        csrf = await _csrf(client)
        sent = await client.post("/api/admin/auth/send-otp", json={"phone": "9000000101"}, headers=_headers(csrf))
        assert sent.status_code == 503
    assert sent.json()["code"] == "AUTH_SERVICE_UNAVAILABLE"


@pytest.mark.anyio
async def test_demotion_revokes_existing_staff_session(bff_client, shared_apps):
    # module: per-request /auth/me role+status revalidation
    verify = await _login_staff(bff_client, shared_apps["sent_otps"], "9000000102")
    assert verify.status_code == 200

    raw = bff_client.cookies.get("__Host-yash_session")
    sid = hashlib.sha256(raw.encode()).hexdigest()
    await shared_apps["canonical_db"].users.update_one({"id": "u_tele"}, {"$set": {"status": "inactive", "account_status": "inactive"}})

    blocked = await bff_client.get("/api/admin/auth/me")
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "ACCOUNT_INACTIVE"

    row = await shared_apps["website_db"].bff_sessions.find_one({"_id": sid}, {"_id": 1})
    assert row is None


@pytest.mark.anyio
async def test_logout_uncertainty_clears_cookie_and_local_session(bff_client, shared_apps, monkeypatch):
    # module: logout should clear local cookie/session even if upstream revocation is uncertain
    verify = await _login_staff(bff_client, shared_apps["sent_otps"], "9000000101")
    assert verify.status_code == 200
    raw = bff_client.cookies.get("__Host-yash_session")
    sid = hashlib.sha256(raw.encode()).hexdigest()

    original = shared_apps["bff_app"].state.canonical.request

    async def flaky_request(method, path, **kwargs):
        if method == "POST" and path == "/auth/logout":
            raise shared_apps["website_server"].UpstreamError(503, "UPSTREAM_UNCERTAIN", "forced uncertain")
        return await original(method, path, **kwargs)

    monkeypatch.setattr(shared_apps["bff_app"].state.canonical, "request", flaky_request)

    csrf = await _csrf(bff_client)
    out = await bff_client.post("/api/admin/auth/logout", json={}, headers=_headers(csrf))
    assert out.status_code == 503
    body = out.json()
    assert body["logged_out"] is True
    assert body["canonical_revoked"] is False

    assert bff_client.cookies.get("__Host-yash_session") is None
    exists = await shared_apps["website_db"].bff_sessions.find_one({"_id": sid}, {"_id": 1})
    assert exists is None


@pytest.mark.anyio
async def test_concurrent_refresh_across_two_bff_workers_rotates_once(shared_apps):
    # module: CAS refresh coordination across two BFF app instances sharing the same Mongo session
    app_a = shared_apps["bff_app"]
    provider_b = shared_apps["website_server"].Canonical(shared_apps["cfg"], transport=ASGITransport(app=shared_apps["canonical_server"].app))
    app_b = shared_apps["website_server"].create_app(
        settings=shared_apps["cfg"],
        database=shared_apps["website_db"],
        provider=provider_b,
    )

    async with AsyncClient(transport=ASGITransport(app=app_a), base_url="https://website.test") as c1, AsyncClient(
        transport=ASGITransport(app=app_b), base_url="https://website.test"
    ) as c2:
        verify = await _login_staff(c1, shared_apps["sent_otps"], "9000000101")
        assert verify.status_code == 200
        raw = c1.cookies.get("__Host-yash_session")
        sid = hashlib.sha256(raw.encode()).hexdigest()
        c2.cookies.set("__Host-yash_session", raw, domain="website.test", path="/")

        await shared_apps["website_db"].bff_sessions.update_one({"_id": sid}, {"$set": {"access_until": 0.0}})

        r1, r2 = await asyncio.gather(c1.get("/api/admin/auth/me"), c2.get("/api/admin/auth/me"))
        assert r1.status_code == 200, r1.text
        assert r2.status_code == 200, r2.text
        assert r1.json()["id"] == "u_admin"
        assert r2.json()["id"] == "u_admin"

        row = await shared_apps["website_db"].bff_sessions.find_one({"_id": sid}, {"_id": 0})
        assert row["generation"] == 1
        assert "refresh_owner" not in row
