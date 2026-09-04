"""Regression tests for the OTP / MSG91 SMS pipeline.

SAFE BY DEFAULT: no SMS is sent. Every check either validates configuration
against MSG91 (flow-detail + log APIs) or exercises request validation that
fails BEFORE the SMS step.

Optional real send:  YASH_TEST_SEND_TO=97XXXXXXXX python -m pytest tests/test_sms_pipeline.py -k real_send
(sends ONE real OTP SMS to that number and confirms operator delivery.)

Run:  cd /app && python -m pytest tests/test_sms_pipeline.py -v
"""
import os
import sys
import asyncio
import time
from pathlib import Path

import httpx
import pytest
from dotenv import load_dotenv

load_dotenv(Path("/app/backend/.env"))
load_dotenv(Path("/app/frontend/.env"))
sys.path.insert(0, "/app/backend")

import sms  # noqa: E402

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/") + "/api"


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ------------------------------------------------------------------ config


def test_env_has_msg91_config():
    cfg = sms.sms_config_status()
    assert cfg["authkey_configured"], "MSG91_AUTHKEY missing in backend/.env"
    assert cfg["template_configured"], "MSG91_TEMPLATE_ID missing in backend/.env"
    assert cfg["primary_endpoint"].startswith("https://api.msg91.com/"), "primary endpoint must be the validating api.msg91.com host"


def test_preflight_accepts_real_config():
    pre = run(sms.preflight_provider_check(force=True))
    assert pre["ok"] is True, f"MSG91 rejected authkey/template: {pre.get('error')}"


def test_connectivity_reports_approved_template():
    check = run(sms.check_msg91_connectivity())
    assert check["reachable"] and check["authkey_valid"] is True
    tpl = check["template"]
    assert tpl and tpl["status"].lower() == "approved" and tpl["state"].lower() == "enabled"
    assert "##otp##" in (tpl.get("variables") or [])


# ------------------------------------------------------------------ failure paths (no SMS leaves)


def test_bad_authkey_is_caught_before_sending(monkeypatch):
    monkeypatch.setattr(sms, "MSG91_AUTHKEY", "definitely-not-a-key")
    monkeypatch.setattr(sms, "_preflight_cache", {"at": 0.0, "result": None})
    res = run(sms.send_otp_sms("9000000000", "0000"))
    assert res["sent"] is False
    assert res["error"] in ("config_invalid", "provider_rejected")
    assert res.get("error_detail")


def test_bad_template_is_caught_before_sending(monkeypatch):
    monkeypatch.setattr(sms, "MSG91_TEMPLATE_ID", "000000000000000000000000")
    monkeypatch.setattr(sms, "_preflight_cache", {"at": 0.0, "result": None})
    res = run(sms.send_otp_sms("9000000000", "0000"))
    assert res["sent"] is False
    assert res["error"] in ("config_invalid", "provider_rejected")


def test_missing_config_is_reported(monkeypatch):
    monkeypatch.setattr(sms, "MSG91_TEMPLATE_ID", "")
    res = run(sms.send_otp_sms("9000000000", "0000"))
    assert res == {"sent": False, "error": "sms_not_configured", "error_detail": "Backend environment is missing: MSG91_TEMPLATE_ID", "attempts": 0}
    assert "not configured" in sms.friendly_sms_error(res)


def test_delivery_lookup_for_unknown_request_id():
    res = run(sms.fetch_delivery_status("000000000000000000000000"))
    assert res["found"] is False and not res.get("error"), res


# ------------------------------------------------------------------ HTTP layer


def test_health_endpoint_reports_build_and_provider():
    r = httpx.get(f"{BASE}/health", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["build"].startswith("2026.")
    assert d["sms"]["ready"] is True
    assert d["sms"]["provider_check"] == "ok", d["sms"]


def test_send_otp_rejects_invalid_phone_before_sms():
    r = httpx.post(f"{BASE}/enroll/send-otp", json={"name": "T", "phone": "12345", "shop_name": "S", "location": "L",
                                                    "consent_terms": True, "consent_privacy": True}, timeout=30)
    assert r.status_code == 422


def test_send_otp_requires_consent_before_sms():
    r = httpx.post(f"{BASE}/enroll/send-otp", json={"name": "Test", "phone": "9000000001", "shop_name": "Shop", "location": "Loc",
                                                    "consent_terms": False, "consent_privacy": False}, timeout=30)
    assert r.status_code == 422


def test_admin_send_otp_blocks_unknown_phone_before_sms():
    r = httpx.post(f"{BASE}/admin/auth/send-otp", json={"phone": "9000000002"}, timeout=30)
    assert r.status_code == 403


def test_admin_sms_endpoints_require_auth():
    for path in ("/admin/sms/diagnostics", "/admin/sms/logs"):
        assert httpx.get(f"{BASE}{path}", timeout=30).status_code == 401
    assert httpx.post(f"{BASE}/admin/sms/test", json={"phone": "9000000003"}, timeout=30).status_code == 401


# ------------------------------------------------------------------ optional real send


@pytest.mark.skipif(not os.environ.get("YASH_TEST_SEND_TO"), reason="set YASH_TEST_SEND_TO=<10 digit> to send ONE real OTP")
def test_real_send_and_operator_delivery():
    phone = os.environ["YASH_TEST_SEND_TO"]
    res = run(sms.send_otp_sms(phone, "1357"))
    assert res["sent"] is True, res
    rid = res["request_id"]
    status = None
    for _ in range(6):
        time.sleep(5)
        st = run(sms.fetch_delivery_status(rid))
        if st.get("found"):
            status = st
            if str(st.get("status", "")).lower() not in ("pending", "submitted", "queued", "sent"):
                break
    assert status and status["found"], f"MSG91 never logged request {rid} - silently dropped"
    assert str(status["status"]).lower() == "delivered", status
