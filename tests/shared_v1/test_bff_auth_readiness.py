"""Targeted auth-readiness and fail-closed flow checks for shared-v1.

# module: readiness status contracts + per-flow availability + origin gating + read-only readiness tool
"""

from __future__ import annotations

import importlib.util
import secrets
from dataclasses import dataclass

import pytest
from httpx import ASGITransport, AsyncClient

from test_bff_auth_session import _csrf, _headers, shared_apps  # noqa: F401  (pytest fixture import)
# ruff: noqa: F811


@dataclass
class _Resp:
    status_code: int
    payload: dict

    def json(self):
        return self.payload


class StubCanonical:
    """Speaks the app 6a6cddd readiness contract: structured 200/503 health + credential GETs."""

    def __init__(self, health_payload=None):
        self.calls = []
        self.probes = []
        self.health_payload = health_payload or {
            "status": "ok",
            "ready": True,
            "build": "canonical-test",
            "commit": "commit-test",
            "database_ready": True,
            "capabilities": {"canonical_auth": 1, "enrollment_grants": 1, "credential_readiness": 1},
            "configuration": {
                "JWT_SECRET": True,
                "MSG91_AUTHKEY": True,
                "ENROLLMENT_INTEGRATION_KEY": True,
                "STAFF_SERVICE_KEY": True,
            },
            "flows": {name: {"ready": True, "issues": []} for name in ("mobile", "staff", "enrollment", "deletion")},
        }

    def unconfigure_staff(self):
        self.health_payload["status"], self.health_payload["ready"] = "not_ready", False
        self.health_payload["configuration"]["STAFF_SERVICE_KEY"] = False
        self.health_payload["flows"]["staff"] = {"ready": False, "issues": ["STAFF_SERVICE_KEY"]}

    async def probe(self, path, key=None):
        self.probes.append((path, key))
        if path == "/health":
            assert key is None
            return (200 if self.health_payload["ready"] else 503), self.health_payload
        flow = {"/integrations/staff/readiness": "staff", "/integrations/enrollment/readiness": "enrollment"}[path]
        assert key == flow
        scoped = self.health_payload["flows"][flow]
        return (200 if scoped["ready"] else 503), {"status": "ok" if scoped["ready"] else "not_ready", "flow": flow,
                                                   **scoped, "build": "canonical-test", "credential_verified": True}

    async def request(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        if method == "POST" and path == "/auth/send-otp":
            return {"challenge_id": "c1", "otp_length": 4, "expires_in": 300, "resend_after": 30}
        return {}


def _build_app(shared_apps_ctx: dict, *, base: str, enrollment_key: str, staff_key: str, origins=("https://website.test",), ingress_origins=()):
    website_server = shared_apps_ctx["website_server"]
    cfg = website_server.Settings(
        mongo_url=shared_apps_ctx["cfg"].mongo_url,
        db_name=shared_apps_ctx["website_db_name"],
        origins=origins,
        base=base,
        enrollment_key=enrollment_key,
        staff_key=staff_key,
        session_secret=secrets.token_urlsafe(48),
        build_commit="test-commit",
        trusted_ingress=(),
        forward_client_ip=False,
        ingress_origins=ingress_origins,
    )
    provider = StubCanonical()
    app = website_server.create_app(settings=cfg, database=shared_apps_ctx["website_db"], provider=provider)
    return app, provider


@pytest.mark.anyio
async def test_missing_config_returns_ready_503_live_200_and_neutral_unavailable_message(shared_apps):
    # module: missing canonical base/keys fail closed without staging/error-specific leakage
    app, provider = _build_app(shared_apps, base="", enrollment_key="", staff_key="")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://website.test") as client:
        health = await client.get("/api/health")
        ready = await client.get("/api/health/ready")
        live = await client.get("/api/health/live")
        status = await client.get("/api/public/auth-status", params={"website_origin": "https://website.test"})

        assert health.status_code == 503
        assert ready.status_code == 503
        assert live.status_code == 200
        assert status.status_code == 200
        body = status.json()
        assert body["flows"]["staff"]["available"] is False
        assert body["flows"]["enrollment"]["available"] is False
        assert body["flows"]["deletion"]["available"] is False
        assert "staging" not in body["flows"]["staff"]["message"].lower()

        csrf = await _csrf(client)
        blocked = await client.post("/api/admin/auth/send-otp", json={"phone": "9000000101"}, headers=_headers(csrf))
        assert blocked.status_code == 503
        assert blocked.json()["code"] == "AUTH_SERVICE_UNAVAILABLE"

    assert all(path == "/health" and key is None for path, key in provider.probes) or provider.probes == []
    assert not any(p in {"/auth/send-otp", "/auth/verify-otp"} for _, p, _ in provider.calls)


@pytest.mark.anyio
async def test_staff_missing_key_blocks_staff_only_while_enrollment_and_deletion_remain_available(shared_apps):
    # module: recognised structured 503 caused only by app staff configuration keeps enrollment/deletion available
    app, provider = _build_app(
        shared_apps,
        base="https://canonical.test/api",
        enrollment_key=secrets.token_urlsafe(48),
        staff_key=secrets.token_urlsafe(48),
    )
    provider.unconfigure_staff()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://website.test") as client:
        ready = await client.get("/api/health/ready")
        assert ready.status_code == 503
        report = ready.json()
        assert report["upstream"]["contract"] == "credential_readiness"
        assert report["flows"]["staff"]["issues"] == ["CANONICAL.STAFF_SERVICE_KEY"]
        assert report["flows"]["enrollment"] == {"ready": True, "issues": [], "credential_verified": True}
        assert report["flows"]["deletion"]["ready"] is True
        assert report["key_matching_verified_by_this_check"] is False

        status = await client.get("/api/public/auth-status", params={"website_origin": "https://website.test"})
        assert status.status_code == 200
        flows = status.json()["flows"]
        assert flows["staff"]["available"] is False
        assert flows["enrollment"]["available"] is True
        assert flows["deletion"]["available"] is True

        csrf = await _csrf(client)
        staff_blocked = await client.post("/api/admin/auth/send-otp", json={"phone": "9000000101"}, headers=_headers(csrf))
        assert staff_blocked.status_code == 503
        assert staff_blocked.json()["code"] == "AUTH_SERVICE_UNAVAILABLE"

        enroll_ok = await client.post(
            "/api/enroll/send-otp",
            json={
                "phone": "9000000111",
                "name": "TEST Enrollment",
                "shop_name": "TEST Shop",
                "location": "Pune",
                "consent_terms": True,
                "consent_privacy": True,
            },
            headers=_headers(csrf),
        )
        assert enroll_ok.status_code == 200, enroll_ok.text

        delete_ok = await client.post("/api/delete/send-otp", json={"phone": "9000000112"}, headers=_headers(csrf))
        assert delete_ok.status_code == 200, delete_ok.text

    assert not any(path == "/auth/send-otp" and kwargs.get("json", {}).get("purpose") == "login" for _, path, kwargs in provider.calls)
    # The staff credential never travels while the app reports the staff flow unavailable.
    assert ("/integrations/staff/readiness", "staff") not in provider.probes
    assert ("/integrations/enrollment/readiness", "enrollment") in provider.probes


@pytest.mark.anyio
async def test_reused_service_keys_fail_closed_with_auth_service_unavailable_and_no_session(shared_apps):
    # module: wrong/reused purpose secret must fail closed with no privileged local fallback
    same = secrets.token_urlsafe(48)
    app, _ = _build_app(shared_apps, base="https://canonical.test/api", enrollment_key=same, staff_key=same)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://website.test") as client:
        csrf = await _csrf(client)
        sent = await client.post("/api/admin/auth/send-otp", json={"phone": "9000000101"}, headers=_headers(csrf))
        assert sent.status_code == 503
        assert sent.json()["code"] == "AUTH_SERVICE_UNAVAILABLE"
        assert client.cookies.get("__Host-yash_session") is None

        me = await client.get("/api/admin/auth/me")
        assert me.status_code == 401
        assert me.json()["code"] == "AUTH_REQUIRED"


@pytest.mark.anyio
async def test_public_auth_status_rejects_unknown_origin_and_masks_flows(shared_apps):
    # module: explicit origin gate for public status when website_origin is unconfigured
    app, _ = _build_app(
        shared_apps,
        base="https://canonical.test/api",
        enrollment_key=secrets.token_urlsafe(48),
        staff_key=secrets.token_urlsafe(48),
        origins=("https://allowed.example",),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://allowed.example") as client:
        denied = await client.get("/api/public/auth-status", params={"website_origin": "https://evil.example"})
        assert denied.status_code == 200
        body = denied.json()
        assert body["origin_allowed"] is False
        assert all(state["available"] is False for state in body["flows"].values())


@pytest.mark.anyio
async def test_readiness_uses_only_documented_get_probes_and_short_cache_no_mutation_calls(shared_apps):
    # module: readiness only issues the three documented GET probes, once per cache window
    app, provider = _build_app(
        shared_apps,
        base="https://canonical.test/api",
        enrollment_key=secrets.token_urlsafe(48),
        staff_key=secrets.token_urlsafe(48),
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://website.test") as client:
        first = await client.get("/api/public/auth-status", params={"website_origin": "https://website.test"})
        second = await client.get("/api/public/auth-status", params={"website_origin": "https://website.test"})
        assert first.status_code == 200
        assert second.status_code == 200
        assert all(state["available"] for state in second.json()["flows"].values())

    assert provider.calls == []
    assert sorted(provider.probes) == [("/health", None), ("/integrations/enrollment/readiness", "enrollment"),
                                       ("/integrations/staff/readiness", "staff")]


def test_check_auth_readiness_returns_nonzero_if_any_origin_unready(monkeypatch):
    # module: read-only readiness script exits nonzero when any explicit origin is unready
    spec = importlib.util.spec_from_file_location("check_auth_readiness", "/app/tools/check_auth_readiness.py")
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)

    monkeypatch.setenv("WEBSITE_CHECK_ORIGINS", "https://ok.example,https://bad.example")

    class FakeClient:
        def __init__(self, *args, **kwargs):
            self.calls = []

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url, params=None):
            self.calls.append(("GET", url, params))
            if url == "https://ok.example/api/health/ready":
                return _Resp(200, {"integration_ready": True, "build": "ok", "commit": "c1", "flows": {}})
            if url == "https://ok.example/api/public/auth-status":
                return _Resp(200, {"origin_allowed": True})
            if url == "https://bad.example/api/health/ready":
                return _Resp(503, {"integration_ready": False, "build": "bad", "commit": "c2", "flows": {"staff": {"issues": ["STAFF_SERVICE_KEY"]}}})
            if url == "https://bad.example/api/public/auth-status":
                return _Resp(200, {"origin_allowed": False})
            raise AssertionError(f"unexpected url: {url}")

    monkeypatch.setattr(module.httpx, "Client", FakeClient)
    rc = module.main()
    assert rc == 1
