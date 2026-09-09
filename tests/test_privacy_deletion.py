"""Regression tests: privacy policy config, account-deletion flow, admin data-sharing tools.

SAFE: no SMS is ever sent. The deletion confirm path is exercised by seeding an OTP
challenge directly in MongoDB for a synthetic phone number.

Run:  cd /app && python -m pytest tests/test_privacy_deletion.py -v
"""
import os
import sys
import uuid
import asyncio
from pathlib import Path
from datetime import datetime, timezone, timedelta

import httpx
import pytest
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path("/app/backend/.env"))
load_dotenv(Path("/app/frontend/.env"))
sys.path.insert(0, "/app/backend")
import server  # noqa: E402

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/") + "/api"
SYNTH_PHONE = "9000011122"  # synthetic - never dialled, never receives SMS


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def db():
    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def test_public_config_has_company_and_privacy_metadata():
    d = httpx.get(f"{BASE}/public/config", timeout=30).json()
    co = d["company"]
    assert co["legal_entity"] == "Yash Silver House Pvt. Ltd."
    assert co["support_email"] and co["address"] and co["privacy_updated"]
    assert co["deletion_sla_days"] == 30


def test_privacy_and_delete_pages_are_served():
    root = BASE[:-4]
    for path in ("/privacy", "/delete-account", "/terms"):
        r = httpx.get(root + path, timeout=30, follow_redirects=True)
        assert r.status_code == 200 and "text/html" in r.headers.get("content-type", ""), path


def test_delete_send_otp_rejects_invalid_phone_before_sms():
    for bad in ("12345", "5000000000", "+919711881372"):
        r = httpx.post(f"{BASE}/account/delete/send-otp", json={"phone": bad}, timeout=30)
        assert r.status_code == 422, (bad, r.text)


def test_delete_confirm_rejects_without_challenge():
    r = httpx.post(f"{BASE}/account/delete/confirm", json={"phone": SYNTH_PHONE, "otp": "1111"}, timeout=30)
    assert r.status_code == 400


def test_delete_confirm_full_flow_with_seeded_otp():
    async def seed():
        d = db()
        now = datetime.now(timezone.utc)
        await d.enrollments.delete_many({"phone": SYNTH_PHONE})
        await d.enrollments.insert_one({"id": str(uuid.uuid4()), "phone": SYNTH_PHONE, "name": "Synthetic Deletion Test",
                                        "shop_name": "Synthetic Shop", "location": "Nowhere", "city": "Nowhere",
                                        "registered_at": now.isoformat(), "live_sync_status": "failed"})
        await d.otp_challenges.insert_one({"id": str(uuid.uuid4()), "phone": SYNTH_PHONE, "purpose": "delete",
                                           "otp_hash": server.hash_otp(SYNTH_PHONE, "4321"), "attempts": 0, "resend_count": 0,
                                           "verified": False, "consumed": False, "ip": "test", "pending_data": {},
                                           "created_at": now.isoformat(), "expires_at": (now + timedelta(minutes=10)).isoformat(),
                                           "expire_marker": now + timedelta(hours=2)})
    run(seed())
    wrong = httpx.post(f"{BASE}/account/delete/confirm", json={"phone": SYNTH_PHONE, "otp": "0000"}, timeout=30)
    assert wrong.status_code == 400 and "attempts remaining" in wrong.text
    ok = httpx.post(f"{BASE}/account/delete/confirm", json={"phone": SYNTH_PHONE, "otp": "4321", "reason": "pytest"}, timeout=60)
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["success"] and body["reference"].startswith("DEL-") and body["website_data_deleted"] is True

    async def check():
        d = db()
        assert await d.enrollments.find_one({"phone": SYNTH_PHONE}) is None
        req = await d.deletion_requests.find_one({"reference": body["reference"]})
        assert req and req["status"] in ("pending", "completed") and req["phone_masked"].endswith("1122")
        await d.deletion_requests.delete_one({"reference": body["reference"]})  # tidy up test artefact
    run(check())


def test_admin_new_endpoints_require_auth():
    for m, path in (("get", "/admin/live/health"), ("get", "/admin/deletion-requests"),
                    ("post", "/admin/deletion-requests/x/complete"), ("post", "/admin/customers/x/verify-sync")):
        r = getattr(httpx, m)(f"{BASE}{path}", timeout=30)
        assert r.status_code == 401, (path, r.status_code)


def test_compare_profile_flags_dropped_fields():
    from live_client import compare_profile
    sent = {"name": "A", "shop_name": "S", "location": "L", "city": "L", "registration_source": "website",
            "onboarding_status": "registered", "registered_at": "2026-09-01T10:00:00+00:00"}
    stored = {"name": "A", "shop_name": "", "location": "L", "city": "L", "registration_source": "app",
              "onboarding_status": "completed", "registered_at": "2026-09-01T10:00:00.700000+00:00"}
    fc = {f["field"]: f["match"] for f in compare_profile(sent, stored)}
    assert fc == {"name": True, "shop_name": False, "location": True, "city": True,
                  "registration_source": False, "onboarding_status": False, "registered_at": True}
