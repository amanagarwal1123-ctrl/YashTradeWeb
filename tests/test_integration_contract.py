"""Contract tests for the website's server-to-server client against the Yash Trade App
integration spec (docs/YASH_TRADE_APP_INTEGRATION.md).

Runs the spec mock (tests/mock_app_backend.py) IN-PROCESS via httpx ASGITransport, so
no network, no SMS, no changes to the real app backend. Also includes one read-only
smoke test against the REAL app backend (health + probe) that is skipped when offline.

Run:  cd /app && python -m pytest tests/test_integration_contract.py -v
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
from tests.mock_app_backend import app as mock_app, KEY as MOCK_KEY, customers as mock_customers  # noqa: E402


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture()
def mock_backend(monkeypatch):
    """Point live_client at the in-process mock."""
    async def _client():
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=mock_app), base_url="http://mock")
    monkeypatch.setattr(lc, "_client", _client)
    lc.configure_integration(base="http://mock", enroll_path="/api/integrations/enrollments", key=MOCK_KEY, source="test")
    mock_customers.clear()
    yield
    lc.configure_integration(base=os.environ.get("LIVE_BACKEND_BASE"), enroll_path=os.environ.get("LIVE_INTEGRATION_PATH"),
                             key=os.environ.get("LIVE_INTEGRATION_KEY", ""), source="environment")


def test_sync_method_reflects_configuration(monkeypatch):
    lc.configure_integration(key="", source="test")
    assert lc.sync_method() in ("not_configured", "customer_otp_login")
    lc.configure_integration(key="abc", source="test")
    assert lc.sync_method() == "integration_key"
    lc.configure_integration(key=os.environ.get("LIVE_INTEGRATION_KEY", ""), source="environment")


def test_upsert_all_fields_match(mock_backend):
    res = run(lc.sync_enrollment_to_live("9000011122", "Contract Test", "Contract Jewellers", "Jaipur", "Jaipur", "2026-09-10T00:00:00+00:00"))
    assert res["status"] == "ok" and res["method"] == "integration_key" and res["created"] is True
    assert all(f["match"] for f in res["field_check"]), res["field_check"]
    assert res["snapshot"]["has_logged_in"] is False and res["snapshot"]["last_login"] is None
    # second call is an update, not a create; empty strings do not overwrite
    res2 = run(lc.sync_enrollment_to_live("9000011122", "Contract Test", "", "Jaipur", "Jaipur", "2026-09-10T00:00:00+00:00"))
    assert res2["created"] is False and res2["snapshot"]["shop_name"] == "Contract Jewellers"


def test_bad_key_is_explained(mock_backend):
    lc.configure_integration(key="wrong", source="test")
    res = run(lc.sync_enrollment_to_live("9000011122", "X", "S", "L", "L", "2026-09-10T00:00:00+00:00"))
    assert res["status"] == "failed" and "rejected the integration key" in res["error"]
    probe = run(lc.integration_probe())
    assert probe["endpoint_live"] is True and probe["key_accepted"] is False


def test_staff_number_is_refused(mock_backend):
    res = run(lc.sync_enrollment_to_live("9999813334", "Admin", "S", "L", "L", "2026-09-10T00:00:00+00:00"))
    assert res["status"] == "failed" and "staff" in res["error"].lower()


def test_no_fallback_when_key_missing(mock_backend, monkeypatch):
    monkeypatch.setattr(lc, "ALLOW_OTP_FALLBACK", False)
    lc.configure_integration(key="", source="test")
    res = run(lc.sync_enrollment_to_live("9000011122", "X", "S", "L", "L", "2026-09-10T00:00:00+00:00"))
    assert res["status"] == "failed" and res["method"] == "not_configured" and "LIVE_INTEGRATION_KEY" in res["error"]


def test_get_and_delete_contract(mock_backend):
    run(lc.sync_enrollment_to_live("9000011133", "Del Test", "Del Shop", "Pune", "Pune", "2026-09-10T00:00:00+00:00"))
    code, body = run(lc.live_integration_get("9000011133"))
    assert code == 200 and body["customer"]["shop_name"] == "Del Shop"
    code, body = run(lc.live_integration_delete("9000011133"))
    assert code == 200 and body["deleted"] is True and body["reference"].startswith("DEL-")
    assert set(body["kept"]) == {"name", "shop_name", "location", "phone"}
    code, body = run(lc.live_integration_delete("9000011133"))
    assert code == 200 and body.get("already_deleted") is True
    code, _ = run(lc.live_integration_delete("9000011199"))
    assert code == 404


def test_probe_detects_endpoint_not_deployed(mock_backend, monkeypatch):
    """A backend WITHOUT the integration routes must be reported as 'not deployed', not as 'key rejected'."""
    from fastapi import FastAPI
    bare = FastAPI()

    @bare.get("/api/health")
    async def h():
        return {"build": "old"}

    async def _client():
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=bare), base_url="http://bare")
    monkeypatch.setattr(lc, "_client", _client)
    probe = run(lc.integration_probe())
    assert probe["endpoint_live"] is False and "not expose" in probe["detail"]


@pytest.mark.skipif(not os.environ.get("LIVE_INTEGRATION_KEY"), reason="no integration key in env")
def test_real_app_backend_probe_read_only():
    """Read-only smoke test against the configured real app backend (skips if unreachable)."""
    lc.configure_integration(base=os.environ.get("LIVE_BACKEND_BASE"), key=os.environ.get("LIVE_INTEGRATION_KEY"), source="environment")
    health = run(lc.live_health())
    if not health.get("reachable"):
        pytest.skip("real app backend unreachable")
    probe = run(lc.integration_probe())
    assert probe["endpoint_live"] is True and probe["key_accepted"] is True, probe
