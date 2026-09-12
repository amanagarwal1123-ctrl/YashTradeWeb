"""Release-gate tool regressions (tools/check_auth_readiness.py) over synthetic responses only.

# module: exit code must require credential-verified readiness on EVERY origin plus exact build/SHA/pin
#         expectations; legacy booleans, null/false verification, malformed or contradictory bodies fail.
# Upstream/website HTTP is MOCKED here; nothing on the network is contacted.
"""

from __future__ import annotations

import copy
import importlib.util
import json
from dataclasses import dataclass

import httpx
import pytest

ORIGINS = ("https://register.yashsilver.com", "https://yash-register.emergent.host")
EXPECTED = {
    "WEBSITE_CHECK_ORIGINS": ",".join(ORIGINS),
    "EXPECTED_WEBSITE_BUILD": "website-shared-v1-d2d3d4-consumers-v3",
    "EXPECTED_WEBSITE_COMMIT": "c1ef7d84609e0d0eff0258601b2fc1a84076189e",
    "EXPECTED_APP_CONTRACT_COMMIT": "9596a5578a61bb1fb187e63345b7f93eda95bc9c",
    "EXPECTED_UPSTREAM_BUILD": "shared-v1-review-fonts-2026-09-12",
    "EXPECTED_UPSTREAM_COMMIT": "9596a5578a61bb1fb187e63345b7f93eda95bc9c",
    "PUBLICATION_RECEIPT": "publish-2026-09-12-website-3",
}


def healthy_ready():
    return {"status": "ok", "build": EXPECTED["EXPECTED_WEBSITE_BUILD"], "commit": EXPECTED["EXPECTED_WEBSITE_COMMIT"],
            "app_contract_commit": EXPECTED["EXPECTED_APP_CONTRACT_COMMIT"], "integration_ready": True, "database_ready": True,
            "configuration_ready": True, "key_matching_verified_by_this_check": True,
            "upstream": {"reachable": True, "build": EXPECTED["EXPECTED_UPSTREAM_BUILD"], "commit": EXPECTED["EXPECTED_UPSTREAM_COMMIT"],
                         "contract": "credential_readiness", "credential_verification_supported": True, "database_ready": True},
            "flows": {name: {"ready": True, "issues": [], "credential_verified": True} for name in ("staff", "enrollment", "deletion")},
            "real_login_verified_by_this_check": False}


def healthy_public():
    return {"origin_allowed": True, "flows": {name: {"available": True, "message": ""} for name in ("staff", "enrollment", "deletion")}}


@dataclass
class _Resp:
    status_code: int
    payload: object
    raw: str | None = None

    def json(self):
        if self.raw is not None:
            return json.loads(self.raw)
        return self.payload


class FakeClient:
    responses: dict = {}

    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get(self, url, params=None):
        origin, path = url.split("/api", 1)
        handler = FakeClient.responses[origin]
        response = handler("/api" + path)
        if isinstance(response, Exception):
            raise response
        return response


def load_tool():
    spec = importlib.util.spec_from_file_location("check_auth_readiness", "/app/tools/check_auth_readiness.py")
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def run(monkeypatch, capsys, per_origin, env_overrides=None):
    module = load_tool()
    env = {**EXPECTED, **(env_overrides or {})}
    for name, value in env.items():
        if value is None:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, value)
    FakeClient.responses = per_origin
    monkeypatch.setattr(module.httpx, "Client", FakeClient)
    rc = module.main()
    return rc, json.loads(capsys.readouterr().out)


def responder(ready=None, public=None, ready_status=200, public_status=200, ready_raw=None):
    ready = healthy_ready() if ready is None else ready
    public = healthy_public() if public is None else public

    def handle(path):
        if path == "/api/health/ready":
            return _Resp(ready_status, ready, ready_raw)
        return _Resp(public_status, public)
    return handle


def test_gate_passes_only_with_credential_verified_readiness_on_both_origins(monkeypatch, capsys):
    # module: healthy success — both origins, all expectations matched, receipt retained
    rc, report = run(monkeypatch, capsys, {o: responder() for o in ORIGINS})
    assert rc == 0 and report["release_gate"] == "PASS"
    assert report["publication_receipt"] == EXPECTED["PUBLICATION_RECEIPT"]
    assert all(r["passed"] and r["failed_checks"] == [] for r in report["origins"])
    assert report["live_login_verified_by_this_check"] is False


@pytest.mark.parametrize("mutate, expected_failure", [
    (lambda r: r.update(key_matching_verified_by_this_check=False), "key_matching_verified"),
    (lambda r: r.update(key_matching_verified_by_this_check=None), "key_matching_verified"),
    (lambda r: r["flows"]["staff"].update(credential_verified=None), "flow_staff"),
    (lambda r: r["flows"]["deletion"].update(credential_verified=False), "flow_deletion"),
    (lambda r: r["flows"]["enrollment"].update(issues=["CANONICAL_CREDENTIAL_MISMATCH"]), "flow_enrollment"),
    (lambda r: r["upstream"].update(contract="public_health"), "upstream_contract"),
    (lambda r: r.update(commit="unrecorded"), "website_commit"),
    (lambda r: r.update(build="website-shared-v1-auth-readiness-v1"), "website_build"),
    (lambda r: r.update(app_contract_commit="6a6cdddb81a4c27b387144746a7b6cf7fefc85c2"), "app_contract_commit"),
    (lambda r: r["upstream"].update(build="shared-v1-owner-recovery-2026-09-12"), "upstream_build"),
    (lambda r: r["upstream"].update(commit="unrecorded"), "upstream_commit"),
    (lambda r: r.update(integration_ready=False, status="not_ready"), "integration_ready"),
    (lambda r: r.pop("flows"), "flows_object"),
    (lambda r: r.update(upstream="credential_readiness"), "upstream_object"),
], ids=["false-key-match", "null-key-match", "null-flow-verification", "false-flow-verification", "flow-issue", "legacy-contract",
        "unrecorded-commit", "wrong-build", "wrong-pin", "wrong-upstream-build", "unrecorded-upstream-commit", "not-ready",
        "flows-missing", "upstream-not-object"])
def test_gate_fails_on_unverified_or_mismatched_readiness(monkeypatch, capsys, mutate, expected_failure):
    # module: false/null verification, legacy response, wrong pin/build and malformed structure each fail the gate
    ready = healthy_ready()
    mutate(ready)
    rc, report = run(monkeypatch, capsys, {ORIGINS[0]: responder(ready=ready), ORIGINS[1]: responder()})
    assert rc == 1 and report["release_gate"] == "FAIL"
    first, second = report["origins"]
    assert expected_failure in first["failed_checks"], first["failed_checks"]
    assert second["passed"] is True, "one-domain failure is reported per origin and still fails the release"


def test_gate_fails_when_ready_is_structured_503(monkeypatch, capsys):
    # module: accurate structured 503 stays diagnosable but never passes
    ready = healthy_ready()
    ready.update(status="not_ready", integration_ready=False)
    ready["flows"]["staff"] = {"ready": False, "issues": ["CANONICAL.STAFF_SERVICE_KEY"], "credential_verified": None}
    rc, report = run(monkeypatch, capsys, {o: responder(ready=ready, ready_status=503) for o in ORIGINS})
    assert rc == 1
    assert all("READY_HTTP_503" in r["failed_checks"] and "flow_staff" in r["failed_checks"] for r in report["origins"])
    assert report["origins"][0]["issues"]["staff"] == ["CANONICAL.STAFF_SERVICE_KEY"]


@pytest.mark.parametrize("public, public_status, expected_failure", [
    ({"origin_allowed": False, "flows": {n: {"available": False, "message": "Verification is unavailable on this website address."} for n in ("staff", "enrollment", "deletion")}}, 200, "origin_allowed"),
    ({"origin_allowed": True, "flows": {"staff": {"available": False, "message": "x"}, "enrollment": {"available": True, "message": ""}, "deletion": {"available": True, "message": ""}}}, 200, "public_staff_available"),
    ({"origin_allowed": True}, 200, "public_enrollment_available"),
    ([], 200, "public_http_200"),
    (healthy_public(), 503, "public_http_200"),
], ids=["origin-rejected", "inconsistent-public-status", "public-flows-missing", "public-not-object", "public-503"])
def test_gate_fails_on_origin_rejection_or_contradictory_public_status(monkeypatch, capsys, public, public_status, expected_failure):
    # module: readiness OK but the anonymous status for that exact origin disagrees → fail
    rc, report = run(monkeypatch, capsys, {ORIGINS[0]: responder(), ORIGINS[1]: responder(public=public, public_status=public_status)})
    assert rc == 1
    assert expected_failure in report["origins"][1]["failed_checks"]


@pytest.mark.parametrize("ready_raw, ready_payload", [
    ("<html>bad gateway</html>", None),
    ("{", None),
    (None, ["not", "an", "object"]),
    (None, "ok"),
], ids=["html", "truncated-json", "array", "string"])
def test_gate_fails_on_malformed_ready_bodies(monkeypatch, capsys, ready_raw, ready_payload):
    # module: malformed or non-object readiness bodies never pass and never crash the tool
    def broken(path, _raw=ready_raw):
        if path == "/api/health/ready":
            class Broken(_Resp):
                def json(self):
                    return json.loads(_raw)  # raises ValueError for invalid raw text
            return Broken(200, None)
        return _Resp(200, healthy_public())

    handler = responder(ready=ready_payload) if ready_raw is None else broken
    rc, report = run(monkeypatch, capsys, {ORIGINS[0]: responder(), ORIGINS[1]: handler})
    assert rc == 1
    assert "READY_BODY_NOT_OBJECT" in report["origins"][1]["failed_checks"]


def test_gate_fails_when_one_domain_is_unreachable(monkeypatch, capsys):
    # module: transport failure on one domain fails the release even though the other passes
    def down(path):
        return httpx.ConnectError("refused")
    rc, report = run(monkeypatch, capsys, {ORIGINS[0]: responder(), ORIGINS[1]: down})
    assert rc == 1
    assert report["origins"][0]["passed"] is True
    assert report["origins"][1]["failed_checks"] == ["READINESS_UNAVAILABLE:ConnectError"]


@pytest.mark.parametrize("missing", ["EXPECTED_WEBSITE_COMMIT", "EXPECTED_UPSTREAM_COMMIT", "EXPECTED_APP_CONTRACT_COMMIT",
                                     "EXPECTED_WEBSITE_BUILD", "EXPECTED_UPSTREAM_BUILD", "PUBLICATION_RECEIPT"])
def test_absent_expectation_is_a_failure_not_a_wildcard(monkeypatch, capsys, missing):
    # module: an absent expected SHA/build/receipt fails the gate even when both origins look healthy
    rc, report = run(monkeypatch, capsys, {o: responder() for o in ORIGINS}, {missing: None})
    assert rc == 1 and missing in report["missing_expectations"]
    assert all(r["failed_checks"] == ["EXPECTATIONS_MISSING"] for r in report["origins"])


def test_non_hex_expected_commit_is_rejected(monkeypatch, capsys):
    # module: a placeholder or app-style label in EXPECTED_WEBSITE_COMMIT cannot satisfy the gate
    ready = healthy_ready()
    ready["commit"] = "SET_IN_PUBLISH_SECRETS"
    rc, report = run(monkeypatch, capsys, {o: responder(ready=copy.deepcopy(ready)) for o in ORIGINS},
                     {"EXPECTED_WEBSITE_COMMIT": "SET_IN_PUBLISH_SECRETS"})
    assert rc == 1 and "EXPECTED_WEBSITE_COMMIT:hex" in report["missing_expectations"]


def test_evaluate_is_pure_and_lists_every_failed_check():
    # module: the pure evaluator reports all failing checks at once for operator diagnosis
    module = load_tool()
    ready = healthy_ready()
    ready.update(key_matching_verified_by_this_check=False, commit="unrecorded")
    ready["flows"]["staff"]["credential_verified"] = None
    failed = module.evaluate(200, ready, 200, healthy_public(), EXPECTED)
    assert set(failed) == {"key_matching_verified", "website_commit", "flow_staff"}
    assert module.evaluate(200, healthy_ready(), 200, healthy_public(), EXPECTED) == []
