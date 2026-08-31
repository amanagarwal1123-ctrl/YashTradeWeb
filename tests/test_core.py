"""
POC test_core.py - Yash Ornaments Enrollment Website
Tests ALL core workflows in isolation before building the app:
  A. MSG91 OTP SMS send (real API, provided authkey)
  B. Live backend sync: verify-otp(demo 1234) -> token -> PUT profile (custom fields) -> GET me
  C. Admin feasibility: role of 9999813334 on live backend + GET /api/customers access
Run: python /app/tests/test_core.py
"""
import os
import json
import httpx
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path("/app/backend/.env"))

MSG91_AUTHKEY = os.environ["MSG91_AUTHKEY"]
LIVE = os.environ["LIVE_BACKEND_BASE"]
ADMIN_PHONE = "9999813334"
TEST_PHONE = "9876501234"  # synthetic test customer

results = {}


def section(name):
    print("\n" + "=" * 60)
    print(f"  {name}")
    print("=" * 60)


# ---------------------------------------------------------------
# A. MSG91 OTP send
# ---------------------------------------------------------------
def test_msg91_send():
    section("A. MSG91 OTP SEND")
    # Try v5 OTP API without template_id first (account may have default),
    # sending our own generated OTP value to the admin phone.
    otp_value = "4321"
    mobile = f"91{ADMIN_PHONE}"

    # Attempt 1: no template_id (default template)
    params = {
        "authkey": MSG91_AUTHKEY,
        "mobile": mobile,
        "otp": otp_value,
        "otp_expiry": 5,
    }
    r = httpx.get("https://control.msg91.com/api/v5/otp", params=params, timeout=20)
    print(f"[no template_id] status={r.status_code} body={r.text[:300]}")
    try:
        data = r.json()
    except Exception:
        data = {}
    if data.get("type") == "success":
        results["msg91"] = {"ok": True, "mode": "no_template", "resp": data}
        print("MSG91 send OK without template_id")
        return

    # Attempt 2: legacy sendotp API with default message/sender
    params2 = {
        "authkey": MSG91_AUTHKEY,
        "mobile": mobile,
        "otp": otp_value,
        "otp_length": 4,
    }
    r2 = httpx.get("https://api.msg91.com/api/sendotp.php", params=params2, timeout=20)
    print(f"[legacy sendotp] status={r2.status_code} body={r2.text[:300]}")
    try:
        data2 = r2.json()
    except Exception:
        data2 = {}
    if data2.get("type") == "success":
        results["msg91"] = {"ok": True, "mode": "legacy", "resp": data2}
        print("MSG91 send OK via legacy API")
        return

    results["msg91"] = {"ok": False, "v5": data, "legacy": data2}
    print("MSG91 send FAILED both attempts - may need template_id from dashboard")


# ---------------------------------------------------------------
# B. Live backend customer create/update sync
# ---------------------------------------------------------------
def test_live_sync():
    section("B. LIVE BACKEND SYNC (create + profile update + me)")
    c = httpx.Client(base_url=LIVE, timeout=25)

    # 0. send-otp first to create challenge on live backend
    r0 = c.post("/api/auth/send-otp", json={"phone": TEST_PHONE})
    print(f"send-otp: {r0.status_code} {r0.text[:150]}")

    # 1. verify-otp with demo 1234 -> creates/gets user + token
    r = c.post("/api/auth/verify-otp", json={"phone": TEST_PHONE, "otp": "1234"})
    print(f"verify-otp: {r.status_code}")
    if r.status_code != 200:
        results["live_sync"] = {"ok": False, "step": "verify-otp", "body": r.text[:300]}
        return
    tok = r.json()["token"]
    user = r.json()["user"]
    print(f"user id={user['id']} role={user.get('role')}")

    # 2. PUT profile with full enrollment fields (test custom-field persistence)
    updates = {
        "name": "POC Test Customer",
        "city": "Mumbai",
        "shop_name": "POC Jewellers",
        "location": "Mumbai",
        "phone_verified": True,
        "onboarding_status": "registered",
        "registration_source": "website",
        "registered_at": "2026-01-15T10:00:00+00:00",
        "has_logged_in": False,
    }
    r2 = c.put("/api/auth/profile", json=updates, headers={"Authorization": f"Bearer {tok}"})
    print(f"profile PUT: {r2.status_code} body={r2.text[:400]}")

    # 3. GET me - confirm fields persisted
    r3 = c.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
    print(f"me GET: {r3.status_code}")
    me = r3.json() if r3.status_code == 200 else {}
    persisted = {k: me.get(k) for k in updates}
    print("persisted fields:", json.dumps(persisted, indent=1))
    missing = [k for k, v in updates.items() if me.get(k) != v]
    results["live_sync"] = {
        "ok": r2.status_code == 200 and r3.status_code == 200 and me.get("name") == updates["name"],
        "missing_or_diff_fields": missing,
        "me_keys": list(me.keys()),
    }
    print(f"missing/differing fields: {missing}")


# ---------------------------------------------------------------
# C. Admin feasibility on live backend
# ---------------------------------------------------------------
def test_admin_feasibility():
    section("C. ADMIN FEASIBILITY (9999813334 on live backend)")
    c = httpx.Client(base_url=LIVE, timeout=25)
    r0 = c.post("/api/auth/send-otp", json={"phone": ADMIN_PHONE})
    print(f"send-otp: {r0.status_code} {r0.text[:150]}")
    r = c.post("/api/auth/verify-otp", json={"phone": ADMIN_PHONE, "otp": "1234"})
    print(f"verify-otp admin: {r.status_code}")
    if r.status_code != 200:
        results["admin"] = {"ok": False, "body": r.text[:300]}
        return
    tok = r.json()["token"]
    user = r.json()["user"]
    print(f"admin-phone user role on live backend: {user.get('role')}")

    r2 = c.get("/api/customers", headers={"Authorization": f"Bearer {tok}"}, params={"limit": 2})
    print(f"GET /api/customers: {r2.status_code} body={r2.text[:300]}")
    results["admin"] = {
        "ok": True,
        "role": user.get("role"),
        "customers_access": r2.status_code == 200,
    }


if __name__ == "__main__":
    test_msg91_send()
    test_live_sync()
    test_admin_feasibility()

    section("SUMMARY")
    print(json.dumps(results, indent=2, default=str))
    ok_all = all(v.get("ok") for v in results.values())
    print("\nPOC OVERALL:", "PASS" if ok_all else "PARTIAL/FAIL - see above")
