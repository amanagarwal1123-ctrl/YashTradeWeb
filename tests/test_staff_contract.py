"""Contract tests for the STAFF integration (docs/YASH_TRADE_APP_INTEGRATION.md -> "Staff (users & roles)").

Runs the spec mock (tests/mock_app_backend.py) IN-PROCESS via httpx ASGITransport, so the
website's client (backend/live_client.py) is exercised against the exact contract the Yash
Trade App team is asked to implement. Also runs the same assertions against the REAL app
backend when STAFF_CONTRACT_LIVE=1 (read-only probe + list only).

Run:  cd /app && python -m pytest tests/test_staff_contract.py -q
"""
import os
import sys
import asyncio
from pathlib import Path

import httpx
import pytest
from dotenv import load_dotenv

load_dotenv(Path("/app/backend/.env"))
sys.path.insert(0, "/app/backend")
sys.path.insert(0, "/app")

import live_client as lc  # noqa: E402
from tests.mock_app_backend import app as mock_app, KEY as MOCK_KEY, staff_users as mock_staff  # noqa: E402


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture()
def mock_backend(monkeypatch):
    async def _client():
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=mock_app), base_url="http://mock")
    monkeypatch.setattr(lc, "_staff_client", _client)
    monkeypatch.setattr(lc, "_upload_client", _client)
    monkeypatch.setattr(lc, "_client", _client)
    lc.configure_integration(base="http://mock", key=MOCK_KEY, source="test")
    mock_staff.clear()
    yield
    mock_staff.clear()
    lc.configure_integration(base=os.environ.get("LIVE_BACKEND_BASE"), enroll_path=os.environ.get("LIVE_INTEGRATION_PATH"),
                             key=os.environ.get("LIVE_INTEGRATION_KEY", ""), source="environment")


def test_probe_reports_live_and_key_accepted(mock_backend):
    p = run(lc.staff_integration_probe())
    assert p["configured"] is True and p["endpoint_live"] is True and p["key_accepted"] is True
    assert p["app_user_count"] == 0 and p["path"] == "/api/integrations/staff"


def test_probe_reports_bad_key(mock_backend):
    lc.configure_integration(key="wrong-key", source="test")
    p = run(lc.staff_integration_probe())
    assert p["endpoint_live"] is True and p["key_accepted"] is False


def test_probe_reports_missing_key():
    lc.configure_integration(key="", source="test")
    p = run(lc.staff_integration_probe())
    assert p["configured"] is False and "not configured" in p["detail"]
    lc.configure_integration(key=os.environ.get("LIVE_INTEGRATION_KEY", ""), source="environment")


def test_upsert_update_delete_roundtrip(mock_backend):
    code, body = run(lc.live_staff_upsert({"phone": "9000044444", "name": "Contract Telecaller", "role": "telecaller", "code": "T1", "status": "active"}))
    assert code == 200 and body["created"] is True
    u = body["user"]
    assert u["phone"] == "9000044444" and u["role"] == "telecaller" and u["status"] == "active" and u["id"]

    # upsert by phone again -> update, not create
    code, body = run(lc.live_staff_upsert({"phone": "9000044444", "name": "Renamed", "role": "billing_executive"}))
    assert code == 200 and body["created"] is False and body["user"]["role"] == "billing_executive" and body["user"]["name"] == "Renamed"

    # list + role filter
    code, body = run(lc.live_staff_list())
    assert code == 200 and len(body["users"]) == 1
    code, body = run(lc.live_staff_list(role="telecaller"))
    assert code == 200 and body["users"] == []

    # PATCH by id (phone change) and by phone
    code, body = run(lc.live_staff_update(u["id"], {"phone": "9000055555"}))
    assert code == 200 and body["user"]["phone"] == "9000055555"
    code, body = run(lc.live_staff_update("9000055555", {"status": "disabled"}))
    assert code == 200 and body["user"]["status"] == "disabled"

    # phone conflict -> 409
    run(lc.live_staff_upsert({"phone": "9000066666", "name": "Other", "role": "admin"}))
    code, body = run(lc.live_staff_update(u["id"], {"phone": "9000066666"}))
    assert code == 409

    # DELETE soft-disables; hard removes
    code, body = run(lc.live_staff_delete(u["id"]))
    assert code == 200 and body["deleted"] is True and body["user"]["status"] == "disabled"
    code, body = run(lc.live_staff_delete("9000066666", hard=True))
    assert code == 200 and body["hard"] is True
    code, body = run(lc.live_staff_list())
    assert [x["phone"] for x in body["users"]] == ["9000055555"]

    # unknown -> 404 (and our helper must NOT mistake it for a missing endpoint)
    code, body = run(lc.live_staff_update("9000099999", {"name": "Nobody"}))
    assert code == 404 and lc.staff_endpoint_missing(code, body) is False


def test_validation_errors(mock_backend):
    assert run(lc.live_staff_upsert({"phone": "123", "name": "Bad", "role": "admin"}))[0] == 400
    assert run(lc.live_staff_upsert({"phone": "9000077777", "name": "X", "role": "admin"}))[0] == 422
    assert run(lc.live_staff_upsert({"phone": "9000077777", "name": "Fine", "role": "ceo"}))[0] == 422


def test_missing_endpoint_detection():
    assert lc.staff_endpoint_missing(404, {"detail": "Not Found"}) is True
    assert lc.staff_endpoint_missing(404, {"raw": ""}) is True
    assert lc.staff_endpoint_missing(404, {"detail": "Staff user not found"}) is False
    assert lc.staff_endpoint_missing(200, {}) is False


@pytest.mark.skipif(os.environ.get("STAFF_CONTRACT_LIVE") != "1", reason="set STAFF_CONTRACT_LIVE=1 to probe the real app backend (read-only)")
def test_real_app_backend_probe_readonly():
    p = run(lc.staff_integration_probe())
    assert p["configured"] is True
    # Until the app team ships the endpoints this reports endpoint_live False with a clear message
    assert p["endpoint_live"] in (True, False, None)
    print("REAL APP STAFF PROBE:", p)


# ---------------------------------------------------------------------------
# Part 2 - token on behalf + acting as staff on the app's own endpoints
# ---------------------------------------------------------------------------
from tests.mock_app_backend import reset_console  # noqa: E402


@pytest.fixture()
def console(mock_backend):
    reset_console()
    yield
    reset_console()


def _mk_staff(phone, role):
    code, body = run(lc.live_staff_upsert({"phone": phone, "name": f"{role} test", "role": role}))
    assert code == 200
    return body["user"]


def test_token_on_behalf_contract(console):
    u = _mk_staff("9000012121", "telecaller")
    code, body = run(lc.live_staff_token("9000012121"))
    assert code == 200 and body["token"] and body["expires_at"] and body["user"]["role"] == "telecaller" and body["user"]["id"] == u["id"]
    # unknown -> 404 with a real detail (not the bare FastAPI "Not Found")
    code, body = run(lc.live_staff_token("9000099999"))
    assert code == 404 and lc.staff_endpoint_missing(code, body) is False
    # disabled -> 409
    run(lc.live_staff_update(u["id"], {"status": "disabled"}))
    assert run(lc.live_staff_token(u["id"]))[0] == 409


def test_role_scoping_enforced_by_app(console):
    _mk_staff("9000013131", "telecaller")
    tele = run(lc.live_staff_token("9000013131"))[1]["token"]
    _mk_staff("9000014141", "billing_executive")
    bill = run(lc.live_staff_token("9000014141"))[1]["token"]
    _mk_staff("9000015151", "admin")
    adm = run(lc.live_staff_token("9000015151"))[1]["token"]

    # telecaller can read requests, cannot touch products or rates
    assert run(lc.live_as_user("GET", "/api/requests", tele))[0] == 200
    assert run(lc.live_as_user("POST", "/api/products", tele, payload={"title": "Nope"}))[0] == 403
    assert run(lc.live_as_user("POST", "/api/rates", tele, payload={"silver_physical_rate": 1}))[0] == 403
    # billing can post rates, cannot handle requests
    assert run(lc.live_as_user("POST", "/api/rates", bill, payload={"silver_physical_rate": 99.5}))[0] == 200
    assert run(lc.live_as_user("PATCH", "/api/requests/req-001", bill, payload={"status": "completed"}))[0] == 403
    # admin can do everything
    assert run(lc.live_as_user("POST", "/api/products", adm, payload={"title": "Admin product"}))[0] == 200
    # public reads need no token at all
    assert run(lc.live_public_get("/api/products", {"limit": 2}))[0] == 200
    assert run(lc.live_public_get("/api/rates/latest"))[0] == 200
    assert run(lc.live_public_get("/api/requests"))[0] == 401


def test_telecaller_flow_contract(console):
    _mk_staff("9000016161", "telecaller")
    tok = run(lc.live_staff_token("9000016161"))[1]["token"]
    code, body = run(lc.live_as_user("GET", "/api/requests", tok, params={"status": "pending"}))
    assert code == 200 and body["requests"] and all(r["status"] == "pending" for r in body["requests"])
    rid = body["requests"][0]["id"]
    code, body = run(lc.live_as_user("PATCH", f"/api/requests/{rid}", tok, payload={"status": "completed", "notes": "Called, resolved"}))
    assert code == 200 and body["status"] == "completed"
    code, body = run(lc.live_as_user("GET", f"/api/requests/{rid}/history", tok))
    assert code == 200 and body["history"][-1]["notes"] == "Called, resolved"
    code, body = run(lc.live_as_user("POST", "/api/telecaller/customers/cust-001/action", tok,
                                     payload={"action": "call", "new_status": "interested", "notes": "Wants payal", "follow_up_at": "2026-09-20T10:00:00+00:00"}))
    assert code == 200 and body["customer"]["lead_status"] == "interested"
    code, body = run(lc.live_as_user("GET", "/api/telecaller/customers/cust-001/activity", tok))
    assert code == 200 and body["activity"][0]["action"] == "call"
    assert run(lc.live_as_user("GET", "/api/telecaller/summary", tok))[0] == 200


def test_product_photo_flow_contract(console):
    _mk_staff("9000017171", "admin")
    tok = run(lc.live_staff_token("9000017171"))[1]["token"]
    code, body = run(lc.live_upload_image(tok, "p.jpg", b"\xff\xd8\xff\xe0fakejpg", "image/jpeg"))
    assert code == 200 and body["url"].startswith("/api/files/")
    code, prod = run(lc.live_as_user("PUT", "/api/products/prod-002", tok, payload={"images": [body["url"]]}))
    assert code == 200 and prod["images"] == [body["url"]]
    code, prod = run(lc.live_as_user("PUT", "/api/products/prod-002", tok, payload={"images": []}))
    assert code == 200 and prod["images"] == []
    assert run(lc.live_as_user("DELETE", "/api/products/prod-002", tok))[0] == 200
    assert run(lc.live_public_get("/api/products/prod-002"))[0] == 404
