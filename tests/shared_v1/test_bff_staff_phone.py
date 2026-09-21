"""Staff directory rules the owner hit on production (bff/proxy.py allowlist + pages/admin/Staff.js, Account.js).

# module: reproduces "Use the admin conversion operation; customer ID must be preserved" when adding staff with a
#         number that is already a customer, proves the website's conversion path keeps the canonical ID, and
#         proves the self-service login-number change (OTP to the NEW number, caller only) ends the website
#         session so the person signs in again with the new number. (Admin renumbering of ORDINARY staff: test_bff_operations_v2.)
"""

# ruff: noqa: F811 -- pytest fixtures are imported for discovery and named as test arguments
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from test_bff_auth_session import _csrf, _headers, _login_staff, bff_client, object_store, shared_apps


async def _post(client, path, body):
    return await client.post(path, json=body, headers=_headers(await _csrf(client)))


@pytest.mark.anyio
async def test_adding_staff_with_a_customer_number_needs_conversion_which_keeps_the_identity(bff_client, shared_apps):
    await _login_staff(bff_client, shared_apps["sent_otps"], "9000000101")
    created = await _post(bff_client, "/api/bff/integrations/staff", {"name": "TEST Customer", "phone": "9000000103", "role": "telecaller", "code": "", "status": "active"})
    assert created.status_code == 409 and created.json()["code"] == "EXPLICIT_CONVERSION_REQUIRED", created.text
    assert "customer ID must be preserved" in created.json()["detail"]

    # What Staff.js does next: look the customer up by number (admin list filter) so nobody types a canonical ID.
    found = await bff_client.get("/api/bff/customers", params={"search": "9000000103", "limit": 5})
    assert found.status_code == 200, found.text
    match = [c for c in found.json()["customers"] if c["phone"].endswith("9000000103")]
    assert len(match) == 1 and match[0]["id"] == "u_cust" and match[0]["role"] == "customer"

    converted = await _post(bff_client, "/api/bff/integrations/staff/u_cust/convert", {"role": "telecaller", "reason": "Joined the telecalling team on 14 Sep", "confirm_user_id": "u_cust"})
    assert converted.status_code == 200, converted.text
    assert converted.json()["user"]["id"] == "u_cust" and converted.json()["user"]["role"] == "telecaller"
    doc = await shared_apps["canonical_db"].users.find_one({"phone": "9000000103"}, {"_id": 0, "id": 1, "role": 1, "identity_events": 1})
    assert doc["id"] == "u_cust" and doc["role"] == "telecaller" and doc["identity_events"][-1]["type"] == "conversion"
    assert await shared_apps["canonical_db"].users.count_documents({"phone": "9000000103"}) == 1, "no duplicate identity"

    # Adding the same number again is now a harmless no-op the page reports as "already staff".
    again = await _post(bff_client, "/api/bff/integrations/staff", {"name": "TEST Customer", "phone": "9000000103", "role": "telecaller", "code": "", "status": "active"})
    assert again.status_code == 200 and again.json()["created"] is False and again.json()["user"]["id"] == "u_cust"
    other_role = await _post(bff_client, "/api/bff/integrations/staff", {"name": "TEST Customer", "phone": "9000000103", "role": "billing_executive", "code": "", "status": "active"})
    assert other_role.status_code == 409 and other_role.json()["code"] == "ROLE_CONFLICT"


@pytest.mark.anyio
async def test_plain_patch_never_renumbers_but_the_holder_changes_it_with_an_otp(bff_client, shared_apps):
    sent = shared_apps["sent_otps"]
    await _login_staff(bff_client, sent, "9000000101")
    denied = await bff_client.patch("/api/bff/integrations/staff/u_tele", json={"phone": "9000000141"}, headers=_headers(await _csrf(bff_client)))
    assert denied.status_code == 409 and denied.json()["code"] == "PHONE_CHANGE_OPERATION_REQUIRED", denied.text
    # A plain PATCH never renumbers; the audited preview → phone operation (test_bff_operations_v2) or the holder's own flow does.
    # The admin's own self-service session cannot start a change for someone else either: the route always acts on the caller.
    await _post(bff_client, "/api/admin/auth/logout", {})

    login = await _login_staff(bff_client, sent, "9000000102")
    assert login.status_code == 200 and login.json()["id"] == "u_tele"
    conflict = await _post(bff_client, "/api/bff/auth/phone-change/request", {"new_phone": "9000000101"})
    assert conflict.status_code == 409 and conflict.json()["code"] == "PHONE_CONFLICT"
    started = await _post(bff_client, "/api/bff/auth/phone-change/request", {"new_phone": "9000000141"})
    assert started.status_code == 200, started.text
    assert {"challenge_id", "otp_length", "expires_in", "resend_after"} <= set(started.json())
    otp = sent[("9000000141", "phone_change")]
    assert ("9000000141", "login") not in sent, "code went to the NEW number for the change purpose only"

    wrong = await _post(bff_client, "/api/bff/auth/phone-change/verify", {"new_phone": "9000000141", "otp": "0000" if otp != "0000" else "1111", "challenge_id": started.json()["challenge_id"]})
    assert wrong.status_code in (400, 401, 409, 422), wrong.text
    me = await bff_client.get("/api/admin/auth/me")
    assert me.status_code == 200 and me.json()["phone"] == "9000000102", "a failed attempt changes nothing and keeps the session"

    done = await _post(bff_client, "/api/bff/auth/phone-change/verify", {"new_phone": "9000000141", "otp": otp, "challenge_id": started.json()["challenge_id"]})
    assert done.status_code == 200, done.text
    assert done.json()["phone"] == "9000000141" and done.json()["reauthentication_required"] is True and done.json()["website_session_ended"] is True
    assert await shared_apps["website_db"].bff_sessions.count_documents({}) == 0, "website lease ended with the app's revocation"
    ended = await bff_client.get("/api/admin/auth/me")
    assert ended.status_code == 401

    doc = await shared_apps["canonical_db"].users.find_one({"id": "u_tele"}, {"_id": 0, "phone": 1, "phone_normalized": 1, "role": 1})
    assert doc == {"phone": "9000000141", "phone_normalized": "9000000141", "role": "telecaller"}
    # The app's 60 s per-number cooldown is what the person waits for in real life; age the used challenge here.
    await shared_apps["canonical_db"].otp_challenges.update_many({"phone": "9000000141"}, {"$set": {"created_at": datetime.now(timezone.utc) - timedelta(seconds=90)}})
    relogin = await _login_staff(bff_client, sent, "9000000141")
    assert relogin.status_code == 200 and relogin.json()["id"] == "u_tele" and relogin.json()["role"] == "telecaller", relogin.text
    old = await _post(bff_client, "/api/admin/auth/send-otp", {"phone": "9000000102"})
    assert old.status_code in (403, 404), "the old number no longer signs in"
