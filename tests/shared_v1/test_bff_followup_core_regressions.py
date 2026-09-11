"""Focused shared-v1 follow-up coverage for rates/customers/queries/deletion/media + dependency regressions.

# module: rates+slabs concurrency semantics, customer/query datasets, deletion no-resurrection, media usage, D2/D3/D4 strict xfail
"""

# ruff: noqa: F811 -- pytest fixtures are imported for discovery and named as test arguments
from __future__ import annotations

import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from test_bff_auth_session import _csrf, _headers, _login_staff, bff_client, shared_apps


async def _login_role(client: AsyncClient, app_ctx: dict, phone: str):
    verify = None
    for attempt in range(2):
        try:
            verify = await _login_staff(client, app_ctx["sent_otps"], phone)
            break
        except Exception as exc:
            if attempt == 0 and ("AutoReconnect" in repr(exc) or "connection closed" in repr(exc)):
                continue
            raise
    assert verify is not None
    assert verify.status_code == 200, verify.text
    return verify.json()


@pytest.mark.anyio
async def test_rates_changed_only_preserves_untouched_gold_and_enforces_version_conflict_409(bff_client, shared_apps):
    # module: rates changed-only writes + stale-version conflict guard
    me = await _login_role(bff_client, shared_apps, "9000000104")
    assert me["role"] == "billing_executive"

    latest = await bff_client.get("/api/bff/rates/latest")
    assert latest.status_code == 200, latest.text
    before = latest.json()
    version = before["version"]

    payload = {"version": version, "silver_physical_rate": before["silver_physical_rate"] + 1.25}
    saved = await bff_client.post("/api/bff/rates", json=payload, headers=_headers(await _csrf(bff_client)))
    assert saved.status_code == 200, saved.text
    after = saved.json()

    assert after["silver_physical_rate"] == payload["silver_physical_rate"]
    assert after["gold_physical_rate"] == before["gold_physical_rate"]
    assert after["gold_mcx_rate"] == before["gold_mcx_rate"]

    stale = await bff_client.post(
        "/api/bff/rates",
        json={"version": version, "silver_movement": "up"},
        headers=_headers(await _csrf(bff_client)),
    )
    assert stale.status_code == 409
    assert stale.json()["code"] == "VERSION_CONFLICT"


@pytest.mark.anyio
async def test_rate_slabs_labour_ambiguity_structured_basis_edit_and_soft_delete_versioned(bff_client, shared_apps):
    # module: slab labour ambiguity rejection + structured basis create/edit/versioned delete
    me = await _login_role(bff_client, shared_apps, "9000000104")
    assert me["role"] == "billing_executive"

    ambiguous = await bff_client.post(
        "/api/bff/rate-list",
        json={"item_name": "TEST slab bad labour", "metal_type": "silver", "labour": "abc"},
        headers=_headers(await _csrf(bff_client)),
    )
    assert ambiguous.status_code == 422
    assert ambiguous.json()["code"] == "AMBIGUOUS_LABOUR_UNIT"

    create = await bff_client.post(
        "/api/bff/rate-list",
        json={
            "item_name": "TEST slab basis",
            "metal_type": "gold",
            "category": "ring",
            "labour": {"currency": "INR", "amount": "250", "basis": "10g"},
        },
        headers=_headers(await _csrf(bff_client)),
    )
    assert create.status_code == 200, create.text
    slab = create.json()
    assert slab["labour"]["basis"] == "10g"
    assert slab["labour_display"].endswith("/10g")

    edited = await bff_client.put(
        f"/api/bff/rate-list/{slab['id']}",
        json={"version": slab["version"], "labour": {"currency": "INR", "amount": "20", "basis": "piece"}},
        headers=_headers(await _csrf(bff_client)),
    )
    assert edited.status_code == 200, edited.text
    edited_doc = edited.json()
    assert edited_doc["labour"]["basis"] == "piece"
    assert edited_doc["version"] == slab["version"] + 1

    deleted = await bff_client.delete(
        f"/api/bff/rate-list/{slab['id']}?version={edited_doc['version']}",
        headers=_headers(await _csrf(bff_client)),
    )
    assert deleted.status_code == 200, deleted.text
    assert deleted.json().get("is_deleted") is True

    listed = await bff_client.get("/api/bff/rate-list")
    assert listed.status_code == 200, listed.text
    assert all(row["id"] != slab["id"] for row in listed.json().get("slabs", []))


@pytest.mark.anyio
async def test_customers_pagination_search_assignment_and_ist_filters_over_20_records(bff_client, shared_apps):
    # module: customers full-page list/search/date/assignment filters with >20 synthetic canonical records
    me = await _login_role(bff_client, shared_apps, "9000000101")
    assert me["role"] == "admin"

    base = datetime.now(timezone.utc)
    rows = []
    for i in range(1, 26):
        created = (base - timedelta(days=i)).isoformat()
        rows.append(
            {
                "id": f"u_test_cust_{i:02d}",
                "phone": f"9100000{i:03d}",
                "phone_normalized": f"9100000{i:03d}",
                "name": f"TEST Bulk Customer {i:02d}",
                "role": "customer",
                "status": "active",
                "account_status": "active",
                "onboarding_status": "completed",
                "assigned_salesperson": "u_tele" if i % 2 == 0 else "",
                "shop_name": f"TEST Shop {i:02d}",
                "location": "Pune",
                "city": "Pune",
                "registered_at": created,
                "created_at": created,
                "updated_at": created,
            }
        )
    await shared_apps["canonical_db"].users.insert_many(rows)

    page1 = await bff_client.get("/api/bff/customers?page=1&limit=20&search=TEST%20Bulk")
    page2 = await bff_client.get("/api/bff/customers?page=2&limit=20&search=TEST%20Bulk")
    assert page1.status_code == 200 and page2.status_code == 200
    body1, body2 = page1.json(), page2.json()
    assert body1["total"] >= 25
    assert len(body1["customers"]) == 20
    assert len(body2["customers"]) >= 5

    unassigned = await bff_client.get("/api/bff/customers?assigned_to=unassigned&search=TEST%20Bulk")
    assert unassigned.status_code == 200
    assert all((c.get("assigned_salesperson") or "") == "" for c in unassigned.json().get("customers", []))

    assigned = await bff_client.get("/api/bff/customers?assigned_to=u_tele&search=TEST%20Bulk")
    assert assigned.status_code == 200
    assert all(c.get("assigned_salesperson") == "u_tele" for c in assigned.json().get("customers", []))

    from zoneinfo import ZoneInfo
    today_ist = datetime.now(timezone.utc).astimezone(ZoneInfo('Asia/Kolkata')).date().isoformat()
    by_date = await bff_client.get(f"/api/bff/customers?registered_from={today_ist}&registered_to={today_ist}&search=TEST%20Bulk")
    assert by_date.status_code == 200
    assert isinstance(by_date.json().get("customers"), list)


@pytest.mark.anyio
async def test_all_7_request_types_visible_as_unassigned_with_consistent_counts_across_roles(bff_client, shared_apps):
    # module: all canonical request types created as unassigned and listed consistently for admin/telecaller/billing
    admin = await _login_role(bff_client, shared_apps, "9000000101")
    assert admin["role"] == "admin"

    request_types = ["video_call", "ask_price", "callback", "similar_products", "hold_item", "quick_reorder", "cart_selection"]
    # Actual canonical customer API creation, NOT a website-local or pre-seeded queue.
    async with AsyncClient(transport=ASGITransport(app=shared_apps['canonical_server'].app), base_url='https://canonical.test') as customer:
        sent = await customer.post('/api/auth/send-otp', json={'phone':'9000000103','purpose':'login','channel':'mobile'})
        assert sent.status_code == 200
        verified = await customer.post('/api/auth/verify-otp', json={'phone':'9000000103','purpose':'login','channel':'mobile',
            'challenge_id':sent.json()['challenge_id'],'otp':shared_apps['sent_otps'][('9000000103','login')]})
        assert verified.status_code == 200 and verified.json()['user']['id'] == 'u_cust'
        customer.headers['Authorization'] = 'Bearer ' + verified.json()['token']
        for i, typ in enumerate(request_types):
            created = await customer.post('/api/requests',json={'request_type':typ},headers={'Idempotency-Key':f'test-new-request-{i}'})
            assert created.status_code == 200, created.text

    admin_view = await bff_client.get("/api/bff/requests?view=unassigned&page=1&limit=100")
    assert admin_view.status_code == 200

    async with AsyncClient(transport=ASGITransport(app=shared_apps["bff_app"]), base_url="https://website.test") as tele_client, AsyncClient(
        transport=ASGITransport(app=shared_apps["bff_app"]), base_url="https://website.test"
    ) as billing_client:
        await _login_role(tele_client, shared_apps, "9000000102")
        await _login_role(billing_client, shared_apps, "9000000104")
        tele_view = await tele_client.get("/api/bff/requests?view=unassigned&page=1&limit=100")
        billing_view = await billing_client.get("/api/bff/requests?view=unassigned&page=1&limit=100")

    assert tele_view.status_code == 200 and billing_view.status_code == 200
    a_total, t_total, b_total = admin_view.json()["total"], tele_view.json()["total"], billing_view.json()["total"]
    assert a_total == t_total == b_total
    by_type = admin_view.json().get("open_counts_by_type", {})
    assert all(by_type.get(typ, 0) >= 1 for typ in request_types)


@pytest.mark.anyio
async def test_request_resolution_reopen_idempotency_history_and_today_metrics_cohort(bff_client, shared_apps):
    # module: request claim/update/reopen idempotency + history + metrics with older-created request resolved today
    await _login_role(bff_client, shared_apps, "9000000102")

    older_created = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    rid = "req-cohort-1"
    await shared_apps["canonical_db"].requests.insert_one(
        {
            "id": rid,
            "request_type": "callback",
            "status": "pending",
            "user_id": "u_cust",
            "user_name": "TEST Customer",
            "user_phone": "9000000103",
            "user_city": "Pune",
            "shop_name": "TEST Shop",
            "assignee_id": "",
            "assigned_to": "",
            "created_at": older_created,
            "updated_at": older_created,
            "pending_since": older_created,
            "version": 0,
            "events": [{"id": "ev-cohort-create", "type": "creation", "actor_id": "u_cust", "actor_role": "customer", "timestamp": older_created, "status": "pending"}],
        }
    )

    claim = await bff_client.post(
        f"/api/bff/requests/{rid}/claim",
        json={"version": 0, "idempotency_key": "cohort-claim-1"},
        headers=_headers(await _csrf(bff_client)),
    )
    assert claim.status_code == 200, claim.text
    claimed = claim.json()

    claim_replay = await bff_client.post(
        f"/api/bff/requests/{rid}/claim",
        json={"version": claimed["version"], "idempotency_key": "cohort-claim-1"},
        headers=_headers(await _csrf(bff_client)),
    )
    assert claim_replay.status_code in {409, 422}

    # Idempotent key support is guaranteed on PATCH /requests/{rid} mutations.
    respond = await bff_client.patch(
        f"/api/bff/requests/{rid}",
        json={"action": "response", "version": claimed["version"], "idempotency_key": "cohort-response-1"},
        headers=_headers(await _csrf(bff_client)),
    )
    assert respond.status_code == 200, respond.text
    responded = respond.json()
    replay = await bff_client.patch(
        f"/api/bff/requests/{rid}",
        json={"action": "response", "version": responded["version"], "idempotency_key": "cohort-response-1"},
        headers=_headers(await _csrf(bff_client)),
    )
    assert replay.status_code == 200
    assert replay.json()["version"] == responded["version"]

    resolve = await bff_client.patch(
        f"/api/bff/requests/{rid}",
        json={"action": "update", "status": "resolved", "version": responded["version"], "idempotency_key": "cohort-resolve-1"},
        headers=_headers(await _csrf(bff_client)),
    )
    assert resolve.status_code == 200, resolve.text
    resolved = resolve.json()
    assert resolved["status"] == "resolved"

    reopen = await bff_client.patch(
        f"/api/bff/requests/{rid}",
        json={"action": "reopen", "status": "pending", "version": resolved["version"], "idempotency_key": "cohort-reopen-1"},
        headers=_headers(await _csrf(bff_client)),
    )
    assert reopen.status_code == 200, reopen.text
    reopened = reopen.json()
    assert reopened["status"] == "pending"

    history = await bff_client.get(f"/api/bff/requests/{rid}/history")
    assert history.status_code == 200, history.text
    types = {event.get("type") for event in history.json().get("history", [])}
    assert "resolution" in types
    assert "reopening" in types

    today = datetime.now(timezone.utc).astimezone().date().isoformat()
    await _login_role(bff_client, shared_apps, "9000000101")
    metrics = await bff_client.get(f"/api/bff/requests/metrics/summary?start={today}&end={today}")
    assert metrics.status_code == 200, metrics.text
    body = metrics.json()
    assert body["timezone"] == "Asia/Kolkata"
    assert body["period_throughput"] >= 1
    assert isinstance(body["received_cohort"], dict)


@pytest.mark.anyio
async def test_deletion_grant_cleanup_ack_and_no_resurrection_via_enrollment(bff_client, shared_apps):
    # module: deletion grant flow + website cleanup ack + deleted identity cannot be re-enrolled
    number = "9000000199"
    now = datetime.now(timezone.utc).isoformat()
    await shared_apps["canonical_db"].users.insert_one(
        {
            "id": "u_delete_me",
            "phone": number,
            "phone_normalized": number,
            "name": "TEST Delete Me",
            "role": "customer",
            "status": "active",
            "account_status": "active",
            "session_version": 0,
            "phone_verified": True,
            "onboarding_status": "completed",
            "shop_name": "Delete Shop",
            "location": "Pune",
            "created_at": now,
            "updated_at": now,
        }
    )
    await shared_apps["website_db"].bff_sessions.insert_one({"_id": "cleanup-1", "canonical_user_id": "u_delete_me", "phone": number, "expires_at": datetime.now(timezone.utc) + timedelta(days=1)})
    await shared_apps["website_db"].bff_drafts.insert_one({"_id": "cleanup-2", "canonical_user_id": "u_delete_me", "phone": number, "purpose": "enrollment", "expires_at": datetime.now(timezone.utc) + timedelta(days=1)})

    sent = await bff_client.post("/api/delete/send-otp", json={"phone": number}, headers=_headers(await _csrf(bff_client)))
    assert sent.status_code == 200, sent.text

    otp = shared_apps["sent_otps"][(number, "deletion")]
    confirm = await bff_client.post(
        "/api/delete/confirm",
        json={"phone": number, "otp": otp, "challenge_id": sent.json()["challenge_id"]},
        headers=_headers(await _csrf(bff_client)),
    )
    assert confirm.status_code == 200, confirm.text
    deleted = confirm.json()
    assert deleted.get("deleted") is True
    assert deleted.get("reference")
    assert "website_cleanup" in deleted

    # No resurrection via enrollment with same deleted phone.
    enroll_payload = {
        "phone": number,
        "name": "TEST Again",
        "shop_name": "TEST Again Shop",
        "location": "Pune",
        "consent_terms": True,
        "consent_privacy": True,
    }
    sent2 = await bff_client.post("/api/enroll/send-otp", json=enroll_payload, headers=_headers(await _csrf(bff_client)))
    if sent2.status_code >= 400:
        assert sent2.json().get("code") in {"DELETED_IDENTITY", "VERIFICATION_REQUIRED", "GRANT_INVALID", "GRANT_EXPIRED"}
    else:
        otp2 = shared_apps["sent_otps"][(number, "enrollment")]
        verify2 = await bff_client.post(
            "/api/enroll/verify-otp",
            json={"phone": number, "otp": otp2, "challenge_id": sent2.json()["challenge_id"]},
            headers=_headers(await _csrf(bff_client)),
        )
        assert verify2.status_code >= 400
        assert verify2.json().get("code") in {"DELETED_IDENTITY", "VERIFICATION_REQUIRED", "GRANT_INVALID", "GRANT_EXPIRED"}


@pytest.mark.anyio
async def test_media_usage_and_lifecycle_audit_reports_audited_true_zero_remote_deletions(bff_client, shared_apps):
    # module: media usage contract + lifecycle audit should report audited=true and remote_deletions=0
    await _login_role(bff_client, shared_apps, "9000000101")

    usage = await bff_client.get("/api/bff/admin/media/usage")
    assert usage.status_code == 200, usage.text
    usage_body = usage.json()
    assert usage_body["provider_delete_supported"] is False
    assert usage_body["inventory_complete"] is False

    audit = await bff_client.post("/api/bff/admin/media/lifecycle-audit", json={}, headers=_headers(await _csrf(bff_client)))
    assert audit.status_code == 200, audit.text
    result = audit.json()
    assert result == {"audited": True, "remote_deletions": 0, "status": "blocked_provider_unsupported"}


@pytest.mark.anyio
@pytest.mark.xfail(
    strict=True,
    reason="D2 source evidence: shared/install.py includes people router before legacy /customers/search; people.py /customers/{uid} can shadow static search.",
)
async def test_dependency_d2_customers_search_should_resolve_static_route_not_dynamic_shadow(bff_client, shared_apps):
    # module: D2 regression — /customers/search should return search envelope, never dynamic customer detail handling
    await _login_role(bff_client, shared_apps, "9000000104")
    res = await bff_client.get("/api/bff/customers/search?q=90")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body.get("customers"), list)


@pytest.mark.anyio
@pytest.mark.xfail(
    strict=True,
    reason="D3 source evidence: shared/queries.py listing() has no customer_id filter and silently ignores immutable customer-ID filtering requirement.",
)
async def test_dependency_d3_customer_id_filter_should_be_supported_or_rejected_not_silently_ignored(bff_client, shared_apps):
    # module: D3 regression — immutable customer-ID request history filter contract gap
    await _login_role(bff_client, shared_apps, "9000000101")
    res = await bff_client.get("/api/bff/requests?customer_id=u_cust&page=1&limit=30")
    assert res.status_code == 422, res.text
    assert res.json().get("code") in {"UNSUPPORTED_FILTER", "INVALID_FILTER"}


@pytest.mark.anyio
@pytest.mark.xfail(
    strict=True,
    reason="D4 source evidence: shared/people.py /integrations/deletions uses .limit(100) pending events without pagination or excluding website-acknowledged rows.",
)
async def test_dependency_d4_deletion_outbox_should_not_starve_101st_event_after_first100_website_ack(shared_apps):
    # module: D4 regression — website ack of first 100 must not hide 101st pending event
    now = datetime.now(timezone.utc).isoformat()
    docs = []
    for i in range(1, 102):
        docs.append(
            {
                "id": f"ev-{i:03d}",
                "type": "account_erased",
                "user_id": f"u_del_{i:03d}",
                "created_at": now,
                "status": "pending",
                "required_acknowledgements": ["website", "sms_provider", "ai_provider"],
                "acknowledged": ["website"] if i <= 100 else [],
            }
        )
    await shared_apps["canonical_db"].integration_outbox.insert_many(docs)

    async with AsyncClient(transport=ASGITransport(app=shared_apps["canonical_server"].app), base_url="https://canonical.test") as canonical:
        res = await canonical.get(
            "/api/integrations/deletions",
            headers={"X-Integration-Key": shared_apps["cfg"].enrollment_key},
        )
    assert res.status_code == 200, res.text
    ids = {e["id"] for e in res.json().get("events", [])}
    assert "ev-101" in ids


def test_identity_export_projection_function_uses_stored_links_only_and_no_extra_fields():
    # module: tools/export_identity_readonly.py projection function behavior on synthetic docs only
    spec = importlib.util.spec_from_file_location("identity_export", "/app/tools/export_identity_readonly.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    synthetic = {
        "_id": "mongo-id-1",
        "id": "doc-1",
        "phone": "+91-9000011111",
        "live_user_id": "live-123",
        "canonical_user_id": None,
        "phone_verified": "unknown",
        "verified_at": None,
        "role": "admin",
        "account_status": "active",
        "created_at": None,
        "updated_at": None,
        "unexpected": "must-not-leak",
    }
    row = mod.export_row("customers", synthetic)

    assert row["collection"] == "customers"
    assert row["record_id"] == "doc-1"
    assert row["canonical_user_id"] == "live-123"
    assert row["phone"] == "+91-9000011111"
    assert row["phone_verified"] is None
    assert row["verified_at"] is None

    expected_keys = {
        "collection",
        "record_id",
        "canonical_user_id",
        "phone",
        "phone_verified",
        "verified_at",
        "role",
        "account_status",
        "created_at",
        "updated_at",
    }
    assert set(row.keys()) == expected_keys
