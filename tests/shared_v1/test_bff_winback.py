"""Consent-based win-back, anonymous churn and deleted-number recognition over the isolated pinned app.

# module: /delete/confirm opt-in + reason, /delete/callback (account kept), D4 cleanup never wipes consented
#         contacts, churn rows carry no identifier, staff console RBAC/actions/opt-out erasure, returning flag.
# Synthetic fixture numbers only; SMS captured by the fixture double.
"""

# ruff: noqa: F811 -- pytest fixtures are imported for discovery and named as test arguments
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone

import pytest

from test_bff_auth_session import _csrf, _headers, _login_staff, bff_client, shared_apps

if "/app/backend" not in sys.path:
    sys.path.insert(0, "/app/backend")
from bff.winback import number_hash  # noqa: E402


async def _customer(app_ctx, uid, phone, name="TEST Leaver", shop="Leaver Shop", location="Pune"):
    now = datetime.now(timezone.utc).isoformat()
    await app_ctx["canonical_db"].users.insert_one({"id": uid, "phone": phone, "phone_normalized": phone, "name": name, "role": "customer",
                                                    "status": "active", "account_status": "active", "session_version": 0, "phone_verified": True,
                                                    "onboarding_status": "completed", "shop_name": shop, "location": location,
                                                    "created_at": now, "registered_at": now, "updated_at": now})


async def _deletion_otp(client, app_ctx, phone):
    csrf = await _csrf(client)
    sent = await client.post("/api/delete/send-otp", json={"phone": phone}, headers=_headers(csrf))
    assert sent.status_code == 200, sent.text
    return csrf, sent.json()["challenge_id"], app_ctx["sent_otps"][(phone, "deletion")]


async def _delete(client, app_ctx, phone, **extra):
    csrf, challenge_id, otp = await _deletion_otp(client, app_ctx, phone)
    confirm = await client.post("/api/delete/confirm", json={"phone": phone, "otp": otp, "challenge_id": challenge_id, **extra}, headers=_headers(csrf))
    assert confirm.status_code == 200, confirm.text
    return confirm.json()


async def _dump(db, name):
    return json.dumps(await db[name].find({}).to_list(100), default=str)


@pytest.mark.anyio
async def test_deletion_optin_keeps_only_consented_contact_plus_anonymous_churn_and_number_hash(bff_client, shared_apps):
    # module: opt-in ticked → one consented contact; deletion itself completes and is acknowledged; churn row is anonymous
    canonical_db, website_db, cfg = shared_apps["canonical_db"], shared_apps["website_db"], shared_apps["cfg"]
    await _customer(shared_apps, "u_leaver_1", "9000000131", location="pune")
    result = await _delete(bff_client, shared_apps, "9000000131", winback_consent=True, reason="other_supplier")
    assert result["deleted"] is True and result["winback_contact_kept"] is True and result["website_cleanup"]["acknowledged"] >= 1

    gone = await canonical_db.users.find_one({"id": "u_leaver_1"}, {"_id": 0})
    assert gone["account_status"] == "deleted" and gone["phone"] == "deleted:u_leaver_1", "canonical account really erased"
    event = await canonical_db.integration_outbox.find_one({"id": "DEL-u_leaver_1"}, {"_id": 0})
    assert "website" in event["acknowledged"], "D4 acknowledgement is truthful: website account data is gone"

    contacts = await website_db.bff_winback_contacts.find({}).to_list(10)
    assert len(contacts) == 1
    contact = contacts[0]
    assert contact["phone"] == "9000000131" and contact["name"] == "TEST Leaver" and contact["shop_name"] == "Leaver Shop" and contact["location"] == "pune"
    assert contact["source"] == "deletion_optin" and contact["status"] == "new" and contact["reason"] == "other_supplier"
    assert contact["consent_version"] == "winback-offers-v1" and contact["expires_at"] > datetime.now(timezone.utc).replace(tzinfo=None)

    churn = await website_db.bff_churn.find({}, {"_id": 0}).to_list(10)
    assert len(churn) == 1
    assert churn[0]["source"] == "website" and churn[0]["location"] == "Pune" and churn[0]["reason"] == "other_supplier"
    assert churn[0]["deleted_month"] == churn[0]["registered_month"] == datetime.now(timezone.utc).strftime("%Y-%m")
    anonymous = json.dumps(churn, default=str)
    assert "u_leaver_1" not in anonymous and "9000000131" not in anonymous and "Leaver" not in anonymous

    hashes = await website_db.bff_deleted_numbers.find({}).to_list(10)
    assert [h["_id"] for h in hashes] == [number_hash(cfg, "9000000131")]
    assert "9000000131" not in await _dump(website_db, "bff_deleted_numbers")
    assert await website_db.bff_churn_pending.count_documents({}) == 0, "staged detail consumed by the D4 pass"
    for coll in ("bff_sessions", "bff_drafts"):
        assert await website_db[coll].count_documents({"phone": "9000000131"}) == 0


@pytest.mark.anyio
async def test_deletion_without_optin_keeps_no_contact_but_still_counts_churn(bff_client, shared_apps):
    # module: unticked box (default) → no personal data survives on the website; anonymous churn + hash only
    website_db = shared_apps["website_db"]
    await _customer(shared_apps, "u_leaver_2", "9000000132", location="Surat")
    result = await _delete(bff_client, shared_apps, "9000000132")
    assert result["winback_contact_kept"] is False
    assert await website_db.bff_winback_contacts.count_documents({}) == 0
    churn = await website_db.bff_churn.find({}, {"_id": 0}).to_list(10)
    assert len(churn) == 1 and churn[0]["reason"] is None and churn[0]["location"] == "Surat"
    assert await website_db.bff_deleted_numbers.count_documents({}) == 1
    for coll in ("bff_winback_contacts", "bff_churn", "bff_churn_marks", "bff_deleted_numbers"):
        assert "9000000132" not in await _dump(website_db, coll), coll


@pytest.mark.anyio
async def test_callback_before_deletion_keeps_the_account_and_records_a_consented_callback(bff_client, shared_apps):
    # module: "Talk to us first" — same OTP proves ownership, nothing is deleted, the challenge cannot be reused for deletion
    canonical_db, website_db = shared_apps["canonical_db"], shared_apps["website_db"]
    await _customer(shared_apps, "u_stayer", "9000000133", name="TEST Stayer", shop="Stay Shop", location="Delhi")
    csrf, challenge_id, otp = await _deletion_otp(bff_client, shared_apps, "9000000133")
    res = await bff_client.post("/api/delete/callback", json={"phone": "9000000133", "otp": otp, "challenge_id": challenge_id, "note": "Please call after 5pm"}, headers=_headers(csrf))
    assert res.status_code == 200, res.text
    assert res.json()["callback_requested"] is True and res.json()["account_deleted"] is False

    kept = await canonical_db.users.find_one({"id": "u_stayer"}, {"_id": 0})
    assert kept["account_status"] == "active" and kept["phone"] == "9000000133"
    assert await canonical_db.integration_outbox.count_documents({"user_id": "u_stayer"}) == 0
    contact = await website_db.bff_winback_contacts.find_one({}, {"_id": 0})
    assert contact["source"] == "pre_deletion_callback" and contact["status"] == "callback_requested"
    assert contact["name"] == "TEST Stayer" and contact["note"] == "Please call after 5pm"
    assert await website_db.bff_churn.count_documents({}) == 0 and await website_db.bff_deleted_numbers.count_documents({}) == 0

    reuse = await bff_client.post("/api/delete/confirm", json={"phone": "9000000133", "otp": otp, "challenge_id": challenge_id}, headers=_headers(csrf))
    assert reuse.status_code == 400 and reuse.json()["code"] == "CHALLENGE_REQUIRED", "a fresh OTP is required to delete later"


@pytest.mark.anyio
async def test_staff_console_rbac_actions_history_and_opt_out_erasure(bff_client, shared_apps):
    # module: telecaller/admin see and work the list; billing is refused; opt-out erases PII; churn summary shape
    website_db = shared_apps["website_db"]
    await _customer(shared_apps, "u_leaver_3", "9000000134", name="TEST Optin", location="Mumbai")
    await _delete(bff_client, shared_apps, "9000000134", winback_consent=True, reason="app_problems")
    await _customer(shared_apps, "u_leaver_4", "9000000135", location="Mumbai")
    await _delete(bff_client, shared_apps, "9000000135", reason="not_buying")

    verify = await _login_staff(bff_client, shared_apps["sent_otps"], "9000000104")  # billing
    assert verify.status_code == 200
    for path in ("/api/admin/winback/contacts", "/api/admin/winback/churn", "/api/admin/winback/returning"):
        denied = await bff_client.get(path)
        assert denied.status_code == 403 and denied.json()["code"] == "PERMISSION_DENIED", path
    await bff_client.post("/api/admin/auth/logout", headers=_headers(await _csrf(bff_client)))

    verify = await _login_staff(bff_client, shared_apps["sent_otps"], "9000000102")  # telecaller
    assert verify.status_code == 200
    listing = await bff_client.get("/api/admin/winback/contacts?status=new")
    assert listing.status_code == 200, listing.text
    body = listing.json()
    assert body["total"] == 1 and body["contacts"][0]["phone"] == "9000000134" and body["contacts"][0]["name"] == "TEST Optin"
    cid = body["contacts"][0]["id"]

    csrf = await _csrf(bff_client)
    contacted = await bff_client.patch(f"/api/admin/winback/contacts/{cid}", json={"action": "contacted", "note": "Spoke; will revisit"}, headers=_headers(csrf))
    assert contacted.status_code == 200 and contacted.json()["status"] == "contacted"
    assert contacted.json()["history"][0]["actor_id"] == "u_tele" and contacted.json()["history"][0]["note"] == "Spoke; will revisit"
    converted = await bff_client.patch(f"/api/admin/winback/contacts/{cid}", json={"action": "converted", "note": ""}, headers=_headers(csrf))
    assert converted.status_code == 200 and converted.json()["status"] == "converted" and len(converted.json()["history"]) == 2

    churn = await bff_client.get("/api/admin/winback/churn?months=12")
    assert churn.status_code == 200, churn.text
    summary = churn.json()
    assert summary["total"] == 2 and summary["anonymous"] is True
    assert summary["by_month"][0]["total"] == 2 and summary["by_month"][0]["website"] == 2 and summary["by_month"][0]["app"] == 0
    assert summary["by_location"] == [{"location": "Mumbai", "count": 2}]
    assert sorted(r["reason"] for r in summary["by_reason"]) == ["app_problems", "not_buying"]
    assert summary["winback"] == {"opted_in": 1, "callbacks": 0, "converted": 1, "opted_out": 0}
    assert "9000000134" not in churn.text and "u_leaver" not in churn.text

    match = await bff_client.post("/api/admin/winback/match", json={"phones": ["9000000134", "9000000135", "9000000101", "bad"]}, headers=_headers(csrf))
    assert match.status_code == 200 and sorted(match.json()["returning"]) == ["9000000134", "9000000135"]

    opted = await bff_client.post(f"/api/admin/winback/contacts/{cid}/opt-out", headers=_headers(csrf))
    assert opted.status_code == 200 and opted.json()["status"] == "opted_out"
    raw = await website_db.bff_winback_contacts.find_one({"_id": cid})
    assert all(k not in raw for k in ("phone", "name", "shop_name", "location", "note")) and raw["opted_out_at"]
    assert "9000000134" not in await _dump(website_db, "bff_winback_contacts") and "Optin" not in await _dump(website_db, "bff_winback_contacts")
    locked = await bff_client.patch(f"/api/admin/winback/contacts/{cid}", json={"action": "reopen"}, headers=_headers(csrf))
    assert locked.status_code == 404 and locked.json()["code"] == "CONTACT_NOT_FOUND", "withdrawn consent cannot be reopened"
    assert (await bff_client.get("/api/admin/winback/churn")).json()["winback"]["opted_out"] == 1


@pytest.mark.anyio
async def test_returning_registration_is_flagged_from_the_keyed_hash_only_and_cleared_on_later_deletion(bff_client, shared_apps):
    # module: a number recorded as deleted earlier registers through the website → flagged to staff by hash match;
    #         the canonical app today tombstones deleted numbers, so the earlier deletion is represented by the hash alone.
    website_db, cfg = shared_apps["website_db"], shared_apps["cfg"]
    from bff.winback import remember_deleted_number
    await remember_deleted_number(website_db, cfg, "9000000136", "2026-01-15T10:00:00+00:00")

    csrf = await _csrf(bff_client)
    payload = {"phone": "9000000136", "name": "TEST Comeback", "shop_name": "Comeback Shop", "location": "Jaipur", "consent_terms": True, "consent_privacy": True}
    sent = await bff_client.post("/api/enroll/send-otp", json=payload, headers=_headers(csrf))
    assert sent.status_code == 200, sent.text
    verify = await bff_client.post("/api/enroll/verify-otp", json={"phone": "9000000136", "otp": shared_apps["sent_otps"][("9000000136", "enrollment")],
                                                                   "challenge_id": sent.json()["challenge_id"]}, headers=_headers(csrf))
    assert verify.status_code == 200, verify.text
    uid = verify.json()["customer"]["id"]
    assert "returning" not in verify.text, "the customer is never told; the flag is for staff"

    flagged = await website_db.bff_returning.find_one({"_id": uid}, {"_id": 0})
    assert flagged["canonical_user_id"] == uid and flagged["previously_deleted_at"] == "2026-01-15T10:00:00+00:00"
    assert "9000000136" not in await _dump(website_db, "bff_returning")

    await _login_staff(bff_client, shared_apps["sent_otps"], "9000000101")
    listing = await bff_client.get("/api/admin/winback/returning")
    assert listing.status_code == 200 and [r["canonical_user_id"] for r in listing.json()["returning"]] == [uid]
    match = await bff_client.post("/api/admin/winback/match", json={"phones": ["9000000136"]}, headers=_headers(await _csrf(bff_client)))
    assert match.json()["returning"] == {"9000000136": "2026-01-15T10:00:00+00:00"}

    # The new account is deleted later inside the app → the D4 pass clears its returning row; the anonymous hash stays.
    from shared import people as canonical_people
    await canonical_people.erase(await shared_apps["canonical_db"].users.find_one({"id": uid}, {"_id": 0}), "app")
    reconcile = await bff_client.post("/api/admin/deletions/reconcile", headers=_headers(await _csrf(bff_client)))
    assert reconcile.status_code == 200 and reconcile.json()["acknowledged"] == 1, reconcile.text
    assert await website_db.bff_returning.count_documents({}) == 0
    assert await website_db.bff_deleted_numbers.count_documents({}) == 1
    churn = await website_db.bff_churn.find_one({}, {"_id": 0})
    assert churn["source"] == "app" and churn["reason"] is None and churn["location"] is None


@pytest.mark.anyio
async def test_in_app_deletion_consumed_by_d4_records_the_hash_from_the_websites_own_enrollment_draft(bff_client, shared_apps):
    # module: app-initiated erasure (ID-only event) → website still learns the keyed hash from its completed enrollment draft,
    #         erases the draft, counts anonymous app-side churn and keeps no contact (no consent was given)
    website_db, cfg = shared_apps["website_db"], shared_apps["cfg"]
    csrf = await _csrf(bff_client)
    payload = {"phone": "9000000137", "name": "TEST Appleaver", "shop_name": "App Shop", "location": "Kanpur", "consent_terms": True, "consent_privacy": True}
    sent = await bff_client.post("/api/enroll/send-otp", json=payload, headers=_headers(csrf))
    assert sent.status_code == 200, sent.text
    verify = await bff_client.post("/api/enroll/verify-otp", json={"phone": "9000000137", "otp": shared_apps["sent_otps"][("9000000137", "enrollment")],
                                                                   "challenge_id": sent.json()["challenge_id"]}, headers=_headers(csrf))
    assert verify.status_code == 200, verify.text
    uid = verify.json()["customer"]["id"]
    assert await website_db.bff_drafts.count_documents({"canonical_user_id": uid}) == 1

    from shared import people as canonical_people
    await canonical_people.erase(await shared_apps["canonical_db"].users.find_one({"id": uid}, {"_id": 0}), "app")
    await _login_staff(bff_client, shared_apps["sent_otps"], "9000000101")
    reconcile = await bff_client.post("/api/admin/deletions/reconcile", headers=_headers(await _csrf(bff_client)))
    assert reconcile.status_code == 200 and reconcile.json()["acknowledged"] == 1, reconcile.text

    assert await website_db.bff_drafts.count_documents({"canonical_user_id": uid}) == 0
    assert [h["_id"] for h in await website_db.bff_deleted_numbers.find({}).to_list(5)] == [number_hash(cfg, "9000000137")]
    assert await website_db.bff_winback_contacts.count_documents({}) == 0
    churn = await website_db.bff_churn.find({}, {"_id": 0}).to_list(5)
    assert len(churn) == 1 and churn[0]["source"] == "app"
    assert "9000000137" not in await _dump(website_db, "bff_deleted_numbers") and "Appleaver" not in await _dump(website_db, "bff_churn")
    match = await bff_client.post("/api/admin/winback/match", json={"phones": ["9000000137"]}, headers=_headers(await _csrf(bff_client)))
    assert list(match.json()["returning"]) == ["9000000137"]
