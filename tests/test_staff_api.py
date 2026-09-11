"""Manage Users (staff directory) API tests - run against the local backend with a seeded admin session.

Safe: no SMS is sent (session is inserted directly), synthetic phones only (90000xxxxx).
Run:  cd /app && python -m pytest tests/test_staff_api.py -q
"""
import os
import secrets
import sys
import asyncio
from datetime import datetime, timezone, timedelta

import httpx
import pytest
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

BASE = os.environ.get("STAFF_TEST_BASE", "http://localhost:8001").rstrip("/") + "/api"
ADMIN_PHONE = "9999813334"
SYN = {"a": "9000011111", "b": "9000022222", "c": "9000033333"}


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(scope="module")
def db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    yield client[os.environ["DB_NAME"]]
    client.close()


@pytest.fixture(scope="module")
def session(db):
    tok = "TEMPTEST_" + secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    _run(db.admin_sessions.insert_one({"token": tok, "phone": ADMIN_PHONE, "role": "admin", "live_token": None, "live_role": None,
                                        "created_at": now.isoformat(), "last_active": now.isoformat(),
                                        "expires_at": (now + timedelta(hours=1)).isoformat(), "expire_marker": now + timedelta(hours=1), "ip": "pytest"}))
    yield {"Cookie": f"yash_admin_session={tok}"}
    _run(db.admin_sessions.delete_many({"token": tok}))
    _run(db.staff_users.delete_many({"phone": {"$in": list(SYN.values())}}))
    _run(db.audit_logs.delete_many({"target": {"$in": list(SYN.values())}}))


@pytest.fixture(scope="module")
def c(session):
    with httpx.Client(base_url=BASE, headers=session, timeout=40) as client:
        yield client


def test_requires_admin_session():
    r = httpx.get(f"{BASE}/admin/staff", timeout=20)
    assert r.status_code == 401


def test_env_admin_seeded(c):
    r = c.get("/admin/staff")
    assert r.status_code == 200, r.text
    d = r.json()
    me = [i for i in d["items"] if i["phone"] == ADMIN_PHONE]
    assert me and me[0]["role"] == "admin" and me[0]["status"] == "active" and me[0]["is_me"] is True
    assert set(d["counts"]) == {"admin", "telecaller", "billing_executive"}
    assert d["roles"] == ["admin", "telecaller", "billing_executive"]


def test_app_status_probe_shape(c):
    r = c.get("/admin/staff/app-status")
    assert r.status_code == 200
    d = r.json()
    assert {"configured", "endpoint_live", "key_accepted", "detail", "path"} <= set(d)


def test_create_validation(c):
    assert c.post("/admin/staff", json={"name": "X", "phone": SYN["a"], "role": "telecaller"}).status_code == 422  # name too short
    assert c.post("/admin/staff", json={"name": "Valid Name", "phone": "12345", "role": "telecaller"}).status_code == 422
    assert c.post("/admin/staff", json={"name": "Valid Name", "phone": SYN["a"], "role": "ceo"}).status_code == 422


def test_create_update_remove_flow(c):
    r = c.post("/admin/staff", json={"name": "Test Telecaller", "phone": SYN["a"], "role": "telecaller", "code": "TC-01"})
    assert r.status_code == 201, r.text
    a = r.json()
    assert a["role"] == "telecaller" and a["status"] == "active" and a["source"] == "site" and a["code"] == "TC-01"
    assert a["app_sync_status"] in ("ok", "pending", "failed", "not_configured")

    # duplicate phone refused
    assert c.post("/admin/staff", json={"name": "Dup", "phone": SYN["a"], "role": "telecaller"}).status_code == 409

    # edit: role + phone + name
    r = c.patch(f"/admin/staff/{a['id']}", json={"role": "billing_executive", "phone": SYN["b"], "name": "Test Billing"})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["role"] == "billing_executive" and b["phone"] == SYN["b"] and b["name"] == "Test Billing"

    # list filter by role
    r = c.get("/admin/staff", params={"role": "billing_executive"})
    assert any(i["id"] == a["id"] for i in r.json()["items"])

    # disable, then the phone cannot log in
    r = c.patch(f"/admin/staff/{a['id']}", json={"status": "disabled"})
    assert r.status_code == 200 and r.json()["status"] == "disabled"
    r = c.post("/admin/auth/send-otp", json={"phone": SYN["b"]}, headers={"Cookie": ""})
    assert r.status_code == 403  # not authorized (disabled) - no SMS sent

    # resync endpoint returns the record
    r = c.post(f"/admin/staff/{a['id']}/resync")
    assert r.status_code == 200 and r.json()["id"] == a["id"]

    # remove -> gone from list, 404 afterwards
    r = c.delete(f"/admin/staff/{a['id']}")
    assert r.status_code == 200 and r.json()["removed"] is True
    assert all(i["id"] != a["id"] for i in c.get("/admin/staff").json()["items"])
    assert c.patch(f"/admin/staff/{a['id']}", json={"name": "Ghost"}).status_code == 404


def test_new_admin_can_login_and_is_protected(c, db):
    r = c.post("/admin/staff", json={"name": "Second Admin", "phone": SYN["c"], "role": "admin"})
    assert r.status_code == 201, r.text
    new_admin = r.json()
    # a brand-new admin is authorized for the portal -> send-otp passes the whitelist check.
    # We stop before the SMS by exhausting nothing: use the lockout-free path of a wrong-OTP verify (400 = challenge missing,
    # which only happens for AUTHORIZED phones after the whitelist check).
    r = c.post("/admin/auth/verify-otp", json={"phone": SYN["c"], "otp": "0000"}, headers={"Cookie": ""})
    assert r.status_code == 400 and "OTP not found" in r.text
    _run(db.audit_logs.delete_many({"actor": SYN["c"], "action": "admin_login_failed"}))

    # self-protection rules
    me = [i for i in c.get("/admin/staff").json()["items"] if i["is_me"]][0]
    assert c.patch(f"/admin/staff/{me['id']}", json={"role": "telecaller"}).status_code == 409
    assert c.patch(f"/admin/staff/{me['id']}", json={"status": "disabled"}).status_code == 409
    assert c.delete(f"/admin/staff/{me['id']}").status_code == 409

    # last-admin protection: demote the new admin (fine, I remain), then remove
    assert c.patch(f"/admin/staff/{new_admin['id']}", json={"role": "telecaller"}).status_code == 200
    assert c.delete(f"/admin/staff/{new_admin['id']}").status_code == 200


def test_audit_trail_written(c, db):
    n = _run(db.audit_logs.count_documents({"action": {"$in": ["staff_created", "staff_updated", "staff_removed", "staff_resynced"]},
                                             "target": {"$in": list(SYN.values())}}))
    assert n >= 6
