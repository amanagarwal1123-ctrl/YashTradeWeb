"""Offline readiness-adapter regressions: real bff.canonical.Canonical + bff.readiness over httpx.MockTransport.

# module: structured 200/503 health interpretation, credential-scoped probes, forbidden routing,
#         malformed upstream bodies, timeout/cache recovery, coalescing and website origin allowlist.
# No canonical app process, Mongo identities, SMS or OTP are involved. Upstream is MOCKED here.
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import secrets
import sys
import uuid

import httpx
import pytest
from dotenv import load_dotenv
from httpx import ASGITransport, AsyncClient, MockTransport
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")

if "/app/backend" not in sys.path:
    sys.path.insert(0, "/app/backend")
from bff.canonical import Canonical, UpstreamError  # noqa: E402
from bff.config import Settings  # noqa: E402
from bff.readiness import Readiness  # noqa: E402


def website_app(cfg, database, provider):
    spec = importlib.util.spec_from_file_location("website_server_readiness_tests", "/app/backend/server.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.create_app(settings=cfg, database=database, provider=provider)

BASE = "https://canonical.test/api"
SITE_ORIGINS = ("https://register.yashsilver.com", "https://yash-register.emergent.host")
STAFF_KEY = "staff-" + secrets.token_urlsafe(48)
ENROLL_KEY = "enroll-" + secrets.token_urlsafe(48)
APP_FLOWS = ("mobile", "staff", "enrollment", "deletion")


def settings(**overrides):
    values = dict(mongo_url=os.environ.get("MONGO_URL", "mongodb://localhost:27017"), db_name="unused", origins=SITE_ORIGINS,
                  base=BASE, enrollment_key=ENROLL_KEY, staff_key=STAFF_KEY, session_secret=secrets.token_urlsafe(48),
                  build_commit="test-commit")
    values.update(overrides)
    return Settings(**values)


def health_body(*, ready=True, flows=None, database_ready=True, capabilities=None, configuration=None):
    flows = flows or {name: {"ready": True, "issues": []} for name in APP_FLOWS}
    ready = ready and all(f["ready"] for f in flows.values())
    return {"status": "ok" if ready else "not_ready", "ready": ready, "build": "app-test", "commit": "app-commit",
            "capabilities": capabilities or {"canonical_auth": 1, "enrollment_grants": 1, "credential_readiness": 1},
            "configuration": configuration or {"JWT_SECRET": True, "ENROLLMENT_INTEGRATION_KEY": True, "STAFF_SERVICE_KEY": True,
                                               "MSG91_AUTHKEY": True, "MSG91_TEMPLATE_ID": True, "MONGO_URL": True, "DB_NAME": True},
            "flows": flows, "database_ready": database_ready, "sms_delivery_verified": False,
            "account_role_verified": False, "key_matching_verified_by_this_check": False}


class AppDouble:
    """Documented app readiness behaviour (shared/readiness.py at 6a6cddd) with recorded requests."""

    def __init__(self, body=None, staff_key=STAFF_KEY, enroll_key=ENROLL_KEY):
        self.body = body or health_body()
        self.staff_key, self.enroll_key = staff_key, enroll_key
        self.requests: list[httpx.Request] = []
        self.delay = 0
        self.override = None

    def credential(self, request, header, expected, flow, code):
        supplied = request.headers.get(header, "")
        if not expected:
            return httpx.Response(503, json={"code": "CONFIGURATION_REQUIRED", "detail": "Server requires a strong key"})
        if supplied != expected:
            return httpx.Response(401, json={"code": code, "detail": "credential rejected"})
        scoped = self.body["flows"][flow]
        return httpx.Response(200 if scoped["ready"] else 503, json={"status": "ok" if scoped["ready"] else "not_ready", "flow": flow,
                              **scoped, "build": "app-test", "credential_verified": True, "sms_delivery_verified": False,
                              "account_role_verified": False})

    async def __call__(self, request):
        self.requests.append(request)
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.override:
            return self.override(request)
        path = request.url.path
        if path == "/api/health":
            return httpx.Response(200 if self.body["ready"] else 503, json=self.body)
        if path == "/api/integrations/staff/readiness":
            return self.credential(request, "x-staff-service-key", self.staff_key, "staff", "SERVICE_KEY_INVALID")
        if path == "/api/integrations/enrollment/readiness":
            return self.credential(request, "x-integration-key", self.enroll_key, "enrollment", "INTEGRATION_KEY_INVALID")
        return httpx.Response(404, json={"code": "NOT_FOUND", "detail": path})


def build(cfg=None, double=None):
    cfg = cfg or settings()
    double = double or AppDouble()
    canonical = Canonical(cfg, transport=MockTransport(double))
    return Readiness(cfg, canonical), canonical, double


def probes(double):
    return [(r.method, r.url.path, "staff" if "x-staff-service-key" in r.headers else "enroll" if "x-integration-key" in r.headers else None)
            for r in double.requests]


@pytest.fixture
async def website_db():
    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        pytest.skip("MONGO_URL missing")
    client = AsyncIOMotorClient(mongo_url)
    name = f"website_readiness_{uuid.uuid4().hex[:8]}"
    try:
        yield client[name]
    finally:
        await client.drop_database(name)
        client.close()


@pytest.mark.anyio
async def test_full_readiness_verifies_both_credentials_once_each():
    # module: all-healthy 200 + credential_verified responses → every flow ready, key matching verified
    readiness, _, double = build()
    snap = await readiness.snapshot()
    assert snap["configuration_ready"] is True
    assert snap["key_matching_verified_by_this_check"] is True
    assert snap["upstream"]["contract"] == "credential_readiness"
    assert snap["upstream"]["build"] == "app-test"
    assert snap["upstream"]["capabilities"] == {"credential_readiness": True, "customer_id_history": False, "deletion_outbox_cursor": False, "enrollment_grants": True}
    full = build(double=AppDouble(health_body(capabilities={"canonical_auth": 1, "enrollment_grants": 1, "credential_readiness": 1, "customer_id_history": 1, "deletion_outbox_cursor": 1})))[0]
    assert (await full.snapshot())["upstream"]["capabilities"]["customer_id_history"] is True
    assert all(s["ready"] and s["credential_verified"] is True and s["issues"] == [] for s in snap["flows"].values())
    assert sorted(probes(double)) == [("GET", "/api/health", None), ("GET", "/api/integrations/enrollment/readiness", "enroll"),
                                      ("GET", "/api/integrations/staff/readiness", "staff")]
    health_request = next(r for r in double.requests if r.url.path == "/api/health")
    assert "x-staff-service-key" not in health_request.headers and "x-integration-key" not in health_request.headers


@pytest.mark.anyio
async def test_staff_only_503_keeps_enrollment_and_deletion_ready_without_sending_staff_key():
    # module: structured 503 whose only issue is app STAFF_SERVICE_KEY disables staff alone
    flows = {name: {"ready": True, "issues": []} for name in APP_FLOWS}
    flows["staff"] = {"ready": False, "issues": ["STAFF_SERVICE_KEY"]}
    readiness, _, double = build(double=AppDouble(health_body(flows=flows), staff_key=""))
    snap = await readiness.snapshot()
    assert snap["flows"]["staff"] == {"ready": False, "issues": ["CANONICAL.STAFF_SERVICE_KEY"], "credential_verified": None}
    assert snap["flows"]["enrollment"] == {"ready": True, "issues": [], "credential_verified": True}
    assert snap["flows"]["deletion"] == {"ready": True, "issues": [], "credential_verified": True}
    assert snap["configuration_ready"] is False
    assert ("GET", "/api/integrations/staff/readiness", "staff") not in probes(double)
    public = await readiness.public()
    assert public["flows"]["staff"]["available"] is False and public["flows"]["enrollment"]["available"] is True


@pytest.mark.anyio
async def test_missing_local_enrollment_settings_disable_enrollment_and_deletion_but_not_staff():
    # module: local configuration decides its own flows; enrollment credential never travels when unconfigured
    readiness, _, double = build(settings(enrollment_key=""))
    snap = await readiness.snapshot()
    assert snap["flows"]["staff"]["ready"] is True and snap["flows"]["staff"]["credential_verified"] is True
    for name in ("enrollment", "deletion"):
        assert snap["flows"][name]["ready"] is False
        assert "ENROLLMENT_INTEGRATION_KEY" in snap["flows"][name]["issues"]
        assert snap["flows"][name]["credential_verified"] is None
    assert [p for p in probes(double) if p[1] == "/api/integrations/enrollment/readiness"] == []


@pytest.mark.anyio
async def test_database_outage_marks_every_flow_unavailable_and_sends_no_credentials():
    # module: app DATABASE_UNAVAILABLE on every flow is surfaced per flow; probes stop at public health
    flows = {name: {"ready": False, "issues": ["DATABASE_UNAVAILABLE"]} for name in APP_FLOWS}
    readiness, _, double = build(double=AppDouble(health_body(flows=flows, database_ready=False)))
    snap = await readiness.snapshot()
    assert all(s["ready"] is False and s["issues"] == ["CANONICAL.DATABASE_UNAVAILABLE"] for s in snap["flows"].values())
    assert snap["upstream"]["reachable"] is True and snap["upstream"]["database_ready"] is False
    assert probes(double) == [("GET", "/api/health", None)]


@pytest.mark.parametrize("response", [
    lambda r: httpx.Response(200, text="<html><body>maintenance</body></html>", headers={"content-type": "text/html"}),
    lambda r: httpx.Response(200, content=b"{", headers={"content-type": "application/json"}),
    lambda r: httpx.Response(200, json=["not", "an", "object"]),
    lambda r: httpx.Response(503, json={"detail": "Service Unavailable"}),
    lambda r: httpx.Response(503, text="Service Unavailable", headers={"content-type": "text/plain"}),
    lambda r: httpx.Response(200, json={"status": "alive", "build": "app-test"}),
    lambda r: httpx.Response(200, json={**health_body(), "flows": {"staff": {"ready": "yes", "issues": []}}}),
    lambda r: httpx.Response(200, json={**health_body(), "flows": {**health_body()["flows"], "staff": {"ready": True, "issues": ["<script>"]}}}),
    lambda r: httpx.Response(503, json=health_body()),
    lambda r: httpx.Response(200, json=health_body(ready=False)),
    lambda r: httpx.Response(500, json={"code": "SERVICE_ERROR", "detail": "boom"}),
    lambda r: httpx.Response(302, headers={"location": "https://attacker.example/api/health"}),
], ids=["html", "malformed-json", "json-array", "arbitrary-503", "text-503", "liveness-body", "bad-flow-type",
        "unsafe-issue-text", "status-mismatch-503", "status-mismatch-200", "http-500", "redirect"])
@pytest.mark.anyio
async def test_unexpected_health_responses_fail_every_flow_closed(response):
    # module: only the documented AuthReadiness shape is interpreted; anything else → all flows unavailable
    double = AppDouble()
    double.override = response
    readiness, _, _ = build(double=double)
    snap = await readiness.snapshot()
    assert all(s["ready"] is False and "CANONICAL_UNAVAILABLE_OR_INCOMPATIBLE" in s["issues"] for s in snap["flows"].values())
    assert snap["key_matching_verified_by_this_check"] is False
    assert len(double.requests) == 1, "no credential probe and no redirect follow after an unrecognised health response"


@pytest.mark.anyio
async def test_present_but_wrong_staff_key_disables_staff_only_with_redacted_report(website_db):
    # module: app 401 on the staff credential probe → staff unavailable, enrollment/deletion untouched, no secret in output
    cfg = settings(db_name=website_db.name)
    double = AppDouble(staff_key="different-" + secrets.token_urlsafe(40))
    app = website_app(cfg, website_db, Canonical(cfg, transport=MockTransport(double)))
    async with AsyncClient(transport=ASGITransport(app=app), base_url=SITE_ORIGINS[0]) as client:
        ready = await client.get("/api/health/ready")
        status = await client.get("/api/public/auth-status", params={"website_origin": SITE_ORIGINS[0]})
        csrf = (await client.get("/api/security/csrf")).json()["csrf_token"]
        blocked = await client.post("/api/admin/auth/send-otp", json={"phone": "9000000101"},
                                    headers={"origin": SITE_ORIGINS[0], "sec-fetch-site": "same-origin", "x-csrf-token": csrf})
    assert ready.status_code == 503
    report = ready.json()
    assert report["flows"]["staff"] == {"ready": False, "issues": ["CANONICAL_CREDENTIAL_MISMATCH"], "credential_verified": False}
    assert report["flows"]["enrollment"]["ready"] is True and report["flows"]["deletion"]["ready"] is True
    assert report["key_matching_verified_by_this_check"] is False
    assert report["real_login_verified_by_this_check"] is False
    flows = status.json()["flows"]
    assert flows["staff"]["available"] is False and flows["enrollment"]["available"] is True
    assert blocked.status_code == 503 and blocked.json()["code"] == "AUTH_SERVICE_UNAVAILABLE"
    for text in (ready.text, status.text, blocked.text):
        assert STAFF_KEY not in text and ENROLL_KEY not in text and "credential rejected" not in text
    assert not any(r.url.path == "/api/auth/send-otp" for r in double.requests)


@pytest.mark.anyio
async def test_wrong_enrollment_key_disables_enrollment_and_deletion_together():
    # module: one enrollment probe decides both enrollment and deletion; staff stays ready
    readiness, _, double = build(double=AppDouble(enroll_key="different-" + secrets.token_urlsafe(40)))
    snap = await readiness.snapshot()
    for name in ("enrollment", "deletion"):
        assert snap["flows"][name] == {"ready": False, "issues": ["CANONICAL_CREDENTIAL_MISMATCH"], "credential_verified": False}
    assert snap["flows"]["staff"]["ready"] is True
    assert [p for p in probes(double) if p[1] == "/api/integrations/enrollment/readiness"] == [("GET", "/api/integrations/enrollment/readiness", "enroll")]


@pytest.mark.anyio
async def test_app_side_unconfigured_credential_route_503_is_reported_as_configuration_issue():
    # module: SharedError 503 from a credential route (weak/shared server key) → named issue, credential not verified
    body = health_body()
    body["configuration"]["STAFF_SERVICE_KEY"] = False  # public metadata only; flows still claim ready
    readiness, _, _ = build(double=AppDouble(body, staff_key=""))
    snap = await readiness.snapshot()
    assert snap["flows"]["staff"] == {"ready": False, "issues": ["CANONICAL.CONFIGURATION_REQUIRED"], "credential_verified": False}
    assert snap["flows"]["enrollment"]["ready"] is True


@pytest.mark.anyio
async def test_forbidden_credential_routing_is_rejected_before_any_request():
    # module: exact method/path/secret allowlist for probes; nothing leaves the adapter on rejection
    _, canonical, double = build()
    forbidden = [
        canonical.probe("/integrations/staff/readiness", key="enrollment"),
        canonical.probe("/integrations/enrollment/readiness", key="staff"),
        canonical.probe("/integrations/staff/readiness"),
        canonical.probe("/health", key="staff"),
        canonical.probe("/auth/me"),
        canonical.probe("/integrations/customers/9000000101", key="enrollment"),
        canonical.request("POST", "/integrations/staff/readiness", key="staff"),
        canonical.request("GET", "/integrations/staff/9000000101/convert", key="staff"),
        canonical.request("GET", "/integrations/staff/readiness", key="enrollment"),
        canonical.request("GET", "/health", key="staff"),
    ]
    for coro in forbidden:
        with pytest.raises(UpstreamError) as exc:
            await coro
        assert exc.value.code == "CREDENTIAL_SCOPE", exc.value.code
    assert double.requests == []


@pytest.mark.anyio
async def test_credential_probe_never_follows_redirect_or_leaks_secret_to_another_origin():
    # module: 302 on a credential route ends the probe; the secret is sent once to the configured base only
    double = AppDouble()

    def redirect(request):
        if request.url.path == "/api/health":
            return httpx.Response(200, json=health_body())
        return httpx.Response(302, headers={"location": "https://attacker.example/collect"})

    double.override = redirect
    readiness, _, _ = build(double=double)
    snap = await readiness.snapshot()
    assert all(s["ready"] is False and s["issues"] == ["CANONICAL_UNAVAILABLE_OR_INCOMPATIBLE"] for s in snap["flows"].values())
    assert all(r.url.host == "canonical.test" for r in double.requests)
    assert len(double.requests) == 3


@pytest.mark.anyio
async def test_timeout_then_recovery_honours_unready_cache_window():
    # module: transport timeout → unready cached 5 s; healthy result only after the window elapses
    double = AppDouble()
    double.override = lambda r: (_ for _ in ()).throw(httpx.ConnectTimeout("timeout", request=r))
    clock = [1000.0]
    readiness, _, _ = build(double=double)
    readiness.clock = lambda: clock[0]
    first = await readiness.snapshot()
    assert first["configuration_ready"] is False and first["upstream"]["reachable"] is False
    assert all("CANONICAL_UNAVAILABLE_OR_INCOMPATIBLE" in s["issues"] for s in first["flows"].values())
    double.override = None
    clock[0] += 4
    assert (await readiness.snapshot()) is first, "unready snapshot is served for 5 s without re-probing"
    assert len(double.requests) == 1
    clock[0] += 2
    recovered = await readiness.snapshot()
    assert recovered["configuration_ready"] is True
    clock[0] += 29
    assert (await readiness.snapshot()) is recovered, "healthy snapshot is served for 30 s"
    clock[0] += 2
    assert (await readiness.snapshot()) is not recovered
    readiness.invalidate()
    assert readiness._snapshot is None


@pytest.mark.anyio
async def test_concurrent_snapshot_requests_coalesce_into_one_probe_set():
    # module: simultaneous anonymous status requests trigger exactly one health + two credential probes
    double = AppDouble()
    double.delay = 0.05
    readiness, _, _ = build(double=double)
    results = await asyncio.gather(*(readiness.snapshot() for _ in range(25)))
    assert all(r is results[0] for r in results)
    assert len(double.requests) == 3


@pytest.mark.anyio
async def test_old_public_health_contract_is_interpreted_without_claiming_key_matching():
    # module: pre-6a6cddd health (no flows/credential_readiness) still works from configuration booleans only
    legacy = {"status": "ok", "build": "shared-v1-followup-2026-09-11", "commit": "unrecorded",
              "capabilities": {"canonical_auth": 1, "enrollment_grants": 1, "staff_directory": 1},
              "configuration": {"JWT_SECRET": True, "MSG91_AUTHKEY": True, "ENROLLMENT_INTEGRATION_KEY": True, "STAFF_SERVICE_KEY": False}}
    double = AppDouble()
    double.override = lambda r: httpx.Response(200, json=legacy)
    readiness, _, _ = build(double=double)
    snap = await readiness.snapshot()
    assert snap["upstream"]["contract"] == "public_health"
    assert snap["upstream"]["credential_verification_supported"] is False
    assert snap["flows"]["staff"] == {"ready": False, "issues": ["CANONICAL.STAFF_SERVICE_KEY"], "credential_verified": None}
    assert snap["flows"]["enrollment"] == {"ready": True, "issues": [], "credential_verified": None}
    assert snap["key_matching_verified_by_this_check"] is False
    assert len(double.requests) == 1


@pytest.mark.anyio
async def test_declared_credential_readiness_without_flows_never_falls_back_to_public_booleans():
    # module: capability says credential_readiness=1 but the per-flow payload is missing → incompatible, not legacy-ready
    body = health_body()
    del body["flows"]
    double = AppDouble()
    double.override = lambda r: httpx.Response(200, json=body)
    readiness, _, _ = build(double=double)
    snap = await readiness.snapshot()
    assert all(s["ready"] is False and s["issues"] == ["CANONICAL_UNAVAILABLE_OR_INCOMPATIBLE"] and s["credential_verified"] is None
               for s in snap["flows"].values())
    assert snap["key_matching_verified_by_this_check"] is False
    assert len(double.requests) == 1


@pytest.mark.parametrize("credential_response", [
    lambda r: httpx.Response(404, json={"detail": "Not Found"}),
    lambda r: httpx.Response(200, json={"status": "ok", "flow": "staff", "ready": True, "issues": []}),
    lambda r: httpx.Response(200, json={"status": "ok", "flow": "enrollment", "ready": True, "issues": [], "credential_verified": True}),
    lambda r: httpx.Response(200, text="<html>ok</html>", headers={"content-type": "text/html"}),
    lambda r: (_ for _ in ()).throw(httpx.ReadTimeout("slow", request=r)),
], ids=["route-missing-404", "verified-flag-absent", "wrong-flow-name", "html-200", "read-timeout"])
@pytest.mark.anyio
async def test_failed_or_missing_staff_credential_probe_leaves_staff_unavailable(credential_response):
    # module: under the declared contract a non-conforming credential probe is never treated as verified
    double = AppDouble()
    healthy = health_body()

    def handler(request):
        if request.url.path == "/api/health":
            return httpx.Response(200, json=healthy)
        if request.url.path == "/api/integrations/staff/readiness":
            return credential_response(request)
        return httpx.Response(200, json={"status": "ok", "flow": "enrollment", "ready": True, "issues": [], "build": "app-test",
                                         "credential_verified": True, "sms_delivery_verified": False, "account_role_verified": False})

    double.override = handler
    readiness, _, _ = build(double=double)
    snap = await readiness.snapshot()
    assert snap["flows"]["staff"] == {"ready": False, "issues": ["CANONICAL_UNAVAILABLE_OR_INCOMPATIBLE"], "credential_verified": False}
    assert snap["flows"]["enrollment"]["ready"] is True and snap["flows"]["enrollment"]["credential_verified"] is True
    assert snap["key_matching_verified_by_this_check"] is False
    public = await readiness.public()
    assert public["flows"]["staff"]["available"] is False
    assert "Not Found" not in json.dumps(public) and "html" not in json.dumps(public)


def test_placeholder_settings_report_invalid_not_present():
    # module: registered placeholder names stay unready and are reported as false by NAME, values never echoed
    cfg = settings(base="PLACEHOLDER_NOT_CONFIGURED", enrollment_key="SET_IN_PUBLISH_SECRETS",
                   staff_key="SET_IN_PUBLISH_SECRETS", build_commit="SET_IN_PUBLISH_SECRETS")
    assert cfg.base == "" and cfg.enrollment_key == "" and cfg.staff_key == "" and cfg.build_commit == ""
    flags = cfg.presence()
    assert flags["CANONICAL_API_BASE_URL"] is False and flags["ENROLLMENT_INTEGRATION_KEY"] is False
    assert flags["STAFF_SERVICE_KEY"] is False and flags["BUILD_COMMIT"] is False
    assert flags["SESSION_SECRET"] is True and flags["BFF_ALLOWED_ORIGINS"] is True
    assert cfg.commit == "unrecorded"
    assert cfg.valid_base is False
    assert cfg.configuration_state() == {"CANONICAL_API_BASE_URL": "placeholder", "ENROLLMENT_INTEGRATION_KEY": "placeholder", "STAFF_SERVICE_KEY": "placeholder",
                                         "SESSION_SECRET": "valid", "BUILD_COMMIT": "placeholder"}
    assert settings(staff_key="", build_commit="not-a-sha").configuration_state()["STAFF_SERVICE_KEY"] == "missing"
    assert settings(build_commit="not-a-sha").configuration_state()["BUILD_COMMIT"] == "invalid"
    assert cfg.flow_issues("staff") == ["CANONICAL_API_BASE_URL", "STAFF_SERVICE_KEY"], "identical placeholders never raise SERVICE_KEYS_MUST_DIFFER noise"
    assert "ENROLLMENT_INTEGRATION_KEY" in cfg.flow_issues("enrollment")
    long_placeholder = "PLACEHOLDER_" + "x" * 40
    assert settings(staff_key=long_placeholder).staff_key == "", "length alone never validates a placeholder"
    assert settings(build_commit="3384da292b44df321dcb9568f4f96264bf795647").commit == "3384da292b44df321dcb9568f4f96264bf795647"


def test_origin_entries_explain_each_rejected_allowlist_entry_without_echoing_values():
    # module: a single malformed BFF_ALLOWED_ORIGINS entry is reported by position and reason; the list stays fail-closed
    cfg = settings(origins=("https://register.yashsilver.com", "http://yash-register.emergent.host", "https://yash-register.emergent.host/admin",
                            "yash-register.emergent.host", "SET_IN_PUBLISH_SECRETS", "https://yash-register.emergent.host:8443", "https://yash-register.emergent.host"))
    entries = cfg.origin_entries()
    assert [e["valid"] for e in entries] == [True, False, False, False, False, False, True]
    assert [e.get("reason") for e in entries] == [None, "scheme_not_https", "path_present", "scheme_not_https", "placeholder", "non_default_port", None]
    assert entries[2]["host"] == "yash-register.emergent.host" and entries[1]["host"] is None
    assert "http://yash-register.emergent.host" not in json.dumps(entries)
    assert cfg.presence()["BFF_ALLOWED_ORIGINS"] is False and "BFF_ALLOWED_ORIGINS" in cfg.flow_issues("staff")
    clean = settings()
    assert all(e["valid"] for e in clean.origin_entries()) and clean.presence()["BFF_ALLOWED_ORIGINS"] is True


def test_from_env_uses_runtime_environment_over_dotenv_and_parses_origins(monkeypatch, tmp_path):
    # module: loader precedence — injected runtime variables win; .env never overrides them; placeholders read as absent
    from dotenv import load_dotenv
    dotenv = tmp_path / ".env"
    dotenv.write_text("STAFF_SERVICE_KEY=SET_IN_PUBLISH_SECRETS\nBFF_ALLOWED_ORIGINS=https://register.yashsilver.com,https://yash-register.emergent.host\n"
                      "CANONICAL_API_BASE_URL=https://yash-tryon-test.emergent.host/api\nENROLLMENT_INTEGRATION_KEY=SET_IN_PUBLISH_SECRETS\nBUILD_COMMIT=SET_IN_PUBLISH_SECRETS\n")
    for name in ("STAFF_SERVICE_KEY", "BFF_ALLOWED_ORIGINS", "CANONICAL_API_BASE_URL", "ENROLLMENT_INTEGRATION_KEY", "BUILD_COMMIT", "BFF_INGRESS_ORIGINS", "TRUSTED_INGRESS_CIDRS"):
        monkeypatch.delenv(name, raising=False)
    injected = "runtime-" + secrets.token_urlsafe(40)
    monkeypatch.setenv("STAFF_SERVICE_KEY", injected)  # simulates Manage Publishes → Secrets
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "unused")
    monkeypatch.setenv("SESSION_SECRET", secrets.token_urlsafe(48))
    load_dotenv(dotenv)  # same call shape as backend/server.py: override=False
    cfg = Settings.from_env()
    assert cfg.staff_key == injected, "the .env placeholder must not replace the injected production value"
    assert cfg.enrollment_key == "" and cfg.build_commit == "" and cfg.commit == "unrecorded"
    assert cfg.base == "https://yash-tryon-test.emergent.host/api" and cfg.valid_base is True
    assert cfg.origins == SITE_ORIGINS
    assert cfg.flow_issues("staff") == [] and cfg.flow_issues("enrollment") == ["ENROLLMENT_INTEGRATION_KEY"]
    monkeypatch.setenv("BFF_ALLOWED_ORIGINS", " https://register.yashsilver.com/ , https://yash-register.emergent.host ,SET_IN_PUBLISH_SECRETS")
    assert Settings.from_env().origins == SITE_ORIGINS, "trailing slashes/whitespace normalised; placeholder entries dropped"


def test_actual_backend_dotenv_declares_required_names_once_without_real_secrets_in_placeholders():
    # module: the real backend/.env (gitignored) registers every production setting name exactly once
    from dotenv import dotenv_values
    from bff.config import is_placeholder
    text = open("/app/backend/.env").read()
    names = [line.split("=", 1)[0] for line in text.splitlines() if line and not line.startswith("#")]
    for name in ("CANONICAL_API_BASE_URL", "BFF_ALLOWED_ORIGINS", "ENROLLMENT_INTEGRATION_KEY", "STAFF_SERVICE_KEY", "BUILD_COMMIT", "SESSION_SECRET", "MONGO_URL", "DB_NAME"):
        assert names.count(name) == 1, name
    values = dotenv_values("/app/backend/.env")
    assert values["CANONICAL_API_BASE_URL"] == "https://yash-tryon-test.emergent.host/api"
    assert values["BFF_ALLOWED_ORIGINS"] == "https://register.yashsilver.com,https://yash-register.emergent.host"
    assert is_placeholder(values["BUILD_COMMIT"])
    for key in ("ENROLLMENT_INTEGRATION_KEY", "STAFF_SERVICE_KEY"):
        assert is_placeholder(values[key]) or len(values[key]) >= 32, key  # placeholder until set privately, never a weak real value
    assert not is_placeholder(values["SESSION_SECRET"]) and len(values["SESSION_SECRET"]) >= 32


@pytest.mark.anyio
async def test_both_production_website_origins_allowed_and_unrelated_origin_rejected(website_db):
    # module: explicit allowlist for both public website origins; unrelated origin fails closed on status and mutation
    cfg = settings(db_name=website_db.name)
    app = website_app(cfg, website_db, Canonical(cfg, transport=MockTransport(AppDouble())))
    async with AsyncClient(transport=ASGITransport(app=app), base_url=SITE_ORIGINS[0]) as client:
        for origin in SITE_ORIGINS:
            status = await client.get("/api/public/auth-status", params={"website_origin": origin})
            assert status.status_code == 200 and status.json()["origin_allowed"] is True, origin
            assert all(state["available"] for state in status.json()["flows"].values()), origin
            post = await client.post("/api/admin/auth/send-otp", json={"phone": "9000000101"}, headers={"origin": origin, "sec-fetch-site": "same-origin"})
            assert post.json()["code"] != "ORIGIN_REJECTED", origin
        denied = await client.get("/api/public/auth-status", params={"website_origin": "https://unrelated.example"})
        assert denied.json()["origin_allowed"] is False
        assert all(state["available"] is False for state in denied.json()["flows"].values())
        rejected = await client.post("/api/admin/auth/send-otp", json={"phone": "9000000101"}, headers={"origin": "https://unrelated.example"})
        assert rejected.status_code == 403 and rejected.json()["code"] == "ORIGIN_REJECTED"
        missing = await client.post("/api/admin/auth/send-otp", json={"phone": "9000000101"})
        assert missing.status_code == 403 and missing.json()["code"] == "ORIGIN_REJECTED"
        ready = await client.get("/api/health/ready")
        assert ready.status_code == 200 and ready.json()["integration_ready"] is True
        assert ready.json()["app_contract_commit"] == "9596a5578a61bb1fb187e63345b7f93eda95bc9c"
        assert ready.json()["key_matching_verified_by_this_check"] is True
        assert ready.json()["real_login_verified_by_this_check"] is False
        live = await client.get("/api/health/live")
        assert live.status_code == 200 and live.json()["status"] == "alive"
    assert STAFF_KEY not in json.dumps(ready.json()) and ENROLL_KEY not in json.dumps(ready.json())
